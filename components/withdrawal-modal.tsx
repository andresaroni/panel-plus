"use client";

import { AlertTriangle, Check, ImageIcon, X, XCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import { prepareReceipt } from "@/lib/receipt-encode";
import { isWithdrawalCancellable, isWithdrawalReviewable } from "@/lib/withdrawal-state";

type Item = ReturnType<typeof import("@/lib/retiros").serializeWithdrawal>;
type UploadFailure = import("@/lib/retiros").UploadFailure;
type Decision = "aprobado" | "rechazado";
type PendingAction = Decision | "cancelar";

export function WithdrawalModal({
  item,
  failure = null,
  returnUrl = "/solicitudes?tipo=retiro",
}: {
  item: Item;
  failure?: UploadFailure | null;
  returnUrl?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const receiptError = item.status === "error_comprobante";
  const originBankError = item.internalError === "origin_bank_not_registered";
  const reviewable = isWithdrawalReviewable(item.status);
  const removable =
    isWithdrawalCancellable(item.status) &&
    item.appliedAt === null &&
    item.reportId === null &&
    item.receiptSentAt === null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const decision = submitter?.value as Decision | undefined;
    if (!decision) return;

    setError("");
    setPending(decision);
    const data = new FormData(event.currentTarget);
    data.set("decision", decision);

    // Recortar la imagen a mano era lo que hacia entrar la subida: el editor del
    // telefono la re-codificaba a JPEG y de paso la dejaba mucho mas liviana. Esto
    // hace lo mismo, y solo cuando el archivo no cabe o no es JPEG/PNG/WEBP, para no
    // recomprimir sin necesidad la imagen que despues tiene que leer el OCR.
    const receipt = data.get("comprobante");
    if (decision === "aprobado" && receipt instanceof File && receipt.size > 0) {
      data.set("comprobante", await prepareReceipt(receipt));
    }

    try {
      const response = await fetch(`/api/retiros/${item.id}/revision`, {
        method: "POST",
        body: data,
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        // Sin JSON la respuesta no viene del panel sino de algo delante (nginx, el proceso
        // caido). Antes se mostraba el mismo texto que un 500 del panel, y esa ambiguedad
        // fue justo lo que impidio saber que le paso a RET-0067.
        setError(
          result?.error ??
            `El servidor respondió ${response.status} sin detalle. (ERR-HTTP-${response.status})`,
        );
        return;
      }
      router.replace(returnUrl);
      router.refresh();
    } catch {
      setError("No fue posible conectar con el servidor. (ERR-RED)");
    } finally {
      setPending(null);
    }
  }

  async function cancelWithdrawal() {
    const confirmed = window.confirm(
      `Se cancelará el retiro RET-${item.id.padStart(4, "0")} de ${item.client} por ${formatMoney(item.amount)}. El registro se conservará en reportes. ¿Deseas continuar?`,
    );
    if (!confirmed) return;

    setError("");
    setPending("cancelar");
    try {
      const response = await fetch(`/api/retiros/${item.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? "No fue posible cancelar el retiro.");
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
      <section role="dialog" aria-modal="true" aria-labelledby="withdrawal-title" className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl bg-card sm:rounded-2xl">
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">RET-{item.id.padStart(4, "0")}</p>
            <h2 id="withdrawal-title" className="mt-1 text-xl font-semibold">
              {receiptError ? "Reemplazar comprobante del retiro" : item.status === "pendiente" ? "Revisar solicitud de retiro" : "Detalle del retiro"}
            </h2>
          </div>
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-secondary" aria-label="Cerrar"><X className="size-5" /></button>
        </header>

        <div className="grid lg:grid-cols-[1.05fr_1fr]">
          <div className="bg-secondary/50 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidencia del premio</p>
            <div className="relative mx-auto min-h-80 max-w-lg overflow-hidden rounded-xl border bg-card shadow-sm">
              {item.hasPrizeImage ? (
                <Image src={`/api/retiros/${item.id}/premio`} alt={`Premio de ${item.client}`} width={1000} height={1200} unoptimized className="h-auto max-h-[62vh] w-full object-contain" />
              ) : (
                <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground"><ImageIcon className="size-8" />Este retiro no contiene una imagen del premio.</div>
              )}
            </div>
            {item.hasPaymentImage && (
              <a href={`/api/retiros/${item.id}/comprobante`} target="_blank" rel="noreferrer" className="mx-auto mt-3 flex max-w-lg items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-semibold hover:bg-secondary">
                <ImageIcon className="size-4" /> Ver comprobante de pago guardado
              </a>
            )}
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Datos del retiro</h3><StatusBadge status={item.status} /></div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <Data label="Cliente" value={item.client} />
              <Data label="Cédula" value={item.clientId} />
              <Data label="Usuario" value={`@${item.username}`} />
              <Data label="Teléfono" value={item.phone} />
              <Data label="Sucursal" value={item.branch} />
              <Data label="Origen" value={item.origin.replaceAll("_", " ")} />
              <Data label="Plataforma" value={item.platform} />
              <Data label="Monto" value={formatMoney(item.amount)} />
              <Data label="Banco destino" value={item.bank} />
              <Data label="Tipo de cuenta" value={item.accountType} />
              <Data label="Número de cuenta" value={item.account} />
              <Data label="Titular" value={item.accountHolder} />
              <Data label="Recibida" value={formatDate(item.createdAt)} />
              <Data label="Última actualización" value={formatDate(item.updatedAt)} />
            </dl>

            {receiptError && (
              <div role="alert" className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950">
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-5" />No se pudo validar el comprobante</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{item.ocrText ?? "La cuenta de origen del pago no pudo validarse."}</p>
                {(item.detectedOriginBank || item.detectedOriginAccount) && (
                  <p className="mt-2 text-sm"><span className="font-medium">Origen detectado:</span> {[item.detectedOriginBank, item.detectedOriginAccount].filter(Boolean).join(" · ")}</p>
                )}
                <div className="mt-3 grid gap-2 rounded-lg bg-white/60 p-3 text-sm">
                  <p><span className="font-medium">Destino ingresado:</span> {item.bank} · {item.account}</p>
                  <p><span className="font-medium">Destino detectado:</span> {[item.detectedDestinationBank, item.detectedDestinationAccount, item.detectedBeneficiary].filter(Boolean).join(" · ") || "No legible"}</p>
                </div>
                <p className="mt-3 text-sm font-medium">
                  {originBankError
                    ? "Registra la cuenta origen en la tabla de bancos o reemplaza el comprobante por uno pagado desde una cuenta registrada."
                    : "Verifica que el monto y la cuenta destino coincidan. El beneficiario puede ser un familiar o un tercero."}
                </p>
              </div>
            )}
            {item.ocrText && !receiptError && <Info title="Lectura OCR" text={item.ocrText} />}
            {item.rejectionReason && <Info title="Motivo de rechazo" text={item.rejectionReason} destructive />}
            {failure ? (
              <UploadFailureInfo failure={failure} withdrawalId={item.id} />
            ) : (
              item.internalError && !receiptError && <Info title="Error interno" text={item.internalError} destructive />
            )}

            {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {reviewable ? (
              <form onSubmit={submit} className="mt-7 space-y-5">
                <div>
                  <label htmlFor="payment-proof" className="text-sm font-medium">{receiptError ? "Nuevo comprobante de pago" : "Comprobante para aprobar"}</label>
                  {/* `accept` NO se restringe al MIME que declara el navegador: ese dato sale
                      de la extension o del content-provider del sistema y miente, asi que
                      filtrar por el escondia comprobantes validos en el selector de fotos de
                      Android sin dar ninguna explicacion. El servidor decide por magic bytes. */}
                  <input id="payment-proof" name="comprobante" type="file" accept="image/*,.heic,.heif" className="mt-2 block w-full rounded-xl border bg-background p-2 text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold file:text-foreground" />
                  <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG o WEBP. Si pesa de más se reduce sola antes de subirla.</p>
                </div>
                <div>
                  <label htmlFor="rejection-reason" className="text-sm font-medium">Motivo para rechazar</label>
                  <textarea id="rejection-reason" name="motivo" maxLength={500} rows={3} placeholder="Obligatorio al rechazar" className="mt-2 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="submit" name="decision" value="rechazado" disabled={pending !== null} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"><XCircle className="size-4" />{pending === "rechazado" ? "Rechazando..." : "Rechazar"}</button>
                  <button type="submit" name="decision" value="aprobado" disabled={pending !== null} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"><Check className="size-4" />{pending === "aprobado" ? "Procesando..." : receiptError ? "Reemplazar y reintentar" : "Aprobar"}</button>
                </div>
              </form>
            ) : (
              <div className="mt-7 rounded-xl bg-secondary p-4 text-sm">
                {item.status === "aprobado" ? "El comprobante fue aprobado y está siendo validado. Esta vista se actualizará automáticamente si requiere corrección." : "Este retiro ya no está pendiente y no admite revisión manual."}
              </div>
            )}
            {removable && (
              <button
                type="button"
                onClick={cancelWithdrawal}
                disabled={pending !== null}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                <XCircle className="size-4" />
                {pending === "cancelar" ? "Cancelando..." : "Cancelar retiro"}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium capitalize">{value}</dd></div>;
}

function formatSize(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * El último intento de subida que se rechazó. Se enseña a todos los que revisan y no
 * sólo a un administrador porque quien está delante cuando falla es el asesor: puede
 * dictar el código y la excepción sin que nadie tenga que entrar al servidor.
 */
function UploadFailureInfo({ failure, withdrawalId }: { failure: UploadFailure; withdrawalId: string }) {
  const size = formatSize(failure.fileSize);
  return (
    <div role="alert" className="mt-5 rounded-xl border bg-red-50 p-4 text-red-800">
      <p className="text-sm font-medium">La última subida del comprobante falló</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{failure.message}</p>
      <dl className="mt-3 grid gap-1 rounded-lg bg-white/60 p-3 text-xs">
        <div className="flex gap-2">
          <dt className="font-medium">Código</dt>
          <dd className="font-mono">{failure.code}</dd>
        </div>
        {failure.detail && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Detalle</dt>
            <dd className="break-all font-mono">{failure.detail}</dd>
          </div>
        )}
        {failure.fileName && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Archivo</dt>
            <dd className="break-all">
              {failure.fileName}
              {failure.fileDeclaredMime ? ` · ${failure.fileDeclaredMime}` : ""}
              {size ? ` · ${size}` : ""}
            </dd>
          </div>
        )}
        {failure.fileMagicBytes && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Primeros bytes</dt>
            <dd className="font-mono">{failure.fileMagicBytes}</dd>
          </div>
        )}
      </dl>
      {failure.hasFile && (
        <a
          href={`/api/retiros/${withdrawalId}/subida-fallida/${failure.id}`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-red-100"
        >
          <ImageIcon className="size-4" /> Descargar el archivo rechazado
        </a>
      )}
    </div>
  );
}

function Info({ title, text, destructive = false }: { title: string; text: string; destructive?: boolean }) {
  return <div className={`mt-5 rounded-xl border p-4 ${destructive ? "bg-red-50 text-red-800" : "bg-background"}`}><p className="text-sm font-medium">{title}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed opacity-80">{text}</p></div>;
}
