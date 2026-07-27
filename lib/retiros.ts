import "server-only";

import { Prisma, type retirar_saldo_estado } from "@prisma/client";

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
