import { NextResponse } from "next/server";
import { z } from "zod";

import { askAssistant } from "@/lib/assistant";
import {
  getAssistantConversation,
  saveAssistantExchange,
} from "@/lib/assistant-conversations";
import { getCurrentUser } from "@/lib/session";

const requestSchema = z.object({
  conversationId: z.string().regex(/^\d+$/).nullable(),
  message: z.string().trim().min(1).max(2_000),
});

const globalForAssistant = globalThis as unknown as {
  assistantRequests?: Map<number, number[]>;
};
const assistantRequests = globalForAssistant.assistantRequests ?? new Map<number, number[]>();
globalForAssistant.assistantRequests = assistantRequests;

function isRateLimited(userId: number) {
  const cutoff = Date.now() - 60_000;
  const recent = (assistantRequests.get(userId) ?? []).filter((time) => time > cutoff);
  if (recent.length >= 12) {
    assistantRequests.set(userId, recent);
    return true;
  }
  recent.push(Date.now());
  assistantRequests.set(userId, recent);
  return false;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (user.role !== "administrador") {
    return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
  }
  if (isRateLimited(user.id)) {
    return NextResponse.json(
      { error: "Has enviado demasiadas consultas. Espera un momento e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "La consulta no es válida." }, { status: 400 });
  }

  try {
    const conversationId = parsed.data.conversationId
      ? BigInt(parsed.data.conversationId)
      : null;
    const saved = conversationId
      ? await getAssistantConversation(user.id, conversationId, 15)
      : null;
    if (conversationId && !saved) {
      return NextResponse.json({ error: "La conversación no existe." }, { status: 404 });
    }

    const context = [
      ...(saved?.messages.map(({ role, content }) => ({ role, content })) ?? []),
      { role: "user" as const, content: parsed.data.message },
    ];
    const answer = await askAssistant(context);
    const conversation = await saveAssistantExchange({
      userId: user.id,
      conversationId,
      userMessage: parsed.data.message,
      assistantMessage: answer,
    });
    return NextResponse.json(
      { answer, conversation },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Assistant request failed", error);
    const message =
      error instanceof Error && error.message === "OPENAI_NOT_CONFIGURED"
        ? "El Asistente IA todavía no está configurado en el servidor."
        : "No pude completar la consulta en este momento. Inténtalo nuevamente.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
