import { describe, expect, it } from "vitest";

import { buildWhatsAppUrl } from "./whatsapp";

describe("enlace de WhatsApp", () => {
  it("normaliza números internacionales y locales de Ecuador", () => {
    expect(buildWhatsAppUrl("+593 99 123 4567")).toContain("https://wa.me/593991234567");
    expect(buildWhatsAppUrl("099 123 4567")).toContain("https://wa.me/593991234567");
  });

  it("rechaza protocolos y números inválidos", () => {
    expect(buildWhatsAppUrl("javascript:alert(1)")).toBeNull();
    expect(buildWhatsAppUrl("123")).toBeNull();
  });
});
