import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "El usuario debe tener al menos 3 caracteres.")
  .max(50, "El usuario no puede superar 50 caracteres.")
  .regex(/^[a-zA-Z0-9._-]+$/, "Usa solo letras, números, punto, guion o guion bajo.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128, "La contraseña no puede superar 128 caracteres.");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1),
  expectedRole: z.enum(["administrador", "vendedor"]),
});

export const userSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    username: usernameSchema,
    name: z.string().trim().min(3, "Ingresa el nombre completo.").max(100),
    role: z.enum(["administrador", "vendedor"]),
    status: z.enum(["activo", "inactivo"]),
    password: z.string().max(128).optional().default(""),
  })
  .superRefine((value, context) => {
    if (!value.id || value.password) {
      const result = passwordSchema.safeParse(value.password);
      if (!result.success) {
        context.addIssue({
          code: "custom",
          path: ["password"],
          message: result.error.issues[0]?.message ?? "Contraseña inválida.",
        });
      }
    }
  });
