// A publicação da DRE para o cliente (05/11/2026, decisão D4 do Kauan: "rascunho
// e publicação por empresa e mês").
//
// Até aqui toda importação ou mudança ia na hora para o portal: `/portal/dre`
// lia ao vivo os lançamentos e os imports. Agora a equipe vê e mexe ao vivo na
// DRE dela, e o portal mostra a última **foto** publicada de cada mês. A foto
// guarda, para os dois regimes, os totais por grupo e as categorias de cada
// grupo — o bastante para o portal montar o mês, a comparação com o anterior e
// os doze meses do ano com as mesmas funções da tela da equipe.
//
// Regra pura, sem Prisma: a leitura e a gravação moram em
// `publicacaoServidor.ts`.

import { montarLinhas, type DetalheDosGrupos, type ResultadoDoDre, type ValorDaCategoria } from "@/lib/dre/calculo";
import type { MesDoAno } from "@/lib/dre/anual";
import { ehCodigoDeModelo, modeloDoCodigo, opcoesDaUrl, type CodigoDoModelo, type OpcoesDoDre } from "@/lib/dre/estrutura";
import { comRotulosEconomicos } from "@/lib/dre/economica";

/** Um regime do mês na foto. */
export type RegimeNaFoto = {
  porGrupo: Record<string, number>;
  porCategoria: DetalheDosGrupos;
  /** Houve movimento? No caixa, pagamento ou recebimento; na competência, lançamento ou ajuste da cobrança. */
  temMovimento: boolean;
};

/** A DRE de uma empresa num mês, como o cliente vai ver. */
export type FotoDaDre = {
  /** O formato da foto — muda se um dia a foto precisar guardar outra coisa. */
  versao: 1;
  /** O modelo da DRE da empresa quando a foto foi tirada: as linhas são as dele. */
  modelo: CodigoDoModelo;
  caixa: RegimeNaFoto;
  competencia: RegimeNaFoto;
};

export type Regime = "caixa" | "competencia";

const VAZIO: RegimeNaFoto = { porGrupo: {}, porCategoria: {}, temMovimento: false };

/** O regime da foto a partir de um resultado calculado (o mesmo da tela da equipe). */
export function regimeDoResultado(resultado: Pick<ResultadoDoDre, "porGrupo" | "porCategoria">, temMovimento: boolean): RegimeNaFoto {
  return { porGrupo: { ...resultado.porGrupo }, porCategoria: resultado.porCategoria, temMovimento };
}

/** A foto tem algo a mostrar ao cliente em algum dos regimes. */
export function fotoTemMovimento(foto: FotoDaDre): boolean {
  return foto.caixa.temMovimento || foto.competencia.temMovimento;
}

/** As opções com que o cliente vê a foto: o padrão do modelo dela, sem `impostos=fora`. */
export function opcoesDaFoto(foto: Pick<FotoDaDre, "modelo">): OpcoesDoDre {
  return opcoesDaUrl(undefined, modeloDoCodigo(foto.modelo));
}

/**
 * O resultado de um regime da foto, pronto para o relatório: as linhas são
 * remontadas dos totais por grupo, com o modelo da foto — as mesmas que a
 * equipe via quando publicou.
 */
export function resultadoDaFoto(foto: FotoDaDre, regime: Regime): ResultadoDoDre {
  const r = foto[regime];
  const opcoes = opcoesDaFoto(foto);
  return {
    linhas: montarLinhas(r.porGrupo, opcoes),
    porGrupo: r.porGrupo,
    naoClassificado: [],
    desconsiderado: [],
    porCategoria: r.porCategoria,
    diferencaDeFechamento: 0,
    modelo: foto.modelo,
  };
}

/** A linha do mês para os doze meses do ano (`dreDoAno`). */
export function mesDoAnoDaFoto(foto: FotoDaDre, regime: Regime, mes: number): MesDoAno {
  const r = foto[regime];
  return { mes, porGrupo: r.porGrupo, temMovimento: r.temMovimento, porCategoria: r.porCategoria };
}

/**
 * Lê a foto gravada. Uma foto que não se reconhece (outra versão, JSON
 * quebrado) vira `null`: o portal mostra o mês como não publicado em vez de um
 * relatório errado.
 */
export function fotoDoJson(valor: unknown): FotoDaDre | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<FotoDaDre>;
  if (v.versao !== 1 || typeof v.modelo !== "string" || !ehCodigoDeModelo(v.modelo)) return null;
  const regime = (r: unknown): RegimeNaFoto | null => {
    if (!r || typeof r !== "object") return null;
    const x = r as Partial<RegimeNaFoto>;
    if (!x.porGrupo || typeof x.porGrupo !== "object" || typeof x.temMovimento !== "boolean") return null;
    return { porGrupo: x.porGrupo, porCategoria: x.porCategoria && typeof x.porCategoria === "object" ? x.porCategoria : {}, temMovimento: x.temMovimento };
  };
  const caixa = regime(v.caixa);
  const competencia = regime(v.competencia) ?? VAZIO;
  if (!caixa) return null;
  return { versao: 1, modelo: v.modelo, caixa, competencia };
}

// ─── Diferenças entre a foto do portal e a DRE de agora ─────────────────────

export type DiferencaDaDre =
  | {
      tipo: "linha";
      regime: Regime;
      /** O código da linha, estável entre as duas fotos. */
      codigo: string;
      rotulo: string;
      /** Centavos; `null` quando a linha não existe daquele lado (o modelo mudou). */
      noPortal: number | null;
      agora: number | null;
    }
  | {
      /** A linha soma o mesmo, mas as categorias dentro dela mudaram (uma classificação de um grupo para outro que se compensa, uma categoria renomeada). */
      tipo: "categorias";
      regime: Regime;
      grupo: string;
      rotulo: string;
    }
  | { tipo: "modelo"; noPortal: CodigoDoModelo; agora: CodigoDoModelo };

function linhasDeValor(foto: FotoDaDre, regime: Regime) {
  const resultado = resultadoDaFoto(foto, regime);
  const linhas = regime === "competencia" ? comRotulosEconomicos(resultado).linhas : resultado.linhas;
  return linhas.filter((l) => l.tipo !== "percentual");
}

function assinaturaDasCategorias(lista: ValorDaCategoria[] | undefined): string {
  return (lista ?? [])
    .map((c) => `${c.origem}:${c.categoria}:${c.centavos}`)
    .sort()
    .join("|");
}

/**
 * O que o cliente veria de diferente se a DRE de agora fosse publicada.
 * Sem foto publicada, toda linha com valor é diferença. Linha com o mesmo
 * valor dos dois lados não conta; percentual não conta (acompanha os valores).
 */
export function diferencasDaDre(publicada: FotoDaDre | null, agora: FotoDaDre): DiferencaDaDre[] {
  const base: FotoDaDre = publicada ?? { versao: 1, modelo: agora.modelo, caixa: VAZIO, competencia: VAZIO };
  const saida: DiferencaDaDre[] = [];
  if (publicada && publicada.modelo !== agora.modelo) saida.push({ tipo: "modelo", noPortal: publicada.modelo, agora: agora.modelo });

  for (const regime of ["caixa", "competencia"] as const) {
    if (!base[regime].temMovimento && !agora[regime].temMovimento) continue;
    const antes = new Map(linhasDeValor(base, regime).map((l) => [l.code, l]));
    const depois = linhasDeValor(agora, regime);
    const vistas = new Set<string>();
    for (const l of depois) {
      vistas.add(l.code);
      const a = antes.get(l.code);
      // Sem movimento naquele lado, o cliente não vê a linha: `null`, e não zero.
      const noPortal = base[regime].temMovimento ? (a?.centavos ?? 0) : null;
      const valorAgora = agora[regime].temMovimento ? (l.centavos ?? 0) : null;
      if ((noPortal ?? 0) !== (valorAgora ?? 0)) {
        saida.push({ tipo: "linha", regime, codigo: l.code, rotulo: l.label, noPortal, agora: valorAgora });
      }
    }
    // Linha que só existe na foto do portal: o modelo da DRE mudou.
    for (const [codigo, a] of antes) {
      if (vistas.has(codigo) || !a.centavos || !base[regime].temMovimento) continue;
      saida.push({ tipo: "linha", regime, codigo, rotulo: a.label, noPortal: a.centavos, agora: null });
    }

    // Categorias que trocaram de lugar sem mudar o total da linha.
    if (publicada && publicada.modelo === agora.modelo) {
      const linhasQueMudaram = new Set(saida.flatMap((d) => (d.tipo === "linha" && d.regime === regime ? [d.codigo] : [])));
      const modelo = modeloDoCodigo(agora.modelo);
      for (const g of modelo.grupos) {
        // A linha do grupo já mudou de valor: a diferença já está dita.
        const linhaDoGrupo = modelo.linhas.find((l) => l.tipo === "grupo" && l.grupo === g.code);
        if (linhaDoGrupo && linhasQueMudaram.has(linhaDoGrupo.code)) continue;
        if (assinaturaDasCategorias(base[regime].porCategoria[g.code]) !== assinaturaDasCategorias(agora[regime].porCategoria[g.code])) {
          saida.push({ tipo: "categorias", regime, grupo: g.code, rotulo: g.label });
        }
      }
    }
  }
  return saida;
}
