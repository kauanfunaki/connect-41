// As etapas de um fluxo do Repositório de fluxos (10/11/2026, pedido do Kauan).
// Puro: sem Prisma e sem servidor — a tela de cliente (o editor) e a action
// usam a mesma leitura.
//
// O setor escreve o fluxo como uma LISTA (opção B do "Como desenhar"): Início,
// etapas, decisões com o destino do Sim e do Não, voltas e Fim. O Connect
// desenha sozinho a partir dela (ver `desenho.ts`) — ninguém arrasta caixa nem
// seta. A notação é a de docs/fluxos/README.md: etapa numerada, losango de
// decisão com as duas saídas nomeadas, laço de volta e o chip de quem executa.
//
// Uma "volta" não é um tipo à parte: é uma etapa (ou o Não de uma decisão)
// cujo destino fica ANTES dela na lista. Sem destino escrito, a etapa segue
// para a seguinte da lista — o caso comum não pede nada.

import { z } from "zod";

export const TIPOS_DE_ETAPA = ["inicio", "etapa", "decisao", "fim"] as const;
export type TipoDeEtapa = (typeof TIPOS_DE_ETAPA)[number];

export const TIPOS_DE_EXECUTOR = ["pessoa", "robo", "integracao", "cliente"] as const;
export type TipoDeExecutor = (typeof TIPOS_DE_EXECUTOR)[number];

/** Quem executa: o chip da etapa. A pessoa leva o setor dela ("Pessoa · DP"). */
export type Executor = { tipo: TipoDeExecutor; setor?: string };

export type Etapa = {
  /** Curto e estável entre as versões ("e7"): é o que os destinos guardam. */
  id: string;
  tipo: TipoDeEtapa;
  titulo: string;
  executor?: Executor;
  /** Prazo da etapa, em texto livre ("Até 1 dia antes do início"). */
  prazo?: string;
  /** O que precisa para começar. */
  entra?: string;
  /** O que resulta. */
  sai?: string;
  seDerErro?: string;
  /** Endereço de uma tela do Connect onde a etapa se faz ("/admissoes"). */
  tela?: string;
  /** Início e etapa: para onde vai. Sem ele, a seguinte da lista. */
  proxima?: string;
  /** Decisão: o destino do Sim. Sem ele, a seguinte da lista. */
  sim?: string;
  /** Decisão: o destino do Não — obrigatório. */
  nao?: string;
};

export const LIMITES_DO_FLUXO = { etapas: 60, titulo: 120, texto: 300, id: 24, setor: 40, tela: 120 } as const;

export const ROTULO_DO_TIPO: Record<TipoDeEtapa, string> = { inicio: "Início", etapa: "Etapa", decisao: "Decisão", fim: "Fim" };

export const ROTULO_DO_EXECUTOR: Record<TipoDeExecutor, string> = {
  pessoa: "Pessoa",
  robo: "Robô",
  integracao: "Integração",
  cliente: "Cliente",
};

/**
 * A cor de cada executor, só com os tokens que o Connect já tem (sem cor nova):
 * cliente no tom do Societário, pessoa na marca, robô no grupo Recrutamento e
 * integração no grupo Atendimento — as mesmas do desenho escolhido. A cor vai
 * sempre num ponto ao lado do nome: o chip nunca diz só pela cor.
 */
export const COR_DO_EXECUTOR: Record<TipoDeExecutor, string> = {
  cliente: "var(--c41-sector-societario)",
  pessoa: "var(--c41-brand)",
  robo: "var(--c41-grupo-recrutamento)",
  integracao: "var(--c41-grupo-atendimento)",
};

/** "Pessoa · DP", "Robô". O setor sai do mapa de rótulos do escritório. */
export function rotuloDoExecutor(executor: Executor, rotuloDoSetor?: (codigo: string) => string): string {
  const base = ROTULO_DO_EXECUTOR[executor.tipo];
  if (executor.tipo !== "pessoa" || !executor.setor) return base;
  return `${base} · ${rotuloDoSetor ? rotuloDoSetor(executor.setor) : executor.setor}`;
}

// ─── Leitura (o que chega do editor ou do banco) ─────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,24}$/;
const SETOR = /^[a-z0-9_]{1,40}$/;

const textoOpcional = (max: number) =>
  z
    .string()
    .max(max * 2) // o corte de verdade é depois do trim, com a mensagem do campo
    .optional()
    .nullable()
    .transform((v) => (v ?? "").trim() || undefined);

const idOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim() || undefined);

const esquemaDaEtapa = z.object({
  id: z.string().regex(ID),
  tipo: z.enum(TIPOS_DE_ETAPA),
  titulo: z.string().max(LIMITES_DO_FLUXO.titulo * 2).transform((v) => v.trim()),
  executor: z
    .object({ tipo: z.enum(TIPOS_DE_EXECUTOR), setor: z.string().regex(SETOR).optional().nullable() })
    .optional()
    .nullable(),
  prazo: textoOpcional(LIMITES_DO_FLUXO.texto),
  entra: textoOpcional(LIMITES_DO_FLUXO.texto),
  sai: textoOpcional(LIMITES_DO_FLUXO.texto),
  seDerErro: textoOpcional(LIMITES_DO_FLUXO.texto),
  tela: textoOpcional(LIMITES_DO_FLUXO.tela),
  proxima: idOpcional,
  sim: idOpcional,
  nao: idOpcional,
});

/** A lista no formato guardado: cada tipo só com os campos que fazem sentido nele. */
export function normalizarEtapas(lista: readonly Etapa[]): Etapa[] {
  return lista.map((e) => {
    const base: Etapa = { id: e.id, tipo: e.tipo, titulo: e.titulo.trim() };
    if (e.tipo === "fim") return base;
    if (e.executor) {
      base.executor = e.executor.tipo === "pessoa" && e.executor.setor ? { tipo: "pessoa", setor: e.executor.setor } : { tipo: e.executor.tipo };
    }
    for (const campo of ["prazo", "entra", "sai", "seDerErro", "tela"] as const) {
      const v = e[campo]?.trim();
      if (v) base[campo] = v;
    }
    if (e.tipo === "decisao") {
      if (e.sim) base.sim = e.sim;
      if (e.nao) base.nao = e.nao;
    } else if (e.proxima) {
      base.proxima = e.proxima;
    }
    return base;
  });
}

/** Lê a lista que veio de fora (JSON do editor ou do banco), sem validar o fluxo. `null`: formato quebrado. */
export function lerListaDeEtapas(bruto: unknown): Etapa[] | null {
  const r = z.array(esquemaDaEtapa).max(LIMITES_DO_FLUXO.etapas * 2).safeParse(bruto);
  if (!r.success) return null;
  return normalizarEtapas(
    r.data.map((e) => ({
      ...e,
      executor: e.executor ? { tipo: e.executor.tipo, setor: e.executor.setor ?? undefined } : undefined,
    }))
  );
}

// ─── Destinos, números e alcance ─────────────────────────────────────────────

export type TipoDeSaida = "proxima" | "sim" | "nao";
export type Saida = { para: string; tipo: TipoDeSaida };

/**
 * Para onde cada etapa vai, já com o padrão "a seguinte da lista". Destino que
 * não existe ou que aponta para a própria etapa fica de fora — a validação diz
 * o que está errado; o desenho só não desenha a seta.
 */
export function saidasDasEtapas(lista: readonly Etapa[]): Map<string, Saida[]> {
  const ids = new Set(lista.map((e) => e.id));
  const saidas = new Map<string, Saida[]>();
  lista.forEach((e, i) => {
    const seguinte = lista[i + 1]?.id;
    const out: Saida[] = [];
    const incluir = (para: string | undefined, tipo: TipoDeSaida) => {
      if (para && para !== e.id && ids.has(para)) out.push({ para, tipo });
    };
    if (e.tipo === "inicio" || e.tipo === "etapa") incluir(e.proxima ?? seguinte, "proxima");
    else if (e.tipo === "decisao") {
      incluir(e.sim ?? seguinte, "sim");
      incluir(e.nao, "nao");
    }
    saidas.set(e.id, out);
  });
  return saidas;
}

/** O número de cada etapa e decisão, na ordem da lista (Início e Fim não têm número). */
export function numerosDasEtapas(lista: readonly Etapa[]): Map<string, number> {
  const numeros = new Map<string, number>();
  let n = 0;
  for (const e of lista) if (e.tipo === "etapa" || e.tipo === "decisao") numeros.set(e.id, ++n);
  return numeros;
}

/** "Etapa 3", "Decisão 2", "Início", "Fim" — o nome curto que as mensagens e os seletores usam. */
export function nomeCurtoDaEtapa(e: Etapa, numeros: Map<string, number>): string {
  const n = numeros.get(e.id);
  return n ? `${ROTULO_DO_TIPO[e.tipo]} ${n}` : ROTULO_DO_TIPO[e.tipo];
}

/** A seta volta: o destino fica antes (ou é a própria etapa) na lista. É a que o desenho tracejado mostra. */
export function ehVolta(lista: readonly Etapa[], de: string, para: string): boolean {
  const i = lista.findIndex((e) => e.id === de);
  const j = lista.findIndex((e) => e.id === para);
  return i >= 0 && j >= 0 && j <= i;
}

/** As etapas que o Início alcança, por qualquer saída. */
export function alcancadasDoInicio(lista: readonly Etapa[]): Set<string> {
  const inicio = lista.find((e) => e.tipo === "inicio");
  const vistas = new Set<string>();
  if (!inicio) return vistas;
  const saidas = saidasDasEtapas(lista);
  const fila = [inicio.id];
  while (fila.length > 0) {
    const id = fila.pop()!;
    if (vistas.has(id)) continue;
    vistas.add(id);
    for (const s of saidas.get(id) ?? []) if (!vistas.has(s.para)) fila.push(s.para);
  }
  return vistas;
}

// ─── Validação ───────────────────────────────────────────────────────────────

export type CampoDaEtapa = "titulo" | "proxima" | "sim" | "nao" | "tela" | "executor" | "prazo" | "entra" | "sai" | "seDerErro";
export type ProblemaDoFluxo = { mensagem: string; etapaId?: string; campo?: CampoDaEtapa };
export type ValidacaoDoFluxo = { erros: ProblemaDoFluxo[]; avisos: ProblemaDoFluxo[] };

export type OpcoesDaValidacao = {
  /** A tela é do Connect? Ver `telas.ts`. Sem a função, só confere o formato. */
  telaValida?: (href: string) => boolean;
  /** Os setores do escritório, para o setor da pessoa que executa. */
  setores?: ReadonlySet<string>;
};

/**
 * O que impede salvar (erros) e o que só merece atenção (avisos) — etapa que o
 * Início não alcança é aviso, não erro: o setor pode estar no meio da escrita.
 */
export function validarFluxo(lista: readonly Etapa[], opcoes: OpcoesDaValidacao = {}): ValidacaoDoFluxo {
  const erros: ProblemaDoFluxo[] = [];
  const avisos: ProblemaDoFluxo[] = [];
  const numeros = numerosDasEtapas(lista);
  const nome = (e: Etapa) => nomeCurtoDaEtapa(e, numeros);

  if (lista.length > LIMITES_DO_FLUXO.etapas) erros.push({ mensagem: `O fluxo passa de ${LIMITES_DO_FLUXO.etapas} etapas. Divida em dois fluxos.` });

  const vistos = new Set<string>();
  for (const e of lista) {
    if (!ID.test(e.id) || vistos.has(e.id)) erros.push({ mensagem: "A lista tem uma etapa repetida. Recarregue a página e tente de novo.", etapaId: e.id });
    vistos.add(e.id);
  }

  const inicios = lista.filter((e) => e.tipo === "inicio");
  if (inicios.length === 0) erros.push({ mensagem: "O fluxo precisa de um Início." });
  else if (inicios.length > 1) erros.push({ mensagem: "O fluxo tem mais de um Início. Deixe só um.", etapaId: inicios[1].id });
  else if (lista[0]?.tipo !== "inicio") erros.push({ mensagem: "O Início fica no topo da lista.", etapaId: inicios[0].id });
  if (!lista.some((e) => e.tipo === "fim")) erros.push({ mensagem: "O fluxo precisa de pelo menos um Fim." });

  const ids = new Set(lista.map((e) => e.id));
  const destino = (e: Etapa, alvo: string | undefined, campo: CampoDaEtapa, rotulo: string) => {
    if (!alvo) return;
    if (alvo === e.id) erros.push({ mensagem: `${rotulo} de ${nome(e)} aponta para ela mesma.`, etapaId: e.id, campo });
    else if (!ids.has(alvo)) erros.push({ mensagem: `${rotulo} de ${nome(e)} aponta para uma etapa que não existe mais. Escolha outra.`, etapaId: e.id, campo });
  };

  lista.forEach((e, i) => {
    const ultima = i === lista.length - 1;
    if (!e.titulo.trim()) erros.push({ mensagem: `Dê um nome a ${nome(e)}.`, etapaId: e.id, campo: "titulo" });
    else if (e.titulo.trim().length > LIMITES_DO_FLUXO.titulo) erros.push({ mensagem: `O nome de ${nome(e)} passa de ${LIMITES_DO_FLUXO.titulo} letras.`, etapaId: e.id, campo: "titulo" });
    for (const campo of ["prazo", "entra", "sai", "seDerErro"] as const) {
      if ((e[campo]?.length ?? 0) > LIMITES_DO_FLUXO.texto) erros.push({ mensagem: `Um texto de ${nome(e)} passa de ${LIMITES_DO_FLUXO.texto} letras.`, etapaId: e.id, campo });
    }
    if (e.tela) {
      const formato = e.tela.startsWith("/") && !e.tela.startsWith("//") && e.tela.length <= LIMITES_DO_FLUXO.tela;
      if (!formato || (opcoes.telaValida && !opcoes.telaValida(e.tela))) erros.push({ mensagem: `A tela de ${nome(e)} não é uma tela do Connect.`, etapaId: e.id, campo: "tela" });
    }
    if (e.executor?.setor && opcoes.setores && !opcoes.setores.has(e.executor.setor)) {
      erros.push({ mensagem: `O setor de quem executa ${nome(e)} não existe no escritório.`, etapaId: e.id, campo: "executor" });
    }

    if (e.tipo === "inicio" || e.tipo === "etapa") {
      destino(e, e.proxima, "proxima", "O destino");
      if (!e.proxima && ultima) erros.push({ mensagem: `${nome(e)} é a última da lista e não segue para lugar nenhum. Escolha o destino ou acrescente um Fim.`, etapaId: e.id, campo: "proxima" });
    } else if (e.tipo === "decisao") {
      destino(e, e.sim, "sim", "O “Sim”");
      destino(e, e.nao, "nao", "O “Não”");
      if (!e.sim && ultima) erros.push({ mensagem: `Escolha para onde vai o “Sim” de ${nome(e)}.`, etapaId: e.id, campo: "sim" });
      if (!e.nao) erros.push({ mensagem: `Escolha para onde vai o “Não” de ${nome(e)}.`, etapaId: e.id, campo: "nao" });
      const sim = e.sim ?? lista[i + 1]?.id;
      if (e.nao && sim && sim === e.nao) erros.push({ mensagem: `O “Sim” e o “Não” de ${nome(e)} vão para a mesma etapa.`, etapaId: e.id, campo: "nao" });
    }
  });

  // Só faz sentido procurar etapa solta num fluxo com começo.
  if (inicios.length === 1) {
    const alcancadas = alcancadasDoInicio(lista);
    for (const e of lista) {
      if (!alcancadas.has(e.id)) avisos.push({ mensagem: `Nenhum caminho a partir do Início chega a ${nome(e)} (“${e.titulo.trim() || "sem nome"}”).`, etapaId: e.id });
    }
  }
  return { erros, avisos };
}

export type FluxoLido = { ok: true; etapas: Etapa[]; avisos: ProblemaDoFluxo[] } | ({ ok: false } & ProblemaDoFluxo);

/** O que a action roda antes de gravar: formato + regras. Devolve a lista já normalizada. */
export function lerFluxo(bruto: unknown, opcoes: OpcoesDaValidacao = {}): FluxoLido {
  const lista = lerListaDeEtapas(bruto);
  if (!lista) return { ok: false, mensagem: "A lista de etapas chegou num formato que o Connect não entende. Recarregue a página." };
  const { erros, avisos } = validarFluxo(lista, opcoes);
  if (erros.length > 0) return { ok: false, ...erros[0] };
  return { ok: true, etapas: lista, avisos };
}

// ─── O editor (lista em memória) ─────────────────────────────────────────────

/** O primeiro fluxo: só o começo e o fim, para o setor escrever o meio. */
export function fluxoEmBranco(): Etapa[] {
  return [
    { id: "e1", tipo: "inicio", titulo: "Início" },
    { id: "e2", tipo: "fim", titulo: "Fim" },
  ];
}

/** O próximo id livre ("e7"): maior número usado + 1, para nunca repetir um id de outra versão desta lista. */
export function proximoIdDeEtapa(lista: readonly Etapa[]): string {
  let maior = 0;
  for (const e of lista) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  return `e${maior + 1}`;
}

/** Insere depois do índice (−1: no fim). Nada entra acima do Início. */
export function inserirEtapa(lista: readonly Etapa[], etapa: Etapa, depoisDe = -1): Etapa[] {
  const onde = depoisDe < 0 ? lista.length : Math.min(depoisDe + 1, lista.length);
  const pos = lista[0]?.tipo === "inicio" ? Math.max(onde, 1) : onde;
  return [...lista.slice(0, pos), etapa, ...lista.slice(pos)];
}

/** Pode ir para esta posição? O Início fica no topo, e nada passa por cima dele. */
export function podeMover(lista: readonly Etapa[], de: number, para: number): boolean {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return false;
  if (lista[de].tipo === "inicio") return false;
  if (lista[0]?.tipo === "inicio" && para === 0) return false;
  return true;
}

/** Leva a etapa do índice `de` para o índice `para` (posição final). */
export function moverEtapa(lista: readonly Etapa[], de: number, para: number): Etapa[] {
  if (!podeMover(lista, de, para)) return [...lista];
  const nova = [...lista];
  const [e] = nova.splice(de, 1);
  nova.splice(para, 0, e);
  return nova;
}

/** Tira a etapa e solta os destinos que apontavam para ela (viram "a seguinte da lista", ou ficam para escolher). */
export function tirarEtapa(lista: readonly Etapa[], indice: number): Etapa[] {
  const tirada = lista[indice];
  if (!tirada) return [...lista];
  return lista
    .filter((_, i) => i !== indice)
    .map((e) => {
      if (e.proxima !== tirada.id && e.sim !== tirada.id && e.nao !== tirada.id) return e;
      const c = { ...e };
      if (c.proxima === tirada.id) delete c.proxima;
      if (c.sim === tirada.id) delete c.sim;
      if (c.nao === tirada.id) delete c.nao;
      return c;
    });
}

/** A forma comparável do fluxo — "mudou?" não conta espaço sobrando. */
export const assinaturaDasEtapas = (lista: readonly Etapa[]) => JSON.stringify(normalizarEtapas(lista));
