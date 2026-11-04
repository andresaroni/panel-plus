export type ReceiptReading = {
  model: string | null;
  readable: boolean | null;
  number: string | null;
  amount: string | null;
  bank: string | null;
  holder: string | null;
  account: string | null;
  explanation: string | null;
  accountValidated: boolean | null;
  error: string | null;
};

export const failedReceiptReasonLabels = {
  descarga_fallida: "No se pudo descargar la imagen",
  proveedor_no_disponible: "Servicio de lectura no disponible",
  ilegible: "Comprobante ilegible",
  campos_faltantes: "Faltan datos en el comprobante",
  cuenta_no_validada: "Cuenta destino no registrada",
  duplicado_registro: "Comprobante ya usado en el bot",
  duplicado_reporte: "Comprobante ya registrado en la plataforma",
  sin_saldo_plataforma: "Plataforma sin saldo",
  error_interno: "Error interno del bot",
  comprobante_falso: "Posible comprobante falso",
} as const;

export type FailedReceiptReason = keyof typeof failedReceiptReasonLabels;

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Convierte la columna `lecturas` (JSON escrito por el bot) en filas mostrables.
 * Un JSON dañado o con otra forma no debe romper el modal: se devuelve lo que se pueda.
 */
export function parseReceiptReadings(raw: string | null): ReceiptReading[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      model: text(item.modelo),
      readable: flag(item.legible),
      number: text(item.numero),
      amount: text(item.monto),
      bank: text(item.banco),
      holder: text(item.titular),
      account: text(item.cuenta),
      explanation: text(item.explicacion),
      accountValidated: flag(item.cuenta_validada),
      error: text(item.error),
    }));
}

export type QrFieldCheck = {
  field: string;
  label: string;
  image: string | null;
  qr: string | null;
  /** null: no se pudo comparar porque falta el dato en la imagen o en el QR. */
  matches: boolean | null;
  decisive: boolean;
};

export type QrCheck = {
  format: string | null;
  transferType: string | null;
  forged: boolean;
  date: string | null;
  originBank: string | null;
  originHolder: string | null;
  originAccount: string | null;
  fields: QrFieldCheck[];
};

/**
 * Convierte la columna `qr_verificacion` (JSON escrito por el bot al leer el QR del
 * comprobante) en datos mostrables. Devuelve null si no hay QR o el JSON no es válido.
 */
export function parseQrCheck(raw: string | null): QrCheck | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const item = data as Record<string, unknown>;
  const origin =
    typeof item.origen === "object" && item.origen !== null
      ? (item.origen as Record<string, unknown>)
      : {};
  const fields = Array.isArray(item.campos) ? item.campos : [];
  return {
    format: text(item.formato),
    transferType: text(item.tipo_transferencia),
    forged: item.falso === true,
    date: text(item.fecha),
    originBank: text(origin.banco),
    originHolder: text(origin.titular),
    originAccount: text(origin.cuenta),
    fields: fields
      .filter((field): field is Record<string, unknown> => typeof field === "object" && field !== null)
      .map((field) => ({
        field: text(field.campo) ?? "",
        label: text(field.etiqueta) ?? text(field.campo) ?? "Dato",
        image: text(field.imagen),
        qr: text(field.qr),
        matches: flag(field.coincide),
        decisive: field.decisivo === true,
      })),
  };
}
