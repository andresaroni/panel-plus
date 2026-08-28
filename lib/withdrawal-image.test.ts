import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ImageValidationError,
  MAX_STORED_IMAGE_BYTES,
  MAX_WITHDRAWAL_IMAGE_SIZE,
  validateWithdrawalImage,
} from "./withdrawal-image";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.from("RIFF0000WEBP", "ascii");
const heic = Buffer.from("\x00\x00\x00\x20ftypheic", "binary");

function sized(head: Uint8Array, size: number) {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
}

describe("comprobantes de retiro", () => {
  it.each([
    ["image/jpeg", jpeg],
    ["image/png", png],
    ["image/webp", webp],
  ])("acepta %s y calcula SHA-256", (mime, bytes) => {
    const result = validateWithdrawalImage(bytes);
    expect(result.mime).toBe(mime);
    expect(result.size).toBe(bytes.byteLength);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  // RET-0033: el navegador etiqueto como JPEG una imagen que no lo era y la
  // aprobacion se rechazo, obligando al agente a recortarla para re-codificarla.
  it("deriva el MIME de los magic bytes aunque el navegador declare otro", () => {
    expect(validateWithdrawalImage(webp).mime).toBe("image/webp");
    expect(validateWithdrawalImage(png).mime).toBe("image/png");
  });

  it("rechaza HEIC nombrando el formato real", () => {
    expect(() => validateWithdrawalImage(heic)).toThrow(ImageValidationError);
    expect(() => validateWithdrawalImage(heic)).toThrow("HEIC");
  });

  it("rechaza formatos desconocidos y lo que no cabe en una petición", () => {
    expect(() => validateWithdrawalImage(Uint8Array.from([1, 2, 3]))).toThrow(
      ImageValidationError,
    );
    expect(() => validateWithdrawalImage(new Uint8Array(MAX_WITHDRAWAL_IMAGE_SIZE + 1))).toThrow(
      "supera el límite",
    );
  });

  // El tope no lo pone la base (el max_allowed_packet de produccion es 1 GB) sino
  // WhatsApp: el comprobante se envia al cliente despues de aplicar el pago, asi que una
  // imagen que Meta rechace deja un retiro pagado sin comprobante entregable.
  it("rechaza una imagen que WhatsApp no podría entregar", () => {
    const big = sized(jpeg, MAX_STORED_IMAGE_BYTES + 1);
    expect(() => validateWithdrawalImage(big)).toThrow(ImageValidationError);
    expect(() => validateWithdrawalImage(big)).toThrow("máximo admitido");
  });

  it("acepta una imagen justo en el límite", () => {
    expect(validateWithdrawalImage(sized(jpeg, MAX_STORED_IMAGE_BYTES)).size).toBe(
      MAX_STORED_IMAGE_BYTES,
    );
  });

  // El formato se comprueba antes que el tamano: a un HEIC pesado hay que decirle
  // que lo guarde como JPEG, no que pesa mucho.
  it("nombra el formato antes que el tamaño en un HEIC pesado", () => {
    expect(() => validateWithdrawalImage(sized(heic, MAX_STORED_IMAGE_BYTES + 1))).toThrow(
      "HEIC",
    );
  });
});
