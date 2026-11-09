// O roteiro de um tipo de processo como a tela de roteiros edita (09/11/2026).
//
// Até aqui o roteiro só se gravava por script (`scripts/seed-societario.ts`, o
// PROCEC do alvará). A tela edita uma cópia da versão em vigor e "Publicar"
// grava uma versão nova inteira: processo em andamento continua na versão em que
// começou (ver `ProcessTemplate` no schema).
//
// Puro, sem banco — o editor (componente de cliente) usa as operações da lista e
// a ação usa a leitura com zod e as regras. Quem lê o banco é
// `roteirosServidor.ts`.

import { z } from "zod";

/** Os tetos das colunas (`ProcessTemplateStep`, `ProcessTemplateChecklistItem`) e da tela. */
export const LIMITES_DO_ROTEIRO = {
  /** `label`, VarChar(160). */
  rotulo: 160,
  /** `description`, VarChar(1000). */
  descricao: 1000,
  /** `parallelGroup`, VarChar(40). */
  grupo: 40,
  /** O item do checklist, VarChar(200). */
  item: 200,
  /** O maior roteiro de hoje tem 10 etapas e 4 itens por etapa: teto folgado, só contra envio malformado. */
  etapas: 60,
  itensPorEtapa: 40,
} as const;

export const EXECUTORES = ["PESSOA", "ROBO", "INTEGRACAO"] as const;
export type Executor = (typeof EXECUTORES)[number];

/** O nome de quem executa, no seletor e no resumo da etapa. */
export const EXECUTOR_ROTULO: Record<Executor, string> = {
  PESSOA: "Pessoa do setor",
  ROBO: "Robô",
  INTEGRACAO: "Integração (sistema de fora)",
};

/** Um órgão do escritório, como o seletor da etapa mostra. */
export type OrgaoDoRoteiro = { id: string; nome: string; sigla: string | null; ativo: boolean };

// ─── O roteiro gravado ───────────────────────────────────────────────────────

export type ItemDoRoteiro = { rotulo: string; obrigatorio: boolean };

/** Uma etapa como se grava: a posição já decidida (paralelas dividem a posição). */
export type EtapaDoRoteiro = {
  posicao: number;
  rotulo: string;
  descricao: string | null;
  /** Nome do grupo das etapas que dividem a posição. Nulo em posição de uma etapa só. */
  grupo: string | null;
  opcional: boolean;
  orgaoId: string | null;
  executor: Executor;
  itens: ItemDoRoteiro[];
};

const aparado = (s: string | null | undefined) => (s ?? "").trim();

/**
 * A forma única de um roteiro, para gravar e para comparar: posições contínuas
 * a partir de 1 na ordem em que vêm, textos aparados, descrição vazia vira
 * nulo, item sem texto sai, e o nome do grupo só existe onde há grupo — o
 * primeiro nome preenchido da posição vale para todas as etapas dela.
 */
export function normalizarRoteiro(etapas: readonly EtapaDoRoteiro[]): EtapaDoRoteiro[] {
  const porPosicao = new Map<number, EtapaDoRoteiro[]>();
  for (const e of etapas) porPosicao.set(e.posicao, [...(porPosicao.get(e.posicao) ?? []), e]);
  const nova = new Map([...porPosicao.keys()].sort((a, b) => a - b).map((p, i) => [p, i + 1]));
  return etapas.map((e) => {
    const irmas = porPosicao.get(e.posicao)!;
    const grupo = irmas.length > 1 ? irmas.map((x) => aparado(x.grupo)).find(Boolean) || null : null;
    return {
      posicao: nova.get(e.posicao)!,
      rotulo: aparado(e.rotulo),
      descricao: aparado(e.descricao) || null,
      grupo,
      opcional: e.opcional,
      orgaoId: aparado(e.orgaoId) || null,
      executor: e.executor,
      itens: e.itens.map((i) => ({ rotulo: aparado(i.rotulo), obrigatorio: i.obrigatorio })).filter((i) => i.rotulo.length > 0),
    };
  });
}

/** Os dois roteiros dizem a mesma coisa? Publicar sem mudança nenhuma só criaria versão. */
export function mesmoRoteiro(a: readonly EtapaDoRoteiro[], b: readonly EtapaDoRoteiro[]): boolean {
  return JSON.stringify(normalizarRoteiro(a)) === JSON.stringify(normalizarRoteiro(b));
}

/** A versão que a publicação cria: a seguinte à maior que já existe, publicada ou não. */
export function proximaVersao(versoes: readonly number[]): number {
  return versoes.length === 0 ? 1 : Math.max(...versoes) + 1;
}

// ─── Regras da gravação ──────────────────────────────────────────────────────

/**
 * Posições contínuas: a primeira etapa é a 1 e cada uma seguinte repete a
 * posição da anterior (corre em paralelo) ou anda uma. Buraco ou volta
 * desmancha a regra do motor — "liberada quando toda posição menor está
 * encerrada" (`etapasLiberadas`) — e a contagem de etapas da tela.
 */
export function posicoesContinuas(posicoes: readonly number[]): boolean {
  if (posicoes.length === 0 || posicoes[0] !== 1) return false;
  for (let i = 1; i < posicoes.length; i++) {
    const passo = posicoes[i] - posicoes[i - 1];
    if (passo !== 0 && passo !== 1) return false;
  }
  return true;
}

/** A primeira etapa com órgão que não é deste escritório, ou -1. */
export function etapaComOrgaoDeFora(etapas: readonly Pick<EtapaDoRoteiro, "orgaoId">[], orgaosDoEscritorio: ReadonlySet<string>): number {
  return etapas.findIndex((e) => e.orgaoId !== null && !orgaosDoEscritorio.has(e.orgaoId));
}

/** O campo da etapa que a tela destaca quando a leitura recusa. */
export type CampoDoRoteiro = "rotulo" | "descricao" | "grupo" | "orgao" | "itens";

export type RoteiroLido =
  | { ok: true; etapas: EtapaDoRoteiro[] }
  | { ok: false; erro: string; /** Índice da etapa na lista, quando o erro é de uma. */ indice?: number; campo?: CampoDoRoteiro };

const itemSchema = z.object({
  // Item sem texto passa aqui e sai na normalização: é a linha que a pessoa
  // acrescentou e não preencheu.
  rotulo: z.string().trim().max(LIMITES_DO_ROTEIRO.item),
  obrigatorio: z.boolean(),
});

const etapaSchema = z.object({
  posicao: z.number().int().min(1).max(LIMITES_DO_ROTEIRO.etapas),
  // O teto conta o texto aparado — o espaço sobrando no fim não recusa nada.
  rotulo: z.string().trim().min(1).max(LIMITES_DO_ROTEIRO.rotulo),
  descricao: z.string().trim().max(LIMITES_DO_ROTEIRO.descricao).nullable(),
  grupo: z.string().trim().max(LIMITES_DO_ROTEIRO.grupo).nullable(),
  opcional: z.boolean(),
  orgaoId: z.string().max(64).nullable(),
  executor: z.enum(EXECUTORES),
  itens: z.array(itemSchema).max(LIMITES_DO_ROTEIRO.itensPorEtapa),
});

const roteiroSchema = z.array(etapaSchema).min(1).max(LIMITES_DO_ROTEIRO.etapas);

/** "Na etapa “Viabilidade”" — pelo nome, que é como a pessoa acha a etapa na tela. */
function naEtapa(etapas: unknown, indice: number): string {
  const rotulo = Array.isArray(etapas) ? (etapas[indice] as { rotulo?: unknown } | undefined)?.rotulo : undefined;
  const nome = typeof rotulo === "string" ? rotulo.trim() : "";
  return nome ? `Na etapa “${nome.length > 40 ? `${nome.slice(0, 40)}…` : nome}”` : `Na ${indice + 1}ª etapa da lista`;
}

function mensagemDoProblema(entrada: unknown, problema: z.core.$ZodIssue): Extract<RoteiroLido, { ok: false }> {
  const [indice, campo, posItem] = problema.path;
  const grande = problema.code === "too_big";
  if (typeof indice !== "number") {
    if (problema.code === "too_small") return { ok: false, erro: "O roteiro precisa de pelo menos uma etapa." };
    if (grande) return { ok: false, erro: `O roteiro pode ter até ${LIMITES_DO_ROTEIRO.etapas} etapas.` };
    return { ok: false, erro: "O roteiro enviado não está no formato esperado. Recarregue a página e tente de novo." };
  }
  const onde = naEtapa(entrada, indice);
  if (campo === "rotulo") {
    return grande
      ? { ok: false, indice, campo, erro: `${onde}, o nome passa de ${LIMITES_DO_ROTEIRO.rotulo} caracteres.` }
      : { ok: false, indice, campo, erro: "Toda etapa precisa de um nome." };
  }
  if (campo === "descricao" && grande) return { ok: false, indice, campo, erro: `${onde}, a descrição passa de ${LIMITES_DO_ROTEIRO.descricao} caracteres.` };
  if (campo === "grupo" && grande) return { ok: false, indice, campo, erro: `${onde}, o nome do grupo passa de ${LIMITES_DO_ROTEIRO.grupo} caracteres.` };
  if (campo === "itens" && grande) {
    return typeof posItem === "number"
      ? { ok: false, indice, campo, erro: `${onde}, o ${posItem + 1}º item do checklist passa de ${LIMITES_DO_ROTEIRO.item} caracteres.` }
      : { ok: false, indice, campo, erro: `${onde}, o checklist pode ter até ${LIMITES_DO_ROTEIRO.itensPorEtapa} itens.` };
  }
  return { ok: false, indice, erro: `${onde}, um campo veio fora do formato esperado. Recarregue a página e tente de novo.` };
}

/**
 * Lê o roteiro que chega da tela, recusando o que não pode virar versão: sem
 * etapa, etapa sem nome, texto além da coluna, posição com buraco e órgão de
 * outro escritório. O que passa sai normalizado (`normalizarRoteiro`).
 *
 * O mesmo código roda na tela, antes de enviar — o erro aparece na etapa, com
 * ela aberta —, e na ação, que não confia na tela.
 */
export function lerRoteiro(entrada: unknown, orgaosDoEscritorio: ReadonlySet<string>): RoteiroLido {
  const lido = roteiroSchema.safeParse(entrada);
  if (!lido.success) {
    // O problema da lista inteira (vazia, longa demais) vem antes do de uma etapa.
    const { issues } = lido.error;
    return mensagemDoProblema(entrada, issues.find((p) => p.path.length === 0) ?? issues[0]);
  }
  const etapas = lido.data;
  if (!posicoesContinuas(etapas.map((e) => e.posicao))) {
    return { ok: false, erro: "As posições das etapas vieram fora de ordem. Recarregue a página e tente de novo." };
  }
  const deFora = etapaComOrgaoDeFora(
    etapas.map((e) => ({ orgaoId: aparado(e.orgaoId) || null })),
    orgaosDoEscritorio
  );
  if (deFora >= 0) {
    return { ok: false, indice: deFora, campo: "orgao", erro: `${naEtapa(entrada, deFora)}, o órgão escolhido não é deste escritório. Escolha outro.` };
  }
  return { ok: true, etapas: normalizarRoteiro(etapas) };
}

// ─── O editor ────────────────────────────────────────────────────────────────
//
// Na tela, a etapa não carrega a posição: carrega "corre junto com a de cima".
// É o gesto que a pessoa faz, e as posições saem sempre contínuas dele. Os
// blocos — as etapas que dividem uma posição — saem das marcas, e é por eles
// que subir, descer e tirar mexem na lista sem desmanchar um grupo por engano.

export type ItemNoEditor = { chave: string; rotulo: string; obrigatorio: boolean };

export type EtapaNoEditor = {
  /** Identidade na tela (o id da etapa gravada, ou um novo) — nunca vai ao banco. */
  chave: string;
  rotulo: string;
  descricao: string;
  /** Corre ao mesmo tempo que a etapa de cima: divide a posição com ela. */
  paralelaAAnterior: boolean;
  grupo: string;
  opcional: boolean;
  /** "" = nenhum órgão. */
  orgaoId: string;
  executor: Executor;
  itens: ItemNoEditor[];
};

export function etapaEmBranco(chave: string): EtapaNoEditor {
  return { chave, rotulo: "", descricao: "", paralelaAAnterior: false, grupo: "", opcional: false, orgaoId: "", executor: "PESSOA", itens: [] };
}

/** O roteiro gravado na forma do editor. `chaves` dá a identidade de cada etapa e item. */
export function paraOEditor(etapas: readonly EtapaDoRoteiro[], chaves: { etapa: (i: number) => string; item: (i: number, k: number) => string }): EtapaNoEditor[] {
  return etapas.map((e, i) => ({
    chave: chaves.etapa(i),
    rotulo: e.rotulo,
    descricao: e.descricao ?? "",
    paralelaAAnterior: i > 0 && e.posicao === etapas[i - 1].posicao,
    grupo: e.grupo ?? "",
    opcional: e.opcional,
    orgaoId: e.orgaoId ?? "",
    executor: e.executor,
    itens: e.itens.map((it, k) => ({ chave: chaves.item(i, k), rotulo: it.rotulo, obrigatorio: it.obrigatorio })),
  }));
}

/** A posição de cada etapa do editor, na ordem: 1, 2, 2, 3… */
export function posicoesDoEditor(etapas: readonly Pick<EtapaNoEditor, "paralelaAAnterior">[]): number[] {
  let posicao = 0;
  return etapas.map((e, i) => (i === 0 || !e.paralelaAAnterior ? ++posicao : posicao));
}

/** O que a tela envia: as posições calculadas e os campos no formato da gravação. Sem normalizar — a leitura faz isso. */
export function doEditor(etapas: readonly EtapaNoEditor[]): EtapaDoRoteiro[] {
  const posicoes = posicoesDoEditor(etapas);
  return etapas.map((e, i) => ({
    posicao: posicoes[i],
    rotulo: e.rotulo,
    descricao: e.descricao,
    grupo: e.grupo,
    opcional: e.opcional,
    orgaoId: e.orgaoId || null,
    executor: e.executor,
    itens: e.itens.map((it) => ({ rotulo: it.rotulo, obrigatorio: it.obrigatorio })),
  }));
}

export type BlocoDoEditor = {
  posicao: number;
  /** As etapas da posição, com o índice de cada uma na lista. */
  etapas: { etapa: EtapaNoEditor; indice: number }[];
};

/** As etapas agrupadas por posição, para a tela desenhar o grupo em paralelo numa caixa só. */
export function blocosDoEditor(etapas: readonly EtapaNoEditor[]): BlocoDoEditor[] {
  const blocos: BlocoDoEditor[] = [];
  etapas.forEach((etapa, indice) => {
    if (indice > 0 && etapa.paralelaAAnterior) blocos[blocos.length - 1].etapas.push({ etapa, indice });
    else blocos.push({ posicao: blocos.length + 1, etapas: [{ etapa, indice }] });
  });
  return blocos;
}

function emBlocos(etapas: readonly EtapaNoEditor[]): EtapaNoEditor[][] {
  return blocosDoEditor(etapas).map((b) => b.etapas.map((x) => x.etapa));
}

/** De volta à lista: as marcas refeitas pelo bloco, e o grupo com um nome só. */
function achatar(blocos: EtapaNoEditor[][]): EtapaNoEditor[] {
  return blocos
    .filter((b) => b.length > 0)
    .flatMap((bloco) => {
      const nome = bloco.find((e) => e.grupo.trim())?.grupo ?? "";
      return bloco.map((e, i) => ({ ...e, paralelaAAnterior: i > 0, grupo: bloco.length > 1 ? nome : e.grupo }));
    });
}

function localizar(blocos: EtapaNoEditor[][], indice: number): [number, number] {
  let resto = indice;
  for (let b = 0; b < blocos.length; b++) {
    if (resto < blocos[b].length) return [b, resto];
    resto -= blocos[b].length;
  }
  return [-1, -1];
}

/**
 * Subir uma etapa:
 * - dentro de um grupo em paralelo, troca de lugar com a de cima no grupo;
 * - a primeira do grupo sai dele e fica sozinha logo antes;
 * - sozinha na posição, passa para antes da posição de cima (inteira, se for
 *   um grupo — entrar num grupo é a marca "corre junto com a de cima").
 */
export function subirEtapa(etapas: readonly EtapaNoEditor[], indice: number): EtapaNoEditor[] {
  const blocos = emBlocos(etapas);
  const [b, j] = localizar(blocos, indice);
  if (b < 0) return [...etapas];
  const bloco = blocos[b];
  if (j > 0) [bloco[j - 1], bloco[j]] = [bloco[j], bloco[j - 1]];
  else if (bloco.length > 1) blocos.splice(b, 0, [{ ...bloco.shift()!, grupo: "" }]);
  else if (b > 0) [blocos[b - 1], blocos[b]] = [blocos[b], blocos[b - 1]];
  else return [...etapas];
  return achatar(blocos);
}

/** O espelho de `subirEtapa`: a última do grupo sai dele e fica sozinha logo depois. */
export function descerEtapa(etapas: readonly EtapaNoEditor[], indice: number): EtapaNoEditor[] {
  const blocos = emBlocos(etapas);
  const [b, j] = localizar(blocos, indice);
  if (b < 0) return [...etapas];
  const bloco = blocos[b];
  if (j < bloco.length - 1) [bloco[j], bloco[j + 1]] = [bloco[j + 1], bloco[j]];
  else if (bloco.length > 1) blocos.splice(b + 1, 0, [{ ...bloco.pop()!, grupo: "" }]);
  else if (b < blocos.length - 1) [blocos[b], blocos[b + 1]] = [blocos[b + 1], blocos[b]];
  else return [...etapas];
  return achatar(blocos);
}

export function podeSubir(etapas: readonly EtapaNoEditor[], indice: number): boolean {
  return indice > 0 || (etapas.length > 1 && etapas[1].paralelaAAnterior);
}

export function podeDescer(etapas: readonly EtapaNoEditor[], indice: number): boolean {
  const ultima = etapas.length - 1;
  return indice < ultima || (indice === ultima && ultima > 0 && etapas[ultima].paralelaAAnterior);
}

/**
 * Liga ou desliga "corre junto com a de cima". Ligar junta o bloco da etapa ao
 * de cima (o nome do grupo de cima vale); desligar parte o grupo ali, e a parte
 * de baixo começa sem nome — dois grupos com o mesmo nome confundiriam.
 */
export function marcarParalela(etapas: readonly EtapaNoEditor[], indice: number, ligada: boolean): EtapaNoEditor[] {
  if (indice <= 0 || indice >= etapas.length) return [...etapas];
  const marcadas = etapas.map((e, i) => (i === indice ? { ...e, paralelaAAnterior: ligada } : e));
  if (ligada) return achatar(emBlocos(marcadas));
  const blocos = emBlocos(marcadas);
  const [b] = localizar(blocos, indice);
  blocos[b] = blocos[b].map((e) => ({ ...e, grupo: "" }));
  return achatar(blocos);
}

/** Dá nome ao grupo da etapa — todas as etapas da posição ficam com ele. */
export function nomearGrupo(etapas: readonly EtapaNoEditor[], indice: number, nome: string): EtapaNoEditor[] {
  const blocos = emBlocos(etapas);
  const [b] = localizar(blocos, indice);
  if (b < 0) return [...etapas];
  blocos[b] = blocos[b].map((e) => ({ ...e, grupo: nome }));
  return achatar(blocos);
}

/** Etapa nova sozinha numa posição logo depois da posição da etapa `indice` (no fim, com -1). */
export function inserirEtapa(etapas: readonly EtapaNoEditor[], nova: EtapaNoEditor, depoisDe = -1): EtapaNoEditor[] {
  const blocos = emBlocos(etapas);
  const [b] = depoisDe < 0 ? [blocos.length - 1] : localizar(blocos, depoisDe);
  blocos.splice(b + 1, 0, [{ ...nova, paralelaAAnterior: false }]);
  return achatar(blocos);
}

/** O que `tirarEtapa` devolve para o "Desfazer" pôr a etapa de volta onde estava. */
export type EtapaTirada = { etapa: EtapaNoEditor; indice: number; abriaGrupo: boolean };

/** Tira a etapa; se ela abria um grupo, a seguinte passa a abrir. */
export function tirarEtapa(etapas: readonly EtapaNoEditor[], indice: number): { etapas: EtapaNoEditor[]; tirada: EtapaTirada | null } {
  const etapa = etapas[indice];
  if (!etapa) return { etapas: [...etapas], tirada: null };
  const abriaGrupo = !etapa.paralelaAAnterior && etapas[indice + 1]?.paralelaAAnterior === true;
  const blocos = emBlocos(etapas);
  const [b, j] = localizar(blocos, indice);
  blocos[b].splice(j, 1);
  return { etapas: achatar(blocos), tirada: { etapa, indice, abriaGrupo } };
}

/** Desfaz `tirarEtapa`: a etapa volta ao lugar, no grupo em que estava. */
export function devolverEtapa(etapas: readonly EtapaNoEditor[], tirada: EtapaTirada): EtapaNoEditor[] {
  const indice = Math.min(tirada.indice, etapas.length);
  const lista = [...etapas];
  lista.splice(indice, 0, { ...tirada.etapa, paralelaAAnterior: indice > 0 && tirada.etapa.paralelaAAnterior });
  if (tirada.abriaGrupo && lista[indice + 1]) lista[indice + 1] = { ...lista[indice + 1], paralelaAAnterior: true };
  return achatar(emBlocos(lista));
}

/** Troca um item do checklist com o vizinho (`delta` -1 sobe, 1 desce). */
export function moverItem(itens: readonly ItemNoEditor[], indice: number, delta: -1 | 1): ItemNoEditor[] {
  const alvo = indice + delta;
  if (indice < 0 || indice >= itens.length || alvo < 0 || alvo >= itens.length) return [...itens];
  const lista = [...itens];
  [lista[indice], lista[alvo]] = [lista[alvo], lista[indice]];
  return lista;
}
