import { createHash } from "node:crypto";

export const MAX_WITHDRAWAL_IMAGE_SIZE = 16 * 1024 * 1024;

const supportedMime = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ValidatedImage = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
  size: number;
};

export class ImageValidationError extends Error {}

function detectedMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateWithdrawalImage(input: Uint8Array, declaredMime: string): ValidatedImage {
  if (input.byteLength === 0) throw new ImageValidationError("Selecciona una imagen.");
  if (input.byteLength > MAX_WITHDRAWAL_IMAGE_SIZE) {
    throw new ImageValidationError("La imagen supera el límite de 16 MiB.");
  }

  const mime = declaredMime.toLowerCase();
  if (!supportedMime.has(mime)) {
    throw new ImageValidationError("Solo se permiten imágenes JPEG, PNG o WEBP.");
  }
  const detected = detectedMime(input);
  if (detected !== mime) {
    throw new ImageValidationError("El contenido de la imagen no coincide con su tipo MIME.");
  }

  const bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(input);
  return {
    bytes,
    mime: mime as ValidatedImage["mime"],
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}
