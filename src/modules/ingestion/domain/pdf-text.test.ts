import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdf-text";

/**
 * PDF mínimo válido, montado à mão (sem lib de geração) — sintético, não
 * corpus real (proibido pelo roadmap do Marco 5). `compressed` decide se o
 * content stream vai com `/Filter /FlateDecode`, para exercitar o caso que
 * `buffer.toString("utf-8")` não conseguia ler (stream comprimida é o caso
 * comum em PDF real de banco).
 */
function buildMinimalPdf(text: string, compressed: boolean): Buffer {
  const contentStream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const streamBytes = compressed
    ? deflateSync(Buffer.from(contentStream, "latin1"))
    : Buffer.from(contentStream, "latin1");
  const streamFilter = compressed ? " /Filter /FlateDecode" : "";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /MediaBox [0 0 300 144] /Contents 4 0 R >>",
    null, // objeto 4 (stream) é montado abaixo, com bytes binários quando comprimido
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  const header = Buffer.from("%PDF-1.4\n", "latin1");
  const parts: Buffer[] = [header];
  const offsets: number[] = [];
  let cursor = header.length;

  function pushPart(buf: Buffer): void {
    parts.push(buf);
    cursor += buf.length;
  }

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(cursor);
    const objNum = i + 1;
    if (i === 3) {
      const streamObj = Buffer.concat([
        Buffer.from(`${objNum} 0 obj\n<< /Length ${streamBytes.length}${streamFilter} >>\nstream\n`, "latin1"),
        streamBytes,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
      pushPart(streamObj);
    } else {
      const body = objects[i];
      pushPart(Buffer.from(`${objNum} 0 obj\n${body}\nendobj\n`, "latin1"));
    }
  }

  const xrefOffset = cursor;
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pushPart(Buffer.from(xref + trailer, "latin1"));

  return Buffer.concat(parts);
}

describe("extractPdfText", () => {
  it("extrai texto de PDF com camada de texto não comprimida", async () => {
    const pdf = buildMinimalPdf("VALOR R$ 150,00", false);
    const text = await extractPdfText(pdf);
    expect(text).toContain("VALOR R$ 150,00");
  });

  it("extrai texto de PDF com stream comprimida (FlateDecode) — o caso que buffer.toString(utf-8) não lia", async () => {
    const pdf = buildMinimalPdf("VALOR R$ 275,50", true);
    const text = await extractPdfText(pdf);
    expect(text).toContain("VALOR R$ 275,50");
  });

  it("devolve string vazia para PDF corrompido, nunca lança", async () => {
    const text = await extractPdfText(Buffer.from("%PDF-1.4\nlixo binário sem estrutura válida"));
    expect(text).toBe("");
  });

  it("devolve string vazia para buffer vazio, nunca lança", async () => {
    const text = await extractPdfText(Buffer.alloc(0));
    expect(text).toBe("");
  });
});
