import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new NextResponse(null, { status: 400 });

  const record = await prisma.recarga_whatsapp.findUnique({
    where: { id_recarga: BigInt(id) },
    select: { comprobante_imagen: true, comprobante_mime: true },
  });
  if (!record?.comprobante_imagen) return new NextResponse(null, { status: 404 });

  const mime = record.comprobante_mime?.toLowerCase() ?? "";
  if (!allowedMime.has(mime)) return new NextResponse(null, { status: 415 });

  return new NextResponse(record.comprobante_imagen, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="comprobante-${id}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
