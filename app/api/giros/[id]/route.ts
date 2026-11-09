import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { approveGiroRequest, GiroRequestError, rejectGiroRequest } from "@/lib/giros";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar") }),
  z.object({
    accion: z.literal("rechazar"),
    motivo: z
      .string()
      .trim()
      .min(3, "Escribe el motivo del rechazo.")
      .max(500, "El motivo no puede superar 500 caracteres."),
  }),
]);

/** Aprueba o rechaza una solicitud de "Giro Bancario Dealers". */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^\d{1,10}$/.test(id)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 },
    );
  }

  const agent = { id: currentUser.id, name: currentUser.name };
  try {
    if (parsed.data.accion === "aprobar") {
      const receiptNumber = await approveGiroRequest(Number(id), agent);
      return NextResponse.json({ success: true, receiptNumber });
    }
    await rejectGiroRequest(Number(id), agent, parsed.data.motivo);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof GiroRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Giros: no fue posible actualizar la solicitud", error);
    const conflict =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
    return NextResponse.json(
      {
        error: conflict
          ? "Otro asesor está procesando esta solicitud. Intenta de nuevo."
          : "No fue posible actualizar la solicitud.",
      },
      { status: conflict ? 409 : 500 },
    );
  }
}
