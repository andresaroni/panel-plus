import { describe, expect, it } from "vitest";

import { isWithdrawalRemovable, isWithdrawalReviewable } from "./withdrawal-state";

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

describe("cancelación y eliminación de retiros", () => {
  it("permite eliminar únicamente retiros sin resultado financiero", () => {
    expect(isWithdrawalRemovable("borrador")).toBe(true);
    expect(isWithdrawalRemovable("pendiente")).toBe(true);
  });

  it("protege estados terminales", () => {
    expect(isWithdrawalRemovable("pagado")).toBe(false);
    expect(isWithdrawalRemovable("rechazado")).toBe(false);
    expect(isWithdrawalRemovable("cancelado")).toBe(false);
    expect(isWithdrawalRemovable("aprobado")).toBe(false);
    expect(isWithdrawalRemovable("error_comprobante")).toBe(false);
  });
});
