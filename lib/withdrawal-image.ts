import { createHash } from "node:crypto";

export const MAX_WITHDRAWAL_IMAGE_SIZE = 16 * 1024 * 1024;

export type ValidatedImage = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
  size: number;
};

export class ImageValidationError extends Error {}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return Buffer.from(bytes.subarray(start, end)).toString("ascii");
}

// Marcas de los contenedores ISO-BMFF que un telefono puede entregar con nombre
// `.jpg`. Ninguna es procesable: ni el OCR ni la API de WhatsApp las aceptan.
const isoBrands = new Map([
  ["heic", "un archivo HEIC"],
  ["heix", "un archivo HEIC"],
  ["hevc", "un archivo HEIC"],
  ["heim", "un archivo HEIC"],
  ["heis", "un archivo HEIC"],
  ["mif1", "un archivo HEIF"],
  ["msf1", "un archivo HEIF"],
  ["avif", "un archivo AVIF"],
  ["avis", "un archivo AVIF"],
]);

// El tipo real de un comprobante lo dictan sus magic bytes. El `file.type` que
// manda el navegador sale de la extension o del content-provider del sistema, no
// del contenido, asi que miente sobre archivos que si son validos: el selector de
// fotos de Android entrega copias llamadas `<id>.jpg` sea cual sea el formato.
export function detectedMime(bytes: Uint8Array) {
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
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

// Solo alimenta el mensaje de error: nombrar el formato real le dice al agente
// que hacer, mientras que un rechazo generico lo deja probando al azar.
export function describeFormat(bytes: Uint8Array) {
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) return "un GIF";
  if (bytes.length >= 2 && ascii(bytes, 0, 2) === "BM") return "un BMP";
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "%PDF") return "un PDF";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    return isoBrands.get(ascii(bytes, 8, 12).toLowerCase()) ?? "un contenedor ISO-BMFF";
  }
  return "un archivo de tipo desconocido";
}

export function validateWithdrawalImage(input: Uint8Array): ValidatedImage {
  if (input.byteLength === 0) throw new ImageValidationError("Selecciona una imagen.");
  if (input.byteLength > MAX_WITHDRAWAL_IMAGE_SIZE) {
    throw new ImageValidationError("La imagen supera el límite de 16 MiB.");
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

  const bytes: Uint8Array<ArrayBuffer> = Uint8Array.from(input);
  return {
    bytes,
    mime: detected,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}
