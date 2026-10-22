// A regra de aplicação de um modelo de obrigação (22/10/2026): a que empresas
// da carteira ele vale, e o plano do que gerar, tirar e reprogramar. Puro, sem
// banco — a prévia da tela e o motor (./geracao.ts) usam as mesmas funções.
//
// Os filtros usam só o que a empresa já tem como dado:
// - regime: `Company.taxRegimeKind` (derivado do texto desde 09/10/2026);
// - sem movimento: `Company.taxNoMovement`;
// - com funcionários: `Company.taxHasEmployees` OU colaboradores ativos
//   cadastrados no DP (Person COLABORADOR com `currentCompanyId`);
// - estado e cidade: `Company.stateCode` e `Company.city`;
// - setor contratado: `CompanyService` ativo no setor do modelo.
// O grupo/cliente da empresa saiu do schema em 21/10/2026 e empresa não tem
// tag própria — por isso não há filtro por grupo ou tag.

import type { DatasDaObrigacao } from "./calendario";

export type FiltroSimNao = "QUALQUER" | "SIM" | "NAO";

export type RegraDeAplicacao = {
  /** TaxRegimeKind; vazio = qualquer regime (inclusive sem regime). */
  regimes: string[];
  semMovimento: FiltroSimNao;
  comFuncionarios: FiltroSimNao;
  /** UFs; vazio = qualquer. */
  estados: string[];
  /** Cidades; vazio = qualquer. Comparadas sem acento e sem maiúscula. */
  cidades: string[];
  /** Só quem tem o setor do modelo contratado e ativo. */
  exigeSetorContratado: boolean;
};

export type EmpresaDaRegra = {
  id: string;
  taxRegimeKind: string | null;
  taxNoMovement: boolean;
  taxHasEmployees: boolean | null;
  /** Colaboradores ativos cadastrados no DP. */
  colaboradoresAtivos: number;
  stateCode: string | null;
  city: string | null;
  /** Setores contratados e ativos. */
  setoresContratados: readonly string[];
};

export function normalizarCidade(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Uma coluna JSON de lista, de volta como lista de textos (o que não for texto sai). */
export function lerListaJson(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/**
 * Tem funcionários: o regime diz que sim, ou o DP tem colaborador ativo.
 * Sem funcionários: o regime diz que não e o DP não tem ninguém. Presumido e
 * Real não dizem no rótulo — sem colaborador no DP, ficam como "não se sabe" e
 * não entram em nenhum dos dois filtros.
 */
export function situacaoDosFuncionarios(e: Pick<EmpresaDaRegra, "taxHasEmployees" | "colaboradoresAtivos">): "SIM" | "NAO" | "NAO_SE_SABE" {
  if (e.taxHasEmployees === true || e.colaboradoresAtivos > 0) return "SIM";
  if (e.taxHasEmployees === false) return "NAO";
  return "NAO_SE_SABE";
}

export function empresaAtende(empresa: EmpresaDaRegra, regra: RegraDeAplicacao, sectorCode: string): boolean {
  if (regra.exigeSetorContratado && !empresa.setoresContratados.includes(sectorCode)) return false;
  if (regra.regimes.length > 0 && (!empresa.taxRegimeKind || !regra.regimes.includes(empresa.taxRegimeKind))) return false;
  if (regra.semMovimento === "SIM" && !empresa.taxNoMovement) return false;
  if (regra.semMovimento === "NAO" && empresa.taxNoMovement) return false;
  if (regra.comFuncionarios !== "QUALQUER" && situacaoDosFuncionarios(empresa) !== regra.comFuncionarios) return false;
  if (regra.estados.length > 0) {
    const uf = (empresa.stateCode ?? "").trim().toUpperCase();
    if (!regra.estados.some((e) => e.trim().toUpperCase() === uf)) return false;
  }
  if (regra.cidades.length > 0) {
    const cidade = normalizarCidade(empresa.city);
    if (!cidade || !regra.cidades.some((c) => normalizarCidade(c) === cidade)) return false;
  }
  return true;
}

// ─── O plano da geração ─────────────────────────────────────────────────────

/** Uma obrigação já gerada, com o que o plano precisa saber dela. */
export type ObrigacaoExistente = {
  id: string;
  companyId: string;
  competencia: string;
  dataLegal: string;
  prazoInterno: string;
  /** Nulo: a atividade foi excluída à mão no kanban — a competência não volta. */
  pipelineItemId: string | null;
  /** A atividade está numa etapa concluída (tipo DONE ou terminal). */
  concluida: boolean;
};

export type PlanoDaGeracao = {
  criar: { companyId: string; datas: DatasDaObrigacao }[];
  /** Futuras, não concluídas, de empresa que saiu da regra (ou de modelo desligado). */
  remover: ObrigacaoExistente[];
  /** Futuras, não concluídas, cujas datas mudaram com a edição do modelo. */
  reprogramar: { existente: ObrigacaoExistente; datas: DatasDaObrigacao }[];
};

/**
 * O que fazer para a carteira bater com o modelo:
 * - cada empresa que atende × cada próxima ocorrência sem linha → criar;
 * - linha futura e não concluída de empresa que não atende mais (ou de modelo
 *   desligado, ou de competência que deixou de existir com a troca de
 *   periodicidade) → remover;
 * - linha futura e não concluída cujas datas recalculadas mudaram → reprogramar.
 * O que já venceu (data legal até hoje) ou foi concluído nunca é tocado.
 *
 * `datasDe` recalcula uma competência existente (nulo se ela não vale mais).
 */
export function planejarGeracao(p: {
  ativo: boolean;
  empresasQueAtendem: readonly string[];
  ocorrencias: readonly DatasDaObrigacao[];
  existentes: readonly ObrigacaoExistente[];
  hoje: string;
  datasDe: (competencia: string) => DatasDaObrigacao | null;
}): PlanoDaGeracao {
  const atendem = new Set(p.ativo ? p.empresasQueAtendem : []);
  const chave = (companyId: string, competencia: string) => `${companyId}|${competencia}`;
  const jaTem = new Set(p.existentes.map((e) => chave(e.companyId, e.competencia)));

  const criar: PlanoDaGeracao["criar"] = [];
  for (const companyId of atendem) {
    for (const datas of p.ocorrencias) {
      if (!jaTem.has(chave(companyId, datas.competencia))) criar.push({ companyId, datas });
    }
  }

  const remover: ObrigacaoExistente[] = [];
  const reprogramar: PlanoDaGeracao["reprogramar"] = [];
  for (const e of p.existentes) {
    const mexivel = !e.concluida && e.pipelineItemId !== null && e.dataLegal > p.hoje;
    if (!mexivel) continue;
    const datas = p.datasDe(e.competencia);
    if (!atendem.has(e.companyId) || !datas) {
      remover.push(e);
      continue;
    }
    if (datas.dataLegal !== e.dataLegal || datas.prazoInterno !== e.prazoInterno) reprogramar.push({ existente: e, datas });
  }

  return { criar, remover, reprogramar };
}
