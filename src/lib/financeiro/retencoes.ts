// Retenções na fonte da conta a pagar (lote D da fila do BPO, 20/10 — as
// retenções do Omie): o imposto que o tomador do serviço segura do fornecedor
// e recolhe ele mesmo. Funções puras; a gravação e as contas dos impostos
// moram em `retencoesServidor.ts`.
//
// ─── Bruto, líquido e a conta de cada imposto ───────────────────────────────
//
// A nota de R$ 1.000 com R$ 15 de IRRF retido: o fornecedor recebe R$ 985 (a
// conta a pagar dele, o líquido) e a Receita recebe R$ 15 (a conta do
// imposto, gerada aqui). O bruto é o líquido mais as retenções — a regra do
// BPO (Amanda, 10/09/2026) é que com retenção paga-se o fornecedor pelo
// líquido. Somadas, as duas contas dão a despesa da nota inteira na DRE.
//
// Só conta a pagar: na conta a receber, a retenção é crédito do escritório do
// cliente, e isso é outra decisão contábil.

import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "./manual";

export const TRIBUTOS_RETIDOS = ["IRRF", "PIS", "COFINS", "CSLL", "INSS", "ISS"] as const;

export type TributoRetido = (typeof TRIBUTOS_RETIDOS)[number];

/** O nome curto, o nome na conta do imposto e quem recebe. */
export const TRIBUTO: Record<TributoRetido, { rotulo: string; nome: string; orgao: "federal" | "municipal" }> = {
  IRRF: { rotulo: "IRRF", nome: "IRRF retido", orgao: "federal" },
  PIS: { rotulo: "PIS", nome: "PIS retido", orgao: "federal" },
  COFINS: { rotulo: "COFINS", nome: "COFINS retida", orgao: "federal" },
  CSLL: { rotulo: "CSLL", nome: "CSLL retida", orgao: "federal" },
  INSS: { rotulo: "INSS", nome: "INSS retido", orgao: "federal" },
  ISS: { rotulo: "ISS", nome: "ISS retido", orgao: "municipal" },
};

export function tributoRetido(v: unknown): v is TributoRetido {
  return typeof v === "string" && (TRIBUTOS_RETIDOS as readonly string[]).includes(v);
}

/** O nome do campo de cada tributo nos formulários. */
export const campoDaRetencao = (t: TributoRetido) => `retencao:${t}`;

export type RetencaoInformada = { tributo: TributoRetido; centavos: number };

const reais = (c: number) => formatarReaisDeCentavos(c);

/**
 * Lê os seis campos do formulário. Vazio é zero; só o que tem valor volta.
 * Texto ilegível ou negativo é erro — e não zero, que tiraria uma retenção
 * que alguém quis informar.
 */
export function lerRetencoes(campo: (nome: string) => string): { ok: true; retencoes: RetencaoInformada[] } | { ok: false; erro: string } {
  const retencoes: RetencaoInformada[] = [];
  for (const tributo of TRIBUTOS_RETIDOS) {
    const texto = campo(campoDaRetencao(tributo)).trim();
    if (!texto) continue;
    const centavos = centavosDeTexto(texto);
    if (centavos === null || centavos < 0) return { ok: false, erro: `Valor do ${TRIBUTO[tributo].rotulo} retido ilegível. Use, por exemplo, 15,00.` };
    if (centavos > 0) retencoes.push({ tributo, centavos });
  }
  return { ok: true, retencoes };
}

export const somaDasRetencoes = (r: { centavos: number }[]) => r.reduce((s, x) => s + x.centavos, 0);

/** O líquido a pagar ao fornecedor: o bruto menos as retenções, que não podem levar a conta a zero. */
export function liquidoDaConta(brutoCentavos: number, retencoes: RetencaoInformada[]): { ok: true; liquidoCentavos: number } | { ok: false; erro: string } {
  const retido = somaDasRetencoes(retencoes);
  const liquido = brutoCentavos - retido;
  if (liquido <= 0) {
    return { ok: false, erro: `As retenções (${reais(retido)}) não podem chegar ao valor bruto (${reais(brutoCentavos)}) — o fornecedor ficaria sem nada a receber.` };
  }
  return { ok: true, liquidoCentavos: liquido };
}

/**
 * O vencimento padrão da conta do imposto: o dia 20 do mês seguinte à
 * competência — IRRF, CSRF e INSS retidos vencem no dia 20 — e o dia 10 no
 * ISS, o mais comum entre os municípios. Caindo no sábado ou no domingo,
 * antecipa para a sexta (a regra federal antecipa; feriado não entra). A
 * conta do imposto é uma conta como outra: o vencimento se ajusta nela.
 */
export function vencimentoDoImposto(tributo: TributoRetido, competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  const seguinteAno = mes === 12 ? ano + 1 : ano;
  const seguinteMes = mes === 12 ? 1 : mes + 1;
  let dia = tributo === "ISS" ? 10 : 20;
  const semana = new Date(Date.UTC(seguinteAno, seguinteMes - 1, dia)).getUTCDay();
  if (semana === 6) dia -= 1;
  if (semana === 0) dia -= 2;
  return `${seguinteAno}-${String(seguinteMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * A categoria da conta do imposto. IRRF, PIS, COFINS e CSLL vão para a
 * categoria de retidos do plano ("Impostos Retidos Serviços Tomados
 * (PIS/COFINS/CSLL/IRRF)", no CMV — pedido de 14/10); sem ela no plano da
 * empresa, e sempre no INSS e no ISS, a categoria da conta de origem — o
 * imposto é parte do custo do serviço que a gerou.
 */
export function categoriaDoImposto(tributo: TributoRetido, p: { categoriaDaConta: string | null; categoriaDosRetidos: string | null }): string | null {
  if (tributo === "INSS" || tributo === "ISS") return p.categoriaDaConta;
  return p.categoriaDosRetidos ?? p.categoriaDaConta;
}

/** Quem recebe o imposto: a Receita (DARF) nos federais e no INSS; a prefeitura no ISS. */
export const RECEITA_FEDERAL = { nome: "Receita Federal do Brasil", documento: "00394460005887" } as const;
export const PREFEITURA_DO_ISS = { nome: "Prefeitura — ISS retido", documento: null } as const;

export function credorDoImposto(tributo: TributoRetido): { nome: string; documento: string | null } {
  return TRIBUTO[tributo].orgao === "municipal" ? PREFEITURA_DO_ISS : RECEITA_FEDERAL;
}

/** "IRRF retido — NF 123 · Fornecedor X" — como a conta do imposto se explica na lista. */
export function descricaoDaContaDoImposto(tributo: TributoRetido, p: { documento: string | null; fornecedor: string }): string {
  const de = [p.documento ? `nº ${p.documento}` : null, p.fornecedor].filter(Boolean).join(" · ");
  return `${TRIBUTO[tributo].nome} — ${de}`.slice(0, 255);
}

/** "IRRF R$ 15,00 · PIS R$ 6,50" — o resumo das retenções, para a auditoria e a linha do bloco. */
export function resumoDasRetencoes(r: RetencaoInformada[]): string | null {
  if (r.length === 0) return null;
  return r.map((x) => `${TRIBUTO[x.tributo].rotulo} ${reais(x.centavos)}`).join(" · ");
}

// ─── A edição, tributo a tributo ────────────────────────────────────────────

export type ContaDoImposto = {
  id: string;
  /** Paga, ou com baixa parcial: o dinheiro já foi para a Receita ou a prefeitura. */
  temBaixa: boolean;
  cancelada: boolean;
};

export type RetencaoAtual = { tributo: TributoRetido; centavos: number; conta: ContaDoImposto | null };

export type PassoDaRetencao =
  /** Tributo novo — ou que tinha a conta cancelada ou apagada: grava a retenção e gera a conta. */
  | { tipo: "criar"; tributo: TributoRetido; centavos: number }
  /** Valor novo numa retenção com a conta em aberto: muda as duas. */
  | { tipo: "atualizar"; tributo: TributoRetido; centavos: number; contaId: string }
  /** Tributo zerado: tira a retenção e cancela a conta em aberto, se houver. */
  | { tipo: "tirar"; tributo: TributoRetido; contaId: string | null };

/**
 * O que salvar as retenções faz, tributo a tributo. Conta do imposto com
 * baixa não muda nem sai — o dinheiro já foi recolhido, e mudar a retenção
 * por baixo deixaria a conta do imposto dizendo outra coisa. O caminho é
 * desfazer a baixa dela.
 */
export function planoDasRetencoes(atuais: RetencaoAtual[], novas: RetencaoInformada[]): { ok: true; passos: PassoDaRetencao[] } | { ok: false; erro: string } {
  const passos: PassoDaRetencao[] = [];
  const porTributo = new Map(atuais.map((a) => [a.tributo, a]));
  const pedidas = new Map(novas.map((n) => [n.tributo, n.centavos]));
  for (const tributo of TRIBUTOS_RETIDOS) {
    const atual = porTributo.get(tributo);
    const nova = pedidas.get(tributo) ?? 0;
    const viva = atual?.conta && !atual.conta.cancelada ? atual.conta : null;
    if (!atual) {
      if (nova > 0) passos.push({ tipo: "criar", tributo, centavos: nova });
      continue;
    }
    if (nova === atual.centavos) continue;
    if (viva?.temBaixa) {
      return { ok: false, erro: `A conta do ${TRIBUTO[tributo].nome} já tem baixa — desfaça a baixa dela para mudar a retenção.` };
    }
    if (nova === 0) passos.push({ tipo: "tirar", tributo, contaId: viva?.id ?? null });
    else if (viva) passos.push({ tipo: "atualizar", tributo, centavos: nova, contaId: viva.id });
    else passos.push({ tipo: "criar", tributo, centavos: nova });
  }
  return { ok: true, passos };
}
