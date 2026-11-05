// As quatro DREs em abas (05/11/2026, escolha 6A do Kauan): Caixa, Competência,
// Análises e reconciliação, Orçado × realizado. Cada uma segue na sua rota —
// `/dre`, `/dre/economica`, `/dre/analises`, `/dre/orcamento` —, e a fileira
// de abas no alto das quatro leva de uma para a outra com a mesma empresa e o
// mesmo mês. Eram links soltos no rodapé ("Abrir DRE de caixa", "Ver
// reconciliação", "Abrir orçamento").
//
// Regra pura, sem Prisma: o gate de cada aba mora em `abasDaDreServidor.ts`.

export type AbaDaDre = "caixa" | "competencia" | "analises" | "orcamento";

export const ABAS_DA_DRE: { chave: AbaDaDre; rotulo: string }[] = [
  { chave: "caixa", rotulo: "Caixa" },
  { chave: "competencia", rotulo: "Competência" },
  { chave: "analises", rotulo: "Análises e reconciliação" },
  { chave: "orcamento", rotulo: "Orçado × realizado" },
];

/**
 * O endereço de cada aba, levando a empresa e o período.
 *
 * `mes` é a competência "AAAA-MM". Cada tela lê o mês no seu formato: a DRE de
 * caixa usa "AAAA-M" (sem o zero, o formato dela desde o início), a econômica
 * e as análises usam "AAAA-MM", e o orçamento é por ano.
 */
export function hrefDaAbaDaDre(aba: AbaDaDre, companyId: string, mes?: string | null): string {
  const q = new URLSearchParams({ empresa: companyId });
  const partes = mes?.match(/^(\d{4})-(\d{2})$/);
  if (partes) {
    const [, ano, mm] = partes;
    if (aba === "caixa") q.set("mes", `${ano}-${Number(mm)}`);
    else if (aba === "orcamento") q.set("ano", ano!);
    else q.set("mes", mes!);
  }
  const rota = aba === "caixa" ? "/dre" : aba === "competencia" ? "/dre/economica" : aba === "analises" ? "/dre/analises" : "/dre/orcamento";
  return `${rota}?${q.toString()}`;
}

/**
 * As abas que aparecem, na ordem fixa. Uma aba só — quem não tem nenhum dos
 * módulos de análise — não é fileira de abas: some.
 */
export function abasVisiveis(liberadas: ReadonlySet<AbaDaDre>, ativa: AbaDaDre): AbaDaDre[] {
  const lista = ABAS_DA_DRE.map((a) => a.chave).filter((c) => c === ativa || liberadas.has(c));
  return lista.length > 1 ? lista : [];
}
