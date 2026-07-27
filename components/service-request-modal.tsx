"use client";

import { CheckCircle2, MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type Item = ReturnType<typeof import("@/lib/service-requests").serializeServiceRequest>;

export function ServiceRequestModal({
  item,
  returnUrl,
}: {
  item: Item;
  returnUrl: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const whatsappUrl = buildWhatsAppUrl(item.phone);

  async function markAttended() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/servicios/${item.id}/atender`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "No fue posible actualizar la solicitud.");
        return;
      }
      router.replace(returnUrl);
      router.refresh();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="service-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-card sm:rounded-2xl">
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">SER-{item.id.padStart(4, "0")}</p>
            <h2 id="service-title" className="mt-1 text-xl font-semibold">Solicitud de servicio</h2>
          </div>
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-secondary" aria-label="Cerrar"><X className="size-5" /></button>
        </header>
        <div className="p-6">
          <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Datos del cliente</h3><StatusBadge status={item.status} /></div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
            <Data label="Cliente" value={item.client} />
            <Data label="Cédula" value={item.clientId} />
            <Data label="Usuario" value={`@${item.username}`} />
            <Data label="Teléfono" value={item.phone} />
            <Data label="Sucursal" value={item.branch} />
            <Data label="Recibida" value={formatDate(item.createdAt)} />
          </dl>
          <div className="mt-6 rounded-xl border bg-secondary/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Servicio solicitado</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.detail}</p>
          </div>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-white hover:brightness-95"><MessageCircle className="size-4" />Abrir chat en WhatsApp</a>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-xl bg-secondary text-sm text-muted-foreground">Número de WhatsApp inválido</span>
            )}
            {item.status === "pendiente" ? (
              <button type="button" onClick={markAttended} disabled={pending} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold hover:bg-secondary disabled:opacity-60"><CheckCircle2 className="size-4" />{pending ? "Guardando..." : "Marcar como atendida"}</button>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-xl border text-sm text-muted-foreground">Solicitud procesada</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}
