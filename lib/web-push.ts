import "server-only";

import webPush, { type PushSubscription } from "web-push";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type RequestPushType = "recarga" | "retiro" | "servicio";

export type RequestPushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function getWebPushConfig() {
  if (
    !env.WEB_PUSH_PUBLIC_KEY ||
    !env.WEB_PUSH_PRIVATE_KEY ||
    !env.WEB_PUSH_SUBJECT ||
    !env.PANEL_PUSH_WEBHOOK_SECRET
  ) {
    return null;
  }

  return {
    publicKey: env.WEB_PUSH_PUBLIC_KEY,
    privateKey: env.WEB_PUSH_PRIVATE_KEY,
    subject: env.WEB_PUSH_SUBJECT,
    webhookSecret: env.PANEL_PUSH_WEBHOOK_SECRET,
  };
}

export async function sendRequestPush(message: RequestPushMessage) {
  const config = getWebPushConfig();
  if (!config) throw new Error("Web Push no está configurado.");

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const subscriptions = await prisma.panel_push_subscriptions.findMany({
    where: {
      estado: "activa",
      usuario: { estado: "activo" },
    },
    select: {
      id_suscripcion: true,
      endpoint: true,
      clave_p256dh: true,
      clave_auth: true,
    },
  });

  const expired: bigint[] = [];
  const transientErrors: unknown[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.clave_p256dh,
          auth: subscription.clave_auth,
        },
      };

      try {
        await webPush.sendNotification(pushSubscription, JSON.stringify(message), {
          TTL: 60 * 60,
          urgency: "high",
        });
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expired.push(subscription.id_suscripcion);
          return;
        }
        transientErrors.push(error);
      }
    }),
  );

  if (expired.length) {
    await prisma.panel_push_subscriptions.deleteMany({
      where: { id_suscripcion: { in: expired } },
    });
  }
  if (transientErrors.length) {
    const first = transientErrors[0] as { statusCode?: number; body?: string; message?: string };
    const reason = first.body || first.message || "Error desconocido del proveedor push";
    throw new Error(
      `Fallaron ${transientErrors.length} envíos Web Push${first.statusCode ? ` (${first.statusCode})` : ""}: ${reason}`,
    );
  }

  return { sent, expired: expired.length };
}
