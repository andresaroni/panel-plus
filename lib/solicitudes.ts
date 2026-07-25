import "server-only";

import type { Status } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { buildSearchWhere, requestSelect, submittedTopUpWhere } from "@/lib/recargas";
import {
  buildWithdrawalWhere,
  submittedWithdrawalWhere,
  withdrawalSelect,
} from "@/lib/retiros";

export type OperationFilter = "todas" | "recarga" | "retiro";

export type UnifiedRequest = {
  key: string;
  type: "recarga" | "retiro";
  id: string;
  client: string;
  username: string;
  platform: string;
  amount: string;
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
  const includeTopUps = operation !== "retiro";
  const includeWithdrawals = operation !== "recarga";
  const topUpWhere = buildSearchWhere(query);
  const withdrawalWhere = buildWithdrawalWhere(query);

  const [topUps, withdrawals, topUpCount, withdrawalCount] = await Promise.all([
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
    prisma.recarga_whatsapp.count({ where: topUpWhere }),
    prisma.retirar_saldo.count({ where: withdrawalWhere }),
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
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const total =
    operation === "recarga"
      ? topUpCount
      : operation === "retiro"
        ? withdrawalCount
        : topUpCount + withdrawalCount;
  const offset = (page - 1) * pageSize;
  return {
    items: combined.slice(offset, offset + pageSize),
    total,
    topUpCount,
    withdrawalCount,
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
  ]);

  return {
    pending: pendingTopUps + pendingWithdrawals,
    approvedToday: approvedTopUpsToday + approvedWithdrawalsToday,
    volume:
      Number(topUpVolume._sum.monto?.toString() ?? 0) +
      Number(withdrawalVolume._sum.monto?.toString() ?? 0),
    total: totalTopUps + totalWithdrawals,
  };
}
