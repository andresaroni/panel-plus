import type { chat_web_mensajes } from "@prisma/client";

/** Las conversaciones del widget web de Juegos de Azar usan la clave `web-{id}`. */
export const WEB_CHAT_KEY_PATTERN = /^web-\d{1,16}$/;

export const AGENT_CLOSE_MESSAGE =
  "Un agente finalizó la conversación. Si necesitas algo más, escribe *menú* para ver las opciones.";

export function isWebChatKey(value: string | null | undefined): value is string {
  return !!value && WEB_CHAT_KEY_PATTERN.test(value);
}

/** Texto para mostrar en lugar del teléfono cuando el cliente escribió desde la web. */
export function formatContact(phone: string): string {
  return isWebChatKey(phone) ? "Chat web (Juegos de Azar)" : phone;
}

export type WebChatOption = { id: string; title: string };

export type WebChatMessage = {
  id: string;
  author: "cliente" | "bot" | "agente";
  kind: "texto" | "opciones" | "imagen";
  text: string | null;
  options: WebChatOption[] | null;
  hasImage: boolean;
  createdAt: string;
};

type MessageRow = Omit<chat_web_mensajes, "imagen"> & { imagen?: unknown };

export function serializeWebChatMessage(row: MessageRow, hasImage: boolean): WebChatMessage {
  return {
    id: row.id_mensaje.toString(),
    author: row.autor,
    kind: row.tipo,
    text: row.texto,
    options: Array.isArray(row.opciones) ? (row.opciones as WebChatOption[]) : null,
    hasImage,
    createdAt: row.date_create.toISOString(),
  };
}
