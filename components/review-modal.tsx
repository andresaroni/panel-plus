"use client";

import { Check, CheckCircle2, X, XCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  updateRequestStatus,
  type RequestActionState,
} from "@/app/actions/requests";
import { formatDate, formatMoney } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

type Item = ReturnType<typeof import("@/lib/recargas").serializeRequest>;

const initialState: RequestActionState = {};

export function ReviewModal({
  item,
  returnUrl = "/solicitudes",
}: {
  item: Item;
  returnUrl?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateRequestStatus, initialState);

  useEffect(() => {
    if (state.success) {
      router.replace(returnUrl);
      router.refresh();
    }
  }, [returnUrl, router, state.success]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-card sm:rounded-2xl"
      >
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              REC-{item.id.padStart(4, "0")}
            </p>
            <h2 id="review-title" className="mt-1 text-xl font-semibold">
              {item.status === "pendiente" ? "Validar comprobante" : "Detalle de la solicitud"}
            </h2>
          </div>
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-secondary" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>

        <div className="grid md:grid-cols-[1fr_1.05fr]">
          <div className="bg-secondary/50 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vista del comprobante
            </p>
            <div className="relative mx-auto min-h-80 max-w-md overflow-hidden rounded-xl border bg-card shadow-sm">
              {item.hasImage ? (
                <Image
                  src={`/api/recargas/${item.id}/comprobante`}
                  alt={`Comprobante de ${item.client}`}
                  width={900}
                  height={1200}
                  unoptimized
                  className="h-auto max-h-[62vh] w-full object-contain"
                />
              ) : (
                <div className="flex min-h-80 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  Esta solicitud no contiene una imagen de comprobante.
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">Datos de la solicitud</h3>
              <StatusBadge status={item.status} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <Data label="Cliente" value={item.client} />
              <Data label="Cédula" value={item.clientId} />
              <Data label="Usuario" value={`@${item.username}`} />
              <Data label="Plataforma" value={item.platform} />
              <Data label="Sucursal" value={item.branch} />
              <Data label="Monto" value={formatMoney(item.amount)} />
              <Data label="Banco" value={item.bank} />
              <Data label="Referencia" value={item.reference} />
              <Data label="Titular detectado" value={item.beneficiary} />
              <Data label="Cuenta" value={item.account} />
              <Data label="Recibida" value={formatDate(item.createdAt)} />
              <Data label="Última actualización" value={formatDate(item.updatedAt)} />
            </dl>

            {item.observation && (
              <div className="mt-6 rounded-xl border bg-background p-4">
                <p className="text-sm font-medium">Observación OCR</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.observation}</p>
              </div>
            )}

            {state.error && (
              <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            )}

            {item.status === "pendiente" && (
              <form action={action} className="mt-7 grid grid-cols-2 gap-3">
                <input type="hidden" name="id" value={item.id} />
                <button
                  name="status"
                  value="rechazado"
                  disabled={pending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="size-4" /> Rechazar
                </button>
                <button
                  name="status"
                  value="aprobado"
                  disabled={pending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
                >
                  {pending ? <span className="animate-pulse">Procesando...</span> : <><Check className="size-4" /> Aprobar</>}
                </button>
              </form>
            )}

            {item.status !== "pendiente" && (
              <div className="mt-7 flex items-center gap-2 rounded-xl bg-secondary p-4 text-sm">
                <CheckCircle2 className="size-5 text-primary" /> Esta solicitud ya fue procesada.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
