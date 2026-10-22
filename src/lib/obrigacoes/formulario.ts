// O formulário do modelo de obrigação (22/10/2026), lido num lugar só: a prévia
// e o salvar leem o mesmo FormData e não podem discordar do que a regra é.
// Puro, sem banco.

import type { Ajuste, Periodicidade, RegraDeData } from "./calendario";
import type { FiltroSimNao, RegraDeAplicacao } from "./regra";

export const REGIMES_DO_FILTRO = [
  "SIMPLES_NACIONAL",
  "MEI",
  "LUCRO_PRESUMIDO",
  "LUCRO_REAL",
  "IMUNE_ISENTA",
  "PRODUTOR_RURAL",
  "DOMESTICA",
] as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type DadosDoModelo = {
  nome: string;
  descricao: string | null;
  pipelineId: string;
  datas: RegraDeData;
  aplicacao: RegraDeAplicacao;
};

const PERIODICIDADES: readonly Periodicidade[] = ["MENSAL", "TRIMESTRAL", "ANUAL"];
const FILTROS: readonly FiltroSimNao[] = ["QUALQUER", "SIM", "NAO"];

function texto(form: FormData, campo: string): string {
  const v = form.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

function inteiro(form: FormData, campo: string): number | null {
  const t = texto(form, campo);
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

/** "SP, mg ; RJ" → ["SP", "MG", "RJ"], sem repetir. */
function lista(textoLivre: string, maiuscula: boolean): string[] {
  const itens = textoLivre
    .split(/[;,\n]/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((s) => (maiuscula ? s.toUpperCase() : s));
  return [...new Set(itens)];
}

/**
 * Lê e valida. A regra de aplicação nunca falha (filtro inválido vira
 * "qualquer"); as datas e o destino, sim — sem eles não há o que gerar.
 * `exigirBasico: false` é a prévia, que roda antes de o nome estar preenchido.
 */
export function lerModeloDoForm(form: FormData, exigirBasico = true): { dados: DadosDoModelo } | { error: string } {
  const nome = texto(form, "nome").slice(0, 160);
  const pipelineId = texto(form, "pipelineId");
  if (exigirBasico && !nome) return { error: "O nome da obrigação é obrigatório." };
  if (exigirBasico && !pipelineId) return { error: "Escolha o kanban onde as atividades nascem." };

  const periodicidadeBruta = texto(form, "periodicidade") as Periodicidade;
  const periodicidade = PERIODICIDADES.includes(periodicidadeBruta) ? periodicidadeBruta : "MENSAL";

  const meses = inteiro(form, "mesesAposCompetencia");
  if (meses === null || meses > 24) return { error: "O mês do vencimento precisa estar entre 0 e 24 meses depois da competência." };

  const ultimoDiaUtil = texto(form, "tipoDoDia") === "ULTIMO_DIA_UTIL";
  let diaLegal: number | null = null;
  if (!ultimoDiaUtil) {
    diaLegal = inteiro(form, "diaLegal");
    if (diaLegal === null || diaLegal < 1 || diaLegal > 31) return { error: "O dia legal precisa estar entre 1 e 31 (ou escolha o último dia útil)." };
  }

  const diasUteisAntes = inteiro(form, "diasUteisAntes") ?? 0;
  if (diasUteisAntes > 30) return { error: "O prazo interno vai até 30 dias úteis antes da data legal." };

  const ajuste: Ajuste = texto(form, "ajuste") === "ANTECIPAR" ? "ANTECIPAR" : "ADIAR";
  const filtro = (campo: string): FiltroSimNao => {
    const v = texto(form, campo) as FiltroSimNao;
    return FILTROS.includes(v) ? v : "QUALQUER";
  };

  const regimes = form
    .getAll("regimes")
    .filter((v): v is string => typeof v === "string")
    .filter((v) => (REGIMES_DO_FILTRO as readonly string[]).includes(v));
  const estados = lista(texto(form, "estados"), true);
  // UF errada não pode sumir em silêncio: o filtro ficaria vazio e a regra
  // passaria a valer para o país inteiro.
  const invalida = estados.find((uf) => !(UFS as readonly string[]).includes(uf));
  if (invalida) return { error: `"${invalida}" não é uma UF. Use as siglas, separadas por vírgula: SP, MG.` };

  return {
    dados: {
      nome,
      descricao: texto(form, "descricao") || null,
      pipelineId,
      datas: { periodicidade, mesesAposCompetencia: meses, diaLegal, diasUteisAntes, ajuste },
      aplicacao: {
        regimes: [...new Set(regimes)],
        semMovimento: filtro("semMovimento"),
        comFuncionarios: filtro("comFuncionarios"),
        estados,
        cidades: lista(texto(form, "cidades"), false),
        exigeSetorContratado: form.get("exigeSetorContratado") === "on",
      },
    },
  };
}
