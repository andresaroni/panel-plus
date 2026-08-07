import { NextResponse } from "next/server";

import { listAssistantConversations } from "@/lib/assistant-conversations";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (user.role !== "administrador") {
    return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
  }

  const conversations = await listAssistantConversations(user.id);
  return NextResponse.json(
    { conversations },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
