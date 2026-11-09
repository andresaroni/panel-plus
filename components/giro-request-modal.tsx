"use client";

import { Check, CheckCircle2, X, XCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { formatMoney } from "@/lib/format";
import { maskIdNumber } from "@/lib/giro-receipt";
import type { GiroRequest } from "@/lib/giros";

/** Fecha guardada por Master-Ventory ("YYYY-MM-DD HH:mm:ss", hora de Ecuador) -> "dd/mm/yyyy  HH:mm:ss". */
function formatLocalDate(value: string | null) {
  if (!value) return "No disponible";
  const [date, time = ""] = value.split(" ");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}  ${time}`;
}

export function GiroRequestModal({
  item,
  returnUrl = "/solicitudes",
}: {
  item: GiroRequest;
  returnUrl?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isDeposit = item.operation === "Deposito";

  async function send(body: { accion: "aprobar" } | { accion: "rechazar"; motivo: string }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/giros/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(result?.error ?? `No fue posible actualizar la solicitud. ERR-HTTP-${response.status}`);
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

  function approve() {
    const total = formatMoney(item.total);
    const accion = isDeposit ? "depósito" : "retiro";
    if (!window.confirm(`¿Aprobar el ${accion} ${item.requestNumber} por ${total}? Se generará el comprobante y se actualizará el saldo de la Cuenta para Giros.`)) {
      return;
    }
    void send({ accion: "aprobar" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/45 sm:items-center sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="giro-title"
        className="max-h-[96vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-card sm:rounded-2xl"
      >
        <header className="flex items-start justify-between border-b p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {item.requestNumber} · Giro Bancario Dealers
            </p>
            <h2 id="giro-title" className="mt-1 text-xl font-semibold">
              {item.status === "pendiente"
                ? `Validar ${isDeposit ? "depósito" : "retiro"}`
                : "Detalle de la solicitud"}
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
            <GiroReceipt item={item} />
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">Datos de la solicitud</h3>
              <StatusBadge status={item.status} />
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <Data label="Operación" value={isDeposit ? "Depósito" : "Retiro"} />
              <Data label="Total" value={formatMoney(item.total)} />
              <Data label="Vendedor" value={`${item.seller} (@${item.sellerUsername})`} />
              <Data label="Sucursal" value={item.branch} />
              <Data label="Solicitada" value={formatLocalDate(item.createdAt)} />
              <Data label="Giros" value={String(item.items.length)} />
              {item.receiptNumber && <Data label="Comprobante" value={item.receiptNumber} />}
              {item.agent && <Data label="Revisada por" value={`${item.agent} · ${formatLocalDate(item.reviewedAt)}`} />}
            </dl>

            {item.status === "pendiente" && (
              <div className="mt-6 rounded-xl border bg-background p-4 text-sm">
                <p className="font-medium">Cuenta para Giros</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {[...new Map(item.items.map((giro) => [giro.bank, giro])).values()].map((giro) => (
                    <li key={giro.bank}>
                      {giro.bank}: {giro.account ?? "sin cuenta asignada"}
                      {giro.balance !== null && <> · saldo {formatMoney(giro.balance)}</>}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isDeposit
                    ? "Al aprobar, el valor de cada depósito se resta de esta cuenta."
                    : "Al aprobar, el valor de cada retiro se suma a esta cuenta (sin comisión)."}
                </p>
              </div>
            )}

            {item.status === "rechazado" && item.rejectReason && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-medium">Motivo del rechazo</p>
                <p className="mt-1">{item.rejectReason}</p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {item.status === "pendiente" && !rejecting && (
              <div className="mt-7 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  disabled={pending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="size-4" /> Rechazar
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={pending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
                >
                  {pending ? <span className="animate-pulse">Procesando...</span> : <><Check className="size-4" /> Aprobar</>}
                </button>
              </div>
            )}

            {item.status === "pendiente" && rejecting && (
              <form
                className="mt-7 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send({ accion: "rechazar", motivo: reason });
                }}
              >
                <label htmlFor="giro-reject-reason" className="text-sm font-medium">
                  Motivo del rechazo
                </label>
                <textarea
                  id="giro-reject-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  placeholder="Ej.: El número de cuenta no coincide con el titular."
                  className="w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRejecting(false)}
                    disabled={pending}
                    className="h-11 rounded-xl border font-semibold hover:bg-secondary disabled:opacity-60"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={pending || reason.trim().length < 3}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {pending ? <span className="animate-pulse">Procesando...</span> : <><XCircle className="size-4" /> Confirmar rechazo</>}
                  </button>
                </div>
              </form>
            )}

            {item.status !== "pendiente" && (
              <div className="mt-7 flex items-center gap-2 rounded-xl bg-secondary p-4 text-sm">
                <CheckCircle2 className="size-5 text-primary" />
                {item.status === "cancelado"
                  ? "El vendedor canceló esta solicitud."
                  : "Esta solicitud ya fue procesada."}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const DEPOSIT_LEGAL =
  "Este documento es un comprobante de gestión de transferencia solicitado por el cliente. FRANKO+plus actúa exclusivamente como facilitador del servicio de pago y de recaudación de terceros. Verifique que los datos de la cuenta sean correctos antes de proceder. Conserve este comprobante como respaldo.";

const WITHDRAWAL_LEGAL =
  "Este documento certifica la entrega de efectivo producto de una gestión de retiro a nombre de terceros. FRANKO+plus actúa únicamente como facilitador tecnológico del retiro de dinero. El cliente certifica con su firma que ha recibido el valor total detallado en efectivo y a su entera satisfacción. Conserve este comprobante como respaldo.";

/**
 * Réplica del comprobante PDF de Master-Ventory (ticket de 80 mm,
 * ComprobanteGiro.php). Depósito = "Comprobante de gestión"; retiro con firma.
 * La comisión se cobra aparte en efectivo y solo se informa: TOTAL PAGADO y
 * EFECTIVO ENTREGADO muestran únicamente el valor depositado / retirado.
 */
function GiroReceipt({ item }: { item: GiroRequest }) {
  const isDeposit = item.operation === "Deposito";
  const approved = item.status === "aprobado" && item.receiptNumber;
  const title = approved
    ? isDeposit ? "COMPROBANTE DE GESTIÓN" : "COMPROBANTE DE RETIRO"
    : isDeposit ? "SOLICITUD DE GESTIÓN" : "SOLICITUD DE RETIRO";
  const date = formatLocalDate(approved ? item.receiptDate : item.createdAt);

  return (
    <div className="mx-auto w-full max-w-sm bg-white px-5 pb-6 pt-5 font-sans text-[13px] text-neutral-900 shadow-sm ring-1 ring-black/10">
      <Image
        src="/giros/franko-plus.png"
        alt="Franko Plus"
        width={1023}
        height={247}
        unoptimized
        className="mx-auto h-auto w-4/5"
      />
      <div className="mt-3 bg-neutral-900 py-2 text-center">
        <p className="text-[16px] font-bold tracking-wide text-[#ffc400]">{title}</p>
        <p className="text-xs font-bold text-white">Servicios Auxiliares y Recaudación</p>
      </div>
      <div className="h-1 bg-[#ffc400]" />
      <p className="mt-3 text-center text-lg font-bold">N° {approved ? item.receiptNumber : item.requestNumber}</p>
      <p className="text-center text-xs">{isDeposit ? `Fecha y Hora: ${date}` : date}</p>
      {!approved && (
        <p className="mx-auto mt-2 w-fit rounded-full bg-[#fff4cc] px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a6500]">
          {item.status === "pendiente" ? "En espera de aprobación" : item.status}
        </p>
      )}

      <Divider />
      <Row label="Sucursal" value={item.branch} shaded />
      {item.branchAddress && <Row label="Dirección" value={item.branchAddress} shaded />}
      <Row label="Atendido por" value={item.seller} shaded />

      {item.items.map((giro, index) => (
        <div key={index}>
          <Divider />
          {item.items.length > 1 && (
            <p className="mb-1 font-bold">
              {isDeposit ? "Depósito" : "Retiro"} {index + 1} de {item.items.length}
            </p>
          )}
          {isDeposit ? (
            <>
              <Row label="Banco / Entidad" value={giro.bank} shaded />
              <Row label="Tipo de cuenta" value={giro.accountType} shaded />
              <Row label="N° de cuenta" value={giro.accountNumber} shaded />
              <Row label="Titular" value={giro.holder} shaded />
              <Row label="Depositante / Cliente" value={giro.client} shaded />
              {item.items.length > 1 && <Row label="Valor" value={formatMoney(giro.amount)} shaded />}
            </>
          ) : (
            <>
              <Row label="Banco / Entidad" value={giro.bank} shaded />
              <Row label="Tipo de Transacción" value="Retiro sin tarjeta / App" shaded />
              <Row label="Titular de la cuenta" value={giro.holder} shaded />
              <Row label="C.I. de quien retira" value={giro.holderId ? maskIdNumber(giro.holderId) : "-"} shaded />
              {item.items.length > 1 && <Row label="Monto" value={formatMoney(giro.amount)} shaded />}
            </>
          )}
        </div>
      ))}

      <Divider />
      {isDeposit ? (
        <>
          <Row label="Valor a transferir" value={formatMoney(item.subtotal)} shaded />
          <Row label="Comisión por gestión" value={formatMoney(item.commission)} shaded />
        </>
      ) : (
        <>
          <Row label="Monto debitado / recibido" value={formatMoney(item.subtotal)} shaded />
          <Row label="Comisión por gestión" value={formatMoney(item.commission)} shaded />
        </>
      )}
      <div className="mt-3 flex items-center justify-between bg-neutral-900 px-3 py-2 font-bold text-[#ffc400]">
        <span className="text-sm">{isDeposit ? "TOTAL PAGADO" : "EFECTIVO ENTREGADO"}</span>
        <span className="text-lg">
          {formatMoney(item.subtotal)}
        </span>
      </div>
      <p className="mt-3 text-center text-[10px] leading-snug">{isDeposit ? DEPOSIT_LEGAL : WITHDRAWAL_LEGAL}</p>

      {!isDeposit && (
        <div className="mx-6 mt-10 border-t border-neutral-900 pt-1 text-center text-xs">
          <p className="font-bold">Firma del Cliente</p>
          <p>Recibe el dinero a conformidad</p>
        </div>
      )}

      <p className="mt-4 text-center text-base font-bold">¡Gracias por elegirnos!</p>
      <p className="text-center text-xs font-bold italic text-[#d69600]">Donde el plus eres tú</p>
    </div>
  );
}

function Row({ label, value, shaded = false }: { label: string; value: string; shaded?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="shrink-0">{label}:</span>
      <span className={`break-words text-right ${shaded ? "min-w-[55%] bg-neutral-200 px-1.5" : ""}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="my-3 border-t border-dashed border-neutral-400" />;
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
