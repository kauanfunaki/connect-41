// "Visão: Equipe | Cliente" (16/11/2026, melhoria-718, alternativa A do Kauan).
//
// "DRE da equipe" e "Como o cliente vê" eram uma segunda fileira de abas na DRE
// de caixa, e a visão do cliente trazia uma terceira (Caixa | Competência). O
// BPO pediu uma fileira só: a das quatro DREs. A visão virou um seletor na
// fileira dos filtros, nas telas de Caixa e de Competência, e na visão do
// cliente quem troca o regime é a aba de cima — `/dre?como=cliente` é o caixa
// do cliente, `/dre/economica?como=cliente` a competência dele.
//
// Regra pura, sem Prisma: quem vê a visão do cliente mora em `acesso.ts`.

export type VisaoDaDre = "equipe" | "cliente";

/** As duas DREs que têm a visão do cliente — as mesmas duas abas do portal. */
export type RegimeDaTela = "caixa" | "competencia";

const ROTA: Record<RegimeDaTela, string> = { caixa: "/dre", competencia: "/dre/economica" };

/** A visão que o endereço pede. `como=cliente` só vale para quem pode vê-la. */
export function visaoDaUrl(como: string | undefined, podeVerComoOCliente: boolean): VisaoDaDre {
  return como === "cliente" && podeVerComoOCliente ? "cliente" : "equipe";
}

/** O período da visão do cliente, no formato do portal: o mês "AAAA-MM" ou o ano inteiro "AAAA". */
export type PeriodoDoPortal = { mes: string | null; ano: string | null };

/** Lê `mes` e `ano` do endereço. O ano inteiro vale no lugar do mês, como no portal. */
export function periodoDoPortal(mes: string | undefined, ano: string | undefined): PeriodoDoPortal {
  if (ano && /^\d{4}$/.test(ano)) return { mes: null, ano };
  return { mes: mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null, ano: null };
}

/** O endereço de "Cliente", com a empresa e o período da tela. */
export function hrefDaVisaoDoCliente(regime: RegimeDaTela, companyId: string, periodo: Partial<PeriodoDoPortal> = {}): string {
  const q = new URLSearchParams({ empresa: companyId, como: "cliente" });
  if (periodo.ano) q.set("ano", periodo.ano);
  else if (periodo.mes) q.set("mes", periodo.mes);
  return `${ROTA[regime]}?${q.toString()}`;
}

/**
 * O endereço de "Equipe" para quem está na visão do cliente, no mesmo período
 * e no formato de cada tela: a DRE de caixa lê o mês sem o zero ("2026-9") e o
 * ano inteiro em `visao=ano`; a de competência não tem ano inteiro, e o ano do
 * cliente abre nela como o acumulado até dezembro — os mesmos doze meses.
 */
export function hrefDaVisaoDaEquipe(regime: RegimeDaTela, companyId: string, periodo: Partial<PeriodoDoPortal> = {}): string {
  const q = new URLSearchParams({ empresa: companyId });
  const partes = periodo.mes?.match(/^(\d{4})-(\d{2})$/);
  if (regime === "caixa") {
    if (periodo.ano) {
      q.set("visao", "ano");
      q.set("ano", periodo.ano);
    } else if (partes) q.set("mes", `${partes[1]}-${Number(partes[2])}`);
  } else if (periodo.ano) {
    q.set("mes", `${periodo.ano}-12`);
    q.set("visao", "acumulado");
  } else if (partes) q.set("mes", periodo.mes!);
  return `${ROTA[regime]}?${q.toString()}`;
}

/**
 * O endereço antigo da competência do cliente, `/dre?como=cliente&regime=competencia`
 * (a aba de dentro da visão do cliente, até 16/11/2026), no endereço novo:
 * `/dre/economica?como=cliente`, com a mesma empresa e o mesmo período. `null`
 * quando não é o endereço antigo — ou quando a competência não está liberada
 * para o cliente: aí a tela fica no caixa, como o portal e como era.
 */
export function enderecoNovoDaVisaoDoCliente(
  params: { como?: string; regime?: string; empresa?: string; mes?: string; ano?: string },
  competenciaLiberada: boolean
): string | null {
  if (params.como !== "cliente" || params.regime !== "competencia" || !competenciaLiberada) return null;
  const q = new URLSearchParams();
  if (params.empresa) q.set("empresa", params.empresa);
  q.set("como", "cliente");
  const { mes, ano } = periodoDoPortal(params.mes, params.ano);
  if (ano) q.set("ano", ano);
  else if (mes) q.set("mes", mes);
  return `${ROTA.competencia}?${q.toString()}`;
}
