import { describe, expect, it } from "vitest";

import { createConversationTitle } from "./assistant-conversation-title";

describe("createConversationTitle", () => {
  it("normalizes whitespace from the first question", () => {
    expect(createConversationTitle("  Cuántas   operaciones\n están pendientes? ")).toBe(
      "Cuántas operaciones están pendientes?",
    );
  });

  it("truncates long questions", () => {
    const title = createConversationTitle("a".repeat(100));
    expect(title).toHaveLength(72);
    expect(title.endsWith("…")).toBe(true);
  });
});
