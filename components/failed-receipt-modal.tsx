"use client";

import { Ban, Check, CheckCircle2, MessageCircle, Minus, QrCode, ShieldAlert, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { WebChatPanel } from "@/components/web-chat-panel";
import { formatDate, formatMoney } from "@/lib/format";
import { formatContact, isWebChatKey } from "@/lib/web-chat";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type Item = import("@/lib/failed-receipts").FailedReceiptCase;
type Attempt = Item["attempts"][number];

export function FailedReceiptModal({
  item,
  returnUrl,
}: {
  item: Item;
  returnUrl: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"atendido" | "descartado" | null>(null);
  const [error, setError] = useState("");
  const webChat = isWebChatKey(item.phone);
  const forged = item.reason === "comprobante_falso";
  const whatsappUrl = webChat
    ? null
    : buildWhatsAppUrl(
        item.phone,
        "Hola, te escribimos de FrankoPlus para ayudarte con el comprobante de tu recarga.",
      );

  async function resolve(status: "atendido" | "descartado") {
    setPending(status);
    setError("");
    try {
      const response = await fetch(`/api/comprobantes/${item.id}/atender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "No fue posible actualizar el comprobante.");
        return;
      }
      router.replace(returnUrl);
      router.refresh();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="failed-receipt-title" className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-card sm:rounded-2xl">
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">CMP-{item.id.padStart(4, "0")}</p>
            <h2 id="failed-receipt-title" className={`mt-1 text-xl font-semibold ${forged ? "text-red-600" : ""}`}>
              {forged ? "Posible comprobante falso" : "Comprobante no leído"}
            </h2>
          </div>
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-secondary" aria-label="Cerrar"><X className="size-5" /></button>
        </header>

        <div className="p-6">
          <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Datos del cliente</h3><StatusBadge status={item.status} /></div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm md:grid-cols-3">
            <Data label="Cliente" value={item.client} />
            <Data label="Cédula" value={item.clientId} />
            <Data label="Usuario" value={`@${item.username}`} />
            <Data label="Contacto" value={formatContact(item.phone)} />
            <Data label="Sucursal" value={item.branch} />
            <Data label="Plataforma" value={item.platform} />
            <Data label="Escalado" value={formatDate(item.createdAt)} />
            {item.attendedAt && <Data label="Resuelto" value={formatDate(item.attendedAt)} />}
          </dl>

          {forged ? (
            <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold">El asistente detectó un posible comprobante falso</p>
                <p className="mt-1 leading-relaxed">
                  El código QR del comprobante contiene datos distintos a los que se ven en la imagen.
                  Es probable que la captura haya sido editada. No acredites la recarga sin verificar
                  la transferencia en la cuenta bancaria.
                </p>
                {item.detail && <p className="mt-2 break-words font-medium">{item.detail}</p>}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <p className="font-semibold">{item.reasonLabel}</p>
              {item.detail && <p className="mt-1 break-words leading-relaxed">{item.detail}</p>}
            </div>
          )}

          <h3 className="mt-8 font-semibold">Intentos del cliente ({item.attempts.length})</h3>
          <div className="mt-4 grid gap-4">
            {item.attempts.map((attempt) => (
              <AttemptCard key={attempt.id} attempt={attempt} client={item.client} />
            ))}
          </div>

          {webChat && <WebChatPanel chatKey={item.phone} clientName={item.client} />}
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {webChat ? (
              <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary text-sm text-muted-foreground"><MessageCircle className="size-4" />Responde en el chat web de arriba</span>
            ) : whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:brightness-95"><MessageCircle className="size-4" />Abrir chat en WhatsApp</a>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-xl bg-secondary text-sm text-muted-foreground">Número de WhatsApp inválido</span>
            )}
            {item.status === "pendiente" ? (
              <>
                <button type="button" onClick={() => resolve("atendido")} disabled={pending !== null} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold hover:bg-secondary disabled:opacity-60"><CheckCircle2 className="size-4" />{pending === "atendido" ? "Guardando..." : "Marcar como atendido"}</button>
                <button type="button" onClick={() => resolve("descartado")} disabled={pending !== null} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><Ban className="size-4" />{pending === "descartado" ? "Guardando..." : "Descartar"}</button>
              </>
            ) : (
              <span className="flex h-11 items-center justify-center rounded-xl border text-sm text-muted-foreground sm:col-span-2">Caso resuelto</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function AttemptCard({ attempt, client }: { attempt: Attempt; client: string }) {
  return (
    <article className="grid overflow-hidden rounded-xl border md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="bg-secondary/50 p-4">
        {attempt.hasImage ? (
          <a href={`/api/comprobantes/${attempt.id}/imagen`} target="_blank" rel="noopener noreferrer">
            <Image
              src={`/api/comprobantes/${attempt.id}/imagen`}
              alt={`Comprobante enviado por ${client}, intento ${attempt.attempt}`}
              width={600}
              height={800}
              unoptimized
              className="mx-auto h-auto max-h-80 w-full rounded-lg border bg-card object-contain"
            />
          </a>
        ) : (
          <div className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No se guardó imagen en este intento.
          </div>
        )}
      </div>
      <div className="p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Intento {attempt.attempt} · {attempt.reasonLabel}</p>
          <p className="text-xs text-muted-foreground">{formatDate(attempt.createdAt)}</p>
        </div>
        {attempt.detail && <p className="mt-1 break-words text-muted-foreground">{attempt.detail}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Data label="Monto leído" value={attempt.amount ? formatMoney(attempt.amount) : "No leído"} valueClassName={attempt.amount ? "tabular-nums text-emerald-600" : undefined} />
          <Data label="Número de comprobante" value={attempt.reference ?? "No leído"} />
          <Data label="Banco" value={attempt.bank ?? "No leído"} />
          <Data label="Cuenta" value={attempt.account ?? "No leída"} />
          <Data label="Titular" value={attempt.beneficiary ?? "No leído"} />
        </dl>
        {attempt.qrCheck && <QrComparison check={attempt.qrCheck} />}
        {attempt.customerMessage && (
          <div className="mt-4 rounded-lg bg-secondary/60 p-3">
            <p className="text-xs text-muted-foreground">Mensaje enviado al cliente</p>
            <p className="mt-1">{attempt.customerMessage}</p>
          </div>
        )}
        {attempt.readings.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Lectura de cada modelo ({attempt.readings.length})</summary>
            <ul className="mt-2 space-y-2">
              {attempt.readings.map((reading, index) => (
                <li key={index} className="rounded-lg border p-3 text-xs leading-relaxed">
                  {reading.error ? (
                    <p className="break-words text-red-700">{reading.error}</p>
                  ) : (
                    <>
                      <p className="font-semibold">
                        {reading.model ?? "Modelo"} · {reading.readable ? "legible" : "ilegible"}
                        {reading.accountValidated !== null && (reading.accountValidated ? " · cuenta validada" : " · cuenta no validada")}
                      </p>
                      <p className="mt-1 break-words text-muted-foreground">
                        N.º {reading.number ?? "—"} · {reading.amount ? formatMoney(reading.amount) : "—"} · {reading.bank ?? "—"} · {reading.holder ?? "—"} · {reading.account ?? "—"}
                      </p>
                      {reading.explanation && <p className="mt-1 break-words">{reading.explanation}</p>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

/** Datos de la imagen frente a los del QR del comprobante, campo por campo. */
function QrComparison({ check }: { check: NonNullable<Attempt["qrCheck"]> }) {
  return (
    <div className={`mt-4 overflow-hidden rounded-lg border ${check.forged ? "border-red-300" : ""}`}>
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-xs font-semibold ${check.forged ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
        <QrCode className="size-4" />
        {check.forged ? "El QR no coincide con la imagen" : "El QR coincide con la imagen"}
        {check.date && <span className="font-normal opacity-80">· Fecha según QR: {check.date}</span>}
      </div>
      <table className="w-full text-xs">
        <thead className="bg-secondary/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Dato</th>
            <th className="px-3 py-2 font-medium">En la imagen</th>
            <th className="px-3 py-2 font-medium">En el QR</th>
            <th className="w-8 px-3 py-2"><span className="sr-only">Resultado</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {check.fields.map((field) => {
            const mismatch = field.matches === false;
            return (
              <tr key={field.field} className={mismatch && field.decisive ? "bg-red-50/70" : ""}>
                <td className="px-3 py-2 font-medium">{field.label}</td>
                <td className="break-words px-3 py-2">{field.image ?? "—"}</td>
                <td className={`break-words px-3 py-2 ${mismatch ? "font-semibold text-red-700" : ""}`}>{field.qr ?? "—"}</td>
                <td className="px-3 py-2">
                  {field.matches === true ? (
                    <Check className="size-4 text-emerald-600" aria-label="Coincide" />
                  ) : mismatch ? (
                    <X className={`size-4 ${field.decisive ? "text-red-600" : "text-orange-500"}`} aria-label="No coincide" />
                  ) : (
                    <Minus className="size-4 text-muted-foreground" aria-label="Sin dato para comparar" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(check.originHolder || check.originAccount) && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Origen según QR: {[check.originBank, check.originHolder, check.originAccount].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Data({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1 break-words font-medium ${valueClassName}`}>{value}</dd></div>;
}
