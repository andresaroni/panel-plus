import { createHash } from "node:crypto";

import {
  DEFAULT_MAX_STORED_IMAGE_BYTES,
  type DetectedMime,
  describeFormat,
  detectedMime,
  formatBytes,
} from "./image-format";

export { describeFormat, detectedMime };

// Tope de la peticion. Tiene que quedar por debajo de los ~4,5 MB que Vercel admite en el
// cuerpo de una Serverless Function: por encima de eso corta su edge, la funcion no llega a
// ejecutarse y el agente recibe un rechazo sin explicacion.
export const MAX_WITHDRAWAL_IMAGE_SIZE = 4 * 1024 * 1024;

// Tope de lo que se acepta guardar. No lo impone la base -el `max_allowed_packet` de
// produccion es 1 GB- sino WhatsApp: el comprobante se le envia al cliente despues de
// aplicar el pago, y Meta rechaza imagenes de mas de unos 5 MB, asi que pasarse deja un
// retiro pagado que no puede entregar su comprobante.
// `PANEL_MAX_STORED_IMAGE_BYTES` existe para poder ajustarlo sin desplegar.
function readStoredLimit() {
  const raw = Number(process.env.PANEL_MAX_STORED_IMAGE_BYTES);
  if (Number.isInteger(raw) && raw > 0 && raw <= MAX_WITHDRAWAL_IMAGE_SIZE) return raw;
  return DEFAULT_MAX_STORED_IMAGE_BYTES;
}

export const MAX_STORED_IMAGE_BYTES = readStoredLimit();

export type ValidatedImage = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: DetectedMime;
  sha256: string;
  size: number;
};

export class ImageValidationError extends Error {}

export function validateWithdrawalImage(input: Uint8Array): ValidatedImage {
  if (input.byteLength === 0) throw new ImageValidationError("Selecciona una imagen.");
  if (input.byteLength > MAX_WITHDRAWAL_IMAGE_SIZE) {
    throw new ImageValidationError(
      `La imagen supera el límite de ${formatBytes(MAX_WITHDRAWAL_IMAGE_SIZE)}.`,
    );
  }

  // El MIME declarado por el navegador ya no entra en la decision: exigir que
  // coincidiera con los magic bytes rechazaba comprobantes validos y obligaba al
  // agente a recortar la imagen para que el telefono la re-codificara como JPEG.
  const detected = detectedMime(input);
  if (!detected) {
    throw new ImageValidationError(
      `El archivo no es una imagen JPEG, PNG o WEBP (se recibió ${describeFormat(input)}). ` +
        "Ábrelo y vuelve a guardarlo como JPEG antes de subirlo.",
    );
  }

  // Se comprueba despues del formato para que un HEIC pesado reciba el consejo util
  // ("guardalo como JPEG") en vez de uno que no resuelve nada ("pesa mucho").
  if (input.byteLength > MAX_STORED_IMAGE_BYTES) {
    throw new ImageValidationError(
      `La imagen pesa ${formatBytes(input.byteLength)} y el máximo admitido es ` +
        `${formatBytes(MAX_STORED_IMAGE_BYTES)}, porque WhatsApp no entregaría un ` +
        "comprobante más pesado. Recórtala o vuelve a guardarla con menos calidad.",
    );
  }

  const bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(input);
  return {
    bytes,
    mime: detected,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}
