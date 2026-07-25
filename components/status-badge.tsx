const styles = {
  pendiente: "bg-stone-100 text-stone-600",
  aprobado: "bg-lime-50 text-lime-800",
  rechazado: "bg-red-50 text-red-600",
  borrador: "bg-slate-100 text-slate-600",
  error_comprobante: "bg-orange-50 text-orange-700",
  pagado: "bg-emerald-50 text-emerald-700",
  cancelado: "bg-zinc-100 text-zinc-600",
};

const labels = {
  pendiente: "Pendiente",
  aprobado: "Aprobada",
  rechazado: "Rechazada",
  borrador: "Borrador",
  error_comprobante: "Error de comprobante",
  pagado: "Pagada",
  cancelado: "Cancelada",
};

export type Status = keyof typeof styles;

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${styles[status]}`}>
      <span className={`size-1.5 rounded-full ${status === "rechazado" || status === "error_comprobante" ? "bg-red-500" : status === "aprobado" || status === "pagado" ? "bg-primary" : "bg-stone-500"}`} />
      {labels[status]}
    </span>
  );
}
