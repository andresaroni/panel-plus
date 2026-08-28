import "server-only";

import { Prisma, type retirar_saldo_estado } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const withdrawalSelect = {
  id_retiro: true,
  operacion_uuid: true,
  conversacion_id: true,
  telefono_whatsapp: true,
  cliente_cedula: true,
  cliente_usuario: true,
  cliente_nombres: true,
  sucursal_nombre: true,
  origen: true,
  plataforma_nombre: true,
  monto: true,
  banco_destino: true,
  tipo_cuenta_destino: true,
  numero_cuenta_destino: true,
  titular_destino: true,
  premio_mime: true,
  premio_tamano: true,
  banco_origen_id: true,
  banco_origen_detectado: true,
  cuenta_origen_detectada: true,
  banco_destino_detectado: true,
  cuenta_destino_detectada: true,
  beneficiario_detectado: true,
  observacion_ocr: true,
  comprobante_pago_mime: true,
  comprobante_pago_tamano: true,
  numero_comprobante: true,
  monto_detectado: true,
  agente_panel_id: true,
  agente_usuario_id: true,
  revisado_at: true,
  motivo_rechazo: true,
  reporte_plataforma_id: true,
  aplicado_at: true,
  comprobante_enviado_at: true,
  notificado_at: true,
  intentos_procesamiento: true,
  error_interno: true,
  estado: true,
  date_create: true,
  date_update: true,
  presentado_panel_at: true,
  primera_respuesta_at: true,
} satisfies Prisma.retirar_saldoSelect;

export type WithdrawalRecord = Prisma.retirar_saldoGetPayload<{
  select: typeof withdrawalSelect;
}>;

export const withdrawalStatuses = [
  "pendiente",
  "aprobado",
  "error_comprobante",
  "pagado",
  "rechazado",
] as const satisfies readonly retirar_saldo_estado[];

export const submittedWithdrawalWhere = {
  estado: { notIn: ["borrador", "cancelado"] },
} satisfies Prisma.retirar_saldoWhereInput;

export function buildWithdrawalWhere(query: string, status?: string): Prisma.retirar_saldoWhereInput {
  const where: Prisma.retirar_saldoWhereInput = { ...submittedWithdrawalWhere };
  if (withdrawalStatuses.includes(status as (typeof withdrawalStatuses)[number])) {
    where.estado = status as retirar_saldo_estado;
  }

  const term = query.trim();
  if (!term) return where;

  const or: Prisma.retirar_saldoWhereInput[] = [
    { cliente_nombres: { contains: term } },
    { cliente_usuario: { contains: term } },
    { cliente_cedula: { contains: term } },
    { telefono_whatsapp: { contains: term } },
    { sucursal_nombre: { contains: term } },
    { plataforma_nombre: { contains: term } },
    { banco_destino: { contains: term } },
    { numero_cuenta_destino: { contains: term } },
    { operacion_uuid: { contains: term } },
  ];
  if (/^\d{1,20}$/.test(term)) or.push({ id_retiro: BigInt(term) });
  where.OR = or;
  return where;
}

export function serializeWithdrawal(item: WithdrawalRecord) {
  return {
    id: item.id_retiro.toString(),
    uuid: item.operacion_uuid,
    conversationId: item.conversacion_id.toString(),
    phone: item.telefono_whatsapp,
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "No disponible",
    client: item.cliente_nombres ?? "Cliente sin nombre",
    branch: item.sucursal_nombre ?? "No disponible",
    origin: item.origen ?? "No disponible",
    platform: item.plataforma_nombre ?? "No disponible",
    amount: item.monto?.toString() ?? "0",
    bank: item.banco_destino ?? "No disponible",
    accountType: item.tipo_cuenta_destino ?? "No disponible",
    account: item.numero_cuenta_destino ?? "No disponible",
    accountHolder: item.titular_destino ?? "No disponible",
    hasPrizeImage: Boolean(item.premio_tamano),
    hasPaymentImage: Boolean(item.comprobante_pago_tamano),
    detectedOriginBankId: item.banco_origen_id,
    detectedOriginBank: item.banco_origen_detectado,
    detectedOriginAccount: item.cuenta_origen_detectada,
    detectedDestinationBank: item.banco_destino_detectado,
    detectedDestinationAccount: item.cuenta_destino_detectada,
    detectedBeneficiary: item.beneficiario_detectado,
    ocrText: item.observacion_ocr,
    status: item.estado,
    reviewedBy: item.agente_panel_id,
    reviewedAt: item.revisado_at?.toISOString() ?? null,
    rejectionReason: item.motivo_rechazo,
    reportId: item.reporte_plataforma_id,
    appliedAt: item.aplicado_at?.toISOString() ?? null,
    receiptSentAt: item.comprobante_enviado_at?.toISOString() ?? null,
    notifiedAt: item.notificado_at?.toISOString() ?? null,
    attempts: item.intentos_procesamiento,
    internalError: item.error_interno,
    createdAt: item.date_create.toISOString(),
    updatedAt: item.date_update.toISOString(),
  };
}

type UploadFailureRow = {
  id_fallo: bigint;
  codigo: string;
  mensaje: string;
  detalle: string | null;
  archivo_nombre: string | null;
  archivo_mime_declarado: string | null;
  // El driver crudo puede devolver los enteros como BigInt, así que nada de esto se
  // usa sin convertir: mezclar BigInt con Number en una resta o división lanza.
  archivo_tamano: number | bigint | null;
  archivo_primeros_bytes: string | null;
  archivo_sha256: string | null;
  tiene_archivo: number | bigint;
  date_create: Date;
};

export type UploadFailure = {
  id: string;
  code: string;
  message: string;
  detail: string | null;
  fileName: string | null;
  fileDeclaredMime: string | null;
  fileSize: number | null;
  fileMagicBytes: string | null;
  fileSha256: string | null;
  hasFile: boolean;
  at: string;
};

/**
 * Último intento de subida que el panel rechazó, para enseñarlo en el modal.
 *
 * Va en SQL crudo a propósito: hace falta saber si quedaron bytes guardados sin
 * traerse el BLOB, y `archivo_imagen IS NOT NULL` lo resuelve en el servidor. Un
 * `select` de Prisma obligaría a elegir entre descargar la imagen entera o deducir su
 * presencia a partir del tamaño, que es una regla que puede quedar desfasada.
 */
export async function getLastUploadFailure(
  withdrawalId: bigint,
  reviewedAt: Date | null,
): Promise<UploadFailure | null> {
  // Los intentos anteriores a la última revisión ya no describen la situación actual:
  // si el agente acabó subiendo un comprobante válido, seguir enseñando el fallo diría
  // que algo va mal cuando no es así. Se conservan en la tabla como historial.
  const rows = await prisma.$queryRaw<UploadFailureRow[]>`
    SELECT id_fallo, codigo, mensaje, detalle, archivo_nombre, archivo_mime_declarado,
           archivo_tamano, archivo_primeros_bytes, archivo_sha256,
           archivo_imagen IS NOT NULL AS tiene_archivo, date_create
    FROM retiro_subida_fallida
    WHERE id_retiro = ${withdrawalId}
      AND (${reviewedAt} IS NULL OR date_create > ${reviewedAt})
    ORDER BY id_fallo DESC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id_fallo.toString(),
    code: row.codigo,
    message: row.mensaje,
    detail: row.detalle,
    fileName: row.archivo_nombre,
    fileDeclaredMime: row.archivo_mime_declarado,
    fileSize: row.archivo_tamano === null ? null : Number(row.archivo_tamano),
    fileMagicBytes: row.archivo_primeros_bytes,
    fileSha256: row.archivo_sha256,
    hasFile: Number(row.tiene_archivo) === 1,
    at: row.date_create.toISOString(),
  };
}
