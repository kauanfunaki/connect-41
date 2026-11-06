// As listas e opções da Revisão do fechamento que a tela também usa — sem nada
// de servidor, para os componentes de cliente importarem daqui. As regras com
// banco ou assinatura ficam em `fechamento.ts`, que reexporta tudo isto.
//
// As listas são as do original (AudTool R_12, `index.html`), com o mesmo texto:
// o motor lê o regime pelo rótulo ("Não informado" gera o achado "Regime
// tributário a confirmar").

export const MODULO_DA_REVISAO = "contabil_revisao";

export const REGIMES = [
  "Não informado",
  "MEI / SIMEI",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "Lucro Arbitrado",
  "Imune",
  "Isenta",
  "Outro / especial",
] as const;

export const ENQUADRAMENTOS = [
  "A confirmar",
  "Normas completas",
  "PME",
  "Pequenas empresas",
  "Microentidades",
  "Entidade regulada",
  "Entidade sem finalidade de lucros",
  "Outro / específico",
] as const;

/** Os estados do acompanhamento de um achado, na ordem do original. */
export const ESTADOS_DO_ACHADO = ["Aberto", "Em análise", "Aguardando documento", "Ajuste proposto", "Corrigido aguardando reteste"] as const;
export type EstadoDoAchado = (typeof ESTADOS_DO_ACHADO)[number];

export const GRAVIDADES = ["Crítica", "Alta", "Média"] as const;
export const NATUREZAS = [
  "Evidência insuficiente",
  "Indício para revisão",
  "Erro aritmético",
  "Divergência entre demonstrações",
  "Divergência de apresentação",
] as const;

/** Tolerância padrão das conferências, em centavos (o motor aceita de 0 a 10.000). */
export const TOLERANCIA_PADRAO = 1;
export const TOLERANCIA_MAXIMA = 10000;

/** Teto por arquivo enviado: o do envio do Connect (o proxy corta acima de 10 MB). */
export const MB_POR_ARQUIVO = 10;
/** Os formatos que o motor lê; `.xls` entra para o aviso de enviar `.xlsx` ou CSV. */
export const ACCEPT_DA_REVISAO = ".pdf,.xlsx,.xls,.csv,.txt,.zip";

export const FINALIDADE_PADRAO = "Revisão do fechamento";

/** O regime do cadastro da empresa vira sugestão; o que não tem rótulo certo fica "Não informado". */
export function regimeSugerido(kind: string | null | undefined): (typeof REGIMES)[number] {
  switch (kind) {
    case "SIMPLES_NACIONAL":
      return "Simples Nacional";
    case "MEI":
      return "MEI / SIMEI";
    case "LUCRO_PRESUMIDO":
      return "Lucro Presumido";
    case "LUCRO_REAL":
      return "Lucro Real";
    default:
      // Imune e isenta são um valor só no cadastro, e o motor distingue: quem
      // revisa escolhe. Produtor rural e doméstica não têm fechamento contábil típico.
      return "Não informado";
  }
}

export const CAMPOS_DA_CORRECAO = ["opening", "debit", "credit", "closing"] as const;
export const ROTULO_DO_CAMPO: Record<(typeof CAMPOS_DA_CORRECAO)[number], string> = {
  opening: "Saldo inicial",
  debit: "Débitos",
  credit: "Créditos",
  closing: "Saldo final",
};
