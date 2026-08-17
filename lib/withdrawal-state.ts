export function isWithdrawalReviewable(status: string) {
  return status === "pendiente" || status === "error_comprobante";
}

export function isWithdrawalCancellable(status: string) {
  return status === "borrador" || status === "pendiente";
}
