import "server-only";

import type { Status } from "@/components/status-badge";
import {
  buildFailedReceiptWhere,
  escalatedFailedReceiptWhere,
  failedReceiptSelect,
} from "@/lib/failed-receipts";
import { getGiroMetrics, listGiroRequests } from "@/lib/giros";
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

export type OperationFilter = "todas" | "recarga" | "retiro" | "servicio" | "comprobante" | "giro";

export type UnifiedRequest = {
  key: string;
  type: "recarga" | "retiro" | "servicio" | "comprobante" | "giro";
  id: string;
  client: string;
  username: string;
  platform: string;
  amount: string | null;
  status: Status;
  createdAt: Date;
  /** Comprobante cuyo QR no coincide con la imagen (validación del asistente). */
  forged?: boolean;
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
  const includeFailedReceipts = operation === "todas" || operation === "comprobante";
  const includeGiros = operation === "todas" || operation === "giro";
  const topUpWhere = buildSearchWhere(query);
  const withdrawalWhere = buildWithdrawalWhere(query);
  const serviceWhere = buildServiceRequestWhere(query);
  const failedReceiptWhere = buildFailedReceiptWhere(query);

  const [
    topUps,
    withdrawals,
    services,
    failedReceipts,
    topUpCount,
    withdrawalCount,
    serviceCount,
    failedReceiptCount,
    giros,
  ] = await Promise.all([
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
    includeFailedReceipts
      ? prisma.recarga_comprobante_fallido.findMany({
          where: failedReceiptWhere,
          select: failedReceiptSelect,
          orderBy: { date_create: "desc" },
          take,
        })
      : [],
    prisma.recarga_whatsapp.count({ where: topUpWhere }),
    prisma.retirar_saldo.count({ where: withdrawalWhere }),
    prisma.solicitudes_servicio.count({ where: serviceWhere }),
    prisma.recarga_comprobante_fallido.count({ where: failedReceiptWhere }),
    // Giro Bancario Dealers (base apuestas). Siempre se consulta para el conteo de la pestaña.
    listGiroRequests(query, includeGiros ? take : 0),
  ]);
  const giroCount = giros.total;

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
    ...failedReceipts.map((item) => ({
      key: `comprobante-${item.id_fallo}`,
      type: "comprobante" as const,
      id: item.id_fallo.toString(),
      client: item.cliente_nombres ?? "Cliente sin nombre",
      username: item.cliente_usuario ?? "sin-usuario",
      platform: item.plataforma_nombre ?? "No disponible",
      amount: item.monto?.toString() ?? null,
      status: item.estado,
      createdAt: item.date_create,
      forged: item.motivo === "comprobante_falso",
    })),
    ...giros.items.map((item) => ({
      key: `giro-${item.id}`,
      type: "giro" as const,
      id: String(item.id),
      client: item.client ?? "Cliente sin nombre",
      username: item.sellerUsername ?? "sin-usuario",
      platform: `${item.operation === "Deposito" ? "Depósito" : "Retiro"} · ${item.branch ?? "Sin sucursal"}`,
      amount: item.total.toString(),
      status: item.status,
      createdAt: item.createdAt,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const total =
    operation === "recarga"
      ? topUpCount
      : operation === "retiro"
        ? withdrawalCount
        : operation === "servicio"
          ? serviceCount
          : operation === "comprobante"
            ? failedReceiptCount
            : operation === "giro"
              ? giroCount
              : topUpCount + withdrawalCount + serviceCount + failedReceiptCount + giroCount;
  const offset = (page - 1) * pageSize;
  return {
    items: combined.slice(offset, offset + pageSize),
    total,
    topUpCount,
    withdrawalCount,
    serviceCount,
    failedReceiptCount,
    giroCount,
  };
}

export async function getRequestMetrics(
  dayStart: Date,
  dayEnd: Date,
  monthStart: Date,
  monthEnd: Date,
) {
  const month = { gte: monthStart, lte: monthEnd };
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
    pendingFailedReceipts,
    totalFailedReceipts,
    giroMetrics,
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
      where: { AND: [submittedTopUpWhere, { estado: "aprobado", date_update: month }] },
      _sum: { monto: true },
    }),
    prisma.retirar_saldo.aggregate({
      where: { estado: { in: ["aprobado", "pagado"] }, revisado_at: month },
      _sum: { monto: true },
    }),
    prisma.recarga_whatsapp.count({
      where: { AND: [submittedTopUpWhere, { date_create: month }] },
    }),
    prisma.retirar_saldo.count({
      where: { AND: [submittedWithdrawalWhere, { date_create: month }] },
    }),
    prisma.solicitudes_servicio.count({ where: { estado: "pendiente" } }),
    prisma.solicitudes_servicio.count({ where: { date_create: month } }),
    prisma.recarga_comprobante_fallido.count({ where: { estado: "pendiente" } }),
    prisma.recarga_comprobante_fallido.count({
      where: { AND: [escalatedFailedReceiptWhere, { date_create: month }] },
    }),
    getGiroMetrics(),
  ]);

  return {
    pending:
      pendingTopUps + pendingWithdrawals + pendingServices + pendingFailedReceipts + giroMetrics.pending,
    approvedToday: approvedTopUpsToday + approvedWithdrawalsToday + giroMetrics.approvedToday,
    volumeMonth:
      Number(topUpVolume._sum.monto?.toString() ?? 0) +
      Number(withdrawalVolume._sum.monto?.toString() ?? 0),
    totalMonth:
      totalTopUps + totalWithdrawals + totalServices + totalFailedReceipts + giroMetrics.totalMonth,
  };
}
