import { Building2, CircleDollarSign, Database, TriangleAlert } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { getPlatformBalances, isApuestasConfigured } from "@/lib/apuestas";
import { formatDate, formatMoney, formatRelativeDate } from "@/lib/format";

function toCents(value: { toString(): string }) {
  return Math.round(Number(value.toString()) * 100);
}

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const params = await searchParams;

  if (!isApuestasConfigured) {
    return (
      <div className="mx-auto max-w-7xl">
        <PageHeading />
        <section className="mt-7 rounded-2xl border bg-card p-10 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-secondary">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <h3 className="mt-4 font-semibold">Consulta no disponible</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Falta definir <code className="font-mono">APUESTAS_DATABASE_URL</code> en el
            entorno. Es la conexión a la base donde viven las plataformas, su inventario de
            saldos y las sucursales.
          </p>
        </section>
      </div>
    );
  }

  const balances = await getPlatformBalances();

  const branches = [...new Set(balances.map((item) => item.branch).filter(Boolean))] as string[];
  const branch = branches.includes(params.sucursal ?? "") ? params.sucursal! : "";
  const rows = branch ? balances.filter((item) => item.branch === branch) : balances;

  const totalCents = rows.reduce((total, row) => total + toCents(row.balance), 0);
  const visibleBranches = new Set(rows.map((row) => row.branch)).size;
  const maxCents = rows.reduce((max, row) => Math.max(max, toCents(row.balance)), 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeading />

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Saldo consolidado"
          value={formatMoney(totalCents / 100)}
          detail={branch ? `Sucursal ${branch}` : "Todas las sucursales"}
          icon={CircleDollarSign}
        />
        <MetricCard
          label="Plataformas"
          value={String(rows.length).padStart(2, "0")}
          detail="Registros con inventario activo"
          icon={Database}
        />
        <MetricCard
          label="Sucursales"
          value={String(visibleBranches).padStart(2, "0")}
          detail="Con plataformas asignadas"
          icon={Building2}
        />
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col justify-between gap-4 border-b p-5 lg:flex-row lg:items-end">
          <div>
            <h3 className="font-semibold">Inventario de plataformas</h3>
            <p className="text-sm text-muted-foreground">
              {rows.length} {rows.length === 1 ? "plataforma encontrada" : "plataformas encontradas"}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <Form action="/plataformas" className="flex items-end gap-2">
              <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                Sucursal
                <select
                  name="sucursal"
                  defaultValue={branch}
                  aria-label="Filtrar por sucursal"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm lg:w-60"
                >
                  <option value="">Todas</option>
                  {branches.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Aplicar
              </button>
            </Form>
            {branch && (
              <Link href="/plataformas" className="pb-3 text-sm font-semibold text-primary">
                Restablecer
              </Link>
            )}
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-190 text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Código</th>
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 text-right font-medium">Saldo</th>
                <th className="px-5 py-3 font-medium">Sucursal</th>
                <th className="px-5 py-3 font-medium">Última actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const cents = toCents(row.balance);
                const share = maxCents > 0 ? Math.round((cents / maxCents) * 100) : 0;
                return (
                  <tr key={`${row.code}-${row.branch}`} className="hover:bg-secondary/25">
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-secondary px-2 py-1 font-mono text-xs font-semibold">
                        {row.code}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium">{row.name}</td>
                    <td className="px-5 py-4 text-right">
                      <p
                        className={`tabular-nums ${
                          cents === 0
                            ? "font-normal text-muted-foreground"
                            : "text-base font-semibold text-emerald-800"
                        }`}
                      >
                        {formatMoney(row.balance)}
                      </p>
                      <span className="mt-1.5 ml-auto block h-1 w-full max-w-30 rounded-full bg-secondary">
                        <span
                          className="block h-1 rounded-full bg-emerald-800"
                          style={{ width: `${share}%` }}
                        />
                      </span>
                    </td>
                    <td className="px-5 py-4">{row.branch ?? "Sin sucursal"}</td>
                    <td className="px-5 py-4">
                      {row.updatedAt ? (
                        <>
                          <p>{formatDate(row.updatedAt)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeDate(row.updatedAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No disponible</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No hay plataformas para la sucursal seleccionada.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Base de Datos Plataformas General</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Consulta el saldo actual de cada plataforma por sucursal. Solo lectura.
      </p>
    </div>
  );
}
