import { Check, CircleDollarSign, FileChartColumn, XCircle } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney, formatResponseTime, responseTimeTone } from "@/lib/format";
import {
  getReportMetrics,
  getReportPage,
  getReportPlatforms,
  type ReportFilters,
  type ReportOperation,
} from "@/lib/reportes";
import { requireAdmin } from "@/lib/session";

const PAGE_SIZE = 15;

const statuses = [
  ["pendiente", "Pendiente"],
  ["aprobado", "Aprobada"],
  ["atendido", "Atendida"],
  ["pagado", "Pagada"],
  ["rechazado", "Rechazada"],
  ["error_comprobante", "Error de comprobante"],
  ["borrador", "Borrador"],
  ["cancelado", "Cancelada"],
] as const;

function currentDates() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { today: parts, monthStart: `${parts.slice(0, 8)}01` };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    platform?: string;
    status?: string;
    operation?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const defaults = currentDates();
  const operation: ReportOperation = ["recarga", "retiro", "servicio"].includes(params.operation ?? "")
    ? (params.operation as ReportOperation)
    : "todas";
  const filters: ReportFilters = {
    from: params.from ?? defaults.monthStart,
    to: params.to ?? defaults.today,
    platform: params.platform ?? "",
    status: params.status ?? "",
    operation,
  };
  const page = Math.min(100, Math.max(1, Number(params.page) || 1));

  const [report, metrics, platforms] = await Promise.all([
    getReportPage(filters, page, PAGE_SIZE),
    getReportMetrics(filters),
    getReportPlatforms(operation),
  ]);
  const approvalRate = metrics.total
    ? Math.round((metrics.approved / metrics.total) * 100)
    : 0;
  const pages = Math.max(1, Math.ceil(report.total / PAGE_SIZE));
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value && value !== "todas")
      .map(([key, value]) => [key, value]),
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Reportes de transacciones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Analiza recargas, retiros y solicitudes de servicio por período y estado.
        </p>
      </div>

      <section className="mt-7 rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Filtros del reporte</h3>
            <p className="text-sm text-muted-foreground">Ajusta los criterios para consultar el detalle.</p>
          </div>
          <Link href="/reportes" className="text-sm font-semibold text-primary">Restablecer</Link>
        </div>
        <Form action="/reportes" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Filter label="Desde"><input name="from" aria-label="Fecha desde" type="date" defaultValue={filters.from} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" /></Filter>
          <Filter label="Hasta"><input name="to" aria-label="Fecha hasta" type="date" defaultValue={filters.to} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" /></Filter>
          <Filter label="Operación">
            <select name="operation" defaultValue={filters.operation} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
              <option value="todas">Todas</option>
              <option value="recarga">Recargas</option>
              <option value="retiro">Retiros</option>
              <option value="servicio">Servicios</option>
            </select>
          </Filter>
          <Filter label="Plataforma / sucursal">
            <select name="platform" defaultValue={filters.platform} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
              <option value="">Todas</option>
              {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
            </select>
          </Filter>
          <Filter label="Estado">
            <div className="flex gap-2">
              <select name="status" defaultValue={filters.status} className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm">
                <option value="">Todos</option>
                {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Aplicar</button>
            </div>
          </Filter>
        </Form>
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Volumen aprobado" value={formatMoney(metrics.approvedAmount)} detail={`${metrics.approved} operaciones`} icon={CircleDollarSign} />
        <MetricCard label="Tasa favorable" value={`${approvalRate}%`} detail="Aprobadas, pagadas o atendidas" icon={Check} />
        <MetricCard label="Monto rechazado" value={formatMoney(metrics.rejectedAmount)} detail="Recargas y retiros rechazados" icon={XCircle} />
        <MetricCard label="Solicitudes" value={String(metrics.total)} detail="Coinciden con los filtros" icon={FileChartColumn} />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col justify-between gap-2 border-b p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold">Detalle de transacciones</h3>
             <p className="text-sm text-muted-foreground">Período {filters.from} al {filters.to} · {report.total} resultados</p>
          </div>
          <a href={`/api/reportes/exportar?${query}`} className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold hover:bg-secondary">Exportar CSV</a>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-370 text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                 <th className="px-5 py-3">Solicitud</th><th className="px-5 py-3">Operación</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Cédula / usuario</th><th className="px-5 py-3">Plataforma / sucursal</th><th className="px-5 py-3">Banco / referencia / detalle</th><th className="px-5 py-3">Monto</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Creación</th><th className="px-5 py-3">Última actualización</th><th className="px-5 py-3">Tiempo de respuesta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.records.map((record) => (
                <tr key={record.key} className="hover:bg-secondary/25">
                  <td className="px-5 py-4 font-mono text-xs font-semibold">{record.id}</td>
                  <td className="px-5 py-4 font-medium">{record.operation}</td>
                  <td className="px-5 py-4 font-medium">{record.client}</td>
                  <td className="px-5 py-4"><p>{record.clientId}</p><p className="text-xs text-muted-foreground">@{record.username}</p></td>
                   <td className="px-5 py-4 capitalize">
                     <p>{record.operation === "Servicio" ? record.branch : record.platform}</p>
                     {record.operation !== "Servicio" && <p className="text-xs text-muted-foreground">{record.branch}</p>}
                   </td>
                   <td className="max-w-72 px-5 py-4">
                     {record.detail ? (
                       <p className="line-clamp-2 whitespace-normal" title={record.detail}>{record.detail}</p>
                     ) : (
                       <><p>{record.bank}</p><p className="font-mono text-xs text-muted-foreground">Ref. {record.reference}</p></>
                     )}
                   </td>
                   <td className="px-5 py-4 font-semibold tabular-nums">{record.amount === null ? "No aplica" : formatMoney(record.amount)}</td>
                   <td className="px-5 py-4"><StatusBadge status={record.status} /></td>
                   <td className="px-5 py-4 text-muted-foreground">{formatDate(record.createdAt)}</td>
                   <td className="px-5 py-4 text-muted-foreground">{formatDate(record.updatedAt)}</td>
                   <td className={`px-5 py-4 font-semibold tabular-nums ${responseTimeTone(record.responseTimeSeconds)}`}>
                     {formatResponseTime(record.responseTimeSeconds, record.presentedAt, record.status)}
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.records.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No hay transacciones para los filtros seleccionados.</div>}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span className="text-muted-foreground">Página {page} de {pages}</span>
            <div className="flex gap-2">
              <PageLink label="Anterior" page={Math.max(1, page - 1)} disabled={page <= 1} query={query} />
              <PageLink label="Siguiente" page={Math.min(pages, page + 1)} disabled={page >= pages} query={query} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-xs font-medium text-muted-foreground">{label}{children}</label>;
}

function PageLink({ label, page, disabled, query }: { label: string; page: number; disabled: boolean; query: URLSearchParams }) {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return <Link aria-disabled={disabled} href={`/reportes?${params}`} className={`rounded-lg border px-3 py-2 ${disabled ? "pointer-events-none opacity-40" : "hover:bg-secondary"}`}>{label}</Link>;
}
