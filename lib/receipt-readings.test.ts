import { describe, expect, it } from "vitest";

import { parseReceiptReadings } from "./receipt-readings";

describe("parseReceiptReadings", () => {
  it("convierte las lecturas y los errores que guarda el bot", () => {
    const raw = JSON.stringify([
      {
        modelo: "gpt-4o-mini",
        legible: true,
        numero: "47224",
        monto: "15.00",
        banco: "BANCO PICHINCHA C.A.",
        titular: "MEJIA MATAMOROS THAIS DAM",
        cuenta: "56",
        explicacion: "Etiquetas visibles",
        cuenta_validada: false,
      },
      { error: "gpt-5-mini: APITimeoutError: Request timed out." },
    ]);

    const [reading, failure] = parseReceiptReadings(raw);

    expect(reading).toMatchObject({
      model: "gpt-4o-mini",
      readable: true,
      number: "47224",
      amount: "15.00",
      account: "56",
      accountValidated: false,
      error: null,
    });
    expect(failure.error).toBe("gpt-5-mini: APITimeoutError: Request timed out.");
    expect(failure.model).toBeNull();
  });

  it("no rompe con JSON vacío, dañado o con otra forma", () => {
    expect(parseReceiptReadings(null)).toEqual([]);
    expect(parseReceiptReadings("{no es json")).toEqual([]);
    expect(parseReceiptReadings('{"modelo":"x"}')).toEqual([]);
    expect(parseReceiptReadings('[null, 3, "texto"]')).toEqual([]);
  });
});
