import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

const globalForApuestas = globalThis as unknown as { apuestas?: PrismaClient };

/// La base `apuestas` es opcional: el panel opera sobre `registro_bot` y solo la pantalla de
/// plataformas la necesita. Si la variable no está definida, el resto del panel debe seguir
/// funcionando en lugar de fallar al arrancar.
export const isApuestasConfigured = env.APUESTAS_DATABASE_URL !== undefined;

let cached: PrismaClient | undefined;

/// Cliente dedicado a la base `apuestas`, donde viven las plataformas, su inventario de
/// saldos y las sucursales. Solo se usa con consultas sin modelo (`$queryRaw`) y nunca
/// escribe. Se crea de forma perezosa para no abrir una conexión cuando no está configurada.
function getApuestasClient() {
  const url = env.APUESTAS_DATABASE_URL;
  if (!url) {
    throw new Error("Falta configurar APUESTAS_DATABASE_URL para consultar las plataformas.");
  }

  cached ??=
    globalForApuestas.apuestas ??
    new PrismaClient({
      datasourceUrl: url,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForApuestas.apuestas = cached;

  return cached;
}

export type PlatformBalance = {
  code: number;
  name: string;
  balance: Prisma.Decimal;
  branch: string | null;
  updatedAt: Date | null;
};

export async function getPlatformBalances() {
  return getApuestasClient().$queryRaw<PlatformBalance[]>`
    SELECT
      p.id_plataforma AS code,
      TRIM(p.nombre)  AS name,
      i.saldo         AS balance,
      TRIM(s.nombre)  AS branch,
      i.date_update   AS updatedAt
    FROM plataforma p
    INNER JOIN inventario_plataforma i ON i.plataforma_id = p.id_plataforma
    LEFT JOIN sucursal s ON s.id_sucursal = i.sucursal_id
    ORDER BY s.nombre ASC, p.nombre ASC, p.id_plataforma ASC
  `;
}
