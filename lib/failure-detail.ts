import { Prisma } from "@prisma/client";

// Lo que hace falta para diagnosticar un fallo de subida y que hasta ahora solo llegaba
// al `console.warn` del servidor. Vive fuera de la ruta para poder probarse: la ruta
// necesita una sesión y una petición multipart, y esto es la parte que importa.
export const MAX_FAILURE_DETAIL = 1000;

export function describeError(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.name} [${error.code}]: ${error.message}`.slice(0, MAX_FAILURE_DETAIL);
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, MAX_FAILURE_DETAIL);
  }
  if (error === undefined || error === null) return null;
  return String(error).slice(0, MAX_FAILURE_DETAIL);
}

// Lo que se guarda en `retirar_saldo.error_interno`, que es varchar(500) y es lo que el
// modal enseña cuando no hay una fila de fallo que mostrar.
export function compactFailure(code: string, message: string, detail: string | null) {
  // En las ramas de validación la excepción es el propio mensaje envuelto en "Error: ",
  // así que repetirlo solo gasta los 500 caracteres que hay.
  const adds = detail !== null && !detail.endsWith(message);
  return `${code}: ${message}${adds ? ` · ${detail}` : ""}`.slice(0, 500);
}
