import { describe, expect, it } from "vitest";

import {
  ecuadorDateParts,
  findInsufficientBank,
  formatGiroReceiptNumber,
  formatGiroRequestNumber,
  fromCents,
  maskIdNumber,
  toCents,
} from "./giro-receipt";

describe("cédula en el comprobante de retiro", () => {
  it("deja visibles los 3 primeros y el último dígito", () => {
    expect(maskIdNumber("1207654325")).toBe("120XXXXXX5");
    expect(maskIdNumber(" 0912345678 ")).toBe("091XXXXXX8");
  });

  it("no oculta valores muy cortos", () => {
    expect(maskIdNumber("000")).toBe("000");
  });
});

describe("numeración de giros", () => {
  it("usa la abreviatura del mes y cinco dígitos", () => {
    expect(formatGiroReceiptNumber(1, 1)).toBe("ENE-00001");
    expect(formatGiroReceiptNumber(11, 42)).toBe("NOV-00042");
    expect(formatGiroReceiptNumber(12, 123456)).toBe("DIC-123456");
  });

  it("rechaza meses fuera de rango", () => {
    expect(() => formatGiroReceiptNumber(0, 1)).toThrow(RangeError);
    expect(() => formatGiroReceiptNumber(13, 1)).toThrow(RangeError);
  });

  it("numera las solicitudes con prefijo SOL", () => {
    expect(formatGiroRequestNumber(12)).toBe("SOL-00012");
  });
});

describe("fecha de Ecuador", () => {
  it("convierte UTC a hora local de Guayaquil (UTC-5)", () => {
    const parts = ecuadorDateParts(new Date("2026-12-01T03:15:09Z"));
    expect(parts).toEqual({ year: 2026, month: 11, day: "2026-11-30", sql: "2026-11-30 22:15:09" });
  });

  it("usa formato de 24 horas a medianoche", () => {
    expect(ecuadorDateParts(new Date("2026-11-09T05:00:00Z")).sql).toBe("2026-11-09 00:00:00");
  });
});

describe("saldos en centavos", () => {
  it("evita errores de coma flotante", () => {
    expect(toCents("0.1") + toCents("0.2")).toBe(30);
    expect(fromCents(toCents("221.50") - toCents("20.25"))).toBe("201.25");
  });

  it("detecta el banco sin saldo suficiente en depósitos", () => {
    const balances = new Map([
      [1, 2000],
      [2, 500],
    ]);
    const items = [
      { bankId: 1, amountCents: 1500 },
      { bankId: 2, amountCents: 300 },
      { bankId: 2, amountCents: 300 },
    ];
    expect(findInsufficientBank("Deposito", items, balances)).toBe(2);
    expect(findInsufficientBank("Retiro", items, balances)).toBeNull();
    expect(findInsufficientBank("Deposito", items.slice(0, 2), balances)).toBeNull();
  });
});
