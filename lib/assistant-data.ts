import "server-only";

import {
  Prisma,
  type recarga_whatsapp_estado,
  type retirar_saldo_estado,
  type solicitudes_servicio_estado,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseDateRange, requestSelect, submittedTopUpWhere } from "@/lib/recargas";
import { submittedWithdrawalWhere, withdrawalSelect } from "@/lib/retiros";
import { serviceRequestSelect } from "@/lib/service-requests";

export type AssistantOperation = "todas" | "recarga" | "retiro" | "servicio";

export type AssistantFilters = {
  operacion: AssistantOperation;
  desde?: string | null;
  hasta?: string | null;
  estado?: string | null;
  plataforma?: string | null;
  cliente?: string | null;
};

const topUpStatuses = new Set<recarga_whatsapp_estado>(["pendiente", "aprobado", "rechazado"]);
const withdrawalStatuses = new Set<retirar_saldo_estado>([
  "borrador",
  "pendiente",
  "aprobado",
  "error_comprobante",
  "pagado",
  "rechazado",
  "cancelado",
]);
const serviceStatuses = new Set<solicitudes_servicio_estado>([
  "pendiente",
  "atendido",
  "cancelado",
]);

function sourceFilters(filters: AssistantFilters) {
  const dateRange = parseDateRange(filters.desde ?? undefined, filters.hasta ?? undefined);
  const topUpWhere: Prisma.recarga_whatsappWhereInput = { ...submittedTopUpWhere };
  const withdrawalWhere: Prisma.retirar_saldoWhereInput = { ...submittedWithdrawalWhere };
  const serviceWhere: Prisma.solicitudes_servicioWhereInput = {};
  const client = filters.cliente?.trim();
  const platform = filters.plataforma?.trim();
  const status = filters.estado?.trim();

  if (dateRange) {
    topUpWhere.date_create = dateRange;
    withdrawalWhere.date_create = dateRange;
    serviceWhere.date_create = dateRange;
  }
  if (platform) {
    topUpWhere.OR = [
      { plataforma_nombre: { contains: platform } },
      { sucursal_nombre: { contains: platform } },
    ];
    withdrawalWhere.OR = [
      { plataforma_nombre: { contains: platform } },
      { sucursal_nombre: { contains: platform } },
    ];
    serviceWhere.sucursal_nombre = { contains: platform };
  }
  if (client) {
    const clientFilter = [
      { cliente_nombres: { contains: client } },
      { cliente_usuario: { contains: client } },
      { cliente_cedula: { contains: client } },
    ];
    topUpWhere.AND = [{ OR: clientFilter }];
    withdrawalWhere.AND = [{ OR: clientFilter }];
    serviceWhere.AND = [{ OR: clientFilter }];
  }

  const includeTopUps =
    (filters.operacion === "todas" || filters.operacion === "recarga") &&
    (!status || topUpStatuses.has(status as recarga_whatsapp_estado));
  const includeWithdrawals =
    (filters.operacion === "todas" || filters.operacion === "retiro") &&
    (!status || withdrawalStatuses.has(status as retirar_saldo_estado));
  const includeServices =
    (filters.operacion === "todas" || filters.operacion === "servicio") &&
    (!status || serviceStatuses.has(status as solicitudes_servicio_estado));

  if (status && includeTopUps) topUpWhere.estado = status as recarga_whatsapp_estado;
  if (status && includeWithdrawals) withdrawalWhere.estado = status as retirar_saldo_estado;
  if (status && includeServices) serviceWhere.estado = status as solicitudes_servicio_estado;

  return {
    includeTopUps,
    includeWithdrawals,
    includeServices,
    topUpWhere,
    withdrawalWhere,
    serviceWhere,
  };
}

export async function getAssistantSummary(filters: AssistantFilters) {
  const sources = sourceFilters(filters);
  const [topUps, withdrawals, services] = await Promise.all([
    sources.includeTopUps
      ? prisma.recarga_whatsapp.groupBy({
          by: ["estado"],
          where: sources.topUpWhere,
          _count: { _all: true },
          _sum: { monto: true },
        })
      : [],
    sources.includeWithdrawals
      ? prisma.retirar_saldo.groupBy({
          by: ["estado"],
          where: sources.withdrawalWhere,
          _count: { _all: true },
          _sum: { monto: true },
        })
      : [],
    sources.includeServices
      ? prisma.solicitudes_servicio.groupBy({
          by: ["estado"],
          where: sources.serviceWhere,
          _count: { _all: true },
        })
      : [],
  ]);

  const result = {
    recargas: topUps.map((row) => ({
      estado: row.estado,
      cantidad: row._count._all,
      monto: row._sum.monto?.toString() ?? "0",
    })),
    retiros: withdrawals.map((row) => ({
      estado: row.estado,
      cantidad: row._count._all,
      monto: row._sum.monto?.toString() ?? "0",
    })),
    servicios: services.map((row) => ({ estado: row.estado, cantidad: row._count._all })),
  };

  return {
    filtros: filters,
    total_registros:
      result.recargas.reduce((sum, row) => sum + row.cantidad, 0) +
      result.retiros.reduce((sum, row) => sum + row.cantidad, 0) +
      result.servicios.reduce((sum, row) => sum + row.cantidad, 0),
    ...result,
  };
}

function matchesSearch(term: string) {
  const numeric = /^\d{1,20}$/.test(term) ? BigInt(term) : null;
  return {
    topUp: [
      { cliente_nombres: { contains: term } },
      { cliente_usuario: { contains: term } },
      { cliente_cedula: { contains: term } },
      { operacion_uuid: { contains: term } },
      ...(numeric ? [{ id_recarga: numeric }, { numero_comprobante: numeric }] : []),
    ] satisfies Prisma.recarga_whatsappWhereInput[],
    withdrawal: [
      { cliente_nombres: { contains: term } },
      { cliente_usuario: { contains: term } },
      { cliente_cedula: { contains: term } },
      { operacion_uuid: { contains: term } },
      ...(numeric ? [{ id_retiro: numeric }, { numero_comprobante: numeric }] : []),
    ] satisfies Prisma.retirar_saldoWhereInput[],
    service: [
      { cliente_nombres: { contains: term } },
      { cliente_usuario: { contains: term } },
      { cliente_cedula: { contains: term } },
      { detalle: { contains: term } },
      { operacion_uuid: { contains: term } },
      ...(numeric ? [{ id_solicitud: numeric }] : []),
    ] satisfies Prisma.solicitudes_servicioWhereInput[],
  };
}

export async function searchAssistantOperations(
  filters: AssistantFilters & { busqueda?: string | null; limite: number },
) {
  const sources = sourceFilters(filters);
  const term = filters.busqueda?.trim();
  if (term) {
    const search = matchesSearch(term);
    sources.topUpWhere.AND = [
      ...(Array.isArray(sources.topUpWhere.AND) ? sources.topUpWhere.AND : []),
      { OR: search.topUp },
    ];
    sources.withdrawalWhere.AND = [
      ...(Array.isArray(sources.withdrawalWhere.AND) ? sources.withdrawalWhere.AND : []),
      { OR: search.withdrawal },
    ];
    sources.serviceWhere.AND = [
      ...(Array.isArray(sources.serviceWhere.AND) ? sources.serviceWhere.AND : []),
      { OR: search.service },
    ];
  }

  const [topUps, withdrawals, services] = await Promise.all([
    sources.includeTopUps
      ? prisma.recarga_whatsapp.findMany({
          where: sources.topUpWhere,
          select: requestSelect,
          orderBy: { date_create: "desc" },
          take: filters.limite,
        })
      : [],
    sources.includeWithdrawals
      ? prisma.retirar_saldo.findMany({
          where: sources.withdrawalWhere,
          select: withdrawalSelect,
          orderBy: { date_create: "desc" },
          take: filters.limite,
        })
      : [],
    sources.includeServices
      ? prisma.solicitudes_servicio.findMany({
          where: sources.serviceWhere,
          select: serviceRequestSelect,
          orderBy: { date_create: "desc" },
          take: filters.limite,
        })
      : [],
  ]);

  return [
    ...topUps.map((item) => ({
      operacion: "recarga",
      id: item.id_recarga.toString(),
      uuid: item.operacion_uuid,
      cliente: item.cliente_nombres,
      cedula: item.cliente_cedula,
      usuario: item.cliente_usuario,
      sucursal: item.sucursal_nombre,
      plataforma: item.plataforma_nombre,
      monto: item.monto?.toString() ?? null,
      referencia: item.numero_comprobante?.toString() ?? null,
      banco: item.banco_nombre_validado ?? item.banco_nombre_detectado,
      estado: item.estado,
      fecha: item.date_create.toISOString(),
    })),
    ...withdrawals.map((item) => ({
      operacion: "retiro",
      id: item.id_retiro.toString(),
      uuid: item.operacion_uuid,
      cliente: item.cliente_nombres,
      cedula: item.cliente_cedula,
      usuario: item.cliente_usuario,
      sucursal: item.sucursal_nombre,
      plataforma: item.plataforma_nombre ?? item.origen,
      monto: item.monto?.toString() ?? null,
      referencia: item.numero_comprobante?.toString() ?? null,
      banco: item.banco_destino,
      estado: item.estado,
      motivo_rechazo: item.motivo_rechazo,
      fecha: item.date_create.toISOString(),
    })),
    ...services.map((item) => ({
      operacion: "servicio",
      id: item.id_solicitud.toString(),
      uuid: item.operacion_uuid,
      cliente: item.cliente_nombres,
      cedula: item.cliente_cedula,
      usuario: item.cliente_usuario,
      sucursal: item.sucursal_nombre,
      detalle: item.detalle,
      estado: item.estado,
      fecha: item.date_create.toISOString(),
    })),
  ]
    .sort((left, right) => right.fecha.localeCompare(left.fecha))
    .slice(0, filters.limite);
}

type BreakdownDimension = "operacion" | "estado" | "plataforma" | "sucursal" | "cliente";

type Group = { nombre: string; cantidad: number; monto: number };

function mergeGroups(groups: Group[]) {
  const merged = new Map<string, Group>();
  for (const group of groups) {
    const current = merged.get(group.nombre) ?? { nombre: group.nombre, cantidad: 0, monto: 0 };
    current.cantidad += group.cantidad;
    current.monto += group.monto;
    merged.set(group.nombre, current);
  }
  return [...merged.values()]
    .sort((left, right) => right.cantidad - left.cantidad || right.monto - left.monto)
    .slice(0, 30);
}

export async function getAssistantBreakdown(
  filters: AssistantFilters & { dimension: BreakdownDimension },
) {
  if (filters.dimension === "operacion" || filters.dimension === "estado") {
    const summary = await getAssistantSummary(filters);
    const groups: Group[] = [];
    for (const row of summary.recargas) {
      groups.push({
        nombre: filters.dimension === "operacion" ? "recarga" : row.estado,
        cantidad: row.cantidad,
        monto: Number(row.monto),
      });
    }
    for (const row of summary.retiros) {
      groups.push({
        nombre: filters.dimension === "operacion" ? "retiro" : row.estado,
        cantidad: row.cantidad,
        monto: Number(row.monto),
      });
    }
    for (const row of summary.servicios) {
      groups.push({
        nombre: filters.dimension === "operacion" ? "servicio" : row.estado,
        cantidad: row.cantidad,
        monto: 0,
      });
    }
    return { dimension: filters.dimension, grupos: mergeGroups(groups) };
  }

  const sources = sourceFilters(filters);
  const topUpField = filters.dimension === "plataforma" ? "plataforma_nombre" : filters.dimension === "sucursal" ? "sucursal_nombre" : "cliente_nombres";
  const withdrawalField = filters.dimension === "plataforma" ? "plataforma_nombre" : filters.dimension === "sucursal" ? "sucursal_nombre" : "cliente_nombres";
  const serviceField = filters.dimension === "plataforma" || filters.dimension === "sucursal" ? "sucursal_nombre" : "cliente_nombres";

  const [topUps, withdrawals, services] = await Promise.all([
    sources.includeTopUps
      ? prisma.recarga_whatsapp.groupBy({
          by: [topUpField],
          where: sources.topUpWhere,
          _count: { _all: true },
          _sum: { monto: true },
        })
      : [],
    sources.includeWithdrawals
      ? prisma.retirar_saldo.groupBy({
          by: [withdrawalField],
          where: sources.withdrawalWhere,
          _count: { _all: true },
          _sum: { monto: true },
        })
      : [],
    sources.includeServices
      ? prisma.solicitudes_servicio.groupBy({
          by: [serviceField],
          where: sources.serviceWhere,
          _count: { _all: true },
        })
      : [],
  ]);

  const groups: Group[] = [
    ...topUps.map((row) => ({
      nombre: String(row[topUpField] ?? "Sin especificar"),
      cantidad: row._count._all,
      monto: Number(row._sum.monto?.toString() ?? 0),
    })),
    ...withdrawals.map((row) => ({
      nombre: String(row[withdrawalField] ?? "Sin especificar"),
      cantidad: row._count._all,
      monto: Number(row._sum.monto?.toString() ?? 0),
    })),
    ...services.map((row) => ({
      nombre: String(row[serviceField] ?? "Sin especificar"),
      cantidad: row._count._all,
      monto: 0,
    })),
  ];

  return { dimension: filters.dimension, grupos: mergeGroups(groups) };
}
