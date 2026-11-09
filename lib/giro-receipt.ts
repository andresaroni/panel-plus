/// Utilidades puras de "Giro Bancario Dealers" (solicitudes de giros de Master-Ventory).
/// Deben coincidir con Master-Ventory: app/controllers/vendedor/giros_control/GirosRegistro.php

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** Número del comprobante aprobado: ENE-00001 (la secuencia se reinicia cada mes). */
export function formatGiroReceiptNumber(month: number, sequence: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Mes inválido: ${month}`);
  }
  return `${MONTHS[month - 1]}-${String(sequence).padStart(5, "0")}`;
}

/** Cédula parcialmente oculta en el comprobante de retiro: 1207654325 -> 120XXXXXX5. */
export function maskIdNumber(value: string) {
  const id = value.trim();
  if (id.length <= 4) return id;
  return `${id.slice(0, 3)}${"X".repeat(id.length - 4)}${id.slice(-1)}`;
}

/** Número visible de una solicitud: SOL-00012. */
export function formatGiroRequestNumber(id: number | string) {
  return `SOL-${String(id).padStart(5, "0")}`;
}

/**
 * Fecha y hora de Ecuador como las guarda Master-Ventory (DATETIME local, sin zona):
 * `sql` = "YYYY-MM-DD HH:mm:ss", más año y mes para la numeración del comprobante.
 */
export function ecuadorDateParts(date: Date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: `${parts.year}-${parts.month}-${parts.day}`,
    sql: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

/** Dinero en centavos enteros para sumar y restar saldos sin errores de coma flotante. */
export function toCents(value: { toString(): string } | number | string) {
  const amount = Number(value.toString());
  if (!Number.isFinite(amount)) throw new RangeError(`Monto inválido: ${value.toString()}`);
  return Math.round(amount * 100);
}

export function fromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export type GiroOperation = "Deposito" | "Retiro";

/**
 * Comprueba que los depósitos no superen el saldo de cada Cuenta para Giros.
 * Devuelve el id del banco sin saldo suficiente, o null si todo alcanza.
 * Los retiros suman saldo, así que nunca fallan.
 */
export function findInsufficientBank(
  operation: GiroOperation,
  items: { bankId: number; amountCents: number }[],
  balances: Map<number, number>,
) {
  if (operation !== "Deposito") return null;
  const totals = new Map<number, number>();
  for (const item of items) {
    totals.set(item.bankId, (totals.get(item.bankId) ?? 0) + item.amountCents);
  }
  for (const [bankId, total] of totals) {
    if (total > (balances.get(bankId) ?? 0)) return bankId;
  }
  return null;
}
