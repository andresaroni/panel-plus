"use client";

import { Bot, Send, UserRound, Headset, LogOut } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import type { WebChatMessage } from "@/lib/web-chat";

const POLL_MS = 4000;

type ChatState = {
  mode: "bot" | "agente";
  messages: WebChatMessage[];
};

/**
 * Chat con un cliente que escribió desde el widget web de Juegos de Azar. Reemplaza el
 * enlace de WhatsApp: el agente responde aquí y el mensaje aparece en el widget.
 */
export function WebChatPanel({ chatKey, clientName }: { chatKey: string; clientName: string }) {
  const [state, setState] = useState<ChatState | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef("0");
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch(`/api/chat-web/${chatKey}?after=${lastIdRef.current}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | { mode: ChatState["mode"]; messages: WebChatMessage[]; error?: string }
        | null;
      if (!response.ok || !result) {
        setError(result?.error ?? "No fue posible cargar el chat.");
        return;
      }
      setError("");
      setState((previous) => {
        const known = new Map((previous?.messages ?? []).map((m) => [m.id, m]));
        for (const message of result.messages) known.set(message.id, message);
        const messages = [...known.values()].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
        const last = messages.at(-1);
        if (last) lastIdRef.current = last.id;
        return { mode: result.mode, messages };
      });
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      loadingRef.current = false;
    }
  }, [chatKey]);

  useEffect(() => {
    lastIdRef.current = "0";
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const messageCount = state?.messages.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messageCount]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/chat-web/${chatKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "No fue posible enviar el mensaje.");
        return;
      }
      setText("");
      await load();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setSending(false);
    }
  }

  async function closeChat() {
    setClosing(true);
    setError("");
    try {
      const response = await fetch(`/api/chat-web/${chatKey}/cerrar`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setError(result?.error ?? "No fue posible cerrar el chat.");
      await load();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setClosing(false);
    }
  }

  const agentMode = state?.mode === "agente";

  return (
    <div className="mt-6 overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Chat web con {clientName}</p>
          <p className="text-xs text-muted-foreground">
            {agentMode
              ? "Estás atendiendo: el asistente automático está en pausa."
              : "Responde el asistente automático. Al escribir, tomas el chat."}
          </p>
        </div>
        {agentMode && (
          <button
            type="button"
            onClick={closeChat}
            disabled={closing}
            className="flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:opacity-60"
          >
            <LogOut className="size-4" />
            {closing ? "Cerrando..." : "Devolver al asistente"}
          </button>
        )}
      </div>

      <div ref={listRef} className="h-80 space-y-3 overflow-y-auto bg-background/60 p-4">
        {!state && !error && <p className="text-center text-sm text-muted-foreground">Cargando chat...</p>}
        {state?.messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Aún no hay mensajes.</p>
        )}
        {state?.messages.map((message) => (
          <MessageBubble key={message.id} message={message} chatKey={chatKey} />
        ))}
      </div>

      {error && <p role="alert" className="border-t bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Escribe una respuesta para el cliente..."
          className="min-h-11 flex-1 resize-none rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-11 items-center gap-2 self-end rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
        >
          <Send className="size-4" />
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message, chatKey }: { message: WebChatMessage; chatKey: string }) {
  const fromClient = message.author === "cliente";
  const Icon = message.author === "cliente" ? UserRound : message.author === "agente" ? Headset : Bot;
  const label = message.author === "cliente" ? "Cliente" : message.author === "agente" ? "Agente" : "Asistente";

  return (
    <div className={`flex gap-2 ${fromClient ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] ${fromClient ? "" : "text-right"}`}>
        <p className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground" style={{ justifyContent: fromClient ? "flex-start" : "flex-end" }}>
          <Icon className="size-3" />
          {label} · {new Date(message.createdAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <div
          className={`inline-block rounded-2xl px-3 py-2 text-left text-sm ${
            fromClient
              ? "rounded-tl-sm bg-secondary"
              : message.author === "agente"
                ? "rounded-tr-sm bg-primary text-primary-foreground"
                : "rounded-tr-sm border bg-card"
          }`}
        >
          {message.hasImage && (
            <a href={`/api/chat-web/${chatKey}/imagen/${message.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
              <img
                src={`/api/chat-web/${chatKey}/imagen/${message.id}`}
                alt="Imagen del chat"
                className="max-h-56 rounded-lg border bg-card object-contain"
              />
            </a>
          )}
          {message.text && <FormattedText text={message.text} />}
          {message.options && message.options.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs opacity-80">
              {message.options.map((option) => (
                <li key={option.id}>• {option.title}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Muestra el formato de WhatsApp (*negrita*) sin usar HTML crudo. */
function FormattedText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {text.split(/(\*[^*\n]+\*)/g).map((part, index) =>
        /^\*[^*\n]+\*$/.test(part) ? (
          <strong key={index}>{part.slice(1, -1)}</strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
