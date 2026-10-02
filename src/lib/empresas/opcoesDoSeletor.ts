import type { Opcao } from "@/components/shared/SearchableSelect";
import { formatCnpj } from "@/lib/format";

// As empresas como opções do `SearchableSelect` (02/10/2026): logo, CNPJ embaixo
// do nome (e na busca, só os dígitos) e a filial recuada logo abaixo da matriz.
//
// Aceita `nome` ou `name`: cada tela monta a lista de um jeito, e todas passam
// por aqui. Os campos a mais são opcionais — sem logo vira iniciais, sem CNPJ
// a busca fica só pelo nome, sem matriz a lista é plana.

export type EmpresaParaEscolher = {
  id: string;
  nome?: string;
  name?: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  /** A matriz, quando esta é filial. */
  matrizId?: string | null;
  /** O mesmo, com o nome do campo no banco — para passar o resultado do Prisma direto. */
  parentCompanyId?: string | null;
};

const ordem = new Intl.Collator("pt-BR", { sensitivity: "base" });

function nomeDe(e: EmpresaParaEscolher): string {
  return e.nome ?? e.name ?? "";
}

function opcao(e: EmpresaParaEscolher, recuo: boolean): Opcao {
  return {
    value: e.id,
    label: nomeDe(e),
    imagem: e.logoUrl ?? null,
    descricao: e.cnpj ? formatCnpj(e.cnpj) : undefined,
    busca: e.cnpj ?? undefined,
    recuo,
  };
}

export function opcoesDeEmpresa(empresas: EmpresaParaEscolher[]): Opcao[] {
  const ids = new Set(empresas.map((e) => e.id));
  const filiais = new Map<string, EmpresaParaEscolher[]>();
  const raizes: EmpresaParaEscolher[] = [];
  for (const e of empresas) {
    const matriz = e.matrizId ?? e.parentCompanyId;
    // Filial cuja matriz não está na lista (fora do alcance, inativa) fica solta.
    if (matriz && ids.has(matriz)) filiais.set(matriz, [...(filiais.get(matriz) ?? []), e]);
    else raizes.push(e);
  }
  const porNome = (a: EmpresaParaEscolher, b: EmpresaParaEscolher) => ordem.compare(nomeDe(a), nomeDe(b));
  return raizes.sort(porNome).flatMap((r) => [opcao(r, false), ...(filiais.get(r.id) ?? []).sort(porNome).map((f) => opcao(f, true))]);
}

/** O `select` do Prisma com o que a escolha de empresa usa. */
export const CAMPOS_DA_EMPRESA_NO_SELETOR = {
  id: true,
  name: true,
  displayName: true,
  logoUrl: true,
  cnpj: true,
  parentCompanyId: true,
} as const;
