// Importação de arquivos e execução da análise, com as validações do original.
// Portado de `dist/adapter.py` (AudTool R_12 provisório, commit 92658a2), rotas `/api/import` e
// `/api/analyse`. Lá a ponte entre a tela e o Python era JSON; aqui são funções, e os bytes do
// original viajam como estão (sem base64).

import { createHash, randomUUID } from "node:crypto";
import { analyse } from "./analise";
import { extractFile, unpack } from "./arquivo";
import { identifier } from "./base";
import { interpreted } from "./manual";
import { corta } from "./py";
import type { Analise, Documento, Empresa, Fechamento } from "./tipos";

const LIMITE_DO_ENVIO = 25 * 1024 * 1024;

/** Correções de leitura por linha de balancete: "idDoDocumento:índiceDaLinha" → campos em centavos. */
export type Correcoes = Record<string, Partial<Record<"opening" | "debit" | "credit" | "closing", number>>>;

export type DocumentoImportado = Documento & { id: string; sha256: string; size: number; extractedAt: string; raw: Uint8Array };

export type Execucao = Analise & {
  runId: string;
  executedAt: string;
  company: Empresa;
  closing: Fechamento;
  documents: { id: string; name: string; sha256: string; size: number; kind: string; interpreted: boolean }[];
  corrections: Correcoes;
};

function validarContexto(co: Empresa, cl: Fechamento) {
  if (!co.id || cl.companyId !== co.id || !co.cnpj) throw new Error("Empresa/fechamento inválidos.");
  if (!cl.start || !cl.end || cl.start > cl.end) throw new Error("Período inválido.");
}

/** Importa um arquivo (ou os de um ZIP): fatos extraídos e SHA-256 de cada um; falhas por arquivo não param os demais. */
export async function importar(
  company: Empresa,
  closing: Fechamento,
  name: string,
  raw: Uint8Array,
): Promise<{ documents: DocumentoImportado[]; errors: { name: string; error: string }[] }> {
  validarContexto(company, closing);
  if (raw.length > LIMITE_DO_ENVIO) throw new Error("Limite de 25 MB por envio.");
  const documents: DocumentoImportado[] = [];
  const errors: { name: string; error: string }[] = [];
  for (const [nome, conteudo] of unpack(name, raw)) {
    try {
      const facts = await extractFile(nome, conteudo);
      documents.push({
        id: randomUUID(),
        name: nome,
        companyId: company.id,
        closingId: closing.id,
        cnpj: identifier(company.cnpj),
        period: [closing.start, closing.end],
        sha256: createHash("sha256").update(conteudo).digest("hex"),
        size: conteudo.length,
        facts,
        extractedAt: new Date().toISOString(),
        raw: conteudo,
      });
    } catch (e) {
      errors.push({ name: nome, error: corta(e instanceof Error ? e.message : String(e), 500) });
    }
  }
  return { documents, errors };
}

const CAMPOS_CORRIGIVEIS = new Set(["opening", "debit", "credit", "closing"]);

/**
 * Executa a análise sobre os documentos selecionados, com as correções de leitura e a tolerância (centavos).
 * Os documentos recebidos não são alterados: as correções valem só para esta execução.
 */
export function executar(input: {
  company: Empresa;
  closing: Fechamento;
  documents: Documento[];
  corrections?: Correcoes;
  tolerance?: number;
}): Execucao {
  const { company: co, closing: cl } = input;
  validarContexto(co, cl);
  const corrections = input.corrections ?? {};
  const docs: Documento[] = structuredClone(input.documents);
  if (!docs.length) throw new Error("Selecione documentos extraídos.");
  for (const d of docs) {
    if (d.companyId !== co.id || d.closingId !== cl.id) throw new Error("Documento de outra empresa/fechamento.");
    d.facts.accounts.forEach((row, i) => {
      const c = Object.prototype.hasOwnProperty.call(corrections, d.id + ":" + i) ? corrections[d.id + ":" + i] : {};
      for (const [k, v] of Object.entries(c)) {
        if (!CAMPOS_CORRIGIVEIS.has(k) || typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > 10 ** 14) throw new Error("Correção inválida.");
        row[k as "opening"] = v;
      }
    });
  }
  const tol = input.tolerance ?? 1;
  if (typeof tol !== "number" || !Number.isInteger(tol) || !(tol >= 0 && tol <= 10000)) throw new Error("Tolerância inválida.");
  const r = analyse(co, cl, docs, tol);
  return {
    ...r,
    runId: randomUUID(),
    executedAt: new Date().toISOString(),
    company: co,
    closing: cl,
    documents: docs.map((d) => ({
      id: d.id as string,
      name: d.name,
      sha256: d.sha256 as string,
      size: d.size as number,
      kind: d.facts.kind,
      interpreted: interpreted(d.facts),
    })),
    corrections,
  };
}
