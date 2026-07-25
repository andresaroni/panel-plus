import { describe, expect, it } from "vitest";

import { loginSchema, passwordSchema, userSchema, usernameSchema } from "./validation";

describe("validación de autenticación", () => {
  it("normaliza el nombre de usuario", () => {
    expect(usernameSchema.parse("  Ana.Admin  ")).toBe("ana.admin");
  });

  it("rechaza caracteres no permitidos", () => {
    expect(usernameSchema.safeParse("admin<script>").success).toBe(false);
  });

  it("exige contraseñas de al menos 12 caracteres", () => {
    expect(passwordSchema.safeParse("corta123").success).toBe(false);
    expect(passwordSchema.safeParse("UnaClaveSegura2026!").success).toBe(true);
  });

  it("solo acepta roles conocidos durante el inicio de sesión", () => {
    expect(
      loginSchema.safeParse({
        username: "admin",
        password: "UnaClaveSegura2026!",
        expectedRole: "superadmin",
      }).success,
    ).toBe(false);
  });
});

describe("validación de usuarios", () => {
  it("requiere contraseña al crear", () => {
    expect(
      userSchema.safeParse({
        username: "vendedor",
        name: "Vendedor Prueba",
        role: "vendedor",
        status: "activo",
        password: "",
      }).success,
    ).toBe(false);
  });

  it("permite editar sin cambiar la contraseña", () => {
    expect(
      userSchema.safeParse({
        id: 1,
        username: "vendedor",
        name: "Vendedor Prueba",
        role: "vendedor",
        status: "activo",
        password: "",
      }).success,
    ).toBe(true);
  });
});
