import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareReceipt } from "./receipt-encode";

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xdb];
const HEIC_HEAD = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];

function file(head: number[], size: number, name = "10017486.jpg", type = "image/jpeg") {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return new File([bytes], name, { type });
}

// El navegador no existe en vitest: se simula lo justo que usa `reencode`.
// `toBlob` devuelve un tamano proporcional al area y a la calidad para que la
// escalera de intentos se comporte como en un navegador real.
function stubBrowser(pixels: { width: number; height: number }) {
  const drawImage = vi.fn();
  const close = vi.fn();

  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ ...pixels, close })),
  );
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (cb: (blob: Blob) => void, type: string, quality: number) => {
          const size = Math.round(canvas.width * canvas.height * quality * 0.2);
          cb(new File([new Uint8Array(size)], "x", { type }));
        },
      };
      return canvas;
    },
  });

  return { close };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preparacion del comprobante antes de subirlo", () => {
  it("no toca un JPEG que ya cabe, para no recomprimir lo que leera el OCR", async () => {
    stubBrowser({ width: 1080, height: 2400 });
    const original = file(JPEG_HEAD, 180 * 1024);

    const prepared = await prepareReceipt(original, 1024 * 1024);

    expect(prepared).toBe(original);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  // Este es el caso de RET-0067: una foto de telefono que pasa la validacion de
  // formato y revienta al escribir el BLOB.
  it("recodifica a JPEG cuando el archivo no cabe", async () => {
    const { close } = stubBrowser({ width: 3000, height: 4000 });
    const original = file(JPEG_HEAD, 4 * 1024 * 1024);

    const prepared = await prepareReceipt(original, 1024 * 1024);

    expect(prepared).not.toBe(original);
    expect(prepared.type).toBe("image/jpeg");
    expect(prepared.name).toBe("10017486.jpg");
    expect(prepared.size).toBeLessThanOrEqual(1024 * 1024);
    expect(close).toHaveBeenCalled();
  });

  it("recodifica un formato no reconocido aunque quepa", async () => {
    stubBrowser({ width: 1200, height: 1600 });
    const original = file(HEIC_HEAD, 120 * 1024, "IMG_0042.heic", "image/heic");

    const prepared = await prepareReceipt(original, 1024 * 1024);

    expect(prepared.type).toBe("image/jpeg");
    expect(prepared.name).toBe("IMG_0042.jpg");
  });

  // Chrome en Android no decodifica HEIC. Antes que romper la subida se manda el
  // original y el servidor, que si lee magic bytes, explica que hacer.
  it("devuelve el original si el navegador no puede decodificarlo", async () => {
    stubBrowser({ width: 1200, height: 1600 });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("The source image cannot be decoded.");
      }),
    );
    const original = file(HEIC_HEAD, 3 * 1024 * 1024, "IMG_0042.heic", "image/heic");

    await expect(prepareReceipt(original, 1024 * 1024)).resolves.toBe(original);
  });
});
