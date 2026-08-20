import { TriangleAlert } from "lucide-react";

import { type BankAccount, getBankAccounts, isApuestasConfigured } from "@/lib/apuestas";
import { formatDate, formatMoney, formatRelativeDate } from "@/lib/format";

export default async function BanksPage() {
  if (!isApuestasConfigured) {
    return (
      <Unavailable detail="Falta definir APUESTAS_DATABASE_URL en el entorno del servidor." />
    );
  }

  let accounts: BankAccount[];
  try {
    accounts = await getBankAccounts();
  } catch (error) {
    console.error("No se pudo consultar la base de bancos.", error);
    return (
      <Unavailable detail="No se pudo conectar con la base de bancos. Revisa las credenciales y el acceso remoto de APUESTAS_DATABASE_URL." />
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeading />

      <section className="mt-7 overflow-hidden rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-semibold">Cuentas bancarias</h3>
          <p className="text-sm text-muted-foreground">
            {accounts.length} {accounts.length === 1 ? "cuenta registrada" : "cuentas registradas"}
          </p>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-190 text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Tutor Nombres</th>
                <th className="px-5 py-3 font-medium">Entidad Bancaria</th>
                <th className="px-5 py-3 font-medium">Número de Cuenta</th>
                <th className="px-5 py-3 font-medium">Tipo de Cuenta</th>
                <th className="px-5 py-3 text-right font-medium">Saldo</th>
                <th className="px-5 py-3 font-medium">Última Modificación</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((row) => {
                const empty = Number(row.balance.toString()) === 0;
                return (
                  <tr key={row.id} className="hover:bg-secondary/25">
                    <td className="px-5 py-4 font-medium">{row.holder}</td>
                    <td className="px-5 py-4">{row.bank}</td>
                    <td className="px-5 py-4 font-mono tabular-nums">{row.accountNumber}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold">
                        {row.accountType}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p
                        className={`tabular-nums ${
                          empty
                            ? "font-normal text-muted-foreground"
                            : "text-base font-semibold text-emerald-800"
                        }`}
                      >
                        {formatMoney(row.balance)}
                      </p>
                    </td>
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
          {accounts.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No hay cuentas bancarias registradas.
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
      <h2 className="text-2xl font-semibold tracking-tight">Base de Datos Bancos General</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Consulta el saldo actual de cada cuenta bancaria de la empresa. Solo lectura.
      </p>
    </div>
  );
}

function Unavailable({ detail }: { detail: string }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeading />
      <section className="mt-7 rounded-2xl border bg-card p-10 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-secondary">
          <TriangleAlert className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-4 font-semibold">Consulta no disponible</h3>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{detail}</p>
      </section>
    </div>
  );
}
