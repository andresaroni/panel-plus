import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { MAX_FAILURE_DETAIL, compactFailure, describeError } from "./failure-detail";

describe("detalle de una subida fallida", () => {
  it("nombra la excepción y su mensaje", () => {
    expect(describeError(new TypeError("boundary inválido"))).toBe(
      "TypeError: boundary inválido",
    );
  });

  // Sin el código de Prisma no se distingue una constraint de una conexión caída, que es
  // justo lo que hubo que averiguar reproduciendo el fallo a mano.
  it("incluye el código cuando el error viene de Prisma", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Server has closed the connection", {
      code: "P1017",
      clientVersion: "6.19.2",
    });
    const detail = describeError(error);
    expect(detail).toContain("P1017");
    expect(detail).toContain("Server has closed the connection");
  });

  it("devuelve null cuando no hay error", () => {
    expect(describeError(undefined)).toBeNull();
    expect(describeError(null)).toBeNull();
  });

  it("acepta cosas que no son Error", () => {
    expect(describeError("se cayó")).toBe("se cayó");
  });

  it("recorta a lo que cabe en la columna", () => {
    const detail = describeError(new Error("x".repeat(5000)));
    expect(detail).toHaveLength(MAX_FAILURE_DETAIL);
  });
});

describe("versión compacta para error_interno", () => {
  it("junta código, mensaje y detalle", () => {
    expect(compactFailure("ERR-SRV", "No fue posible procesar el retiro.", "TypeError: x")).toBe(
      "ERR-SRV: No fue posible procesar el retiro. · TypeError: x",
    );
  });

  it("omite el separador cuando no hay detalle", () => {
    expect(compactFailure("ERR-IMG", "No es una imagen.", null)).toBe(
      "ERR-IMG: No es una imagen.",
    );
  });

  // En las ramas de validación la excepción es el mensaje envuelto en "Error: ".
  it("no repite el mensaje cuando la excepción solo lo envuelve", () => {
    expect(compactFailure("ERR-IMG", "No es una imagen.", "Error: No es una imagen.")).toBe(
      "ERR-IMG: No es una imagen.",
    );
  });

  it("nunca pasa de 500 caracteres", () => {
    expect(compactFailure("ERR-SRV", "m".repeat(400), "d".repeat(400))).toHaveLength(500);
  });
});
