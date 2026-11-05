// O que o portal mostra, a partir das fotos publicadas (05/11/2026). Era lido ao
// vivo dos lançamentos e dos imports (`doCliente.ts`, que segue sendo a régua
// do cálculo: a foto guarda os totais que aqueles loaders dão).
//
// Regra pura: quem chama lê as publicações da empresa (`publicacoesDaEmpresa`)
// e passa aqui.

import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { dreDoAno, type DreAnual } from "@/lib/dre/anual";
import { mesDoAnoDaFoto, opcoesDaFoto, resultadoDaFoto, type FotoDaDre, type Regime } from "@/lib/dre/publicacao";
import { partesDaCompetencia, somarMeses } from "@/lib/financeiro/periodo";

/** Uma foto publicada, como o banco devolve. */
export type Publicacao = {
  competencia: string;
  foto: FotoDaDre;
  inicial: boolean;
  publicadoEm: Date;
  publicadoPorNome: string | null;
};

export type LeituraDoCliente =
  | {
      tipo: "mes";
      mes: string;
      /** `null`: a equipe ainda não publicou este mês. */
      publicada: {
        resultado: ResultadoDoDre;
        temMovimento: boolean;
        /** O mês anterior publicado, quando teve movimento no regime. */
        anterior: ResultadoDoDre | null;
        atualizadaEm: Date;
      } | null;
    }
  | {
      tipo: "ano";
      ano: number;
      /** Os doze meses, montados das fotos do ano; `null` sem nenhum mês publicado com movimento. */
      anual: DreAnual | null;
      /** A publicação mais recente entre as do ano. */
      atualizadaEm: Date | null;
    }
  /** Nenhum mês publicado com movimento: a DRE ainda não chegou ao cliente. */
  | { tipo: "nenhum" };

/**
 * O mês mais recente que o cliente pode ver — o padrão do filtro do portal.
 * Era o mais recente com movimento ao vivo; agora, o mais recente publicado.
 */
export function mesMaisRecentePublicado(publicacoes: Iterable<Publicacao>, regime: Regime): string | null {
  let recente: string | null = null;
  for (const p of publicacoes) {
    if (!p.foto[regime].temMovimento && !p.foto.caixa.temMovimento) continue;
    if (!recente || p.competencia > recente) recente = p.competencia;
  }
  return recente;
}

export function lerDreDoCliente(
  publicacoes: ReadonlyMap<string, Publicacao>,
  pedido: { mes?: string | null; ano?: number | null },
  regime: Regime
): LeituraDoCliente {
  if (pedido.ano) {
    const doAno = [...publicacoes.values()].filter((p) => p.competencia.startsWith(`${pedido.ano}-`));
    const comMovimento = doAno.filter((p) => p.foto[regime].temMovimento);
    if (comMovimento.length === 0) return { tipo: "ano", ano: pedido.ano, anual: null, atualizadaEm: null };
    // As linhas do ano são as do modelo da foto mais recente: um ano que
    // atravessou uma troca de modelo mostra o de agora, como a tela da equipe.
    const recente = comMovimento.reduce((a, b) => (b.competencia > a.competencia ? b : a));
    const anual = dreDoAno(
      comMovimento.map((p) => mesDoAnoDaFoto(p.foto, regime, partesDaCompetencia(p.competencia).mes)),
      opcoesDaFoto(recente.foto)
    );
    const atualizadaEm = doAno.reduce<Date | null>((m, p) => (!m || p.publicadoEm > m ? p.publicadoEm : m), null);
    return { tipo: "ano", ano: pedido.ano, anual, atualizadaEm };
  }

  const mes = pedido.mes ?? mesMaisRecentePublicado(publicacoes.values(), regime);
  if (!mes) return { tipo: "nenhum" };
  const p = publicacoes.get(mes);
  if (!p) return { tipo: "mes", mes, publicada: null };
  const doAnterior = publicacoes.get(somarMeses(mes, -1));
  return {
    tipo: "mes",
    mes,
    publicada: {
      resultado: resultadoDaFoto(p.foto, regime),
      temMovimento: p.foto[regime].temMovimento,
      anterior: doAnterior && doAnterior.foto[regime].temMovimento ? resultadoDaFoto(doAnterior.foto, regime) : null,
      atualizadaEm: p.publicadoEm,
    },
  };
}
