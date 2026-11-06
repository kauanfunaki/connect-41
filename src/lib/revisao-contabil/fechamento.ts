// Regras puras do módulo Revisão do fechamento (Fase 2, 05/11/2026): as opções
// do cadastro, a validação dos formulários, a ponte entre o banco do Connect e
// o formato do motor, e as exportações. Sem banco: o servidor e as telas usam
// daqui, e os testes também.
//
// As listas e opções moram em `regras-da-tela.ts` (sem servidor, para os
// componentes de cliente) e são reexportadas daqui.

import { createHash } from "node:crypto";
import { contextKey, inputKey } from "./motor/relatorio";
import type { Achado, Empresa, Fechamento } from "./motor/tipos";

import { CAMPOS_DA_CORRECAO, ENQUADRAMENTOS, FINALIDADE_PADRAO, REGIMES, TOLERANCIA_MAXIMA } from "./regras-da-tela";

export * from "./regras-da-tela";

export type DadosDoFechamento = {
  companyId: string;
  inicio: string;
  fim: string;
  regime: (typeof REGIMES)[number];
  enquadramento: (typeof ENQUADRAMENTOS)[number];
  finalidade: string;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(s: string): boolean {
  if (!DATA.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Valida o formulário do fechamento. O período é fechado nas duas pontas, como no original. */
export function validarFechamento(form: Record<string, unknown>): { ok: true; dados: DadosDoFechamento } | { ok: false; erro: string } {
  const companyId = texto(form.companyId);
  const inicio = texto(form.inicio);
  const fim = texto(form.fim);
  const regime = texto(form.regime);
  const enquadramento = texto(form.enquadramento) || "A confirmar";
  const finalidade = texto(form.finalidade) || FINALIDADE_PADRAO;
  if (!companyId) return { ok: false, erro: "Escolha a empresa." };
  if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) return { ok: false, erro: "Informe datas válidas: início anterior ou igual ao fim." };
  if (!(REGIMES as readonly string[]).includes(regime)) return { ok: false, erro: "Escolha o regime tributário." };
  if (!(ENQUADRAMENTOS as readonly string[]).includes(enquadramento)) return { ok: false, erro: "Escolha o enquadramento contábil." };
  if (finalidade.length > 120) return { ok: false, erro: "A finalidade passa de 120 caracteres." };
  return {
    ok: true,
    dados: {
      companyId,
      inicio,
      fim,
      regime: regime as DadosDoFechamento["regime"],
      enquadramento: enquadramento as DadosDoFechamento["enquadramento"],
      finalidade,
    },
  };
}

/** Tolerância digitada em reais ("0,01", "1") → centavos inteiros, ou `null` quando não serve. */
export function toleranciaEmCentavos(v: unknown): number | null {
  const s = texto(v).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const centavos = Math.round(Number(s) * 100);
  return centavos >= 0 && centavos <= TOLERANCIA_MAXIMA ? centavos : null;
}

export type EmpresaDoCadastro = { id: string; name: string; cnpj: string | null; cnaePrincipal?: string | null };
export type FechamentoDoBanco = {
  id: string;
  companyId: string;
  inicio: Date;
  fim: Date;
  regime: string;
  enquadramento: string;
  finalidade: string;
};

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** A empresa no formato do motor: razão social, CNPJ do cadastro e a atividade pelo CNAE principal. */
export function empresaDoMotor(c: EmpresaDoCadastro): Empresa {
  return { id: c.id, name: c.name, cnpj: c.cnpj ?? "", sector: c.cnaePrincipal?.trim() || "Não informado" };
}

export function fechamentoDoMotor(f: FechamentoDoBanco): Fechamento {
  return {
    id: f.id,
    companyId: f.companyId,
    start: dia(f.inicio),
    end: dia(f.fim),
    regime: f.regime,
    framework: f.enquadramento,
    purpose: f.finalidade,
  };
}

/** Correções de leitura: "idDoDocumento:linha" → campos em centavos (o formato do motor). */
export type Correcoes = Record<string, Partial<Record<"opening" | "debit" | "credit" | "closing", number>>>;

/** Lê as correções guardadas no banco, descartando o que não tem a forma do motor. */
export function correcoesDoBanco(v: unknown): Correcoes {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Correcoes = {};
  for (const [chave, campos] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}:\d+$/.test(chave) || !campos || typeof campos !== "object") continue;
    const c: Correcoes[string] = {};
    for (const k of CAMPOS_DA_CORRECAO) {
      const n = (campos as Record<string, unknown>)[k];
      if (typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= 10 ** 14) c[k] = n;
    }
    if (Object.keys(c).length) out[chave] = c;
  }
  return out;
}

/** Valor digitado em reais ("-1.234,56") → centavos; vazio é `undefined` (sem correção no campo). */
export function centavosDigitados(v: unknown): number | undefined | null {
  const s = texto(v).replace(/\s/g, "").replace(/^R\$/, "");
  if (!s) return undefined;
  const normal = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normal)) return null;
  const centavos = Math.round(Number(normal) * 100);
  return Math.abs(centavos) <= 10 ** 14 ? centavos : null;
}

export type DocumentoNaAssinatura = { id: string; sha256: string; extraidoEm: Date; ativo: boolean };

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * As assinaturas de uma execução (as do original, em SHA-256 para caber na
 * coluna): mudar a empresa, o período, o regime, os documentos ativos, uma
 * extração, as correções ou a tolerância invalida o relatório.
 */
export function assinaturas(
  empresa: Empresa,
  fechamento: Fechamento,
  docs: DocumentoNaAssinatura[],
  correcoes: Correcoes,
  tolerancia: number,
): { contexto: string; entradas: string } {
  return {
    contexto: sha256(contextKey(empresa, fechamento)),
    entradas: sha256(
      inputKey({
        processed: docs.map((d) => ({ id: d.id, sha256: d.sha256, extractedAt: d.extraidoEm.toISOString(), active: d.ativo })),
        corrections: correcoes,
        tolerance: tolerancia,
      }),
    ),
  };
}

export type Acompanhamento = { responsavel: string | null; estado: string; nota: string | null };

/** O achado com o acompanhamento gravado por cima (quem cuida, estado e nota). */
export function comAcompanhamento(f: Achado, a: Acompanhamento | undefined): Achado & { nota: string } {
  return { ...f, owner: a?.responsavel?.trim() || f.owner, status: a?.estado || f.status, nota: a?.nota ?? "" };
}

/** Célula do CSV com aspas, e fórmula neutralizada ("=", "+", "@", "-" no começo), como no original. */
function celula(v: unknown): string {
  return '"' + String(v ?? "").replace(/^([=+@-])/, "'$1").replace(/"/g, '""') + '"';
}

/** As pendências em CSV para o Excel (BOM, ";" e CRLF), com as colunas do original. */
export function csvDasPendencias(nomeDaEmpresa: string, achados: Pick<Achado, "id" | "area" | "severity" | "kind" | "value" | "source" | "fact" | "action" | "owner" | "status">[]): string {
  const cabecalho = ["ID", "Empresa", "Conta/área", "Prioridade", "Natureza", "Valor sob revisão", "Fonte", "Fato", "Providência", "Responsável", "Estado"];
  const linhas = achados.map((f) => [f.id, nomeDaEmpresa, f.area, f.severity, f.kind, f.value || "", f.source, f.fact, f.action, f.owner, f.status]);
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
}

/** Nome de arquivo para download: sem acento, sem barra, curto. */
export function nomeDoArquivo(base: string, extensao: string): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${limpo || "revisao"}.${extensao}`;
}
