import "server-only";

import { Prisma } from "@prisma/client";

import { getApuestasClient, isApuestasConfigured } from "@/lib/apuestas";
import {
  ecuadorDateParts,
  findInsufficientBank,
  formatGiroReceiptNumber,
  formatGiroRequestNumber,
  fromCents,
  toCents,
  type GiroOperation,
} from "@/lib/giro-receipt";

/// "Giro Bancario Dealers": solicitudes de depósito/retiro que los vendedores de
/// Master-Ventory envían con el botón "Solicitar". Viven en la base `apuestas`
/// (tablas giro_solicitud y giro_solicitud_detalle).
///
/// Al aprobar, el panel registra el giro igual que Master-Ventory
/// (GirosRegistro.php -> girosRegistrarItems): comprobante ENE-00001, giro_transaccion y
/// saldo de la Cuenta para Giros (tabla banco). Si cambia allá, cambiarlo aquí.

export type GiroStatus = "pendiente" | "aprobado" | "rechazado" | "cancelado";

export class GiroRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** true si la base apuestas no tiene aún las tablas de solicitudes (migración pendiente). */
function isMissingTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2010" || error.code === "P2021") &&
    /doesn't exist|1146/i.test(error.message)
  );
}

async function safely<T>(fallback: T, run: () => Promise<T>) {
  if (!isApuestasConfigured) return fallback;
  try {
    return await run();
  } catch (error) {
    // Un fallo de giros no debe tumbar el centro de solicitudes completo.
    if (!isMissingTable(error)) console.error("Giros: error al consultar la base apuestas", error);
    return fallback;
  }
}

function buildSearch(query: string) {
  const term = query.trim();
  if (!term) return Prisma.empty;
  const like = `%${term}%`;
  const id = /^(?:sol-?)?0*(\d{1,10})$/i.exec(term)?.[1];
  return Prisma.sql`AND (
    u.nombres LIKE ${like} OR u.usuario LIKE ${like} OR su.nombre LIKE ${like}
    ${id ? Prisma.sql`OR s.id_giro_solicitud = ${Number(id)}` : Prisma.empty}
    OR EXISTS (
      SELECT 1 FROM giro_solicitud_detalle d
      LEFT JOIN cliente c ON c.id_cliente = d.cliente_id
      WHERE d.giro_solicitud_id = s.id_giro_solicitud
        AND (c.nombres LIKE ${like} OR c.cedula LIKE ${like} OR c.usuario LIKE ${like}
             OR d.numero_cuenta LIKE ${like} OR d.titular LIKE ${like})
    )
  )`;
}

export type GiroListItem = {
  id: number;
  operation: GiroOperation;
  total: Prisma.Decimal;
  status: GiroStatus;
  createdAt: Date;
  seller: string | null;
  sellerUsername: string | null;
  branch: string | null;
  client: string | null;
};

export async function listGiroRequests(query: string, take: number) {
  return safely<{ items: GiroListItem[]; total: number }>({ items: [], total: 0 }, async () => {
    const client = getApuestasClient();
    const search = buildSearch(query);
    const [items, count] = await Promise.all([
      client.$queryRaw<GiroListItem[]>`
        SELECT s.id_giro_solicitud AS id, s.tipo_operacion AS operation, s.total, s.estado AS status,
               s.date_create AS createdAt, TRIM(u.nombres) AS seller, TRIM(u.usuario) AS sellerUsername,
               TRIM(su.nombre) AS branch,
               (SELECT TRIM(c.nombres) FROM giro_solicitud_detalle d
                  LEFT JOIN cliente c ON c.id_cliente = d.cliente_id
                 WHERE d.giro_solicitud_id = s.id_giro_solicitud
                 ORDER BY d.id_giro_solicitud_detalle LIMIT 1) AS client
        FROM giro_solicitud s
        LEFT JOIN usuario u ON u.id_usuario = s.usuario_id
        LEFT JOIN sucursal su ON su.id_sucursal = s.sucursal_id
        WHERE 1 = 1 ${search}
        ORDER BY s.date_create DESC, s.id_giro_solicitud DESC
        LIMIT ${take}
      `,
      client.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total
        FROM giro_solicitud s
        LEFT JOIN usuario u ON u.id_usuario = s.usuario_id
        LEFT JOIN sucursal su ON su.id_sucursal = s.sucursal_id
        WHERE 1 = 1 ${search}
      `,
    ]);
    return { items, total: Number(count[0]?.total ?? 0) };
  });
}

/** Pendientes, aprobadas hoy y registradas en el mes (hora de Ecuador). */
export async function getGiroMetrics() {
  return safely({ pending: 0, approvedToday: 0, totalMonth: 0 }, async () => {
    const { day } = ecuadorDateParts();
    const monthStart = `${day.slice(0, 7)}-01 00:00:00`;
    const rows = await getApuestasClient().$queryRaw<
      { pending: bigint; approvedToday: bigint; totalMonth: bigint }[]
    >`
      SELECT
        SUM(estado = 'pendiente') AS pending,
        SUM(estado = 'aprobado' AND revisado_at BETWEEN ${`${day} 00:00:00`} AND ${`${day} 23:59:59`}) AS approvedToday,
        SUM(date_create >= ${monthStart}) AS totalMonth
      FROM giro_solicitud
    `;
    const row = rows[0];
    return {
      pending: Number(row?.pending ?? 0),
      approvedToday: Number(row?.approvedToday ?? 0),
      totalMonth: Number(row?.totalMonth ?? 0),
    };
  });
}

/** Huella para la sincronización en vivo del centro de solicitudes. */
export async function getGiroVersion() {
  return safely<string | null>(null, async () => {
    const rows = await getApuestasClient().$queryRaw<
      { count: bigint; lastId: number | null; updatedAt: Date | null; pending: bigint }[]
    >`
      SELECT COUNT(*) AS count, MAX(id_giro_solicitud) AS lastId, MAX(date_update) AS updatedAt,
             SUM(estado = 'pendiente') AS pending
      FROM giro_solicitud
    `;
    const row = rows[0];
    return JSON.stringify([
      Number(row?.count ?? 0),
      row?.lastId ?? 0,
      row?.updatedAt?.toISOString() ?? null,
      Number(row?.pending ?? 0),
    ]);
  });
}

type GiroHeaderRow = {
  id: number;
  operation: GiroOperation;
  subtotal: Prisma.Decimal;
  commission: Prisma.Decimal;
  total: Prisma.Decimal;
  status: GiroStatus;
  rejectReason: string | null;
  agent: string | null;
  createdAt: string;
  reviewedAt: string | null;
  seller: string | null;
  sellerUsername: string | null;
  branch: string | null;
  branchAddress: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
};

type GiroDetailRow = {
  bankId: number;
  bank: string | null;
  account: string | null;
  accountType: string;
  accountNumber: string;
  holder: string;
  holderId: string | null;
  client: string | null;
  clientId: string | null;
  amount: Prisma.Decimal;
  commission: Prisma.Decimal;
  balance: Prisma.Decimal | null;
};

export async function getGiroRequest(id: number) {
  return safely(null, async () => {
    const client = getApuestasClient();
    const [headers, details] = await Promise.all([
      client.$queryRaw<GiroHeaderRow[]>`
        SELECT s.id_giro_solicitud AS id, s.tipo_operacion AS operation, s.subtotal, s.comision AS commission,
               s.total, s.estado AS status, s.motivo_rechazo AS rejectReason, s.agente_nombre AS agent,
               DATE_FORMAT(s.date_create, '%Y-%m-%d %H:%i:%s') AS createdAt,
               DATE_FORMAT(s.revisado_at, '%Y-%m-%d %H:%i:%s') AS reviewedAt,
               TRIM(u.nombres) AS seller, TRIM(u.usuario) AS sellerUsername,
               TRIM(su.nombre) AS branch, TRIM(su.direccion) AS branchAddress,
               gc.numero AS receiptNumber, DATE_FORMAT(gc.date_create, '%Y-%m-%d %H:%i:%s') AS receiptDate
        FROM giro_solicitud s
        LEFT JOIN usuario u ON u.id_usuario = s.usuario_id
        LEFT JOIN sucursal su ON su.id_sucursal = s.sucursal_id
        LEFT JOIN giro_comprobante gc ON gc.id_giro_comprobante = s.giro_comprobante_id
        WHERE s.id_giro_solicitud = ${id}
      `,
      client.$queryRaw<GiroDetailRow[]>`
        SELECT d.giro_banco_id AS bankId, TRIM(g.nombre) AS bank, TRIM(b.nombre_banco) AS account,
               d.tipo_cuenta AS accountType, d.numero_cuenta AS accountNumber, d.titular AS holder,
               d.cedula_titular AS holderId, TRIM(c.nombres) AS client, c.cedula AS clientId,
               d.monto AS amount, d.comision AS commission, b.saldo AS balance
        FROM giro_solicitud_detalle d
        LEFT JOIN giro_banco g ON g.id_giro_banco = d.giro_banco_id
        LEFT JOIN banco b ON b.id_banco = g.banco_id
        LEFT JOIN cliente c ON c.id_cliente = d.cliente_id
        WHERE d.giro_solicitud_id = ${id}
        ORDER BY d.id_giro_solicitud_detalle ASC
      `,
    ]);
    const header = headers[0];
    if (!header) return null;
    return serializeGiroRequest(header, details);
  });
}

function serializeGiroRequest(header: GiroHeaderRow, details: GiroDetailRow[]) {
  return {
    id: String(header.id),
    requestNumber: formatGiroRequestNumber(header.id),
    operation: header.operation,
    subtotal: header.subtotal.toString(),
    commission: header.commission.toString(),
    total: header.total.toString(),
    status: header.status,
    rejectReason: header.rejectReason,
    agent: header.agent,
    createdAt: header.createdAt,
    reviewedAt: header.reviewedAt,
    seller: header.seller ?? "No disponible",
    sellerUsername: header.sellerUsername ?? "sin-usuario",
    branch: header.branch ?? "No disponible",
    branchAddress: header.branchAddress,
    receiptNumber: header.receiptNumber,
    receiptDate: header.receiptDate,
    items: details.map((item) => ({
      bank: item.bank ?? "Banco eliminado",
      account: item.account,
      accountType: item.accountType,
      accountNumber: item.accountNumber,
      holder: item.holder,
      holderId: item.holderId,
      client: item.client ?? "Cliente no disponible",
      clientId: item.clientId,
      amount: item.amount.toString(),
      commission: item.commission.toString(),
      balance: item.balance?.toString() ?? null,
    })),
  };
}

export type GiroRequest = ReturnType<typeof serializeGiroRequest>;

type LockedRequest = {
  status: GiroStatus;
  operation: GiroOperation;
  sellerId: number;
  branchId: number;
};

type LockedItem = {
  bankId: number;
  bankName: string | null;
  accountNumber: string;
  accountType: string;
  holder: string;
  holderId: string | null;
  clientId: number;
  amount: Prisma.Decimal;
  commission: Prisma.Decimal;
};

/**
 * Aprueba una solicitud pendiente y registra el giro en una sola transacción.
 * Devuelve el número de comprobante generado (ej. NOV-00004).
 */
export async function approveGiroRequest(id: number, agent: { id: number; name: string }) {
  if (!isApuestasConfigured) {
    throw new GiroRequestError("Falta configurar APUESTAS_DATABASE_URL.", 503);
  }

  return getApuestasClient().$transaction(
    async (tx) => {
      const requests = await tx.$queryRaw<LockedRequest[]>`
        SELECT estado AS status, tipo_operacion AS operation, usuario_id AS sellerId, sucursal_id AS branchId
        FROM giro_solicitud
        WHERE id_giro_solicitud = ${id}
        FOR UPDATE
      `;
      const request = requests[0];
      if (!request) throw new GiroRequestError("La solicitud no existe.", 404);
      if (request.status !== "pendiente") {
        throw new GiroRequestError("La solicitud ya fue revisada o el vendedor la canceló.", 409);
      }

      const items = await tx.$queryRaw<LockedItem[]>`
        SELECT d.giro_banco_id AS bankId, TRIM(g.nombre) AS bankName, d.numero_cuenta AS accountNumber,
               d.tipo_cuenta AS accountType, d.titular AS holder, d.cedula_titular AS holderId,
               d.cliente_id AS clientId, d.monto AS amount, d.comision AS commission
        FROM giro_solicitud_detalle d
        LEFT JOIN giro_banco g ON g.id_giro_banco = d.giro_banco_id
        WHERE d.giro_solicitud_id = ${id}
        ORDER BY d.id_giro_solicitud_detalle ASC
      `;
      if (items.length === 0) throw new GiroRequestError("La solicitud no tiene giros.", 409);

      // Bloquear la Cuenta para Giros de cada banco, en orden fijo para evitar bloqueos cruzados
      const bankIds = [...new Set(items.map((item) => item.bankId))].sort((a, b) => a - b);
      const accounts = new Map<number, { accountId: number; cents: number }>();
      for (const bankId of bankIds) {
        const rows = await tx.$queryRaw<{ accountId: number; balance: Prisma.Decimal }[]>`
          SELECT b.id_banco AS accountId, b.saldo AS balance
          FROM giro_banco g
          JOIN banco b ON b.id_banco = g.banco_id
          WHERE g.id_giro_banco = ${bankId} AND g.estado = 1
          FOR UPDATE
        `;
        if (!rows[0]) {
          const name = items.find((item) => item.bankId === bankId)?.bankName ?? `#${bankId}`;
          throw new GiroRequestError(
            `El banco ${name} está inactivo o no tiene una Cuenta para Giros asignada.`,
            409,
          );
        }
        accounts.set(bankId, { accountId: rows[0].accountId, cents: toCents(rows[0].balance) });
      }

      const amounts = items.map((item) => ({
        bankId: item.bankId,
        amountCents: toCents(item.amount),
        commissionCents: toCents(item.commission),
      }));
      const shortBank = findInsufficientBank(
        request.operation,
        amounts,
        new Map([...accounts].map(([bankId, account]) => [bankId, account.cents])),
      );
      if (shortBank !== null) {
        const name = items.find((item) => item.bankId === shortBank)?.bankName ?? `#${shortBank}`;
        throw new GiroRequestError(
          `Saldo insuficiente en la Cuenta para Giros de ${name}. Disponible: $${fromCents(accounts.get(shortBank)!.cents)}.`,
          409,
        );
      }

      const subtotalCents = amounts.reduce((sum, item) => sum + item.amountCents, 0);
      const commissionCents = amounts.reduce((sum, item) => sum + item.commissionCents, 0);
      const now = ecuadorDateParts();

      // Siguiente número del mes (la fila de la secuencia queda bloqueada hasta el commit)
      await tx.$executeRaw`
        INSERT INTO giro_comprobante_secuencia (anio, mes, ultimo)
        VALUES (${now.year}, ${now.month}, LAST_INSERT_ID(1))
        ON DUPLICATE KEY UPDATE ultimo = LAST_INSERT_ID(ultimo + 1)
      `;
      const [{ sequence }] = await tx.$queryRaw<{ sequence: bigint }[]>`SELECT LAST_INSERT_ID() AS sequence`;
      const receiptNumber = formatGiroReceiptNumber(now.month, Number(sequence));

      await tx.$executeRaw`
        INSERT INTO giro_comprobante
          (numero, anio, mes, secuencia, tipo_operacion, subtotal, comision, total, usuario_id, sucursal_id, date_create)
        VALUES
          (${receiptNumber}, ${now.year}, ${now.month}, ${Number(sequence)}, ${request.operation},
           ${fromCents(subtotalCents)}, ${fromCents(commissionCents)}, ${fromCents(subtotalCents + commissionCents)},
           ${request.sellerId}, ${request.branchId}, ${now.sql})
      `;
      const [{ receiptId }] = await tx.$queryRaw<{ receiptId: bigint }[]>`SELECT LAST_INSERT_ID() AS receiptId`;

      for (const [index, item] of items.entries()) {
        const account = accounts.get(item.bankId)!;
        const { amountCents, commissionCents: itemCommission } = amounts[index];
        const before = account.cents;
        account.cents = request.operation === "Deposito" ? before - amountCents : before + amountCents;

        await tx.$executeRaw`
          INSERT INTO giro_transaccion
            (giro_comprobante_id, tipo_operacion, giro_banco_id, banco_id, numero_cuenta, tipo_cuenta,
             titular, cedula_titular, cliente_id, monto, comision, total, saldo_anterior, saldo_nuevo,
             usuario_id, sucursal_id, date_create)
          VALUES
            (${Number(receiptId)}, ${request.operation}, ${item.bankId}, ${account.accountId},
             ${item.accountNumber}, ${item.accountType}, ${item.holder}, ${item.holderId}, ${item.clientId},
             ${fromCents(amountCents)}, ${fromCents(itemCommission)}, ${fromCents(amountCents + itemCommission)},
             ${fromCents(before)}, ${fromCents(account.cents)}, ${request.sellerId}, ${request.branchId}, ${now.sql})
        `;
      }

      for (const account of accounts.values()) {
        await tx.$executeRaw`UPDATE banco SET saldo = ${fromCents(account.cents)} WHERE id_banco = ${account.accountId}`;
      }

      const updated = await tx.$executeRaw`
        UPDATE giro_solicitud
        SET estado = 'aprobado', giro_comprobante_id = ${Number(receiptId)}, motivo_rechazo = NULL,
            agente_panel_id = ${agent.id}, agente_nombre = ${agent.name.slice(0, 100)}, revisado_at = ${now.sql}
        WHERE id_giro_solicitud = ${id} AND estado = 'pendiente'
      `;
      if (updated !== 1) throw new GiroRequestError("La solicitud cambió mientras se procesaba.", 409);

      return receiptNumber;
    },
    { timeout: 15_000 },
  );
}

export async function rejectGiroRequest(id: number, agent: { id: number; name: string }, reason: string) {
  if (!isApuestasConfigured) {
    throw new GiroRequestError("Falta configurar APUESTAS_DATABASE_URL.", 503);
  }
  const now = ecuadorDateParts();
  const updated = await getApuestasClient().$executeRaw`
    UPDATE giro_solicitud
    SET estado = 'rechazado', motivo_rechazo = ${reason}, agente_panel_id = ${agent.id},
        agente_nombre = ${agent.name.slice(0, 100)}, revisado_at = ${now.sql}
    WHERE id_giro_solicitud = ${id} AND estado = 'pendiente'
  `;
  if (updated !== 1) {
    throw new GiroRequestError("La solicitud ya fue revisada o el vendedor la canceló.", 409);
  }
}
