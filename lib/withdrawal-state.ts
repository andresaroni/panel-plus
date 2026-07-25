export function isWithdrawalReviewable(status: string) {
  return status === "pendiente" || status === "error_comprobante";
}
