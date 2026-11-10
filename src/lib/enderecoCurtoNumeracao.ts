import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { TelaCurta } from "@/lib/enderecoCurto";

/**
 * O número do endereço curto na criação (10/11/2026, pedido do Kauan). Fica à
 * parte da leitura do endereço (src/lib/enderecoCurtoServidor.ts, que depende
 * do Next) para os scripts de carga também usarem: sem nada do Next aqui.
 */

type Tx = Prisma.TransactionClient;

/**
 * As telas cujo número sai aqui. A solicitação fica de fora: ela já nascia
 * numerada pelo protocolo ("Solicitação nº 12", na abertura pelo portal), e o
 * endereço curto reaproveita esse número.
 */
export type TelaNumerada = Exclude<TelaCurta, "solicitacao">;
// Nome fixo, nunca vindo de fora: entra cru no SQL (`Prisma.raw`).
const TABELA: Record<TelaNumerada, string> = {
  empresa: "companies",
  pessoa: "people",
  chamado: "helpdesk_tickets",
  processo: "processes",
  transferencia: "handoffs",
  pendencia: "client_requests",
  tarefa: "pipeline_items",
};

/**
 * O próximo número da tela no escritório, o do endereço curto. É a mesma
 * técnica do Controle interno (`proximoNumero`, src/lib/tech-interno/servidor.ts):
 *
 * Duas criações ao mesmo tempo no mesmo escritório fazem fila na linha do
 * escritório (`tenants … FOR UPDATE`, a trava dos chamados) — vale também para
 * o escritório ainda sem nenhum registro, em que não há linha para travar. O
 * último número é lido pela própria consulta com trava, que enxerga o que a
 * criação da frente acabou de confirmar: uma leitura comum depois da trava
 * leria a foto do começo da transação, se ela já tiver lido algo antes (o
 * pagamento em dobro de 19/10/2026). A unique (tenantId, number) fica de rede
 * (`comNovaTentativa`).
 *
 * Para criar vários de uma vez (importação, demonstração), o primeiro número
 * é este e os seguintes, em sequência (`numerosEmSequencia`): a trava segue
 * com a transação até o fim, e ninguém mais numera no escritório enquanto isso.
 *
 * Fora de uma transação (os scripts de carga local, que rodam sozinhos), a
 * trava vale só para a própria consulta e o número é o maior + 1.
 */
export async function proximoNumero(tx: Tx, tela: TelaNumerada, tenantId: string): Promise<number> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
  const [ultimo] = await tx.$queryRaw<{ numero: number | bigint }[]>(
    Prisma.sql`SELECT \`number\` AS numero FROM ${Prisma.raw(TABELA[tela])} WHERE tenantId = ${tenantId} ORDER BY \`number\` DESC LIMIT 1 FOR UPDATE`
  );
  return (ultimo ? Number(ultimo.numero) : 0) + 1;
}

/** Os números de uma leva, em sequência a partir do primeiro reservado. */
export function numerosEmSequencia<T extends object>(primeiro: number, registros: readonly T[]): (T & { number: number })[] {
  return registros.map((r, i) => ({ ...r, number: primeiro + i }));
}

const codigo = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined);
function textoDoErro(e: unknown): string {
  let meta = "";
  try {
    meta = JSON.stringify((e as { meta?: unknown } | null)?.meta ?? null);
  } catch {
    // meta com referência circular: fica só a mensagem.
  }
  return `${e instanceof Error ? e.message : ""} ${meta}`;
}
/**
 * A corrida que vale refazer: a unique do número recusou (P2002 no índice
 * `…_tenantId_number_key` — e não o CNPJ ou o CPF repetidos, que são erro de
 * quem cadastra) ou o MySQL desfez a transação num impasse de trava.
 */
export function corridaDoNumero(e: unknown): boolean {
  const c = codigo(e);
  if (c === "P2034") return true;
  const texto = textoDoErro(e);
  if (c === "P2002") return /_tenantId_number_key/.test(texto);
  return /deadlock/i.test(texto);
}

const TENTATIVAS = 3;
/** Refaz a gravação inteira (que lê o número de novo) quando perde a corrida; até 3 vezes. */
export async function comNovaTentativa<T>(gravar: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await gravar();
    } catch (e) {
      if (!corridaDoNumero(e) || tentativa >= TENTATIVAS) throw e;
    }
  }
}

/**
 * Cria um registro numerado numa transação própria: o número sai por último,
 * logo antes de gravar, para a trava durar o mínimo. Para quem já está numa
 * transação, `proximoNumero(tx, …)` direto.
 */
export function criarComNumero<T>(tela: TelaNumerada, tenantId: string, criar: (tx: Tx, numero: number) => Promise<T>): Promise<T> {
  return comNovaTentativa(() => getPrisma().$transaction(async (tx) => criar(tx, await proximoNumero(tx, tela, tenantId))));
}
