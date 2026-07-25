import { describe, expect, it } from "vitest";

import { isWithdrawalReviewable } from "./withdrawal-state";

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
