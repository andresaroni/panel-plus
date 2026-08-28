import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// El archivo rechazado se sirve como descarga y nunca inline: por definicion es un
// archivo que no pasó la validacion, asi que puede no ser una imagen. `nosniff` mas
// un tipo generico evitan que el navegador intente interpretarlo.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fallo: string }> },
) {
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 401 });

  const { id, fallo } = await context.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(fallo)) return new NextResponse(null, { status: 400 });

  const record = await prisma.retiro_subida_fallida.findFirst({
    // El id del retiro entra en el filtro para que un id de fallo suelto no sirva para
    // sacar el archivo de otro retiro.
    where: { id_fallo: BigInt(fallo), id_retiro: BigInt(id) },
    select: { archivo_imagen: true, archivo_nombre: true },
  });
  if (!record?.archivo_imagen) return new NextResponse(null, { status: 404 });

  const name = (record.archivo_nombre ?? "archivo").replace(/[^\w.-]/g, "_");
  return new NextResponse(record.archivo_imagen, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="rechazado-${id}-${fallo}-${name}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
