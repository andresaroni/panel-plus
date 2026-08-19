import "server-only";

import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APUESTAS_DATABASE_URL: z.string().url().optional(),
  SESSION_PASSWORD: z.string().min(32),
  APP_TIME_ZONE: z.string().default("America/Guayaquil"),
  ALLOW_ROOT_DATABASE: z.enum(["true", "false"]).default("false"),
  WEB_PUSH_PUBLIC_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_SUBJECT: z.string().trim().min(1).optional(),
  PANEL_PUSH_WEBHOOK_SECRET: z.string().min(32).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_CHAT_MODEL: z.string().trim().min(1).default("gpt-4.1-mini"),
}).superRefine((value, context) => {
  const pushValues = [
    value.WEB_PUSH_PUBLIC_KEY,
    value.WEB_PUSH_PRIVATE_KEY,
    value.WEB_PUSH_SUBJECT,
    value.PANEL_PUSH_WEBHOOK_SECRET,
  ];
  if (pushValues.some(Boolean) && !pushValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      message: "La configuración Web Push debe incluir todas sus variables.",
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Configuración inválida: ${z.prettifyError(parsed.error)}`);
}

const usesRootAccount = (url: string) => /^mysql:\/\/root(?::[^@]*)?@/i.test(url);

if (
  process.env.NODE_ENV === "production" &&
  parsed.data.ALLOW_ROOT_DATABASE !== "true" &&
  [parsed.data.DATABASE_URL, parsed.data.APUESTAS_DATABASE_URL]
    .filter((url) => url !== undefined)
    .some(usesRootAccount)
) {
  throw new Error("La aplicación no puede usar la cuenta root de MySQL en producción.");
}

export const env = parsed.data;
