// As regras da Gestão — o painel que veio do protótipo 41-gestao (29/09/2026).
//
// O 41-gestao juntava "processos" de três fontes num ciclo de quatro colunas.
// No Connect, decidido pelo Kauan em 29/09, o "processo" de cada setor é:
//
// - Societário: o processo (`Process`);
// - BPO: a pendência com o cliente (`ClientRequest`);
// - os demais setores: o card do quadro de tarefas (`PipelineItem`);
// - e, atravessando setores, a transferência (`HandoffSector`).
//
// Tudo vira um `ItemDeTrabalho` com o mesmo formato, e este arquivo — puro —
// decide a coluna, se está parado e se o prazo pede atenção. É a mesma regra
// para o painel, para a carga de cada coordenador e para os alertas: três
// telas, uma conta.

export type Origem = "PROCESSO" | "CARD" | "PENDENCIA" | "TRANSFERENCIA";

/**
 * O estado do item, já traduzido da origem:
 * - `NAO_INICIADO`: ninguém começou (card em coluna "não iniciado", processo sem etapa andando, transferência nova);
 * - `ANDAMENTO`: alguém está trabalhando;
 * - `ESPERANDO_ORGAO`: protocolado, depende do órgão — parado só depois de bem mais tempo;
 * - `ESPERANDO_CLIENTE` e `PAUSADO`: parado de propósito, com motivo — conta como parado, mas não gera alerta;
 * - `CONCLUIDO`.
 */
export type Estado = "NAO_INICIADO" | "ANDAMENTO" | "ESPERANDO_ORGAO" | "ESPERANDO_CLIENTE" | "PAUSADO" | "CONCLUIDO";

export type Coluna = "INICIADO" | "ANDAMENTO" | "PARADO" | "CONCLUIDO";

export type ItemDeTrabalho = {
  origem: Origem;
  id: string;
  titulo: string;
  /** Código do setor que responde pelo item. */
  setor: string;
  /** Quem responde — vazio quando ninguém foi designado. */
  responsaveis: string[];
  estado: Estado;
  ultimaMovimentacao: Date;
  prazo: Date | null;
  concluidoEm: Date | null;
  href: string;
};

export type Limites = { diasParado: number; diasAvisoPrazo: number };

export const LIMITES_PADRAO: Limites = { diasParado: 10, diasAvisoPrazo: 3 };
/** Esperando o órgão: a Junta demora; parado só depois disso (mesma regra da varredura do Societário). */
export const DIAS_PARADO_ESPERANDO_ORGAO = 30;

const DIA = 24 * 60 * 60 * 1000;
const diasEntre = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DIA);

export type Classificacao = {
  coluna: Coluna;
  /** Dias sem movimentação, quando passou do limite. */
  parado: number | null;
  /** Parado de propósito (esperando cliente, pausado) — aparece, mas não alerta. */
  paradoDeProposito: boolean;
  prazo: { situacao: "VENCIDO" | "VENCENDO"; dias: number } | null;
};

export function classificar(item: ItemDeTrabalho, limites: Limites, agora: Date): Classificacao {
  if (item.estado === "CONCLUIDO") return { coluna: "CONCLUIDO", parado: null, paradoDeProposito: false, prazo: null };

  const deProposito = item.estado === "ESPERANDO_CLIENTE" || item.estado === "PAUSADO";
  // Não iniciado não "para": é fila. Em 29/09 o BPO tinha 126 cards nessa
  // coluna, quase todos sem responsável — contar como parado viraria cento e
  // tantos alertas de backlog. Ele só alerta pelo prazo.
  const podeParar = item.estado === "ANDAMENTO" || item.estado === "ESPERANDO_ORGAO";
  const limiteDoItem =
    item.estado === "ESPERANDO_ORGAO" ? Math.max(limites.diasParado, DIAS_PARADO_ESPERANDO_ORGAO) : limites.diasParado;
  const semMexer = diasEntre(item.ultimaMovimentacao, agora);
  const parado = podeParar && semMexer >= limiteDoItem ? semMexer : null;

  let prazo: Classificacao["prazo"] = null;
  if (item.prazo) {
    const dias = diasEntre(agora, item.prazo);
    if (dias < 0) prazo = { situacao: "VENCIDO", dias: -dias };
    else if (dias <= limites.diasAvisoPrazo) prazo = { situacao: "VENCENDO", dias };
  }

  const coluna: Coluna =
    deProposito || parado !== null ? "PARADO" : item.estado === "NAO_INICIADO" ? "INICIADO" : "ANDAMENTO";
  return { coluna, parado, paradoDeProposito: deProposito, prazo };
}

/** Os limites de um setor: o que ele configurou, senão o padrão. Valor fora da faixa cai no padrão. */
export function limitesDoSetor(config: { alertStalledDays: number | null; alertDueSoonDays: number | null } | undefined): Limites {
  const ok = (n: number | null | undefined, max: number) => (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max ? n : null);
  return {
    diasParado: ok(config?.alertStalledDays, 365) ?? LIMITES_PADRAO.diasParado,
    diasAvisoPrazo: ok(config?.alertDueSoonDays, 90) ?? LIMITES_PADRAO.diasAvisoPrazo,
  };
}

// ─── Quem vê o quê ───────────────────────────────────────────────────────────

/**
 * O recorte da Gestão (decisão de 29/09): diretoria e administradores veem
 * todos os setores; cada coordenador vê os próprios. Quem é do setor Gestão
 * conta como diretoria. Os demais não entram.
 */
export function recorteDaGestao(ctx: { role: string; sectors: string[] }): "todos" | string[] | null {
  if (ctx.role === "SUPER_ADMIN" || ctx.role === "ADMIN" || ctx.role === "READONLY") return "todos";
  if (ctx.sectors.includes("gestao")) return "todos";
  if (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0) return ctx.sectors;
  return null;
}

export function podeVerSetor(recorte: "todos" | string[], setor: string): boolean {
  return recorte === "todos" || recorte.includes(setor);
}

// ─── Carga por pessoa ────────────────────────────────────────────────────────

export type CargaDaPessoa = {
  userId: string;
  abertos: number;
  porOrigem: Record<Origem, number>;
  parados: number;
  vencidos: number;
  vencendo: number;
  itens: { item: ItemDeTrabalho; c: Classificacao }[];
};

/** A carga de cada pessoa sobre os itens em aberto. Item com dois responsáveis conta para os dois. */
export function cargaPorPessoa(itens: { item: ItemDeTrabalho; c: Classificacao }[]): Map<string, CargaDaPessoa> {
  const mapa = new Map<string, CargaDaPessoa>();
  for (const x of itens) {
    if (x.c.coluna === "CONCLUIDO") continue;
    for (const userId of x.item.responsaveis) {
      let carga = mapa.get(userId);
      if (!carga) {
        carga = {
          userId,
          abertos: 0,
          porOrigem: { PROCESSO: 0, CARD: 0, PENDENCIA: 0, TRANSFERENCIA: 0 },
          parados: 0,
          vencidos: 0,
          vencendo: 0,
          itens: [],
        };
        mapa.set(userId, carga);
      }
      carga.abertos++;
      carga.porOrigem[x.item.origem]++;
      if (x.c.coluna === "PARADO") carga.parados++;
      if (x.c.prazo?.situacao === "VENCIDO") carga.vencidos++;
      if (x.c.prazo?.situacao === "VENCENDO") carga.vencendo++;
      carga.itens.push(x);
    }
  }
  return mapa;
}

/** O que pede atenção primeiro: prazo vencido, depois parado, depois vencendo; dentro de cada um, o mais antigo. */
export function ordemDeAtencao(a: { c: Classificacao }, b: { c: Classificacao }): number {
  const peso = (c: Classificacao) => (c.prazo?.situacao === "VENCIDO" ? 0 : c.parado !== null ? 1 : c.prazo ? 2 : c.coluna === "PARADO" ? 3 : 4);
  const intensidade = (c: Classificacao) => c.prazo?.dias ?? c.parado ?? 0;
  return peso(a.c) - peso(b.c) || intensidade(b.c) - intensidade(a.c);
}

export function precisaDeAtencao(c: Classificacao): boolean {
  return c.prazo !== null || c.parado !== null;
}
