/**
 * O endereço curto das telas de detalhe (10/11/2026, pedido do Kauan): no
 * lugar do uuid, o nome da tela no singular e um número do escritório —
 * /empresas/empresa-301, /chamados/chamado-45, /kanban/itens/tarefa-77. É a
 * mesma ideia do Controle interno (/controle-interno/bug-123,
 * src/lib/tech-interno/regras.ts), estendida ao resto do Connect. Desde
 * 25/11/2026 (melhoria-818) o prefixo é uma sigla de três letras: na tela,
 * EMP-301; no endereço, /empresas/emp-301 — o de antes continua abrindo.
 *
 * O número é um por tela e por escritório, sai na criação do contador da tela,
 * nunca muda e nunca é reaproveitado (ver `reservarNumeros`,
 * src/lib/enderecoCurtoNumeracao.ts). O endereço antigo, com o
 * uuid, continua abrindo: a tela passa para o curto. Este arquivo é só regra —
 * sem Prisma —, para servir também aos componentes "use client".
 */
import { boardPath } from "@/lib/kanbanPaths";

/**
 * As telas com endereço curto: a rota da lista e o prefixo do id curto (ASCII,
 * sem acento, em minúsculas). Desde 25/11/2026 (melhoria-818, alternativa B do
 * Kauan), o prefixo é a sigla de três letras da tela — EMP-301, CHA-45 —, no
 * mesmo molde do Controle interno (FUN-816). Nenhuma sigla repete a de outra
 * tela nem a de um tipo do Controle interno (BUG, MEL, FUN, TES, MIG).
 */
export const TELAS_DO_ENDERECO_CURTO = {
  empresa: { rota: "/empresas", prefixo: "emp" },
  pessoa: { rota: "/pessoas", prefixo: "pes" },
  chamado: { rota: "/chamados", prefixo: "cha" },
  processo: { rota: "/processos", prefixo: "pro" },
  transferencia: { rota: "/transferencias", prefixo: "tra" },
  // A solicitação já tinha o número do protocolo ("Solicitação nº 12"): é ele.
  solicitacao: { rota: "/solicitacoes", prefixo: "sol" },
  pendencia: { rota: "/pendencias", prefixo: "pen" },
  // A tarefa dos Quadros: /kanban/itens/tar-77 acha o quadro e abre a
  // tarefa nele (/kanban/{quadro}/itens/tar-77, ver `enderecoDaTarefa`).
  tarefa: { rota: "/kanban/itens", prefixo: "tar" },
} as const;
export type TelaCurta = keyof typeof TELAS_DO_ENDERECO_CURTO;

/**
 * Prefixos que uma tela já usou. O endereço velho continua achando o registro
 * pelo número, para sempre, e a tela passa para o de agora. Até 25/11/2026
 * (melhoria-818) o prefixo era o nome da tela por extenso: /empresas/empresa-301.
 */
const PREFIXOS_ANTIGOS: Partial<Record<TelaCurta, readonly string[]>> = {
  empresa: ["empresa"],
  pessoa: ["pessoa"],
  chamado: ["chamado"],
  processo: ["processo"],
  transferencia: ["transferencia"],
  solicitacao: ["solicitacao"],
  pendencia: ["pendencia"],
  tarefa: ["tarefa"],
};

/** O maior número que cabe na coluna (INT do MySQL). */
const MAIOR_NUMERO = 2147483647;

/**
 * "EMP-301": o id curto como aparece na tela, em maiúsculas (melhoria-818).
 * Para montar um link, use `endereco`, `enderecoDe` ou `idCurtoNoEndereco`.
 */
export function idCurto(tela: TelaCurta, numero: number): string {
  return idCurtoNoEndereco(tela, numero).toUpperCase();
}

/** "emp-301": o id curto como vai no endereço, em minúsculas. */
export function idCurtoNoEndereco(tela: TelaCurta, numero: number): string {
  return `${TELAS_DO_ENDERECO_CURTO[tela].prefixo}-${numero}`;
}

/** "/empresas/emp-301": o endereço do registro no Connect. */
export function endereco(tela: TelaCurta, numero: number): string {
  return `${TELAS_DO_ENDERECO_CURTO[tela].rota}/${idCurtoNoEndereco(tela, numero)}`;
}

/**
 * O endereço de um registro do qual se tem o uuid e, quase sempre, o número.
 * Sem o número (um aviso antigo que só guardou o id, por exemplo), fica o
 * endereço com o uuid — que abre igual e passa para o curto.
 */
export function enderecoDe(tela: TelaCurta, registro: { id: string; number?: number | null }): string {
  return typeof registro.number === "number" ? endereco(tela, registro.number) : `${TELAS_DO_ENDERECO_CURTO[tela].rota}/${registro.id}`;
}

/** O pedaço da tarefa no endereço do quadro: "tar-77", ou o uuid quando o número não veio. */
export function segmentoDaTarefa(item: { id: string; number?: number | null }): string {
  return typeof item.number === "number" ? idCurtoNoEndereco("tarefa", item.number) : item.id;
}

/** "/kanban/{quadro}/itens/tar-77": a tarefa aberta no próprio quadro. */
export function enderecoDaTarefa(pipelineId: string, item: { id: string; number?: number | null }): string {
  return `${boardPath({ id: pipelineId })}/itens/${segmentoDaTarefa(item)}`;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ID_CURTO = Object.fromEntries(
  (Object.keys(TELAS_DO_ENDERECO_CURTO) as TelaCurta[]).map((tela) => {
    const prefixos = [TELAS_DO_ENDERECO_CURTO[tela].prefixo, ...(PREFIXOS_ANTIGOS[tela] ?? [])].map(escapar).join("|");
    return [tela, new RegExp(`^(?:${prefixos})-([1-9][0-9]{0,9})$`, "i")];
  })
) as Record<TelaCurta, RegExp>;

/**
 * Lê "EMP-301" ou "emp-301" (sem diferença de maiúsculas, aceitando um prefixo
 * antigo da tela, como "empresa-301"): o número, ou null. Número fora de
 * 1..2147483647 não é endereço.
 */
export function lerIdCurto(tela: TelaCurta, valor: string): number | null {
  const [, digitos] = ID_CURTO[tela].exec(valor.trim()) ?? [];
  if (!digitos) return null;
  const numero = Number(digitos);
  return Number.isSafeInteger(numero) && numero >= 1 && numero <= MAIOR_NUMERO ? numero : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (valor: string) => UUID.test(valor);

/**
 * O que procurar a partir do pedaço do endereço: o uuid pelo id, o id curto
 * pelo número (único no escritório). Qualquer outra coisa não é registro.
 */
export function alvoDoEndereco(tela: TelaCurta, valor: string): { id: string } | { number: number } | null {
  if (ehUuid(valor)) return { id: valor };
  const numero = lerIdCurto(tela, valor);
  return numero === null ? null : { number: numero };
}

type Busca = Record<string, string | string[] | undefined>;
/** A query da página de volta para texto ("?tab=files"), para não perder filtros e abas no redirecionamento. */
export function textoDaBusca(busca: Busca | undefined): string {
  const q = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca ?? {})) {
    if (Array.isArray(valor)) for (const v of valor) q.append(chave, v);
    else if (typeof valor === "string") q.append(chave, valor);
  }
  const texto = q.toString();
  return texto ? `?${texto}` : "";
}

export type DecisaoDoEndereco = { tipo: "nao_encontrado" } | { tipo: "abrir" } | { tipo: "redirecionar"; para: string };
/**
 * O que a tela de detalhe faz com o endereço pedido:
 * - registro que não existe (ou pedaço que não é uuid nem id curto) → 404;
 * - já no id curto de agora (mesma grafia, em minúsculas) → abre;
 * - no uuid, em maiúsculas ou num prefixo antigo → vai para o curto de agora,
 *   com a mesma query (aba, filtros, `?editar=1`).
 * `base` é onde o id curto fica: a rota da tela, ou o quadro, para a tarefa;
 * `resto`, o caminho depois dele, nas telas abaixo da ficha ("/socios").
 */
export function decidirEndereco(
  tela: TelaCurta,
  segmento: string,
  registro: { number: number } | null,
  busca?: Busca,
  { base = TELAS_DO_ENDERECO_CURTO[tela].rota, resto = "" }: { base?: string; resto?: string } = {}
): DecisaoDoEndereco {
  if (!registro) return { tipo: "nao_encontrado" };
  const curto = idCurtoNoEndereco(tela, registro.number);
  if (segmento === curto) return { tipo: "abrir" };
  return { tipo: "redirecionar", para: `${base}/${curto}${resto}${textoDaBusca(busca)}` };
}
