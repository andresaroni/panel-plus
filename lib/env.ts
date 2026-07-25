import "server-only";

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_PASSWORD: z.string().min(32),
  APP_TIME_ZONE: z.string().default("America/Guayaquil"),
  ALLOW_ROOT_DATABASE: z.enum(["true", "false"]).default("false"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Configuración inválida: ${z.prettifyError(parsed.error)}`);
}

if (
  process.env.NODE_ENV === "production" &&
  parsed.data.ALLOW_ROOT_DATABASE !== "true" &&
  /^mysql:\/\/root(?::[^@]*)?@/i.test(parsed.data.DATABASE_URL)
) {
  throw new Error("La aplicación no puede usar la cuenta root de MySQL en producción.");
}

export const env = parsed.data;
