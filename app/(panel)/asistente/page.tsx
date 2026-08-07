import { Bot } from "lucide-react";

import { AssistantChat } from "@/components/assistant-chat";
import {
  getAssistantConversation,
  listAssistantConversations,
} from "@/lib/assistant-conversations";
import { requireAdmin } from "@/lib/session";

export default async function AssistantPage() {
  const user = await requireAdmin();
  const firstName = user.name.trim().split(/\s+/)[0] || "Administrador";
  const conversations = await listAssistantConversations(user.id);
  const initialConversation = conversations[0]
    ? await getAssistantConversation(user.id, BigInt(conversations[0].id))
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <Bot className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Asistente de operaciones</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta, compara y analiza los registros del panel usando lenguaje natural.
          </p>
        </div>
      </div>
      <AssistantChat
        name={firstName}
        initialConversations={conversations}
        initialConversation={initialConversation}
      />
    </div>
  );
}
