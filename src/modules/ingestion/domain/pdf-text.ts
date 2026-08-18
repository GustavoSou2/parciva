/**
 * Tier 1 (texto) da cascata — spec §7.1: extrai a camada de texto real de
 * um PDF, via `pdfjs-dist`. Substitui a decodificação `buffer.toString
 * ("utf-8")` que `ingest-receipt.ts` usava antes — funcionava só por
 * acidente em PDF não comprimido (stream sem `/Filter`) e produzia texto
 * vazio/lixo em qualquer PDF real de banco (stream `FlateDecode`).
 *
 * Sem I/O de disco/rede: só processa um `Buffer` já em memória — mesmo
 * critério de camada de `normalizer.ts` (usa `sharp`, uma lib externa,
 * mas continua "domain" porque não toca o mundo fora do buffer recebido.
 *
 * Nunca lança: falha de parse (PDF corrompido, senha, vazio) devolve `""`
 * — mesmo contrato de "sem contribuição" que o resto da cascata assume
 * (um tier que não contribuiu não deve derrubar `ingestReceipt`).
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs-dist (mesmo no build "legacy") exige `workerSrc` explícito mesmo em
// Node — sem isso, `getDocument` lança "Setting up fake worker failed".
// `createRequire` resolve o caminho absoluto do arquivo dentro de
// node_modules; `pathToFileURL` é obrigatório no Windows — o loader ESM do
// Node rejeita caminho cru tipo "C:\..." (só aceita URL "file:"). Não há
// `fetch`/DOM envolvido, o worker roda no mesmo processo Node via
// `import()` dinâmico interno do pdfjs.
GlobalWorkerOptions.workerSrc = pathToFileURL(
  createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // `destroy()` vive na `PDFDocumentLoadingTask` (o que `getDocument`
  // devolve direto), não no `PDFDocumentProxy` resolvido por `.promise` —
  // por isso a referência é mantida separada do `doc` abaixo.
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  try {
    const doc = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }
    return pages.join("\n");
  } catch {
    return "";
  } finally {
    await loadingTask.destroy();
  }
}
