import { NextResponse } from "next/server";

import {
  deleteAssistantConversation,
  getAssistantConversation,
} from "@/lib/assistant-conversations";
import { getCurrentUser } from "@/lib/session";

function parseConversationId(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Sesión no válida." }, { status: 401 }) };
  if (user.role !== "administrador") {
    return { error: NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const id = parseConversationId((await params).id);
  if (id === null) return NextResponse.json({ error: "ID no válido." }, { status: 400 });

  const result = await getAssistantConversation(auth.user!.id, id);
  if (!result) return NextResponse.json({ error: "La conversación no existe." }, { status: 404 });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const id = parseConversationId((await params).id);
  if (id === null) return NextResponse.json({ error: "ID no válido." }, { status: 400 });

  const deleted = await deleteAssistantConversation(auth.user!.id, id);
  if (!deleted) return NextResponse.json({ error: "La conversación no existe." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
