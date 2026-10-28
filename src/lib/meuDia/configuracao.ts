// Quem configura o Meu dia de quem (28/10/2026, decisão do Kauan). Até aqui só
// o Super Admin configurava, e só por setor. Agora:
//
// - cada pessoa personaliza o próprio Meu dia;
// - o coordenador (SECTOR_ADMIN) configura o Meu dia dos colaboradores dos
//   setores dele;
// - Admin e Super Admin configuram o de qualquer pessoa e o padrão de cada
//   setor.
//
// A configuração da pessoa vale mais que a do setor: quem tem a sua vê os
// blocos dela; quem não tem vê a soma dos setores dele (`visibleTaskWidgets`).
// A da pessoa é uma só — gravada por ela, pelo coordenador ou pelo admin, vale
// a última —, e "Voltar ao padrão do setor" apaga.
//
// Só regra: sem banco.

import type { AuthContext } from "@/lib/auth/context";
import { isFullWrite } from "@/lib/auth/papeis";
import { parseTaskWidgets, visibleTaskWidgets, type TaskWidgetKey } from "@/lib/taskWidgets";

type Quem = Pick<AuthContext, "userId" | "role" | "sectors">;
/** A pessoa cujo Meu dia se configura. */
export type PessoaDoMeuDia = { id: string; role: string; sectors: readonly string[] };

/** O padrão de um setor: Admin e Super Admin. */
export function podeConfigurarOSetor(ctx: Pick<Quem, "role">): boolean {
  return isFullWrite(ctx.role);
}

/** O Meu dia desta pessoa: ela mesma, o admin, ou o coordenador de um setor dela, se ela é colaboradora. */
export function podeConfigurarAPessoa(ctx: Quem, pessoa: PessoaDoMeuDia): boolean {
  if (pessoa.id === ctx.userId) return true;
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role !== "SECTOR_ADMIN" || pessoa.role !== "SECTOR_USER") return false;
  return pessoa.sectors.some((s) => ctx.sectors.includes(s));
}

/**
 * Os blocos que a pessoa vê: os dela, se tem configuração própria; senão a
 * soma dos setores dela.
 */
export function blocosDaPessoa(
  propria: string | null | undefined,
  setores: string[],
  configPorSetor: Record<string, TaskWidgetKey[]>,
): TaskWidgetKey[] {
  if (propria != null) return parseTaskWidgets(propria);
  return visibleTaskWidgets(setores, configPorSetor);
}
