import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Clock3,
  FileText,
  MessageCircle,
  Search,
} from "lucide-react";
import Link from "next/link";
import Form from "next/form";

import { LiveRequests } from "@/components/live-requests";
import { MetricCard } from "@/components/metric-card";
import { ReviewModal } from "@/components/review-modal";
import { ServiceRequestModal } from "@/components/service-request-modal";
import { StatusBadge } from "@/components/status-badge";
import { WithdrawalModal } from "@/components/withdrawal-modal";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requestSelect, serializeRequest, submittedTopUpWhere } from "@/lib/recargas";
import { getRequestsVersion } from "@/lib/request-version";
import { serializeServiceRequest, serviceRequestSelect } from "@/lib/service-requests";
import {
  getRequestMetrics,
  getUnifiedRequests,
  type OperationFilter,
} from "@/lib/solicitudes";
import {
  serializeWithdrawal,
  submittedWithdrawalWhere,
  withdrawalSelect,
} from "@/lib/retiros";
import { isWithdrawalReviewable } from "@/lib/withdrawal-state";

const PAGE_SIZE = 10;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tipo?: string;
    page?: string;
    review?: string;
    reviewType?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const operation: OperationFilter = ["recarga", "retiro", "servicio"].includes(params.tipo ?? "")
    ? (params.tipo as OperationFilter)
    : "todas";
  const page = Math.min(100, Math.max(1, Number(params.page) || 1));

  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dayStart = new Date(`${day}T00:00:00-05:00`);
  const dayEnd = new Date(`${day}T23:59:59-05:00`);

  const [list, metrics, initialVersion] = await Promise.all([
    getUnifiedRequests({ query, operation, page, pageSize: PAGE_SIZE }),
    getRequestMetrics(dayStart, dayEnd),
    getRequestsVersion(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const validReviewId = params.review && /^\d{1,20}$/.test(params.review);

  const [selectedTopUp, selectedServiceRequest, selectedWithdrawal] = await Promise.all([
    validReviewId && params.reviewType === "recarga"
      ? prisma.recarga_whatsapp.findFirst({
          where: {
            AND: [submittedTopUpWhere, { id_recarga: BigInt(params.review!) }],
          },
          select: requestSelect,
        })
      : null,
    validReviewId && params.reviewType === "servicio"
      ? prisma.solicitudes_servicio.findUnique({
          where: { id_solicitud: BigInt(params.review!) },
          select: serviceRequestSelect,
        })
      : null,
    validReviewId && params.reviewType === "retiro"
      ? prisma.retirar_saldo.findFirst({
          where: {
            AND: [submittedWithdrawalWhere, { id_retiro: BigInt(params.review!) }],
          },
          select: withdrawalSelect,
        })
      : null,
  ]);

  const listParams = (overrides: Record<string, string> = {}) =>
    new URLSearchParams({
      ...(query ? { q: query } : {}),
      ...(operation !== "todas" ? { tipo: operation } : {}),
      ...overrides,
    }).toString();
  const returnUrl = `/solicitudes${listParams({ page: String(page) }) ? `?${listParams({ page: String(page) })}` : ""}`;

  const tabs: { value: OperationFilter; label: string; count: number }[] = [
    { value: "todas", label: "Todas", count: list.topUpCount + list.withdrawalCount + list.serviceCount },
    { value: "recarga", label: "Recargas", count: list.topUpCount },
    { value: "retiro", label: "Retiros", count: list.withdrawalCount },
    { value: "servicio", label: "Servicios", count: list.serviceCount },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Centro de solicitudes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona recargas, retiros y solicitudes de servicio desde una sola bandeja.
          </p>
        </div>
        <LiveRequests
          initialVersion={initialVersion}
          paused={Boolean(
            selectedTopUp ||
            (selectedWithdrawal && isWithdrawalReviewable(selectedWithdrawal.estado)) ||
            selectedServiceRequest?.estado === "pendiente"
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Por revisar" value={String(metrics.pending).padStart(2, "0")} detail="Operaciones y servicios pendientes" icon={Clock3} />
        <MetricCard label="Aprobadas" value={String(metrics.approvedToday).padStart(2, "0")} detail="Durante esta jornada" icon={Check} />
        <MetricCard label="Volumen gestionado" value={formatMoney(metrics.volume)} detail="Operaciones aprobadas" icon={CircleDollarSign} />
        <MetricCard label="Solicitudes" value={String(metrics.total).padStart(2, "0")} detail="Registros totales" icon={FileText} />
      </div>

      <section className="mt-7 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h3 className="font-semibold">Solicitudes recientes</h3>
              <p className="text-sm text-muted-foreground">{list.total} operaciones encontradas</p>
            </div>
            <Form action="/solicitudes" className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 lg:w-72">
              {operation !== "todas" && <input type="hidden" name="tipo" value={operation} />}
              <Search className="size-4 text-muted-foreground" />
              <label htmlFor="request-search" className="sr-only">Buscar solicitudes</label>
              <input id="request-search" name="q" defaultValue={query} placeholder="Cliente, usuario, ID..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </Form>
          </div>

          <div className="mt-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-secondary p-1 sm:w-fit">
            {tabs.map((tab) => {
              const tabParams = new URLSearchParams({
                ...(query ? { q: query } : {}),
                ...(tab.value !== "todas" ? { tipo: tab.value } : {}),
              });
              return (
                <Link
                  key={tab.value}
                  href={`/solicitudes${tabParams.size ? `?${tabParams}` : ""}`}
                  className={`flex min-w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    operation === tab.value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  <span className="rounded-full bg-background px-2 py-0.5 text-[11px] tabular-nums">{tab.count}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Solicitud / cliente</th>
                <th className="px-5 py-3 font-medium">Operación</th>
                <th className="px-5 py-3 font-medium">Plataforma / sucursal</th>
                <th className="px-5 py-3 font-medium">Monto</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.items.map((item) => {
                const prefix = item.type === "recarga" ? "REC" : item.type === "retiro" ? "RET" : "SER";
                return (
                  <tr key={item.key} className="hover:bg-secondary/25">
                    <td className="px-5 py-4">
                      <p className="font-medium">{item.client}</p>
                      <p className="text-xs text-muted-foreground">{prefix}-{item.id.padStart(4, "0")} · @{item.username}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex items-center gap-1.5">
                        {item.type === "recarga" ? <ArrowDownLeft className="size-4 text-primary" /> : item.type === "retiro" ? <ArrowUpRight className="size-4" /> : <MessageCircle className="size-4 text-primary" />}
                        {item.type === "recarga" ? "Recarga" : item.type === "retiro" ? "Retiro" : "Servicio"}
                      </span>
                    </td>
                    <td className="px-5 py-4 capitalize">{item.platform}</td>
                    <td className="px-5 py-4 font-semibold tabular-nums">{item.amount === null ? "No aplica" : formatMoney(item.amount)}</td>
                    <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/solicitudes?${listParams({ page: String(page), reviewType: item.type, review: item.id })}`}
                        className="inline-flex rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-secondary"
                      >
                        {item.type === "servicio" && item.status === "pendiente" ? "Atender" : item.status === "pendiente" || item.status === "error_comprobante" ? "Revisar" : "Ver detalle"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.items.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No hay solicitudes que coincidan con los filtros.</div>}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span className="text-muted-foreground">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <Link aria-disabled={page <= 1} href={`/solicitudes?${listParams({ page: String(Math.max(1, page - 1)) })}`} className={`rounded-lg border px-3 py-2 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-secondary"}`}>Anterior</Link>
              <Link aria-disabled={page >= pages} href={`/solicitudes?${listParams({ page: String(Math.min(pages, page + 1)) })}`} className={`rounded-lg border px-3 py-2 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-secondary"}`}>Siguiente</Link>
            </div>
          </div>
        )}
      </section>

      {selectedTopUp && <ReviewModal item={serializeRequest(selectedTopUp)} returnUrl={returnUrl} />}
      {selectedWithdrawal && <WithdrawalModal item={serializeWithdrawal(selectedWithdrawal)} returnUrl={returnUrl} />}
      {selectedServiceRequest && <ServiceRequestModal item={serializeServiceRequest(selectedServiceRequest)} returnUrl={returnUrl} />}
    </div>
  );
}
