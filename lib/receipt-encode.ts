import { RECEIPT_TARGET_BYTES, detectedMime } from "./image-format";

// Recortar la imagen era el truco manual del agente: el editor del telefono la
// re-codificaba a JPEG y de paso la dejaba mucho mas liviana, que es lo que hacia
// que la subida entrara. Esto hace lo mismo automaticamente, y solo cuando hace
// falta: un comprobante que ya es JPEG/PNG/WEBP y cabe se sube intacto, para no
// degradar con una recompresion la imagen que despues tiene que leer el OCR.

const MAX_EDGE = 2000;

// De mas nitido a mas liviano. Se para en el primer intento que quepa.
const ATTEMPTS: ReadonlyArray<{ edge: number; quality: number }> = [
  { edge: MAX_EDGE, quality: 0.85 },
  { edge: MAX_EDGE, quality: 0.7 },
  { edge: 1600, quality: 0.7 },
  { edge: 1280, quality: 0.6 },
];

function drawn(bitmap: ImageBitmap, edge: number) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function reencode(file: File, maxBytes: number) {
  const bitmap = await createImageBitmap(file);
  try {
    let smallest: Blob | null = null;
    for (const { edge, quality } of ATTEMPTS) {
      const canvas = drawn(bitmap, edge);
      if (!canvas) return null;
      const blob = await toBlob(canvas, quality);
      if (!blob) return null;
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= maxBytes) break;
    }
    if (!smallest) return null;
    const name = file.name.replace(/\.[^.]+$/, "") || "comprobante";
    return new File([smallest], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

/**
 * Devuelve el comprobante listo para subir. Nunca lanza: si el navegador no puede
 * decodificar el archivo (Chrome en Android no abre HEIC) se sube el original y es
 * el servidor, que si lee magic bytes, quien explica que pasa.
 */
export async function prepareReceipt(
  file: File,
  maxBytes: number = RECEIPT_TARGET_BYTES,
): Promise<File> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (detectedMime(head) && file.size <= maxBytes) return file;
    return (await reencode(file, maxBytes)) ?? file;
  } catch {
    return file;
  }
}
