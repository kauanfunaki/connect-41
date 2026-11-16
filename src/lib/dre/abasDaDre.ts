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
 *
 * `visaoDoCliente` (16/11/2026, melhoria-718): a tela está em "Visão: Cliente".
 * Caixa e Competência seguem nela (`como=cliente`), com o período no formato
 * do portal — o mês "AAAA-MM" nas duas, ou `ano` no ano inteiro —, porque na
 * visão do cliente quem troca o regime é esta fileira. Análises e Orçamento
 * não têm visão do cliente: abrem como sempre.
 */
export function hrefDaAbaDaDre(
  aba: AbaDaDre,
  companyId: string,
  mes?: string | null,
  visaoDoCliente?: { ano?: string | null } | null
): string {
  const q = new URLSearchParams({ empresa: companyId });
  const doCliente = Boolean(visaoDoCliente) && (aba === "caixa" || aba === "competencia");
  if (doCliente) q.set("como", "cliente");
  const anoInteiro = visaoDoCliente?.ano && /^\d{4}$/.test(visaoDoCliente.ano) ? visaoDoCliente.ano : null;
  const partes = mes?.match(/^(\d{4})-(\d{2})$/);
  if (anoInteiro) {
    // As análises são de um mês: sem mês na tela, abrem no mais recente.
    if (doCliente || aba === "orcamento") q.set("ano", anoInteiro);
  } else if (partes) {
    const [, ano, mm] = partes;
    if (aba === "caixa" && !doCliente) q.set("mes", `${ano}-${Number(mm)}`);
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
