// Deteccion de formato por magic bytes, sin dependencias de Node: la usan tanto la
// ruta de revision como el navegador, que recodifica el comprobante antes de subirlo.

// Quien pone el techo del comprobante NO es la base: el `max_allowed_packet` del MySQL
// de produccion es 1 GB, asi que por ese lado cabe cualquier foto. Los topes reales son
// dos, y los dos estan fuera de nuestro codigo:
//
//   - Vercel corta el cuerpo de una peticion a una Serverless Function en ~4,5 MB, y lo
//     hace en su edge, ANTES de ejecutar la funcion: sin log, sin escritura en base y con
//     una respuesta que no es JSON. Es un rechazo mudo.
//   - WhatsApp rechaza imagenes por encima de unos 5 MB, y el bot envia el comprobante al
//     cliente DESPUES de aplicar el pago: pasarse deja un retiro pagado cuyo comprobante
//     no se puede entregar.
//
// 3 MiB queda por debajo de ambos con margen, de modo que el rechazo lo demos nosotros con
// un mensaje que dice que hacer, y nunca Vercel en silencio.
export const DEFAULT_MAX_STORED_IMAGE_BYTES = 3 * 1024 * 1024;

// El navegador encoge por encima de esto aunque el servidor acepte hasta el tope de
// arriba. No es una validacion: es que el agente suele subir desde el movil con datos,
// y mandar 4 MB cuando 300 KB se leen igual de bien solo le hace esperar.
export const RECEIPT_TARGET_BYTES = 1024 * 1024;

export type DetectedMime = "image/jpeg" | "image/png" | "image/webp";

function ascii(bytes: Uint8Array, start: number, end: number) {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
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
export function detectedMime(bytes: Uint8Array): DetectedMime | null {
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

export function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}
