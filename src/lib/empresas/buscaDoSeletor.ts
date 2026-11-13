// A busca do seletor de empresa ou pessoa, no servidor (13/11/2026,
// melhoria-662). As telas mandavam todas as empresas e todas as pessoas do
// escritório para o seletor do navegador — milhares de pessoas no HTML da Nova
// transferência e no "Duplicar" de cada quadro, mesmo sem abrir a lista. Agora
// o seletor pede ao servidor as primeiras 100 que casam com o que se digitou.

import { getPrisma } from "@/lib/prisma";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { nomeExibicao } from "@/lib/companyName";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import type { AuthContext } from "@/lib/auth/context";
import type { Opcao } from "@/components/shared/SearchableSelect";

/** Quantas opções cada busca devolve; uma a mais diz que há mais. */
export const LIMITE_DA_BUSCA = 100;
/** Quantos ids a mais (a escolhida e os recentes) a busca aceita resolver. */
export const LIMITE_DE_INCLUIDAS = 10;

export type TipoDaEntidade = "COMPANY" | "PERSON";
export type ResultadoDaBusca = { opcoes: Opcao[]; incluidas: Opcao[] };

const soDigitos = (s: string) => s.replace(/\D/g, "");

/**
 * Empresa: pelo nome, pelo apelido ou, com três dígitos ou mais e só número
 * digitado, pelo CNPJ — o mesmo critério da busca no navegador
 * (`casaComABusca`). Pessoa: pelo nome. Sem termo, as primeiras em ordem
 * alfabética. O banco compara sem caixa e sem acento (collation do MySQL).
 */
export async function buscarEntidadesDoSeletor(ctx: AuthContext, tipo: TipoDaEntidade, termo: string, incluir: string[] = []): Promise<ResultadoDaBusca> {
  const prisma = getPrisma();
  const q = termo.trim().slice(0, 100);
  const ids = [...new Set(incluir.filter((v) => typeof v === "string" && v.length > 0 && v.length <= 64))].slice(0, LIMITE_DE_INCLUIDAS);

  if (tipo === "COMPANY") {
    const alcance = await scopedCompanyWhere(ctx);
    const digitos = /^[\d./\-\s]+$/.test(q) ? soDigitos(q) : "";
    const onde = q
      ? {
          ...alcance,
          OR: [{ name: { contains: q } }, { displayName: { contains: q } }, ...(digitos.length >= 3 ? [{ cnpj: { contains: digitos } }] : [])],
        }
      : alcance;
    const [lista, extras] = await Promise.all([
      prisma.company.findMany({ where: onde, orderBy: { name: "asc" }, take: LIMITE_DA_BUSCA + 1, select: CAMPOS_DA_EMPRESA_NO_SELETOR }),
      ids.length ? prisma.company.findMany({ where: { ...alcance, id: { in: ids } }, select: CAMPOS_DA_EMPRESA_NO_SELETOR }) : [],
    ]);
    const comoOpcoes = (xs: typeof lista) => opcoesDeEmpresa(xs.map((c) => ({ ...c, nome: nomeExibicao(c) })));
    return { opcoes: comoOpcoes(lista), incluidas: comoOpcoes(extras) };
  }

  const alcance = await scopedPersonWhere(ctx);
  const campos = { id: true, name: true, photoUrl: true } as const;
  const [lista, extras] = await Promise.all([
    prisma.person.findMany({ where: q ? { ...alcance, name: { contains: q } } : alcance, orderBy: { name: "asc" }, take: LIMITE_DA_BUSCA + 1, select: campos }),
    ids.length ? prisma.person.findMany({ where: { ...alcance, id: { in: ids } }, select: campos }) : [],
  ]);
  const comoOpcoes = (xs: typeof lista): Opcao[] => xs.map((p) => ({ value: p.id, label: p.name, imagem: p.photoUrl ?? null }));
  return { opcoes: comoOpcoes(lista), incluidas: comoOpcoes(extras) };
}
