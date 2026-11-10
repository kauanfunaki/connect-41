// Quem configura o Meu dia de quem (28/10/2026, decisão do Kauan). Até aqui só
// o Super Admin configurava, e só por setor. Agora:
//
// - cada pessoa personaliza o próprio Meu dia;
// - o coordenador (SECTOR_ADMIN) configura o Meu dia dos colaboradores dos
//   setores dele — e, desde 10/11/2026 (pedido do Kauan), o PADRÃO dos setores
//   dele também, como a Agenda do setor;
// - Admin e Super Admin configuram o de qualquer pessoa e o padrão de cada
//   setor.
//
// A precedência é pessoa > setor > código, chave a chave: a configuração da
// pessoa decide os blocos que ela conhece; bloco que ela não conhece (lançado
// depois de ela salvar) segue o setor; o setor sem configuração segue o código
// (`padraoDoSetor`, que desliga "Próximas reuniões" no setor que não usa
// reuniões). A da pessoa é uma só — gravada por ela, pelo coordenador ou pelo
// admin, vale a última —, e "Voltar ao padrão do setor" apaga.
//
// Só regra: sem banco.

import type { AuthContext } from "@/lib/auth/context";
import { isFullWrite } from "@/lib/auth/papeis";
import { padraoDoSetor, parseTaskWidgets, visibleTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";

type Quem = Pick<AuthContext, "userId" | "role" | "sectors">;
/** A pessoa cujo Meu dia se configura. */
export type PessoaDoMeuDia = { id: string; role: string; sectors: readonly string[] };

/**
 * O padrão de um setor (o do Meu dia e o da Agenda): Admin e Super Admin, de
 * qualquer setor; o coordenador (SECTOR_ADMIN), dos setores dele.
 */
export function podeConfigurarOSetor(ctx: Pick<Quem, "role" | "sectors">, sectorCode: string): boolean {
  if (isFullWrite(ctx.role)) return true;
  return ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(sectorCode);
}

/** Dos setores dados, os que esta pessoa configura — para o "Padrão do setor" das telas. */
export function setoresQueConfigura<T extends { code: string }>(ctx: Pick<Quem, "role" | "sectors">, setores: readonly T[]): T[] {
  return setores.filter((s) => podeConfigurarOSetor(ctx, s.code));
}

/** O Meu dia desta pessoa: ela mesma, o admin, ou o coordenador de um setor dela, se ela é colaboradora. */
export function podeConfigurarAPessoa(ctx: Quem, pessoa: PessoaDoMeuDia): boolean {
  if (pessoa.id === ctx.userId) return true;
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role !== "SECTOR_ADMIN" || pessoa.role !== "SECTOR_USER") return false;
  return pessoa.sectors.some((s) => ctx.sectors.includes(s));
}

/** Os blocos do padrão de um setor: o gravado; o que ele não conhece, o do código. */
export function blocosDoSetor(gravado: string | null | undefined, usaReunioes: boolean): TaskWidgetKey[] {
  return parseTaskWidgets(gravado, padraoDoSetor(usaReunioes));
}

/**
 * Os blocos que a pessoa vê: os dela, se tem configuração própria (com o que
 * ela não conhece vindo dos setores); senão a soma dos setores dela.
 * `configPorSetor` traz os setores que gravaram padrão (já lidos com
 * `blocosDoSetor`); para os outros vale `padraoDoSetorCode`.
 */
export function blocosDaPessoa(
  propria: string | null | undefined,
  setores: string[],
  configPorSetor: Record<string, TaskWidgetKey[]>,
  padraoDoSetorCode?: (code: string) => readonly TaskWidgetKey[],
): TaskWidgetKey[] {
  const dosSetores = visibleTaskWidgets(setores, configPorSetor, padraoDoSetorCode);
  if (propria != null) return parseTaskWidgets(propria, dosSetores);
  return dosSetores;
}
