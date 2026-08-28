import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  ImageValidationError,
  MAX_STORED_IMAGE_BYTES,
  MAX_WITHDRAWAL_IMAGE_SIZE,
  validateWithdrawalImage,
} from "@/lib/withdrawal-image";
import { compactFailure, describeError } from "@/lib/failure-detail";
import { formatBytes } from "@/lib/image-format";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const MAX_MULTIPART_SIZE = MAX_WITHDRAWAL_IMAGE_SIZE + 64 * 1024;

class PayloadTooLargeError extends Error {}
class MultipartValidationError extends Error {}

// Huella del archivo que se intento subir. Un comprobante rechazado no llega a
// escribirse en la base, asi que sin esto el motivo real solo se puede deducir
// leyendo el codigo.
type Receipt = {
  nombre: string;
  tipoDeclarado: string;
  tamano: number;
  primerosBytes: string;
  sha256: string;
  bytes: Uint8Array<ArrayBuffer>;
};

// El agente no tiene acceso a los logs del servidor. El codigo va al final del
// mensaje para que pueda dictarlo por WhatsApp y sepamos que rama fallo.
type FailureCode = "ERR-IMG" | "ERR-FORM" | "ERR-BIG" | "ERR-DUP" | "ERR-DB" | "ERR-SRV";

// Cuantos intentos fallidos se conservan por retiro. `archivo_imagen` guarda
// comprobantes bancarios que el sistema rechazo, asi que no se acumulan sin limite.
const MAX_STORED_FAILURES = 5;

// El log no debe arrastrar los bytes de la imagen.
function receiptSummary(receipt: Receipt | null) {
  if (!receipt) return null;
  return {
    nombre: receipt.nombre,
    tipoDeclarado: receipt.tipoDeclarado,
    tamano: receipt.tamano,
    primerosBytes: receipt.primerosBytes,
    sha256: receipt.sha256,
  };
}

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

// Guarda el intento fallido en `retiro_subida_fallida` con la excepcion real y el
// archivo, y deja una version compacta en `retirar_saldo.error_interno`, que es lo que
// el modal ya enseña. Ese UPDATE NO incluye el BLOB: si lo que fallo fue justamente
// escribir la imagen, tiene que poder entrar igual. La aprobacion siguiente lo limpia.
async function recordFailure(
  id: string,
  agentId: number,
  code: FailureCode,
  message: string,
  detail: string | null,
  receipt: Receipt | null,
) {
  const withdrawalId = BigInt(id);
  const row = {
    id_retiro: withdrawalId,
    agente_panel_id: agentId,
    codigo: code,
    mensaje: message.slice(0, 500),
    detalle: detail,
    archivo_nombre: receipt?.nombre.slice(0, 255) ?? null,
    archivo_mime_declarado: receipt?.tipoDeclarado.slice(0, 100) ?? null,
    archivo_tamano: receipt?.tamano ?? null,
    archivo_primeros_bytes: receipt?.primerosBytes ?? null,
    archivo_sha256: receipt?.sha256 ?? null,
  };
  // Por encima del tope admitido queda solo la huella: guardar el archivo sirve para
  // diagnosticar, no para acumular comprobantes ajenos.
  const image = receipt && receipt.tamano <= MAX_STORED_IMAGE_BYTES ? receipt.bytes : null;

  try {
    try {
      await prisma.retiro_subida_fallida.create({ data: { ...row, archivo_imagen: image } });
    } catch (error) {
      // Si lo que fallo fue precisamente escribir la imagen, guardarla aqui falla por lo
      // mismo. La huella sola ya identifica formato y tamano, que es lo que hace falta.
      if (!image) throw error;
      console.warn("No se pudo guardar el archivo rechazado, queda solo la huella", {
        retiro: id,
        error: describeError(error),
      });
      await prisma.retiro_subida_fallida.create({ data: { ...row, archivo_imagen: null } });
    }

    const stale = await prisma.retiro_subida_fallida.findMany({
      where: { id_retiro: withdrawalId },
      orderBy: { id_fallo: "desc" },
      skip: MAX_STORED_FAILURES,
      select: { id_fallo: true },
    });
    if (stale.length > 0) {
      await prisma.retiro_subida_fallida.deleteMany({
        where: { id_fallo: { in: stale.map((row) => row.id_fallo) } },
      });
    }
  } catch (error) {
    console.error("No se pudo registrar el intento fallido", { retiro: id, error });
  }

  try {
    await prisma.retirar_saldo.updateMany({
      where: { id_retiro: withdrawalId, estado: { in: ["pendiente", "error_comprobante"] } },
      data: {
        error_interno: compactFailure(code, message, detail),
      },
    });
  } catch (error) {
    console.error("No se pudo registrar el fallo del comprobante", { retiro: id, error });
  }
}

async function fail(
  id: string,
  agentId: number,
  receipt: Receipt | null,
  code: FailureCode,
  status: number,
  message: string,
  error?: unknown,
) {
  const detail = describeError(error);
  console.warn("Comprobante de retiro rechazado", {
    retiro: id,
    ...receiptSummary(receipt),
    codigo: code,
    motivo: message,
    error: detail,
  });
  await recordFailure(id, agentId, code, message, detail, receipt);
  return NextResponse.json({ error: `${message} (${code})` }, { status });
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

  let receipt: Receipt | null = null;

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
        // `error_interno` NO se limpia aqui: es la unica copia del motivo tecnico por el
        // que el bot no pudo aplicar el pago, y borrarla al rechazar dejaba el modal en
        // blanco y el fallo invisible. Solo se limpia al aprobar, que empieza un intento
        // nuevo.
        procesando_token: null,
        procesando_hasta: null,
        notificado_at: null,
        notificacion_token: null,
        notificacion_hasta: null,
        agente_panel_id: currentUser.id,
        agente_usuario_id: currentUser.id,
        revisado_at: reviewedAt,
        date_update: reviewedAt,
      };
    } else {
      const file = form.get("comprobante");
      // Un input de archivo vacio igual llega como File, asi que sin mirar el tamano
      // el agente recibia "Selecciona una imagen" por un archivo que si habia elegido.
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Selecciona el comprobante de pago." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      receipt = {
        nombre: file.name,
        tipoDeclarado: file.type,
        tamano: file.size,
        primerosBytes: Buffer.from(bytes.subarray(0, 12)).toString("hex"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      };
      const image = validateWithdrawalImage(bytes);
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
        intentos_procesamiento: 0,
        agente_panel_id: currentUser.id,
        agente_usuario_id: currentUser.id,
        revisado_at: reviewedAt,
        date_update: reviewedAt,
      };
    }

    let result = await prisma.retirar_saldo.updateMany({
      where: {
        id_retiro: BigInt(id),
        estado: "pendiente",
      },
      data: { ...data, primera_respuesta_at: reviewedAt },
    });
    if (result.count === 0) {
      result = await prisma.retirar_saldo.updateMany({
        where: {
          id_retiro: BigInt(id),
          estado: "error_comprobante",
        },
        data,
      });
    }
    if (result.count !== 1) {
      return NextResponse.json({ error: "El retiro ya fue procesado por otro agente o no existe." }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return fail(
        id,
        currentUser.id,
        receipt,
        "ERR-BIG",
        413,
        `El archivo supera el límite de ${formatBytes(MAX_WITHDRAWAL_IMAGE_SIZE)}.`,
        error,
      );
    }
    if (error instanceof ImageValidationError) {
      return fail(id, currentUser.id, receipt, "ERR-IMG", 400, error.message, error);
    }
    if (error instanceof MultipartValidationError) {
      return fail(id, currentUser.id, receipt, "ERR-FORM", 400, error.message, error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: las constraints de comprobante son globales
      // (uq_retirar_saldo_pago_sha256, uq_retirar_saldo_comprobante), asi que el
      // choque es contra OTRO retiro y decirlo ahorra reintentos a ciegas.
      if (error.code === "P2002") {
        return fail(
          id,
          currentUser.id,
          receipt,
          "ERR-DUP",
          409,
          "Este comprobante ya se usó en otro retiro. Sube el comprobante correcto.",
          error,
        );
      }
      return fail(id, currentUser.id, receipt, "ERR-DB", 409, "No fue posible actualizar el retiro.", error);
    }
    // La rama que dejo RET-0067 sin explicacion. El agente vio "No fue posible procesar
    // el retiro" y no quedo rastro de por que: ni en el log ni en la base. La causa sigue
    // sin identificar, y es justamente esto lo que la delatara la proxima vez.
    return fail(id, currentUser.id, receipt, "ERR-SRV", 500, "No fue posible procesar el retiro.", error);
  }
}
