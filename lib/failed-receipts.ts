import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { failedReceiptReasonLabels, parseReceiptReadings } from "@/lib/receipt-readings";

// Las filas `reintento` son intentos que el cliente todavía podía corregir; al panel
// solo llegan los casos que el bot escaló a un agente.
export const escalatedFailedReceiptWhere = {
  estado: { in: ["pendiente", "atendido", "descartado"] },
} satisfies Prisma.recarga_comprobante_fallidoWhereInput;

export const failedReceiptSelect = {
  id_fallo: true,
  operacion_uuid: true,
  conversacion_id: true,
  telefono_whatsapp: true,
  intento: true,
  cliente_cedula: true,
  cliente_usuario: true,
  cliente_nombres: true,
  sucursal_nombre: true,
  plataforma_nombre: true,
  motivo: true,
  detalle: true,
  lecturas: true,
  monto: true,
  numero_comprobante: true,
  banco_nombre_detectado: true,
  beneficiario_detectado: true,
  cuenta_detectada: true,
  comprobante_tamano: true,
  mensaje_cliente: true,
  estado: true,
  atendido_at: true,
  date_create: true,
  date_update: true,
} satisfies Prisma.recarga_comprobante_fallidoSelect;

export type FailedReceiptRecord = Prisma.recarga_comprobante_fallidoGetPayload<{
  select: typeof failedReceiptSelect;
}>;

export function buildFailedReceiptWhere(
  query: string,
): Prisma.recarga_comprobante_fallidoWhereInput {
  const term = query.trim();
  if (!term) return escalatedFailedReceiptWhere;
  const or: Prisma.recarga_comprobante_fallidoWhereInput[] = [
    { cliente_nombres: { contains: term } },
    { cliente_usuario: { contains: term } },
    { cliente_cedula: { contains: term } },
    { telefono_whatsapp: { contains: term } },
    { plataforma_nombre: { contains: term } },
    { operacion_uuid: { contains: term } },
  ];
  if (/^\d{1,19}$/.test(term)) {
    const number = BigInt(term);
    or.push({ id_fallo: number }, { numero_comprobante: number });
  }
  return { AND: [escalatedFailedReceiptWhere, { OR: or }] };
}

function serializeAttempt(item: FailedReceiptRecord) {
  return {
    id: item.id_fallo.toString(),
    attempt: item.intento,
    reason: item.motivo,
    reasonLabel: failedReceiptReasonLabels[item.motivo],
    detail: item.detalle,
    readings: parseReceiptReadings(item.lecturas),
    amount: item.monto?.toString() ?? null,
    reference: item.numero_comprobante?.toString() ?? null,
    bank: item.banco_nombre_detectado,
    beneficiary: item.beneficiario_detectado,
    account: item.cuenta_detectada,
    hasImage: Boolean(item.comprobante_tamano),
    customerMessage: item.mensaje_cliente,
    createdAt: item.date_create.toISOString(),
  };
}

export function serializeFailedReceipt(
  item: FailedReceiptRecord,
  attempts: FailedReceiptRecord[],
) {
  return {
    ...serializeAttempt(item),
    uuid: item.operacion_uuid,
    conversationId: item.conversacion_id.toString(),
    phone: item.telefono_whatsapp,
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "No disponible",
    client: item.cliente_nombres ?? "Cliente sin nombre",
    branch: item.sucursal_nombre ?? "No disponible",
    platform: item.plataforma_nombre ?? "No disponible",
    status: item.estado,
    attendedAt: item.atendido_at?.toISOString() ?? null,
    updatedAt: item.date_update.toISOString(),
    attempts: attempts.map(serializeAttempt),
  };
}

/** El caso escalado junto con todos los intentos de la misma conversación. */
export async function getFailedReceiptCase(id: bigint) {
  const item = await prisma.recarga_comprobante_fallido.findFirst({
    where: { AND: [escalatedFailedReceiptWhere, { id_fallo: id }] },
    select: failedReceiptSelect,
  });
  if (!item) return null;
  const attempts = await prisma.recarga_comprobante_fallido.findMany({
    where: { conversacion_id: item.conversacion_id },
    select: failedReceiptSelect,
    orderBy: [{ intento: "asc" }, { id_fallo: "asc" }],
  });
  return serializeFailedReceipt(item, attempts);
}

export type FailedReceiptCase = ReturnType<typeof serializeFailedReceipt>;
