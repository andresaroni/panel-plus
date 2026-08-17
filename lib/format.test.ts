import { describe, expect, it } from "vitest";

import {
  elapsedSeconds,
  formatDuration,
  formatMoney,
  formatResponseTime,
  initials,
} from "./format";

describe("formateadores", () => {
  it("formatea montos como dólares con dos decimales", () => {
    const result = formatMoney("14.00");
    expect(result).toContain("14,00");
    expect(result).toMatch(/US\$|USD|\$/);
  });

  it("genera iniciales con los dos primeros nombres", () => {
    expect(initials("Ana Méndez Castillo")).toBe("AM");
  });

  it("calcula y formatea el tiempo transcurrido", () => {
    const start = new Date("2026-08-17T10:00:00Z");
    const end = new Date("2026-08-17T11:02:03Z");
    expect(elapsedSeconds(start, end)).toBe(3723);
    expect(formatDuration(3723)).toBe("1 h 2 min 3 s");
  });

  it("descarta intervalos inválidos y distingue pendientes de históricos", () => {
    expect(elapsedSeconds("2026-08-17T11:00:00Z", "2026-08-17T10:00:00Z")).toBeNull();
    expect(formatResponseTime(null, "2026-08-17T10:00:00Z", "pendiente")).toBe("Pendiente");
    expect(formatResponseTime(null, "2026-08-17T10:00:00Z", "aprobado")).toBe("No disponible");
    expect(formatResponseTime(null, null, "pendiente")).toBe("No disponible");
  });
});
