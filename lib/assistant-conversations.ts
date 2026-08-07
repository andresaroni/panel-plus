import "server-only";

import { createConversationTitle } from "@/lib/assistant-conversation-title";
import { prisma } from "@/lib/prisma";

type ConversationRow = {
  id: bigint;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  id: bigint;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type SavedConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function serializeConversation(row: ConversationRow): SavedConversation {
  return {
    id: row.id.toString(),
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMessage(row: MessageRow): SavedMessage {
  return {
    id: row.id.toString(),
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAssistantConversations(userId: number, limit = 40) {
  const safeLimit = Math.min(100, Math.max(1, limit));
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT
      id_conversacion AS id,
      titulo AS title,
      date_create AS createdAt,
      date_update AS updatedAt
    FROM panel_ai_conversations
    WHERE usuario_id = ${userId}
    ORDER BY date_update DESC, id_conversacion DESC
    LIMIT ${safeLimit}
  `;
  return rows.map(serializeConversation);
}

export async function getAssistantConversation(
  userId: number,
  conversationId: bigint,
  messageLimit = 200,
) {
  const conversations = await prisma.$queryRaw<ConversationRow[]>`
    SELECT
      id_conversacion AS id,
      titulo AS title,
      date_create AS createdAt,
      date_update AS updatedAt
    FROM panel_ai_conversations
    WHERE id_conversacion = ${conversationId} AND usuario_id = ${userId}
    LIMIT 1
  `;
  const conversation = conversations[0];
  if (!conversation) return null;

  const safeLimit = Math.min(500, Math.max(1, messageLimit));
  const rows = await prisma.$queryRaw<MessageRow[]>`
    SELECT id_mensaje AS id, rol AS role, contenido AS content, date_create AS createdAt
    FROM (
      SELECT id_mensaje, rol, contenido, date_create
      FROM panel_ai_messages
      WHERE conversacion_id = ${conversationId}
      ORDER BY id_mensaje DESC
      LIMIT ${safeLimit}
    ) AS recent_messages
    ORDER BY id_mensaje ASC
  `;

  return {
    conversation: serializeConversation(conversation),
    messages: rows.map(serializeMessage),
  };
}

export async function saveAssistantExchange(input: {
  userId: number;
  conversationId: bigint | null;
  userMessage: string;
  assistantMessage: string;
}) {
  return prisma.$transaction(async (transaction) => {
    let conversationId = input.conversationId;

    if (conversationId === null) {
      const title = createConversationTitle(input.userMessage);
      await transaction.$executeRaw`
        INSERT INTO panel_ai_conversations (usuario_id, titulo)
        VALUES (${input.userId}, ${title})
      `;
      const inserted = await transaction.$queryRaw<Array<{ id: bigint }>>`
        SELECT LAST_INSERT_ID() AS id
      `;
      conversationId = inserted[0].id;
    } else {
      const updated = await transaction.$executeRaw`
        UPDATE panel_ai_conversations
        SET date_update = CURRENT_TIMESTAMP
        WHERE id_conversacion = ${conversationId} AND usuario_id = ${input.userId}
      `;
      if (updated !== 1) throw new Error("CONVERSATION_NOT_FOUND");
    }

    await transaction.$executeRaw`
      INSERT INTO panel_ai_messages (conversacion_id, rol, contenido)
      VALUES
        (${conversationId}, 'user', ${input.userMessage}),
        (${conversationId}, 'assistant', ${input.assistantMessage})
    `;

    const conversations = await transaction.$queryRaw<ConversationRow[]>`
      SELECT
        id_conversacion AS id,
        titulo AS title,
        date_create AS createdAt,
        date_update AS updatedAt
      FROM panel_ai_conversations
      WHERE id_conversacion = ${conversationId} AND usuario_id = ${input.userId}
      LIMIT 1
    `;
    return serializeConversation(conversations[0]);
  });
}

export async function deleteAssistantConversation(userId: number, conversationId: bigint) {
  const deleted = await prisma.$executeRaw`
    DELETE FROM panel_ai_conversations
    WHERE id_conversacion = ${conversationId} AND usuario_id = ${userId}
  `;
  return deleted === 1;
}
