import { describe, expect, it } from "vitest";

import { formatContact, isWebChatKey } from "./web-chat";

describe("web chat", () => {
  it("reconoce solo claves web válidas", () => {
    expect(isWebChatKey("web-15")).toBe(true);
    expect(isWebChatKey("593999999999")).toBe(false);
    expect(isWebChatKey("web-abc")).toBe(false);
    expect(isWebChatKey("web-1/../x")).toBe(false);
    expect(isWebChatKey(null)).toBe(false);
  });

  it("muestra el canal en lugar del teléfono para clientes web", () => {
    expect(formatContact("web-15")).toBe("Chat web (Juegos de Azar)");
    expect(formatContact("0991234567")).toBe("0991234567");
  });
});
