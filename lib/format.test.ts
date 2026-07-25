import { describe, expect, it } from "vitest";

import { formatMoney, initials } from "./format";

describe("formateadores", () => {
  it("formatea montos como dólares con dos decimales", () => {
    const result = formatMoney("14.00");
    expect(result).toContain("14,00");
    expect(result).toMatch(/US\$|USD|\$/);
  });

  it("genera iniciales con los dos primeros nombres", () => {
    expect(initials("Ana Méndez Castillo")).toBe("AM");
  });
});
