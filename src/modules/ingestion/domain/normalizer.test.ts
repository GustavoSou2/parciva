import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isErr, isOk } from "@/shared/result";
import { computeHash, computePerceptualHash, hammingDistance, normalizeMime } from "./normalizer";

describe("computeHash", () => {
  it("é determinístico para o mesmo buffer", () => {
    const buffer = Buffer.from("comprovante-de-teste");
    expect(computeHash(buffer)).toBe(computeHash(Buffer.from("comprovante-de-teste")));
  });

  it("muda quando o buffer muda", () => {
    const a = computeHash(Buffer.from("comprovante-a"));
    const b = computeHash(Buffer.from("comprovante-b"));
    expect(a).not.toBe(b);
  });
});

/** Gradiente sintético determinístico — não é comprovante real (corpus proibido pelo roadmap do Marco 5). */
function buildGradientRaw(width: number, height: number, seed: number): Buffer {
  const pixels = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels[y * width + x] = (x * 5 + y * 3 + seed) % 256;
    }
  }
  return pixels;
}

function toJpeg(raw: Buffer, width: number, height: number, quality: number): Promise<Buffer> {
  return sharp(raw, { raw: { width, height, channels: 1 } }).jpeg({ quality }).toBuffer();
}

describe("computePerceptualHash", () => {
  it("distância pequena entre a mesma imagem recomprimida em qualidades diferentes (reenvio via WhatsApp)", async () => {
    const raw = buildGradientRaw(64, 64, 0);
    const highQuality = await toJpeg(raw, 64, 64, 90);
    const lowQuality = await toJpeg(raw, 64, 64, 40);

    const hashHigh = await computePerceptualHash(highQuality);
    const hashLow = await computePerceptualHash(lowQuality);

    expect(hammingDistance(hashHigh, hashLow)).toBeLessThanOrEqual(8);
  });

  it("distância maior entre duas imagens diferentes do que entre a mesma imagem recomprimida", async () => {
    const rawA = buildGradientRaw(64, 64, 0);
    const rawB = buildGradientRaw(64, 64, 128); // padrão bem diferente, mesmo seed determinístico

    const jpegA = await toJpeg(rawA, 64, 64, 90);
    const jpegARecompressed = await toJpeg(rawA, 64, 64, 40);
    const jpegB = await toJpeg(rawB, 64, 64, 90);

    const hashA = await computePerceptualHash(jpegA);
    const hashARecompressed = await computePerceptualHash(jpegARecompressed);
    const hashB = await computePerceptualHash(jpegB);

    const distanceSameImage = hammingDistance(hashA, hashARecompressed);
    const distanceDifferentImage = hammingDistance(hashA, hashB);

    expect(distanceDifferentImage).toBeGreaterThan(distanceSameImage);
  });

  it("é determinístico para o mesmo buffer", async () => {
    const jpeg = await toJpeg(buildGradientRaw(32, 32, 7), 32, 32, 80);
    const a = await computePerceptualHash(jpeg);
    const b = await computePerceptualHash(jpeg);
    expect(a).toBe(b);
  });
});

describe("hammingDistance", () => {
  it("é zero para hashes idênticos", () => {
    expect(hammingDistance("abcdef0123456789", "abcdef0123456789")).toBe(0);
  });

  it("é 64 para hashes totalmente opostos", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("conta exatamente os bits diferentes", () => {
    // 0x0 vs 0x1 difere só no bit menos significativo.
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
  });
});

describe("normalizeMime", () => {
  it("detecta JPEG por magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = normalizeMime(jpeg);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("image/jpeg");
  });

  it("detecta PNG por magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const result = normalizeMime(png);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("image/png");
  });

  it("detecta PDF por magic bytes", () => {
    const pdf = Buffer.from("%PDF-1.7\n%comprovante");
    const result = normalizeMime(pdf);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("application/pdf");
  });

  it("rejeita buffer vazio", () => {
    expect(isErr(normalizeMime(Buffer.alloc(0)))).toBe(true);
  });

  it("rejeita tipo não suportado", () => {
    const text = Buffer.from("isto não é um arquivo de imagem ou pdf");
    expect(isErr(normalizeMime(text))).toBe(true);
  });
});
