// Regras do módulo Planejamento tributário no Connect (05/11/2026) — sem banco e
// sem servidor, para a tela e as ações usarem igual.
//
// O motor e a avaliação vêm do Connect Tributário sem mudança (./motor e
// ./avaliacao). Aqui fica só o que é do Connect: o código do módulo, como a
// avaliação nasce a partir de uma empresa do cadastro, as colunas que a lista
// usa e a mensagem em português quando os dados não passam na validação.

import type { TaxRegimeKind } from "@/generated/prisma/enums";
import { nomeExibicao } from "@/lib/companyName";
import { newStudy, studySchema, fieldLabels, type Study } from "./avaliacao/model";
import { ENGINE } from "./motor/fiscal";

export const MODULO_PLANEJAMENTO = "contabil_planejamento";
export const ROTA_DO_PLANEJAMENTO = "/planejamento-tributario";
/** Versão do motor gravada com cada avaliação e cada versão. */
export const MOTOR_ATUAL = ENGINE;

export type ModoDaAvaliacao = "rapida" | "guiada";

export function modoDaAvaliacao(modo: Study["mode"]): ModoDaAvaliacao {
  return modo === "guided" ? "guiada" : "rapida";
}

export function rotuloDoModo(modo: ModoDaAvaliacao): string {
  return modo === "guiada" ? "Avaliação analítica" : "Avaliação rápida";
}

/**
 * O regime atual da avaliação a partir do cadastro da empresa. MEI, imune,
 * produtor rural e doméstica ficam "não informado": o simulador compara só
 * Simples, Presumido e Real.
 */
export function regimeAtualDaEmpresa(kind: TaxRegimeKind | null | undefined): Study["currentRegime"] {
  switch (kind) {
    case "SIMPLES_NACIONAL":
      return "simple";
    case "LUCRO_PRESUMIDO":
      return "presumed";
    case "LUCRO_REAL":
      return "real";
    default:
      return "unknown";
  }
}

/** O cadastro guarda o CNPJ com ou sem máscara; a avaliação quer 14 dígitos ou nada. */
export function cnpjDaAvaliacao(cnpj: string | null | undefined): string {
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  return digitos.length === 14 ? digitos : "";
}

export type EmpresaParaAvaliacao = {
  name: string;
  displayName: string | null;
  cnpj: string | null;
  taxRegimeKind: TaxRegimeKind | null;
  stateCode: string | null;
  city: string | null;
};

/**
 * Uma avaliação nova, no formato do motor. Com empresa, já vem com nome, CNPJ,
 * regime atual, UF e cidade do cadastro; sem empresa (prospecto), só com o nome
 * digitado. Os valores começam vazios, como no original.
 */
export function novaAvaliacao(
  modo: ModoDaAvaliacao,
  ano: number,
  origem: { empresa: EmpresaParaAvaliacao } | { prospecto: string },
): Study {
  const estudo = newStudy(modo === "guiada" ? "guided" : "quick", ano);
  if ("empresa" in origem) {
    const e = origem.empresa;
    estudo.name = nomeExibicao(e).trim().slice(0, 160) || estudo.name;
    estudo.cnpj = cnpjDaAvaliacao(e.cnpj);
    estudo.currentRegime = regimeAtualDaEmpresa(e.taxRegimeKind);
    estudo.uf = (e.stateCode ?? "").trim().slice(0, 2).toUpperCase();
    estudo.city = (e.city ?? "").trim().slice(0, 100);
  } else {
    estudo.name = origem.prospecto.trim().slice(0, 160) || estudo.name;
  }
  return studySchema.parse(estudo);
}

/** As colunas da tabela que a lista e os filtros usam (cópias do que está em `dados`). */
export function colunasDaAvaliacao(estudo: Study): { nome: string; cnpj: string | null; modo: ModoDaAvaliacao; ano: number } {
  const ano = Number(estudo.start.slice(0, 4));
  return {
    nome: estudo.name,
    cnpj: estudo.cnpj || null,
    modo: modoDaAvaliacao(estudo.mode),
    ano: Number.isInteger(ano) && ano > 0 ? ano : new Date().getFullYear(),
  };
}

type Problema = { path: PropertyKey[]; message: string };

/**
 * A mensagem para a tela quando `studySchema` recusa os dados. As regras do
 * original já falam português (datas, sinais, percentuais); as mensagens
 * padrão do zod não, então traduzimos pelo campo.
 */
export function mensagemDoProblema(problema: Problema | undefined): string {
  if (!problema) return "Confira os dados da avaliação.";
  const [campo, sub] = problema.path;
  if (problema.path.length === 0) return problema.message;
  if (campo === "name") return "Dê um nome à avaliação (até 160 caracteres).";
  if (campo === "cnpj") return "O CNPJ precisa ter 14 dígitos — ou deixe em branco.";
  if (campo === "start" || campo === "end") return "Informe o período com datas válidas do mesmo ano.";
  if (campo === "values" && typeof sub === "string") return `Confira o valor de "${fieldLabels[sub] ?? sub}".`;
  if (campo === "notes") return "As observações passaram de 5.000 caracteres.";
  if (campo === "base") return "Confira as premissas: algum percentual ou valor está fora do permitido.";
  return "Confira os dados da avaliação.";
}

export type ValidacaoDaAvaliacao = { ok: true; estudo: Study } | { ok: false; error: string };

export function validarAvaliacao(dados: unknown): ValidacaoDaAvaliacao {
  const r = studySchema.safeParse(dados);
  if (!r.success) return { ok: false, error: mensagemDoProblema(r.error.issues[0]) };
  return { ok: true, estudo: r.data };
}
