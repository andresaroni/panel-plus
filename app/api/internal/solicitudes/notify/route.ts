import { randomUUID, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { submittedTopUpWhere } from "@/lib/recargas";
import { submittedWithdrawalWhere } from "@/lib/retiros";
import {
  getWebPushConfig,
  sendRequestPush,
  type RequestPushMessage,
  type RequestPushType,
} from "@/lib/web-push";

export const runtime = "nodejs";

const inputSchema = z.object({
  type: z.enum(["recarga", "retiro", "servicio"]),
  id: z.string().regex(/^\d{1,20}$/),
});

function authorized(request: Request, expected: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function requestMessage(type: RequestPushType, id: bigint): Promise<RequestPushMessage | null> {
  if (type === "recarga") {
    const exists = await prisma.recarga_whatsapp.findFirst({
      where: { AND: [submittedTopUpWhere, { id_recarga: id, estado: "pendiente" }] },
      select: { id_recarga: true },
    });
    if (!exists) return null;
    return {
      title: "Nueva solicitud de recarga",
      body: "Hay una recarga pendiente de revisión.",
      url: `/solicitudes?reviewType=recarga&review=${id}`,
      tag: `solicitud-recarga-${id}`,
    };
  }

  if (type === "retiro") {
    const exists = await prisma.retirar_saldo.findFirst({
      where: { AND: [submittedWithdrawalWhere, { id_retiro: id, estado: "pendiente" }] },
      select: { id_retiro: true },
    });
    if (!exists) return null;
    return {
      title: "Nueva solicitud de retiro",
      body: "Hay un retiro pendiente de revisión.",
      url: `/solicitudes?reviewType=retiro&review=${id}`,
      tag: `solicitud-retiro-${id}`,
    };
  }

  const exists = await prisma.solicitudes_servicio.findFirst({
    where: { id_solicitud: id, estado: "pendiente" },
    select: { id_solicitud: true },
  });
  if (!exists) return null;
  return {
    title: "Nueva solicitud de servicio",
    body: "Hay una solicitud de servicio pendiente de atención.",
    url: `/solicitudes?reviewType=servicio&review=${id}`,
    tag: `solicitud-servicio-${id}`,
  };
}

export async function POST(request: Request) {
  const config = getWebPushConfig();
  if (!config) {
    return NextResponse.json({ error: "Web Push no está configurado." }, { status: 503 });
  }
  if (!authorized(request, config.webhookSecret)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Evento no válido." }, { status: 400 });
  }

  const type = parsed.data.type;
  const id = BigInt(parsed.data.id);
  const message = await requestMessage(type, id);
  if (!message) {
    return NextResponse.json({ ignored: true, reason: "La solicitud ya no está pendiente." });
  }

  const event = await prisma.panel_push_events.upsert({
    where: { tipo_solicitud_id: { tipo: type, solicitud_id: id } },
    create: { tipo: type, solicitud_id: id },
    update: {},
  });
  if (event.estado === "enviado") {
    return NextResponse.json({ duplicate: true });
  }

  const now = new Date();
  const token = randomUUID();
  const claimed = await prisma.panel_push_events.updateMany({
    where: {
      id_event: event.id_event,
      OR: [
        { estado: { in: ["pendiente", "fallido"] } },
        { estado: "procesando", procesando_hasta: { lt: now } },
      ],
    },
    data: {
      estado: "procesando",
      procesando_token: token,
      procesando_hasta: new Date(now.getTime() + 5 * 60_000),
      intentos_envio: { increment: 1 },
      ultimo_error: null,
    },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ processing: true }, { status: 202 });
  }

  try {
    const result = await sendRequestPush(message);
    await prisma.panel_push_events.updateMany({
      where: { id_event: event.id_event, procesando_token: token },
      data: {
        estado: "enviado",
        enviado_at: new Date(),
        procesando_token: null,
        procesando_hasta: null,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error Web Push";
    await prisma.panel_push_events.updateMany({
      where: { id_event: event.id_event, procesando_token: token },
      data: {
        estado: "fallido",
        ultimo_error: detail.slice(0, 1000),
        procesando_token: null,
        procesando_hasta: null,
      },
    });
    return NextResponse.json({ error: "No se pudieron enviar las alertas." }, { status: 502 });
  }
}
