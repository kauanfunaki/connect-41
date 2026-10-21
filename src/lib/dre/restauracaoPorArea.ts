// Refazer a classificação de uma empresa ao trocar o modelo do DRE (21/10/2026).
//
// ─── Por que precisa ────────────────────────────────────────────────────────
//
// A classificação é gravada em código de grupo — na categoria, na exceção da
// empresa. O mesmo código não quer dizer a mesma coisa em todo modelo, e a
// migration de 20/10/2026 (`20261020230000_dre_padrao_cargo`) juntou grupos do
// modelo por área: CMV, mão de obra e comerciais viraram custo operacional, e
// assim por diante. Voltar ao modelo por área pede saber, para cada categoria,
// em qual dos grupos antigos ela estava — o banco não guarda mais.
//
// ─── De onde sai a resposta ─────────────────────────────────────────────────
//
// Para cada categoria, os grupos antigos que a migration transformaria no
// grupo de hoje são os **candidatos** (custo operacional → CMV, mão de obra ou
// comerciais). Um candidato só é escolhido com evidência, nesta ordem:
//
// 1. **O histórico** — a auditoria guarda cada classificação feita na DRE, no
//    plano da empresa, no plano do escritório e nas correções, com o código
//    gravado. É o que a pessoa escolheu, inclusive o que fugiu do padrão.
// 2. **O nome** — no de-para do Omie e no plano padrão daquela época
//    (`deParaPorArea.ts`), que é de onde a categoria tirou o grupo quando
//    nasceu. Categoria da empresa olha o de-para primeiro; a do escritório, o
//    plano.
// 3. **O único** — grupo de hoje que veio de um antigo só (receita bruta,
//    impostos, outras receitas).
//
// Evidência que não está entre os candidatos não vale: é classificação de
// outra época, já trocada. Sem evidência, a categoria fica **sem grupo** no
// modelo por área e aparece em "Classificar" — escolher um dos três seria
// inventar, e um valor no grupo errado sai no relatório como se estivesse
// certo. A exceção é o código que o modelo por área também tem ("outras
// despesas"): sem evidência de que era investimento, fica onde a tela já o lê.
//
// O plano é puro; a ação (`src/app/(app)/dre/actions.ts`) lê o banco e grava.

import { chaveDaCategoria } from "./calculo";
import { grupoDeTexto } from "./mapeamento";
import { GRUPO_DO_ANTIGO, MODELO_PADRAO, type CodigoDoModelo, type ModeloDoDre } from "./estrutura";
import { MODELO_POR_AREA } from "./estruturaPorArea";
import { DE_PARA_POR_AREA, PLANO_POR_AREA } from "./deParaPorArea";

export type CategoriaParaTrocar = {
  id: string;
  nome: string;
  kind: "PAGAR" | "RECEBER";
  /** Do plano da própria empresa — e não do padrão do escritório. */
  daEmpresa: boolean;
  dreGroup: string | null;
  /** A exceção desta empresa para a categoria, quando há. */
  excecao: string | null;
};

/** Os códigos que o histórico gravou para cada categoria, do mais novo para o mais velho. */
export type HistoricoDasCategorias = ReadonlyMap<string, readonly string[]>;

export type FonteDaTroca = "historico" | "de_para" | "plano" | "unico" | "mesmo_codigo";

/** Onde a troca grava: a exceção da empresa, ou a linha da própria categoria da empresa. */
export type Gravacao =
  | { tipo: "excecao"; categoryId: string; grupo: string }
  | { tipo: "remover_excecao"; categoryId: string }
  | { tipo: "categoria"; categoryId: string; grupo: string };

export type PlanoDaTroca = {
  de: CodigoDoModelo;
  para: CodigoDoModelo;
  gravacoes: Gravacao[];
  /** As categorias que tinham grupo e ficam sem no modelo novo — vão para "Classificar". */
  semGrupo: { categoryId: string; nome: string }[];
  /** Quantas categorias saíram de cada evidência (só na ida para o modelo por área). */
  porFonte: Record<FonteDaTroca, number>;
  /** O grupo de cada categoria no modelo novo — vai para a auditoria e serve de histórico na próxima troca. */
  classificacao: Record<string, string>;
};

// ─── Os candidatos: o que a migration de 20/10 transformou no grupo de hoje ──

const GRUPOS_POR_AREA = new Set(MODELO_POR_AREA.grupos.map((g) => g.code));

/** Grupo do padrão → os grupos do modelo por área que a migration levou para ele. */
export const PREIMAGEM_DO_PADRAO: Readonly<Record<string, readonly string[]>> = (() => {
  const p: Record<string, string[]> = {};
  for (const g of MODELO_PADRAO.grupos) p[g.code] = GRUPOS_POR_AREA.has(g.code) ? [g.code] : [];
  for (const [antigo, novo] of Object.entries(GRUPO_DO_ANTIGO)) p[novo]!.push(antigo);
  // A migration levou sete categorias do plano do escritório para
  // financiamentos: Impostos Parcelados (de impostos) e as de empréstimo e
  // consórcio (de outras despesas).
  p.financiamentos = ["impostos", "outras_despesas"];
  return p;
})();

/** O grupo do padrão que o texto é — código ou rótulo, sem o de-para do padrão antigo. */
function grupoDoPadraoSemAlias(texto: string): string | null {
  const chave = chaveDaCategoria(texto);
  return MODELO_PADRAO.grupos.find((g) => chaveDaCategoria(g.code) === chave || chaveDaCategoria(g.label) === chave)?.code ?? null;
}

const DO_DE_PARA = new Map(DE_PARA_POR_AREA.map((p) => [chaveDaCategoria(p.categoria), p.grupo]));
const DO_PLANO = new Map(PLANO_POR_AREA.map((p) => [`${p.kind}|${chaveDaCategoria(p.nome)}`, p.grupo]));

/** O que a tela leria no modelo sem gravar nada — a mesma precedência de `resolverCategorias`. */
function semGravar(c: CategoriaParaTrocar, modelo: ModeloDoDre): string | null {
  return (c.excecao ? grupoDeTexto(c.excecao, modelo) : null) ?? grupoDeTexto(c.dreGroup, modelo);
}

function planoVazio(de: CodigoDoModelo, para: CodigoDoModelo): PlanoDaTroca {
  return {
    de,
    para,
    gravacoes: [],
    semGrupo: [],
    porFonte: { historico: 0, de_para: 0, plano: 0, unico: 0, mesmo_codigo: 0 },
    classificacao: {},
  };
}

/** A gravação que faz a tela ler o grupo para a categoria. */
function gravacaoPara(c: CategoriaParaTrocar, grupo: string): Gravacao {
  // Na categoria da empresa sem exceção, a linha é a dela; senão, a exceção da
  // empresa — a mesma regra da tela "Linha da DRE nesta empresa".
  return c.daEmpresa && c.excecao === null ? { tipo: "categoria", categoryId: c.id, grupo } : { tipo: "excecao", categoryId: c.id, grupo };
}

/**
 * O plano da troca de modelo de uma empresa: o que gravar, de onde saiu cada
 * grupo e o que fica para classificar.
 */
export function planejarTrocaDeModelo(
  categorias: CategoriaParaTrocar[],
  historico: HistoricoDasCategorias,
  de: ModeloDoDre,
  para: ModeloDoDre
): PlanoDaTroca {
  if (de.codigo === para.codigo) return planoVazio(de.codigo, para.codigo);
  return para.codigo === "por_area" ? paraOPorArea(categorias, historico, de) : paraOPadrao(categorias, de);
}

function paraOPorArea(categorias: CategoriaParaTrocar[], historico: HistoricoDasCategorias, de: ModeloDoDre): PlanoDaTroca {
  const plano = planoVazio(de.codigo, "por_area");
  for (const c of categorias) {
    const atual = c.excecao ?? c.dreGroup;
    if (!atual) continue;
    const lido = semGravar(c, MODELO_POR_AREA);

    // Texto que não é grupo do padrão — o código ou o rótulo do próprio modelo
    // por área, ou transferência e desconsiderar: a tela já lê certo.
    const doPadrao = grupoDoPadraoSemAlias(atual);
    if (doPadrao === null) {
      if (lido) plano.classificacao[c.id] = lido;
      continue;
    }

    const candidatos = PREIMAGEM_DO_PADRAO[doPadrao] ?? [];
    let destino: string | null = null;
    let fonte: FonteDaTroca | null = null;
    if (candidatos.length === 1) {
      destino = candidatos[0]!;
      fonte = "unico";
    } else {
      const doHistorico = (historico.get(c.id) ?? [])
        .map((h) => grupoDeTexto(h, MODELO_POR_AREA))
        .find((g): g is string => g !== null && candidatos.includes(g));
      if (doHistorico) {
        destino = doHistorico;
        fonte = "historico";
      } else {
        const peloDePara: [FonteDaTroca, string | undefined] = ["de_para", DO_DE_PARA.get(chaveDaCategoria(c.nome))];
        const peloPlano: [FonteDaTroca, string | undefined] = ["plano", DO_PLANO.get(`${c.kind}|${chaveDaCategoria(c.nome)}`)];
        const ordem = c.daEmpresa ? [peloDePara, peloPlano] : [peloPlano, peloDePara];
        const achado = ordem.find(([, g]) => g !== undefined && candidatos.includes(g));
        if (achado) {
          destino = achado[1]!;
          fonte = achado[0];
        } else if (lido && candidatos.includes(lido)) {
          // "outras_despesas" existe nos dois modelos: sem evidência de que era
          // investimento, fica onde a tela já o lê.
          destino = lido;
          fonte = "mesmo_codigo";
        }
      }
    }

    if (destino === null || fonte === null) {
      plano.semGrupo.push({ categoryId: c.id, nome: c.nome });
      continue;
    }
    plano.porFonte[fonte]++;
    plano.classificacao[c.id] = destino;
    if (lido !== destino) plano.gravacoes.push(gravacaoPara(c, destino));
  }
  return plano;
}

function paraOPadrao(categorias: CategoriaParaTrocar[], de: ModeloDoDre): PlanoDaTroca {
  const plano = planoVazio(de.codigo, "padrao");
  for (const c of categorias) {
    // O padrão lê os códigos e os rótulos do modelo por área pelo de-para da
    // migration (GRUPO_DO_ANTIGO). O que se grava aqui é a arrumação: a exceção
    // que ficou igual ao padrão do escritório sai, e o código antigo vira o
    // novo — o painel "Fora do padrão" não fica cheio do que a ida para o
    // modelo por área gravou.
    const doPlano = grupoDeTexto(c.dreGroup, MODELO_PADRAO);
    if (c.excecao !== null) {
      const novo = grupoDeTexto(c.excecao, MODELO_PADRAO);
      if (novo === null) continue;
      plano.classificacao[c.id] = novo;
      if (!c.daEmpresa && novo === doPlano) plano.gravacoes.push({ tipo: "remover_excecao", categoryId: c.id });
      else if (novo !== c.excecao) plano.gravacoes.push({ tipo: "excecao", categoryId: c.id, grupo: novo });
      continue;
    }
    if (doPlano === null) continue;
    plano.classificacao[c.id] = doPlano;
    if (c.daEmpresa && c.dreGroup !== doPlano) plano.gravacoes.push({ tipo: "categoria", categoryId: c.id, grupo: doPlano });
  }
  return plano;
}

// ─── O histórico, a partir da auditoria ──────────────────────────────────────

/** As ações da auditoria que gravam a linha da DRE de uma categoria. */
export const ACOES_DO_HISTORICO = {
  /** A fila de classificação da DRE: exceção da empresa. Na empresa; metadata {categoryId, grupo}. */
  classificacao: "dre.map",
  /** A troca de modelo: metadata {classificacao: {categoryId: grupo}}. Na empresa. */
  modelo: "dre.modelo",
  /** "Linha da DRE nesta empresa": na categoria; metadata {companyId, linha}. */
  linhaNaEmpresa: "financeiro.categoria.linha_da_dre",
  /** Categoria criada pela DRE no plano da empresa: na categoria; metadata {companyId, dreGroup}. */
  criadaNaEmpresa: "financeiro.categoria_da_empresa.criada",
  /** As correções por script (impostos retidos, pedágio): na categoria; metadata {companyId?, linhaDaDre: "de → para"}. */
  correcao: "dre.categoria.linha_corrigida",
  /** O plano do escritório: na categoria; metadata {dreGroup}. */
  criadaNoEscritorio: "financeCategory.create",
  alteradaNoEscritorio: "financeCategory.update",
} as const;

export type RegistroDaAuditoria = { action: string; entityId: string | null; metadata: unknown };

function campo(metadata: unknown, nome: string): unknown {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[nome] : undefined;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/**
 * O histórico de cada categoria nesta empresa, a partir dos registros da
 * auditoria **do mais novo para o mais velho**. Registro de outra empresa não
 * entra; o do plano do escritório entra para toda empresa — é o padrão dela.
 */
export function historicoDosRegistros(registros: RegistroDaAuditoria[], companyId: string): HistoricoDasCategorias {
  const h = new Map<string, string[]>();
  const anotar = (categoryId: string | null, codigo: string | null) => {
    if (!categoryId || !codigo) return;
    const lista = h.get(categoryId) ?? [];
    lista.push(codigo);
    h.set(categoryId, lista);
  };
  for (const r of registros) {
    const m = r.metadata;
    const daEmpresa = texto(campo(m, "companyId"));
    switch (r.action) {
      case ACOES_DO_HISTORICO.classificacao:
        if (r.entityId === companyId) anotar(texto(campo(m, "categoryId")), texto(campo(m, "grupo")));
        break;
      case ACOES_DO_HISTORICO.modelo: {
        const classificacao = campo(m, "classificacao");
        if (r.entityId === companyId && classificacao && typeof classificacao === "object") {
          for (const [categoryId, codigo] of Object.entries(classificacao as Record<string, unknown>)) anotar(categoryId, texto(codigo));
        }
        break;
      }
      case ACOES_DO_HISTORICO.linhaNaEmpresa:
        if (daEmpresa === companyId) anotar(r.entityId, texto(campo(m, "linha")));
        break;
      case ACOES_DO_HISTORICO.criadaNaEmpresa:
        if (daEmpresa === companyId) anotar(r.entityId, texto(campo(m, "dreGroup")));
        break;
      case ACOES_DO_HISTORICO.correcao: {
        if (daEmpresa && daEmpresa !== companyId) break;
        // "Impostos sobre Receita Bruta → CMV sobre Receita Bruta": o destino é
        // o rótulo depois da seta.
        const linha = texto(campo(m, "linhaDaDre"));
        anotar(r.entityId, linha?.split("→").at(-1)?.trim() ?? null);
        break;
      }
      case ACOES_DO_HISTORICO.criadaNoEscritorio:
      case ACOES_DO_HISTORICO.alteradaNoEscritorio:
        anotar(r.entityId, texto(campo(m, "dreGroup")));
        break;
    }
  }
  return h;
}
