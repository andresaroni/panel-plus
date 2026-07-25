import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { submittedTopUpWhere } from "@/lib/recargas";
import { submittedWithdrawalWhere } from "@/lib/retiros";

export async function getRequestsVersion() {
  const [topUps, topUpStates, withdrawals, withdrawalStates] = await Promise.all([
    prisma.recarga_whatsapp.aggregate({
      where: submittedTopUpWhere,
      _count: { _all: true },
      _max: { id_recarga: true, date_update: true },
    }),
    prisma.recarga_whatsapp.groupBy({
      where: submittedTopUpWhere,
      by: ["estado"],
      _count: { _all: true },
      orderBy: { estado: "asc" },
    }),
    prisma.retirar_saldo.aggregate({
      where: submittedWithdrawalWhere,
      _count: { _all: true },
      _max: { id_retiro: true, date_update: true },
    }),
    prisma.retirar_saldo.groupBy({
      where: submittedWithdrawalWhere,
      by: ["estado"],
      _count: { _all: true },
      orderBy: { estado: "asc" },
    }),
  ]);

  const fingerprint = JSON.stringify({
    topUps: {
      count: topUps._count._all,
      lastId: topUps._max.id_recarga?.toString() ?? "0",
      updatedAt: topUps._max.date_update?.toISOString() ?? null,
      states: topUpStates.map((item) => [item.estado, item._count._all]),
    },
    withdrawals: {
      count: withdrawals._count._all,
      lastId: withdrawals._max.id_retiro?.toString() ?? "0",
      updatedAt: withdrawals._max.date_update?.toISOString() ?? null,
      states: withdrawalStates.map((item) => [item.estado, item._count._all]),
    },
  });

  return createHash("sha256").update(fingerprint).digest("base64url");
}
