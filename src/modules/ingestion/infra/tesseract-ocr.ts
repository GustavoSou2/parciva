/**
 * OCR local (Tier 2) — spec §7.1/§7.2: extrai texto de uma imagem antes
 * de tentar regex, sem chamar nenhum modelo pago. Fica em `infra/`
 * porque `tesseract.js` roda um binário/WASM local — não é I/O de rede,
 * mas também não é computação pura o suficiente para `domain/`.
 *
 * Nunca lança: falha de OCR (imagem ilegível, worker não inicializa)
 * volta `""`, que a cascata trata como "tier sem contribuição" (spec
 * §7.1, ver `domain/pipeline.ts`), nunca como erro de infraestrutura.
 *
 * Cria e termina um worker do Tesseract por chamada — mais simples e
 * seguro que manter um worker global vivo entre jobs; se o throughput
 * exigir, um pool reutilizável é otimização de tarefa futura.
 */

import { createWorker } from "tesseract.js";

export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  try {
    const worker = await createWorker("por");
    try {
      const { data } = await worker.recognize(buffer);
      console.log(`[ocr] texto extraído: ${data.text.length} chars`);
      return data.text;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error("[ocr] falha ao extrair texto", error);
    return "";
  }
}
