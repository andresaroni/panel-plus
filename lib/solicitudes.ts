import "server-only";

import type { Status } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { buildSearchWhere, requestSelect, submittedTopUpWhere } from "@/lib/recargas";
import {
  buildServiceRequestWhere,
  serviceRequestSelect,
} from "@/lib/service-requests";
import {
  buildWithdrawalWhere,
  submittedWithdrawalWhere,
  withdrawalSelect,
} from "@/lib/retiros";

export type OperationFilter = "todas" | "recarga" | "retiro" | "servicio";

export type UnifiedRequest = {
  key: string;
  type: "recarga" | "retiro" | "servicio";
  id: string;
  client: string;
  username: string;
  platform: string;
  amount: string | null;
  status: Status;
  createdAt: Date;
};

export async function getUnifiedRequests({
  query,
  operation,
  page,
  pageSize,
}: {
  query: string;
  operation: OperationFilter;
  page: number;
  pageSize: number;
}) {
  const take = page * pageSize;
  const includeTopUps = operation === "todas" || operation === "recarga";
  const includeWithdrawals = operation === "todas" || operation === "retiro";
  const includeServices = operation === "todas" || operation === "servicio";
  const topUpWhere = buildSearchWhere(query);
  const withdrawalWhere = buildWithdrawalWhere(query);
  const serviceWhere = buildServiceRequestWhere(query);

  const [topUps, withdrawals, services, topUpCount, withdrawalCount, serviceCount] = await Promise.all([
    includeTopUps
      ? prisma.recarga_whatsapp.findMany({
          where: topUpWhere,
          select: requestSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    includeWithdrawals
      ? prisma.retirar_saldo.findMany({
          where: withdrawalWhere,
          select: withdrawalSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    includeServices
      ? prisma.solicitudes_servicio.findMany({
          where: serviceWhere,
          select: serviceRequestSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    prisma.recarga_whatsapp.count({ where: topUpWhere }),
    prisma.retirar_saldo.count({ where: withdrawalWhere }),
    prisma.solicitudes_servicio.count({ where: serviceWhere }),
  ]);

  const combined: UnifiedRequest[] = [
    ...topUps.map((item) => ({
      key: `recarga-${item.id_recarga}`,
      type: "recarga" as const,
      id: item.id_recarga.toString(),
      client: item.cliente_nombres ?? "Cliente sin nombre",
      username: item.cliente_usuario ?? "sin-usuario",
      platform: item.plataforma_nombre ?? "No disponible",
      amount: item.monto?.toString() ?? "0",
      status: item.estado,
      createdAt: item.date_create,
    })),
    ...withdrawals.map((item) => ({
      key: `retiro-${item.id_retiro}`,
      type: "retiro" as const,
      id: item.id_retiro.toString(),
      client: item.cliente_nombres ?? "Cliente sin nombre",
      username: item.cliente_usuario ?? "sin-usuario",
      platform:
        item.plataforma_nombre ??
        (item.origen ? item.origen.replaceAll("_", " ") : "No disponible"),
      amount: item.monto?.toString() ?? "0",
      status: item.estado,
      createdAt: item.date_create,
    })),
    ...services.map((item) => ({
      key: `servicio-${item.id_solicitud}`,
      type: "servicio" as const,
      id: item.id_solicitud.toString(),
      client: item.cliente_nombres ?? "Cliente sin nombre",
      username: item.cliente_usuario ?? "sin-usuario",
      platform: item.sucursal_nombre ?? "No disponible",
      amount: null,
      status: item.estado,
      createdAt: item.date_create,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const total =
    operation === "recarga"
      ? topUpCount
      : operation === "retiro"
        ? withdrawalCount
        : operation === "servicio"
          ? serviceCount
          : topUpCount + withdrawalCount + serviceCount;
  const offset = (page - 1) * pageSize;
  return {
    items: combined.slice(offset, offset + pageSize),
    total,
    topUpCount,
    withdrawalCount,
    serviceCount,
  };
}

export async function getRequestMetrics(dayStart: Date, dayEnd: Date) {
  const [
    pendingTopUps,
    pendingWithdrawals,
    approvedTopUpsToday,
    approvedWithdrawalsToday,
    topUpVolume,
    withdrawalVolume,
    totalTopUps,
    totalWithdrawals,
    pendingServices,
    totalServices,
  ] = await Promise.all([
    prisma.recarga_whatsapp.count({
      where: { AND: [submittedTopUpWhere, { estado: "pendiente" }] },
    }),
    prisma.retirar_saldo.count({
      where: { estado: { in: ["pendiente", "error_comprobante"] } },
    }),
    prisma.recarga_whatsapp.count({
      where: {
        AND: [
          submittedTopUpWhere,
          { estado: "aprobado", date_update: { gte: dayStart, lte: dayEnd } },
        ],
      },
    }),
    prisma.retirar_saldo.count({
      where: {
        estado: { in: ["aprobado", "pagado"] },
        revisado_at: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.recarga_whatsapp.aggregate({
      where: { AND: [submittedTopUpWhere, { estado: "aprobado" }] },
      _sum: { monto: true },
    }),
    prisma.retirar_saldo.aggregate({
      where: { estado: { in: ["aprobado", "pagado"] } },
      _sum: { monto: true },
    }),
    prisma.recarga_whatsapp.count({ where: submittedTopUpWhere }),
    prisma.retirar_saldo.count({ where: submittedWithdrawalWhere }),
    prisma.solicitudes_servicio.count({ where: { estado: "pendiente" } }),
    prisma.solicitudes_servicio.count(),
  ]);

  return {
    pending: pendingTopUps + pendingWithdrawals + pendingServices,
    approvedToday: approvedTopUpsToday + approvedWithdrawalsToday,
    volume:
      Number(topUpVolume._sum.monto?.toString() ?? 0) +
      Number(withdrawalVolume._sum.monto?.toString() ?? 0),
    total: totalTopUps + totalWithdrawals + totalServices,
  };
}
