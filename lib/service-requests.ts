import "server-only";

import { Prisma } from "@prisma/client";

export const serviceRequestSelect = {
  id_solicitud: true,
  operacion_uuid: true,
  conversacion_id: true,
  telefono_whatsapp: true,
  detalle: true,
  cliente_cedula: true,
  cliente_usuario: true,
  cliente_nombres: true,
  sucursal_nombre: true,
  estado: true,
  agente_panel_id: true,
  agente_usuario_id: true,
  atendido_at: true,
  cancelado_at: true,
  date_create: true,
  date_update: true,
} satisfies Prisma.solicitudes_servicioSelect;

export type ServiceRequestRecord = Prisma.solicitudes_servicioGetPayload<{
  select: typeof serviceRequestSelect;
}>;

export function buildServiceRequestWhere(
  query: string,
): Prisma.solicitudes_servicioWhereInput {
  const term = query.trim();
  if (!term) return {};
  const or: Prisma.solicitudes_servicioWhereInput[] = [
    { cliente_nombres: { contains: term } },
    { cliente_usuario: { contains: term } },
    { cliente_cedula: { contains: term } },
    { telefono_whatsapp: { contains: term } },
    { sucursal_nombre: { contains: term } },
    { detalle: { contains: term } },
    { operacion_uuid: { contains: term } },
  ];
  if (/^\d{1,20}$/.test(term)) or.push({ id_solicitud: BigInt(term) });
  return { OR: or };
}

export function serializeServiceRequest(item: ServiceRequestRecord) {
  return {
    id: item.id_solicitud.toString(),
    uuid: item.operacion_uuid,
    conversationId: item.conversacion_id?.toString() ?? null,
    phone: item.telefono_whatsapp,
    detail: item.detalle,
    clientId: item.cliente_cedula ?? "No disponible",
    username: item.cliente_usuario ?? "No disponible",
    client: item.cliente_nombres ?? "Cliente sin nombre",
    branch: item.sucursal_nombre ?? "No disponible",
    status: item.estado,
    agentPanelId: item.agente_panel_id,
    agentUserId: item.agente_usuario_id,
    attendedAt: item.atendido_at?.toISOString() ?? null,
    canceledAt: item.cancelado_at?.toISOString() ?? null,
    createdAt: item.date_create.toISOString(),
    updatedAt: item.date_update.toISOString(),
  };
}
