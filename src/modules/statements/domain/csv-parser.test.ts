import { describe, expect, it } from "vitest";
import { isErr } from "@/shared/result";
import { parseStatementCsv } from "./csv-parser";

describe("parseStatementCsv", () => {
  it("parseia CSV com decimal simples de ponto e delimitador vírgula (comum em banco digital)", () => {
    const csv = ["Data,Histórico,Valor", "15/08/2026,PIX RECEBIDO JOAO,150.00"].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.amountCents).toBe(15000);
      expect(result.value.lines[0]?.description).toBe("PIX RECEBIDO JOAO");
      expect(result.value.skippedRows).toBe(0);
    }
  });

  it("aceita data ISO (aaaa-mm-dd) e headers sem acento ('data'/'descricao'/'valor')", () => {
    const csv = ["data,descricao,valor", "2026-08-15,teste,50.00"].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines[0]?.amountCents).toBe(5000);
    }
  });

  it("formato BR (vírgula decimal, ponto milhar) exige delimitador ; — detectado pelo cabeçalho", () => {
    const csv = ["Data;Histórico;Valor", "15/08/2026;PIX RECEBIDO;1.234,56"].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.amountCents).toBe(123456);
    }
  });

  it("campo entre aspas com o delimitador dentro não quebra o parse", () => {
    const csv = ["Data,Histórico,Valor", '15/08/2026,"PIX, RECEBIDO DE JOAO",100.00'].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines[0]?.description).toBe("PIX, RECEBIDO DE JOAO");
    }
  });

  it("linha de débito (valor negativo) é descartada, nunca aparece nas linhas", () => {
    const csv = ["Data,Histórico,Valor", "15/08/2026,PIX ENVIADO,-50.00"].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines).toHaveLength(0);
    }
  });

  it("linha malformada (data inválida) é descartada individualmente, conta em skippedRows, não derruba o arquivo", () => {
    const csv = [
      "Data,Histórico,Valor",
      "31/13/2026,linha ruim,100.00",
      "15/08/2026,linha boa,50.00",
    ].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(false);
    if (!isErr(result)) {
      expect(result.value.lines).toHaveLength(1);
      expect(result.value.lines[0]?.description).toBe("linha boa");
      expect(result.value.skippedRows).toBe(1);
    }
  });

  it("cabeçalho não reconhecível → missing_headers", () => {
    const csv = ["Coluna1,Coluna2,Coluna3", "a,b,c"].join("\n");
    const result = parseStatementCsv(csv);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("missing_headers");
  });

  it("arquivo vazio → empty", () => {
    const result = parseStatementCsv("");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toBe("empty");
  });
});
