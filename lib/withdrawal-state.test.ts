import { describe, expect, it } from "vitest";

import { isWithdrawalCancellable, isWithdrawalReviewable } from "./withdrawal-state";

describe("estado de revisión de retiros", () => {
  it("permite reemplazar un comprobante que falló su validación", () => {
    expect(isWithdrawalReviewable("error_comprobante")).toBe(true);
    expect(isWithdrawalReviewable("pendiente")).toBe(true);
  });

  it("mantiene aprobado como validación de solo lectura", () => {
    expect(isWithdrawalReviewable("aprobado")).toBe(false);
    expect(isWithdrawalReviewable("pagado")).toBe(false);
  });
});

describe("cancelación de retiros", () => {
  it("permite cancelar únicamente retiros sin resultado financiero", () => {
    expect(isWithdrawalCancellable("borrador")).toBe(true);
    expect(isWithdrawalCancellable("pendiente")).toBe(true);
  });

  it("protege estados terminales", () => {
    expect(isWithdrawalCancellable("pagado")).toBe(false);
    expect(isWithdrawalCancellable("rechazado")).toBe(false);
    expect(isWithdrawalCancellable("cancelado")).toBe(false);
    expect(isWithdrawalCancellable("aprobado")).toBe(false);
    expect(isWithdrawalCancellable("error_comprobante")).toBe(false);
  });
});
