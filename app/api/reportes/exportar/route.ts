import { NextRequest, NextResponse } from "next/server";

import { formatDate } from "@/lib/format";
import {
  getReportExportRecords,
  type ReportFilters,
  type ReportOperation,
} from "@/lib/reportes";
import { getCurrentUser } from "@/lib/session";

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (user.role !== "administrador") return new NextResponse(null, { status: 403 });

  const params = request.nextUrl.searchParams;
  const operation: ReportOperation = ["recarga", "retiro"].includes(
    params.get("operation") ?? "",
  )
    ? (params.get("operation") as ReportOperation)
    : "todas";
  const filters: ReportFilters = {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    platform: params.get("platform") ?? "",
    status: params.get("status") ?? "",
    operation,
  };
  const records = await getReportExportRecords(filters);

  const header = [
    "Solicitud",
    "UUID",
    "Operación",
    "Cliente",
    "Cédula",
    "Usuario",
    "Plataforma",
    "Sucursal",
    "Banco",
    "Referencia",
    "Monto USD",
    "Estado",
    "Fecha",
  ];
  const rows = records.map((item) => [
    item.id,
    item.uuid,
    item.operation,
    item.client,
    item.clientId,
    item.username,
    item.platform,
    item.branch,
    item.bank,
    item.reference,
    Number(item.amount).toFixed(2),
    item.status,
    formatDate(item.createdAt),
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-operaciones-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
