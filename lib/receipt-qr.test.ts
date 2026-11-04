import { describe, expect, it } from "vitest";

import { failedReceiptReasonLabels, parseQrCheck } from "./receipt-readings";

describe("parseQrCheck", () => {
  it("convierte la verificación del QR escrita por el bot", () => {
    const check = parseQrCheck(
      JSON.stringify({
        formato: "banco_pichincha",
        tipo_transferencia: "BP_TO_DEUNA",
        falso: true,
        fecha: "28/10/2026",
        origen: { banco: "Banco Pichincha", titular: "Perez Lopez Juan", cuenta: "2200000001" },
        campos: [
          { campo: "monto", etiqueta: "Monto", imagen: "$10.00", qr: "$0.01", coincide: false, decisivo: true },
          { campo: "banco_destino", etiqueta: "Banco destino", imagen: "Banco Pichincha", qr: "DeUna", coincide: false, decisivo: false },
          { campo: "beneficiario", etiqueta: "Beneficiario", imagen: null, qr: "Garcia Vera", coincide: null, decisivo: true },
        ],
      }),
    );

    expect(check?.forged).toBe(true);
    expect(check?.date).toBe("28/10/2026");
    expect(check?.originHolder).toBe("Perez Lopez Juan");
    expect(check?.fields).toHaveLength(3);
    expect(check?.fields[0]).toEqual({
      field: "monto",
      label: "Monto",
      image: "$10.00",
      qr: "$0.01",
      matches: false,
      decisive: true,
    });
    expect(check?.fields[2].matches).toBeNull();
  });

  it("ignora valores vacíos o JSON inválido", () => {
    expect(parseQrCheck(null)).toBeNull();
    expect(parseQrCheck("no-json")).toBeNull();
    expect(parseQrCheck("[1,2]")).toBeNull();
  });

  it("tiene etiqueta para el motivo de comprobante falso", () => {
    expect(failedReceiptReasonLabels.comprobante_falso).toBe("Posible comprobante falso");
  });
});
