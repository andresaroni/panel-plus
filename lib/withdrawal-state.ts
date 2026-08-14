export function isWithdrawalReviewable(status: string) {
  return status === "pendiente" || status === "error_comprobante";
}

export function isWithdrawalRemovable(status: string) {
  return status === "borrador" || status === "pendiente";
}
