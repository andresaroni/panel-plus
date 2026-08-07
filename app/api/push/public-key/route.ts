import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { getWebPushConfig } from "@/lib/web-push";

export async function GET() {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  }

  const config = getWebPushConfig();
  if (!config) {
    return NextResponse.json({ error: "Las alertas no están configuradas." }, { status: 503 });
  }

  return NextResponse.json(
    { publicKey: config.publicKey },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
