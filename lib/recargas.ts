import "server-only";

import { Prisma, type recarga_whatsapp_estado } from "@prisma/client";

export const requestSelect = {
  id_recarga: true,
  operacion_uuid: true,
  telefono_whatsapp: true,
  cliente_cedula: true,
  cliente_usuario: true,
  cliente_nombres: true,
  sucursal_nombre: true,
  plataforma_nombre: true,
  monto: true,
  numero_comprobante: true,
  metodo_pago: true,
  banco_nombre_detectado: true,
  beneficiario_detectado: true,
  cuenta_detectada: true,
  observacion_ocr: true,
  banco_nombre_validado: true,
  banco_titular_validado: true,
  banco_cuenta_validada: true,
  comprobante_mime: true,
  comprobante_tamano: true,
  fase: true,
  estado: true,
  aplicada_at: true,
  date_create: true,
  date_update: true,
} satisfies Prisma.recarga_whatsappSelect;

export type RequestRecord = Prisma.recarga_whatsappGetPayload<{ select: typeof requestSelect }>;

export const submittedTopUpWhere = {
  fase: { in: ["esperar_revision", "finalizada"] },
  monto: { not: null },
  numero_comprobante: { not: null },
  banco_id: { not: null },
  comprobante_tamano: { not: null },
} satisfies Prisma.recarga_whatsappWhereInput;

export function buildSearchWhere(query: string): Prisma.recarga_whatsappWhereInput {
  const term = query.trim();
  if (!term) return submittedTopUpWhere;

  const or: Prisma.recarga_whatsappWhereInput[] = [
    { cliente_nombres: { contains: term } },
    { cliente_usuario: { contains: term } },
    { cliente_cedula: { contains: term } },
    { plataforma_nombre: { contains: term } },
    { operacion_uuid: { contains: term } },
  ];

  if (/^\d{1,20}$/.test(term)) {
    const number = BigInt(term);
    or.push({ id_recarga: number }, { numero_comprobante: number });
  }

  return { AND: [submittedTopUpWhere, { OR: or }] };
}

export function parseDateRange(from?: string, to?: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const created: Prisma.DateTimeFilter = {};
  if (from && datePattern.test(from)) created.gte = new Date(`${from}T00:00:00-05:00`);
  if (to && datePattern.test(to)) created.lte = new Date(`${to}T23:59:59-05:00`);
  return Object.keys(created).length ? created : undefined;
}

export function buildReportWhere(filters: {
  from?: string;
  to?: string;
  platform?: string;
  status?: string;
}): Prisma.recarga_whatsappWhereInput {
  const where: Prisma.recarga_whatsappWhereInput = { ...submittedTopUpWhere };
  const dateRange = parseDateRange(filters.from, filters.to);
  if (dateRange) where.date_create = dateRange;
  if (filters.platform) where.plataforma_nombre = filters.platform;
  if (["pendiente", "aprobado", "rechazado"].includes(filters.status ?? "")) {
    where.estado = filters.status as recarga_whatsapp_estado;
  }
  return where;
}

export function serializeRequest(item: RequestRecord) {
  return {
    id: item.id_recarga.toString(),
    uuid: item.operacion_uuid,
    phone: item.telefono_whatsapp,
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "No disponible",
    client: item.cliente_nombres ?? "Cliente sin nombre",
    branch: item.sucursal_nombre ?? "No disponible",
    platform: item.plataforma_nombre ?? "No disponible",
    amount: item.monto?.toString() ?? "0",
    reference: item.numero_comprobante?.toString() ?? "No disponible",
    paymentMethod: item.metodo_pago,
    bank: item.banco_nombre_validado ?? item.banco_nombre_detectado ?? "No detectado",
    beneficiary: item.banco_titular_validado ?? item.beneficiario_detectado ?? "No disponible",
    account: item.banco_cuenta_validada ?? item.cuenta_detectada ?? "No disponible",
    observation: item.observacion_ocr,
    mime: item.comprobante_mime,
    hasImage: Boolean(item.comprobante_tamano),
    phase: item.fase,
    status: item.estado,
    createdAt: item.date_create.toISOString(),
    updatedAt: item.date_update.toISOString(),
  };
}
