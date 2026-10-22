"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteFailedReceiptButton({ id, client }: { id: string; client: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (
      pending ||
      !window.confirm(`¿Eliminar el comprobante de ${client} y todos sus intentos? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/comprobantes/${id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        window.alert(result?.error ?? "No fue posible eliminar el comprobante.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("No fue posible conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label="Eliminar comprobante"
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
    >
      <Trash2 className="size-3.5" />
      {pending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
