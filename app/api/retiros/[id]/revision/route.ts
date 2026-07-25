import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ImageValidationError,
  MAX_WITHDRAWAL_IMAGE_SIZE,
  validateWithdrawalImage,
} from "@/lib/withdrawal-image";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_MULTIPART_SIZE = MAX_WITHDRAWAL_IMAGE_SIZE + 64 * 1024;

class PayloadTooLargeError extends Error {}
class MultipartValidationError extends Error {}

async function readMultipart(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new MultipartValidationError("Se requiere multipart/form-data.");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_SIZE) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) throw new MultipartValidationError("El formulario está vacío.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MULTIPART_SIZE) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { "Content-Type": contentType } }).formData();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Retiro inválido." }, { status: 400 });
  }

  try {
    const form = await readMultipart(request);
    const decision = form.get("decision");
    if (decision !== "aprobado" && decision !== "rechazado") {
      return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });
    }

    const reviewedAt = new Date();
    let data: Prisma.retirar_saldoUpdateManyMutationInput;
    if (decision === "rechazado") {
      const reason = String(form.get("motivo") ?? "").trim();
      if (!reason || reason.length > 500) {
        return NextResponse.json({ error: "Indica un motivo de rechazo de hasta 500 caracteres." }, { status: 400 });
      }
      data = {
        estado: "rechazado",
        motivo_rechazo: reason,
        error_interno: null,
        procesando_token: null,
        procesando_hasta: null,
        notificado_at: null,
        notificacion_token: null,
        notificacion_hasta: null,
        agente_panel_id: currentUser.id,
        agente_usuario_id: currentUser.id,
        revisado_at: reviewedAt,
      };
    } else {
      const file = form.get("comprobante");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Selecciona el comprobante de pago." }, { status: 400 });
      }
      const image = validateWithdrawalImage(new Uint8Array(await file.arrayBuffer()), file.type);
      data = {
        estado: "aprobado",
        motivo_rechazo: null,
        error_interno: null,
        monto_detectado: null,
        numero_comprobante: null,
        banco_origen_id: null,
        banco_origen_detectado: null,
        cuenta_origen_detectada: null,
        titular_origen_detectado: null,
        banco_destino_detectado: null,
        cuenta_destino_detectada: null,
        beneficiario_detectado: null,
        observacion_ocr: null,
        procesando_token: null,
        procesando_hasta: null,
        notificado_at: null,
        notificacion_token: null,
        notificacion_hasta: null,
        comprobante_pago_imagen: image.bytes,
        comprobante_pago_mime: image.mime,
        comprobante_pago_sha256: image.sha256,
        comprobante_pago_tamano: image.size,
        agente_panel_id: currentUser.id,
        agente_usuario_id: currentUser.id,
        revisado_at: reviewedAt,
      };
    }

    const result = await prisma.retirar_saldo.updateMany({
      where: {
        id_retiro: BigInt(id),
        estado: { in: ["pendiente", "error_comprobante"] },
      },
      data,
    });
    if (result.count !== 1) {
      return NextResponse.json({ error: "El retiro ya fue procesado por otro agente o no existe." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "El archivo supera el límite de 16 MiB." }, { status: 413 });
    }
    if (error instanceof ImageValidationError || error instanceof MultipartValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: "No fue posible actualizar el retiro." }, { status: 409 });
    }
    return NextResponse.json({ error: "No fue posible procesar el retiro." }, { status: 500 });
  }
}
