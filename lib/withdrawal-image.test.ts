import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ImageValidationError,
  MAX_WITHDRAWAL_IMAGE_SIZE,
  validateWithdrawalImage,
} from "./withdrawal-image";

describe("comprobantes de retiro", () => {
  it.each([
    ["image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xdb])],
    ["image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/webp", Buffer.from("RIFF0000WEBP", "ascii")],
  ])("acepta %s y calcula SHA-256", (mime, bytes) => {
    const result = validateWithdrawalImage(bytes, mime);
    expect(result.mime).toBe(mime);
    expect(result.size).toBe(bytes.byteLength);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("rechaza una extensión MIME que no coincide con los magic bytes", () => {
    expect(() =>
      validateWithdrawalImage(Uint8Array.from([0xff, 0xd8, 0xff]), "image/png"),
    ).toThrow(ImageValidationError);
  });

  it("rechaza formatos desconocidos y archivos mayores a 16 MiB", () => {
    expect(() => validateWithdrawalImage(Uint8Array.from([1, 2, 3]), "image/gif")).toThrow(
      ImageValidationError,
    );
    expect(() =>
      validateWithdrawalImage(new Uint8Array(MAX_WITHDRAWAL_IMAGE_SIZE + 1), "image/png"),
    ).toThrow("16 MiB");
  });
});
