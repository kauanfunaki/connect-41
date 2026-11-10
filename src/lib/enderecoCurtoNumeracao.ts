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
/** As telas do contador: as do endereço curto e o Controle interno (bug-123), que usa o mesmo contador. */
export type TelaDoContador = TelaNumerada | "controle-interno";
// Nome fixo, nunca vindo de fora: entra cru no SQL (`Prisma.raw`).
const TABELA: Record<TelaDoContador, string> = {
  empresa: "companies",
  pessoa: "people",
  chamado: "helpdesk_tickets",
  processo: "processes",
  transferencia: "handoffs",
  pendencia: "client_requests",
  tarefa: "pipeline_items",
  "controle-interno": "tech_internal_items",
};

/**
 * Reserva `quantos` números seguidos da tela no escritório e devolve o
 * primeiro. Decisão do Kauan (10/11/2026): o número nunca é reaproveitado, nem
 * quando o registro de maior número é excluído — por isso ele sai do contador
 * da tela (`short_address_counters`), e não do maior número que sobrou na
 * tabela.
 *
 * Na transação de quem cria:
 * 1. trava a linha do contador e lê o último número pela própria consulta com
 *    trava (`FOR UPDATE`), que enxerga o que a criação da frente acabou de
 *    confirmar — uma leitura comum leria a foto do começo da transação, se ela
 *    já tiver lido algo antes (o pagamento em dobro de 19/10/2026);
 * 2. sem a linha (escritório sem nenhum registro na tela quando a migration
 *    rodou), cria a linha a partir do maior número da tabela e trava de novo;
 * 3. avança o contador.
 * Duas criações ao mesmo tempo na mesma tela do escritório fazem fila na
 * linha do contador, e a trava segue com a transação até o fim. A unique
 * (tenantId, number) fica de rede (`comNovaTentativa`).
 *
 * Fora de uma transação (os scripts de carga local, que rodam sozinhos), cada
 * consulta vale por si: não há outra criação para disputar o número.
 */
export async function reservarNumeros(tx: Tx, tela: TelaDoContador, tenantId: string, quantos: number): Promise<number> {
  if (!Number.isInteger(quantos) || quantos < 1) throw new Error(`Quantidade de números inválida: ${quantos}.`);
  const travar = () =>
    tx.$queryRaw<{ ultimo: number | bigint }[]>(
      Prisma.sql`SELECT ultimo FROM short_address_counters WHERE tenantId = ${tenantId} AND tela = ${tela} FOR UPDATE`
    );
  let [linha] = await travar();
  if (!linha) {
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO short_address_counters (tenantId, tela, ultimo, updatedAt) SELECT ${tenantId}, ${tela}, COALESCE(MAX(\`number\`), 0), NOW(3) FROM ${Prisma.raw(TABELA[tela])} WHERE tenantId = ${tenantId} ON DUPLICATE KEY UPDATE ultimo = ultimo`
    );
    [linha] = await travar();
    if (!linha) throw new Error(`O contador do endereço curto (${tela}) não foi criado.`);
  }
  await tx.$executeRaw(
    Prisma.sql`UPDATE short_address_counters SET ultimo = ultimo + ${quantos}, updatedAt = NOW(3) WHERE tenantId = ${tenantId} AND tela = ${tela}`
  );
  return Number(linha.ultimo) + 1;
}

/** O próximo número da tela no escritório, o do endereço curto (`reservarNumeros` de um). */
export function proximoNumero(tx: Tx, tela: TelaDoContador, tenantId: string): Promise<number> {
  return reservarNumeros(tx, tela, tenantId, 1);
}

/** Os números de uma leva, em sequência a partir do primeiro reservado. */
export function numerosEmSequencia<T extends object>(primeiro: number, registros: readonly T[]): (T & { number: number })[] {
  return registros.map((r, i) => ({ ...r, number: primeiro + i }));
}

/**
 * Uma leva inteira de uma vez (importação, demonstração): reserva o bloco
 * todo no contador e numera em sequência. Leva vazia não mexe no contador.
 */
export async function numerarLeva<T extends object>(tx: Tx, tela: TelaDoContador, tenantId: string, registros: readonly T[]): Promise<(T & { number: number })[]> {
  if (registros.length === 0) return [];
  return numerosEmSequencia(await reservarNumeros(tx, tela, tenantId, registros.length), registros);
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
