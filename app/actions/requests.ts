"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  id: z.string().regex(/^\d+$/),
  status: z.enum(["aprobado", "rechazado"]),
});

export type RequestActionState = { error?: string; success?: boolean };

export async function updateRequestStatus(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  await requireUser();
  const parsed = schema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { error: "Solicitud inválida." };

  try {
    const result = await prisma.recarga_whatsapp.updateMany({
      where: { id_recarga: BigInt(parsed.data.id), estado: "pendiente" },
      data: { estado: parsed.data.status },
    });

    if (result.count !== 1) {
      return { error: "La solicitud ya fue procesada por otro operador." };
    }

    revalidatePath("/solicitudes");
    revalidatePath("/reportes");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Error
        ? error.message
        : "";
    if (message.includes("datos necesarios")) {
      return { error: "No se puede aprobar: faltan datos financieros obligatorios." };
    }
    if (message.includes("siendo procesada")) {
      return { error: "El bot está procesando esta recarga. Intenta nuevamente más tarde." };
    }
    return { error: "No fue posible actualizar la solicitud." };
  }
}
