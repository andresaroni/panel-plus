"use client";

import {
  ArrowUp,
  Bot,
  History,
  LoaderCircle,
  MessageSquare,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type ConversationDetail = {
  conversation: ConversationSummary;
  messages: ChatMessage[];
};

const suggestions = [
  "¿Cuántas operaciones están pendientes?",
  "¿Cuál es el volumen aprobado este mes?",
  "Compara las operaciones por sucursal",
];

function initialMessage(name: string): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: `Hola, ${name}. Puedo consultar y analizar las operaciones registradas en el panel. ¿Qué deseas saber?`,
  };
}

function formatConversationDate(value: string) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AssistantChat({
  name,
  initialConversations,
  initialConversation,
}: {
  name: string;
  initialConversations: ConversationSummary[];
  initialConversation: ConversationDetail | null;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversation?.conversation.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialConversation?.messages.length
      ? initialConversation.messages
      : [initialMessage(name)],
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading || loadingConversation) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setValue("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: content }),
      });
      const data = (await response.json()) as {
        answer?: string;
        conversation?: ConversationSummary;
        error?: string;
      };
      if (!response.ok || !data.answer || !data.conversation) {
        throw new Error(data.error ?? "No se recibió una respuesta válida.");
      }

      setActiveId(data.conversation.id);
      setConversations((current) => [
        data.conversation!,
        ...current.filter((item) => item.id !== data.conversation!.id),
      ]);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer!,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setValue(content);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pude completar la consulta. Inténtalo nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(id: string) {
    if (id === activeId || loading || loadingConversation) return;
    setLoadingConversation(id);
    setError("");
    try {
      const response = await fetch(`/api/asistente/conversaciones/${id}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ConversationDetail & { error?: string };
      if (!response.ok || !data.conversation) {
        throw new Error(data.error ?? "No se pudo abrir la conversación.");
      }
      setActiveId(data.conversation.id);
      setMessages(data.messages.length ? data.messages : [initialMessage(name)]);
      setValue("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo abrir la conversación.",
      );
    } finally {
      setLoadingConversation(null);
    }
  }

  async function deleteConversation(id: string) {
    if (loading || deletingId || !window.confirm("¿Eliminar esta conversación y todos sus mensajes?")) {
      return;
    }
    setDeletingId(id);
    setError("");
    try {
      const response = await fetch(`/api/asistente/conversaciones/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo eliminar la conversación.");
      }
      setConversations((current) => current.filter((item) => item.id !== id));
      if (activeId === id) startNewConversation();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo eliminar la conversación.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(value);
    }
  }

  function startNewConversation() {
    if (loading) return;
    setActiveId(null);
    setMessages([initialMessage(name)]);
    setValue("");
    setError("");
  }

  const activeTitle = conversations.find((item) => item.id === activeId)?.title;

  return (
    <section className="grid min-h-155 overflow-hidden rounded-3xl border bg-card shadow-[0_18px_60px_-45px_rgba(90,72,0,0.45)] lg:h-[calc(100vh-230px)] lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="flex max-h-52 flex-col border-b bg-secondary/25 lg:max-h-none lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden="true" /> Historial
          </div>
          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading}
            className="flex size-8 items-center justify-center rounded-lg border bg-card transition hover:bg-secondary disabled:opacity-50"
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            const isLoading = conversation.id === loadingConversation;
            return (
              <div
                key={conversation.id}
                className={`group flex items-center rounded-xl transition ${
                  isActive ? "bg-card shadow-sm" : "hover:bg-card/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void openConversation(conversation.id)}
                  disabled={loading || Boolean(loadingConversation)}
                  className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:cursor-wait"
                >
                  <span className="flex items-center gap-2">
                    {isLoading ? (
                      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs font-medium">{conversation.title}</span>
                  </span>
                  <span className="mt-1 block pl-5.5 text-[10px] text-muted-foreground">
                    {formatConversationDate(conversation.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteConversation(conversation.id)}
                  disabled={loading || Boolean(deletingId)}
                  className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 disabled:cursor-wait"
                  aria-label={`Eliminar ${conversation.title}`}
                  title="Eliminar conversación"
                >
                  {deletingId === conversation.id ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="px-3 py-7 text-center">
              <MessageSquare className="mx-auto size-5 text-muted-foreground/60" />
              <p className="mt-2 text-xs text-muted-foreground">Todavía no hay conversaciones guardadas.</p>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{activeTitle ?? "Asistente de operaciones"}</h3>
              <p className="text-xs text-muted-foreground">Conectado a los registros del panel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={startNewConversation}
            disabled={loading}
            className="ml-3 inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nueva conversación</span>
          </button>
        </div>

        <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-5 overflow-y-auto bg-background/45 p-5 md:p-7">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bot className="size-4" aria-hidden="true" />
                </span>
              )}
              <div
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 md:max-w-[72%] ${
                  message.role === "user"
                    ? "rounded-br-md bg-sidebar text-white"
                    : "rounded-bl-md border bg-card text-card-foreground shadow-sm"
                }`}
              >
                {message.content}
              </div>
              {message.role === "user" && (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <UserRound className="size-4" aria-hidden="true" />
                </span>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-end gap-2.5" aria-live="polite">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="size-4" aria-hidden="true" />
              </span>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Consultando registros...
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-card p-4 md:px-6 md:py-5">
          {!activeId && messages.length === 1 && (
            <div className="scrollbar-thin mb-3 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  className="shrink-0 rounded-full border bg-background px-3 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={2_000}
              disabled={loading || Boolean(loadingConversation)}
              aria-label="Consulta para el Asistente IA"
              placeholder="Consulta las operaciones registradas..."
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || Boolean(loadingConversation) || !value.trim()}
              aria-label="Enviar consulta"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            El historial se guarda de forma privada. Las respuestas de IA pueden contener errores.
          </p>
        </div>
      </div>
    </section>
  );
}
