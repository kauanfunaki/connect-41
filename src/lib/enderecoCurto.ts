/**
 * O endereço curto das telas de detalhe (10/11/2026, pedido do Kauan): no
 * lugar do uuid, o nome da tela no singular e um número do escritório —
 * /empresas/empresa-301, /chamados/chamado-45, /kanban/itens/tarefa-77. É a
 * mesma ideia do Controle interno (/controle-interno/bug-123,
 * src/lib/tech-interno/regras.ts), estendida ao resto do Connect.
 *
 * O número é um por tela e por escritório, sai na criação e nunca muda (ver
 * `proximoNumero`, src/lib/enderecoCurtoNumeracao.ts). O endereço antigo, com o
 * uuid, continua abrindo: a tela passa para o curto. Este arquivo é só regra —
 * sem Prisma —, para servir também aos componentes "use client".
 */
import { boardPath } from "@/lib/kanbanPaths";

/** As telas com endereço curto: a rota da lista e o prefixo do id curto (ASCII, sem acento). */
export const TELAS_DO_ENDERECO_CURTO = {
  empresa: { rota: "/empresas", prefixo: "empresa" },
  pessoa: { rota: "/pessoas", prefixo: "pessoa" },
  chamado: { rota: "/chamados", prefixo: "chamado" },
  processo: { rota: "/processos", prefixo: "processo" },
  transferencia: { rota: "/transferencias", prefixo: "transferencia" },
  // A solicitação já tinha o número do protocolo ("Solicitação nº 12"): é ele.
  solicitacao: { rota: "/solicitacoes", prefixo: "solicitacao" },
  pendencia: { rota: "/pendencias", prefixo: "pendencia" },
  // A tarefa dos Quadros: /kanban/itens/tarefa-77 acha o quadro e abre a
  // tarefa nele (/kanban/{quadro}/itens/tarefa-77, ver `enderecoDaTarefa`).
  tarefa: { rota: "/kanban/itens", prefixo: "tarefa" },
} as const;
export type TelaCurta = keyof typeof TELAS_DO_ENDERECO_CURTO;

/**
 * Prefixos que uma tela já usou. Se o nome de uma tela mudar, o prefixo antigo
 * entra aqui e o endereço velho continua achando o registro pelo número (a
 * tela passa para o de agora). Nenhuma mudou até aqui.
 */
const PREFIXOS_ANTIGOS: Partial<Record<TelaCurta, readonly string[]>> = {};

/** O maior número que cabe na coluna (INT do MySQL). */
const MAIOR_NUMERO = 2147483647;

/** "empresa-301": o id curto, como aparece no endereço. */
export function idCurto(tela: TelaCurta, numero: number): string {
  return `${TELAS_DO_ENDERECO_CURTO[tela].prefixo}-${numero}`;
}

/** "/empresas/empresa-301": o endereço do registro no Connect. */
export function endereco(tela: TelaCurta, numero: number): string {
  return `${TELAS_DO_ENDERECO_CURTO[tela].rota}/${idCurto(tela, numero)}`;
}

/**
 * O endereço de um registro do qual se tem o uuid e, quase sempre, o número.
 * Sem o número (um aviso antigo que só guardou o id, por exemplo), fica o
 * endereço com o uuid — que abre igual e passa para o curto.
 */
export function enderecoDe(tela: TelaCurta, registro: { id: string; number?: number | null }): string {
  return typeof registro.number === "number" ? endereco(tela, registro.number) : `${TELAS_DO_ENDERECO_CURTO[tela].rota}/${registro.id}`;
}

/** O pedaço da tarefa no endereço do quadro: "tarefa-77", ou o uuid quando o número não veio. */
export function segmentoDaTarefa(item: { id: string; number?: number | null }): string {
  return typeof item.number === "number" ? idCurto("tarefa", item.number) : item.id;
}

/** "/kanban/{quadro}/itens/tarefa-77": a tarefa aberta no próprio quadro. */
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
 * Lê "empresa-301" (sem diferença de maiúsculas, aceitando um prefixo antigo
 * da tela): o número, ou null. Número fora de 1..2147483647 não é endereço.
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
 * - já no id curto de agora (mesma grafia) → abre;
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
  const curto = idCurto(tela, registro.number);
  if (segmento === curto) return { tipo: "abrir" };
  return { tipo: "redirecionar", para: `${base}/${curto}${resto}${textoDaBusca(busca)}` };
}
