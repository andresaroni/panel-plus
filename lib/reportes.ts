import "server-only";

import { Prisma, type recarga_whatsapp_estado, type retirar_saldo_estado } from "@prisma/client";

import type { Status } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { parseDateRange, requestSelect } from "@/lib/recargas";
import { withdrawalSelect } from "@/lib/retiros";

export type ReportOperation = "todas" | "recarga" | "retiro";

export type ReportFilters = {
  from: string;
  to: string;
  platform: string;
  status: string;
  operation: ReportOperation;
};

export type ReportRecord = {
  key: string;
  id: string;
  uuid: string;
  operation: "Recarga" | "Retiro";
  client: string;
  clientId: string;
  username: string;
  platform: string;
  branch: string;
  bank: string;
  reference: string;
  amount: string;
  status: Status;
  createdAt: Date;
};

const topUpStatuses = new Set<recarga_whatsapp_estado>([
  "pendiente",
  "aprobado",
  "rechazado",
]);
const withdrawalStatuses = new Set<retirar_saldo_estado>([
  "borrador",
  "pendiente",
  "aprobado",
  "error_comprobante",
  "pagado",
  "rechazado",
  "cancelado",
]);

function getSources(filters: ReportFilters) {
  const dateRange = parseDateRange(filters.from, filters.to);
  const topUpWhere: Prisma.recarga_whatsappWhereInput = {};
  const withdrawalWhere: Prisma.retirar_saldoWhereInput = {};

  if (dateRange) {
    topUpWhere.date_create = dateRange;
    withdrawalWhere.date_create = dateRange;
  }
  if (filters.platform) {
    topUpWhere.plataforma_nombre = filters.platform;
    withdrawalWhere.plataforma_nombre = filters.platform;
  }

  const topUpStatus = filters.status as recarga_whatsapp_estado;
  const withdrawalStatus = filters.status as retirar_saldo_estado;
  const includeTopUps =
    filters.operation !== "retiro" &&
    (!filters.status || topUpStatuses.has(topUpStatus));
  const includeWithdrawals =
    filters.operation !== "recarga" &&
    (!filters.status || withdrawalStatuses.has(withdrawalStatus));

  if (filters.status && includeTopUps) topUpWhere.estado = topUpStatus;
  if (filters.status && includeWithdrawals) withdrawalWhere.estado = withdrawalStatus;

  return { includeTopUps, includeWithdrawals, topUpWhere, withdrawalWhere };
}

function normalizeTopUp(item: Prisma.recarga_whatsappGetPayload<{ select: typeof requestSelect }>): ReportRecord {
  return {
    key: `recarga-${item.id_recarga}`,
    id: `REC-${item.id_recarga.toString().padStart(4, "0")}`,
    uuid: item.operacion_uuid,
    operation: "Recarga",
    client: item.cliente_nombres ?? "Sin nombre",
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "sin-usuario",
    platform: item.plataforma_nombre ?? "No disponible",
    branch: item.sucursal_nombre ?? "No disponible",
    bank: item.banco_nombre_validado ?? item.banco_nombre_detectado ?? "No detectado",
    reference: item.numero_comprobante?.toString() ?? "N/D",
    amount: item.monto?.toString() ?? "0",
    status: item.estado,
    createdAt: item.date_create,
  };
}

function normalizeWithdrawal(
  item: Prisma.retirar_saldoGetPayload<{ select: typeof withdrawalSelect }>,
): ReportRecord {
  return {
    key: `retiro-${item.id_retiro}`,
    id: `RET-${item.id_retiro.toString().padStart(4, "0")}`,
    uuid: item.operacion_uuid,
    operation: "Retiro",
    client: item.cliente_nombres ?? "Sin nombre",
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "sin-usuario",
    platform:
      item.plataforma_nombre ??
      (item.origen ? item.origen.replaceAll("_", " ") : "No disponible"),
    branch: item.sucursal_nombre ?? "No disponible",
    bank: item.banco_origen_detectado ?? item.banco_destino ?? "No detectado",
    reference:
      item.numero_comprobante?.toString() ?? item.numero_cuenta_destino ?? "N/D",
    amount: item.monto?.toString() ?? "0",
    status: item.estado,
    createdAt: item.date_create,
  };
}

export async function getReportPage(
  filters: ReportFilters,
  page: number,
  pageSize: number,
) {
  const sources = getSources(filters);
  const take = page * pageSize;
  const [topUps, withdrawals, topUpCount, withdrawalCount] = await Promise.all([
    sources.includeTopUps
      ? prisma.recarga_whatsapp.findMany({
          where: sources.topUpWhere,
          select: requestSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    sources.includeWithdrawals
      ? prisma.retirar_saldo.findMany({
          where: sources.withdrawalWhere,
          select: withdrawalSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    sources.includeTopUps
      ? prisma.recarga_whatsapp.count({ where: sources.topUpWhere })
      : 0,
    sources.includeWithdrawals
      ? prisma.retirar_saldo.count({ where: sources.withdrawalWhere })
      : 0,
  ]);

  const records = [
    ...topUps.map(normalizeTopUp),
    ...withdrawals.map(normalizeWithdrawal),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const offset = (page - 1) * pageSize;

  return {
    records: records.slice(offset, offset + pageSize),
    total: topUpCount + withdrawalCount,
  };
}

export async function getReportMetrics(filters: ReportFilters) {
  const sources = getSources(filters);

  async function getTopUpStats() {
    if (!sources.includeTopUps) {
      return { total: 0, approved: 0, approvedAmount: 0, rejectedAmount: 0 };
    }
    const [total, approved, approvedAmount, rejectedAmount] = await Promise.all([
      prisma.recarga_whatsapp.count({ where: sources.topUpWhere }),
      prisma.recarga_whatsapp.count({
        where: { AND: [sources.topUpWhere, { estado: "aprobado" }] },
      }),
      prisma.recarga_whatsapp.aggregate({
        where: { AND: [sources.topUpWhere, { estado: "aprobado" }] },
        _sum: { monto: true },
      }),
      prisma.recarga_whatsapp.aggregate({
        where: { AND: [sources.topUpWhere, { estado: "rechazado" }] },
        _sum: { monto: true },
      }),
    ]);
    return {
      total,
      approved,
      approvedAmount: Number(approvedAmount._sum.monto?.toString() ?? 0),
      rejectedAmount: Number(rejectedAmount._sum.monto?.toString() ?? 0),
    };
  }

  async function getWithdrawalStats() {
    if (!sources.includeWithdrawals) {
      return { total: 0, approved: 0, approvedAmount: 0, rejectedAmount: 0 };
    }
    const approvedWhere: Prisma.retirar_saldoWhereInput = {
      AND: [sources.withdrawalWhere, { estado: { in: ["aprobado", "pagado"] } }],
    };
    const [total, approved, approvedAmount, rejectedAmount] = await Promise.all([
      prisma.retirar_saldo.count({ where: sources.withdrawalWhere }),
      prisma.retirar_saldo.count({ where: approvedWhere }),
      prisma.retirar_saldo.aggregate({ where: approvedWhere, _sum: { monto: true } }),
      prisma.retirar_saldo.aggregate({
        where: { AND: [sources.withdrawalWhere, { estado: "rechazado" }] },
        _sum: { monto: true },
      }),
    ]);
    return {
      total,
      approved,
      approvedAmount: Number(approvedAmount._sum.monto?.toString() ?? 0),
      rejectedAmount: Number(rejectedAmount._sum.monto?.toString() ?? 0),
    };
  }

  const [topUps, withdrawals] = await Promise.all([getTopUpStats(), getWithdrawalStats()]);
  return {
    total: topUps.total + withdrawals.total,
    approved: topUps.approved + withdrawals.approved,
    approvedAmount: topUps.approvedAmount + withdrawals.approvedAmount,
    rejectedAmount: topUps.rejectedAmount + withdrawals.rejectedAmount,
  };
}

export async function getReportPlatforms(operation: ReportOperation) {
  const [topUps, withdrawals] = await Promise.all([
    operation !== "retiro"
      ? prisma.recarga_whatsapp.findMany({
          where: { plataforma_nombre: { not: null } },
          distinct: ["plataforma_nombre"],
          select: { plataforma_nombre: true },
        })
      : [],
    operation !== "recarga"
      ? prisma.retirar_saldo.findMany({
          where: { plataforma_nombre: { not: null } },
          distinct: ["plataforma_nombre"],
          select: { plataforma_nombre: true },
        })
      : [],
  ]);

  return [...new Set([...topUps, ...withdrawals].map((item) => item.plataforma_nombre).filter(Boolean))]
    .sort((left, right) => left!.localeCompare(right!, "es")) as string[];
}

export async function getReportExportRecords(filters: ReportFilters) {
  const sources = getSources(filters);
  const [topUps, withdrawals] = await Promise.all([
    sources.includeTopUps
      ? prisma.recarga_whatsapp.findMany({
          where: sources.topUpWhere,
          select: requestSelect,
          orderBy: { date_create: "desc" },
          take: 10_000,
        })
      : [],
    sources.includeWithdrawals
      ? prisma.retirar_saldo.findMany({
          where: sources.withdrawalWhere,
          select: withdrawalSelect,
          orderBy: { date_create: "desc" },
          take: 10_000,
        })
      : [],
  ]);

  return [...topUps.map(normalizeTopUp), ...withdrawals.map(normalizeWithdrawal)]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 10_000);
}
