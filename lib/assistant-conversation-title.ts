export function createConversationTitle(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 71).trimEnd()}…`;
}
