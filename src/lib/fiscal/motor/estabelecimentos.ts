// Company do Connect ↔ estabelecimento do motor SPED (J1.2, 22/10/2026).
//
// Puro. O vínculo é pelo CNPJ inteiro: no Connect cada estabelecimento já é uma
// `Company` (matriz e filial da BLD são duas), e no motor cada linha de
// `empresas` é um estabelecimento. A raiz (8 dígitos) só diz de quem é.
//
// As divergências ficam explícitas, como pede o plano (J1.2): o que o motor tem
// sem cadastro no Connect não aparece nas telas de operação (ninguém do
// escritório "vê" um estabelecimento sem empresa), e aparece em Configurações
// para quem resolve o cadastro.

import type { EmpresaDoMotor } from "@/lib/sped/motor";

export type CompanyFiscal = { id: string; nome: string; cnpj: string; regime: string | null };

export type EstabelecimentoVisivel = {
  id: number;
  cnpj: string;
  rotulo: string;
  uf: string;
  matriz: boolean;
  ativo: boolean;
  obrigacoes: string[];
  companyId: string;
  companyNome: string;
  regime: string | null;
};

export type MapaDaRaiz = {
  visiveis: EstabelecimentoVisivel[];
  /** No motor, sem `Company` com o mesmo CNPJ no escritório. */
  semCadastro: EmpresaDoMotor[];
  /** `Company` da raiz que o motor não tem. */
  semMotor: CompanyFiscal[];
};

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function mapearEstabelecimentos(raiz: string, motor: EmpresaDoMotor[], companies: CompanyFiscal[]): MapaDaRaiz {
  const daRaiz = companies.filter((c) => soDigitos(c.cnpj).length === 14 && soDigitos(c.cnpj).startsWith(raiz));
  const porCnpj = new Map(daRaiz.map((c) => [soDigitos(c.cnpj), c]));
  const visiveis: EstabelecimentoVisivel[] = [];
  const semCadastro: EmpresaDoMotor[] = [];
  const usadas = new Set<string>();
  for (const e of motor) {
    // O motor responde só a raiz pedida; um CNPJ de outra raiz aqui é defeito
    // do outro lado, e não entra.
    if (!e.cnpj.startsWith(raiz)) continue;
    const c = porCnpj.get(e.cnpj);
    if (!c) { semCadastro.push(e); continue; }
    usadas.add(c.id);
    visiveis.push({
      id: e.id, cnpj: e.cnpj, rotulo: e.rotulo || e.razao_social, uf: e.uf, matriz: e.matriz, ativo: e.ativo,
      obrigacoes: e.obrigacoes, companyId: c.id, companyNome: c.nome, regime: c.regime,
    });
  }
  visiveis.sort((a, b) => Number(b.matriz) - Number(a.matriz) || a.cnpj.localeCompare(b.cnpj));
  return { visiveis, semCadastro, semMotor: daRaiz.filter((c) => !usadas.has(c.id)) };
}

/** Competência padrão: o mês anterior, que é o que o fiscal fecha. */
export function competenciaPadrao(hoje = new Date()): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export type ContextoDoMotor = { raiz: string; estabelecimentoId: number | null; competencia: string };

/**
 * O recorte pedido na URL, conferido contra o que a pessoa alcança: raiz fora
 * da lista cai na primeira; estabelecimento que não está entre os visíveis vira
 * "todos" (nunca um id de fora); competência malformada vira a padrão.
 */
export function contextoDaUrl(
  params: { raiz?: string | null; estab?: string | null; competencia?: string | null },
  raizes: readonly string[],
  visiveisDaRaiz: (raiz: string) => readonly { id: number }[],
  hoje = new Date(),
): ContextoDoMotor | null {
  if (raizes.length === 0) return null;
  const raiz = params.raiz && raizes.includes(params.raiz) ? params.raiz : raizes[0];
  const pedido = Number(params.estab);
  const estabelecimentoId = Number.isSafeInteger(pedido) && visiveisDaRaiz(raiz).some((e) => e.id === pedido) ? pedido : null;
  const competencia = params.competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.competencia) ? params.competencia : competenciaPadrao(hoje);
  return { raiz, estabelecimentoId, competencia };
}
