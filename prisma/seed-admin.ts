import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "../lib/password";
import { passwordSchema, usernameSchema } from "../lib/validation";

const inputSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(3).max(100),
  password: passwordSchema,
});

async function main() {
  const input = inputSchema.parse({
    username: process.env.ADMIN_USERNAME,
    name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
  });

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.usuarios.findUnique({ where: { usuario: input.username } });
    if (existing) throw new Error(`El usuario ${input.username} ya existe.`);

    await prisma.usuarios.create({
      data: {
        usuario: input.username,
        nombres: input.name,
        clave: await hashPassword(input.password),
        rol: "administrador",
        estado: "activo",
      },
    });
    console.log(`Administrador ${input.username} creado correctamente.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
