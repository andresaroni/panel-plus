import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getWebPushConfig } from "@/lib/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().int().nonnegative().nullable(),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

function hashEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!validOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (!getWebPushConfig()) {
    return NextResponse.json({ error: "Las alertas no están configuradas." }, { status: 503 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción no válida." }, { status: 400 });
  }

  const subscription = parsed.data;
  await prisma.panel_push_subscriptions.upsert({
    where: { endpoint_hash: hashEndpoint(subscription.endpoint) },
    create: {
      usuario_id: user.id,
      endpoint: subscription.endpoint,
      endpoint_hash: hashEndpoint(subscription.endpoint),
      clave_p256dh: subscription.keys.p256dh,
      clave_auth: subscription.keys.auth,
      expiration_time: subscription.expirationTime === null ? null : BigInt(subscription.expirationTime),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      estado: "activa",
    },
    update: {
      usuario_id: user.id,
      endpoint: subscription.endpoint,
      clave_p256dh: subscription.keys.p256dh,
      clave_auth: subscription.keys.auth,
      expiration_time: subscription.expirationTime === null ? null : BigInt(subscription.expirationTime),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      estado: "activa",
      date_update: new Date(),
    },
  });

  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const parsed = z.object({ endpoint: z.string().url().max(4096) }).safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción no válida." }, { status: 400 });
  }

  await prisma.panel_push_subscriptions.deleteMany({
    where: {
      endpoint_hash: hashEndpoint(parsed.data.endpoint),
      usuario_id: user.id,
    },
  });
  return NextResponse.json({ subscribed: false });
}
