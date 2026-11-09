// A decisão do motor NEO para uma transação, sem banco (porte de `src/domain/neo/engine.py`).
//
// O servidor (`servidor/neo.ts`) carrega as regras, as contrapartes e as pendências, chama `decidir`
// para cada transação e grava o que sai daqui. A ordem de decisão é a do original:
// 1. valor não confiável → quarentena (`sem_regra` com estratégia `valor_suspeito`);
// 2. regra (exato > substring > todas as palavras; agência antes da global; histórico mais longo);
// 3. sem regra, a contraparte: CPF/CNPJ impresso no histórico, depois o nome — recusando ambiguidade;
// 4. nada disso → `sem_regra`, com o quase-acerto recusado no motivo.
//
// Notas fiscais e comprovantes (a primeira evidência do original) chegam com o Bloco C; até lá a
// resolução começa pelo documento no histórico, que é o mesmo caminho do original quando não há nota
// nem comprovante candidato.

import type { Dec } from "./decimal";
import { casarPorNome, nucleoDoNome, type CandidataPorNome } from "./contrapartePorNome";
import { documentosNoHistorico } from "./documentoNoHistorico";
import {
  desambiguarTiposPorDocumento,
  encontrarRegra,
  ESTRATEGIA_VALOR_SUSPEITO,
  gerarHistoricoSugerido,
  motivoParaNaoContabilizar,
  type Dc,
  type Estrategia,
  type RegraDoMotor,
} from "./regras";
import { normalizarHistoricoContabil } from "./texto";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { ordenados } from "./unicodePy";

export type TransacaoDoNeo = {
  readonly id: string;
  readonly agenciaId: string;
  readonly historico: string;
  readonly dc: Dc;
  readonly valor: Dec;
};

export type RegraDoNeo = RegraDoMotor & {
  readonly contaId: string;
  readonly descricao: string;
  readonly manterHistorico: boolean;
  readonly tipo: string;
};

export type ContraparteDoNeo = {
  readonly id: string;
  readonly documento: string;
  readonly tipo: string;
  readonly origem: string;
  readonly razaoSocial: string;
  readonly nomeFantasia: string | null;
  readonly contaContabilId: string;
};

export type OrigemEvidencia = "historico" | "nome";

/** O que a contraparte sugere quando uma regra já classificou (medição paralela, nunca aplicada). */
export type Sombra = {
  contraparteId: string;
  origemEvidencia: OrigemEvidencia;
  contaContraparteId: string;
  contaDivergente: boolean;
};

/** As partidas de um lançamento: a classificação e a contrapartida bancária. */
export type Partidas = { contaId: string; descricao: string; historico: string; dc: Dc; tipoRegra: string };

export type Decisao =
  | { tipo: "valor_suspeito"; motivo: string }
  | { tipo: "regra"; regra: RegraDoNeo; estrategia: Estrategia; partidas: Partidas; motivo: string; sombra: Sombra | null }
  | { tipo: "contraparte"; contraparte: ContraparteDoNeo; origemEvidencia: OrigemEvidencia; partidas: Partidas; motivo: string }
  | { tipo: "sem_regra"; motivo: string; recusa: string | null };

export type ContextoDoNeo = {
  /** Regras automáticas e ativas, já na ordem de `ordenarRegras`. */
  readonly regras: readonly RegraDoNeo[];
  /** Contrapartes ativas e vivas da empresa. */
  readonly contrapartes: readonly ContraparteDoNeo[];
  /** CNPJ da própria empresa: aparece em transferência entre contas próprias e nunca é contraparte. */
  readonly cnpjDaEmpresa: string | null;
  /** Forma canônica do histórico de cada regra, guardada entre transações. */
  readonly formaDeMatch?: (regra: RegraDoNeo) => string;
};

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\P{Nd}/gu, "");

function porDocumento(ctx: ContextoDoNeo, documento: string, dc: Dc): ContraparteDoNeo | null {
  const candidatas = desambiguarTiposPorDocumento(
    ctx.contrapartes.filter((c) => c.documento === documento),
    dc,
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}

type Resolucao = { contraparte: ContraparteDoNeo; origem: OrigemEvidencia } | { recusa: string } | null;

/**
 * O CPF/CNPJ que o banco imprimiu na linha. O da própria empresa é descartado, e documentos de duas
 * contrapartes diferentes na mesma linha ("LIQUIDACAO BOLETO SICREDI <cnpj do banco> <cnpj do
 * cedente>") recusam: escolher um seria adivinhar.
 */
function noHistorico(ctx: ContextoDoNeo, t: TransacaoDoNeo): Resolucao {
  const documentos = documentosNoHistorico(t.historico);
  if (!documentos.length) return null;
  const proprio = soDigitos(ctx.cnpjDaEmpresa);
  const achadas = new Map<string, ContraparteDoNeo>();
  for (const d of documentos) {
    if (proprio && d === proprio) continue;
    const c = porDocumento(ctx, d, t.dc);
    if (c) achadas.set(c.id, c);
  }
  if (!achadas.size) return null;
  if (achadas.size > 1) {
    const nomes = ordenados([...achadas.values()].map((c) => c.razaoSocial)).slice(0, 3).join(", ");
    return { recusa: `O histórico traz documentos de mais de uma contraparte cadastrada (${nomes}). Classifique manualmente.` };
  }
  return { contraparte: achadas.values().next().value!, origem: "historico" };
}

/** Razão social ou nome fantasia no histórico, recusando empate entre cadastros. */
function peloNome(ctx: ContextoDoNeo, t: TransacaoDoNeo): Resolucao {
  const contrapartes = desambiguarTiposPorDocumento(ctx.contrapartes, t.dc);
  if (!contrapartes.length) return null;
  const candidatas: CandidataPorNome<string>[] = [];
  const porId = new Map<string, ContraparteDoNeo>();
  for (const c of contrapartes) {
    porId.set(c.id, c);
    for (const nome of [c.razaoSocial, c.nomeFantasia]) {
      const nucleo = nucleoDoNome(nome);
      if (nucleo) candidatas.push({ contraparteId: c.id, nucleo });
    }
  }
  const { achada, motivo } = casarPorNome(t.historico ?? "", candidatas);
  if (!achada) return motivo ? { recusa: motivo } : null;
  return { contraparte: porId.get(achada.contraparteId)!, origem: "nome" };
}

/** Documento antes de nome: o CNPJ bate ou não bate; o nome depende de como o banco escreveu. */
function resolverContraparte(ctx: ContextoDoNeo, t: TransacaoDoNeo): { achada: Exclude<Resolucao, { recusa: string } | null> | null; recusa: string | null } {
  let recusa: string | null = null;
  for (const via of [noHistorico, peloNome]) {
    const r = via(ctx, t);
    if (r && "recusa" in r) {
      // A última recusa é a que fica, como no original (o dicionário é sobrescrito).
      recusa = r.recusa;
      continue;
    }
    if (r) return { achada: r, recusa };
  }
  return { achada: null, recusa };
}

/** A decisão do NEO para uma transação pendente. */
export function decidir(t: TransacaoDoNeo, ctx: ContextoDoNeo): Decisao {
  const bloqueio = motivoParaNaoContabilizar({ historico: t.historico, valor: t.valor });
  if (bloqueio !== null) return { tipo: "valor_suspeito", motivo: corta(bloqueio, 500) };

  const casou = encontrarRegra(t, ctx.regras, ctx.formaDeMatch);
  if (casou) {
    const { regra, estrategia } = casou;
    const historico = regra.manterHistorico ? t.historico : regra.descricao;
    const r = resolverContraparte(ctx, t).achada;
    const sombra: Sombra | null = r
      ? {
          contraparteId: r.contraparte.id,
          origemEvidencia: r.origem,
          contaContraparteId: r.contraparte.contaContabilId,
          contaDivergente: r.contraparte.contaContabilId !== regra.contaId,
        }
      : null;
    return {
      tipo: "regra",
      regra,
      estrategia,
      partidas: { contaId: regra.contaId, descricao: regra.descricao, historico, dc: regra.dc, tipoRegra: regra.tipo },
      motivo: `Regra '${regra.historico}' (${estrategia})`,
      sombra,
    };
  }

  const { achada, recusa } = resolverContraparte(ctx, t);
  if (achada) {
    const c = achada.contraparte;
    return {
      tipo: "contraparte",
      contraparte: c,
      origemEvidencia: achada.origem,
      partidas: {
        contaId: c.contaContabilId,
        descricao: c.razaoSocial,
        historico: gerarHistoricoSugerido(t.dc, c.razaoSocial, null),
        dc: t.dc,
        tipoRegra: "contraparte",
      },
      motivo: `Contraparte '${c.razaoSocial}' identificada via ${achada.origem} (documento ${c.documento})`,
    };
  }

  let motivo = `Nenhuma regra encontrada para '${t.historico}' (dc=${t.dc})`;
  if (recusa) motivo = `${motivo}. ${recusa}`;
  return { tipo: "sem_regra", motivo: corta(motivo, 500), recusa };
}

export const ESTRATEGIA_QUARENTENA = ESTRATEGIA_VALOR_SUSPEITO;

/** As duas pernas que `_registrar_partidas` grava: a classificação e a contrapartida no banco. */
export function pernas(p: Partidas, contaBancariaId: string, historicoExtrato: string) {
  const comum = { historico: corta(normalizarHistoricoContabil(p.historico), 500), historicoExtrato, tipoRegra: p.tipoRegra };
  return [
    { ...comum, contaId: p.contaId, descricao: corta(normalizarHistoricoContabil(p.descricao), 500), dc: p.dc },
    {
      ...comum,
      contaId: contaBancariaId,
      descricao: corta(normalizarHistoricoContabil(`Contrapartida bancária: ${p.descricao}`), 500),
      dc: (p.dc === "D" ? "C" : "D") as Dc,
    },
  ];
}

/** Código da conta sintética que o motor cria para agência sem conta contábil (`1.1.B.<hex16>`). */
export function codigoContaSintetica(agenciaId: string): string {
  return `1.1.B.${agenciaId.replace(/-/g, "").slice(0, 16)}`;
}

/** O histórico da classificação manual: o digitado ou, com `manterHistorico`, a linha do banco. */
export function historicoManual(t: { historico: string }, descricao: string | null, manterHistorico: boolean): string | null {
  const h = manterHistorico ? t.historico : descricao;
  return h && h.trim() ? h : null;
}
