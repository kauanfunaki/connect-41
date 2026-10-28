// Risco de multa nas obrigações por regime (lote 2, 28/10/2026 — o "M3" do
// comparativo de mercado).
//
// A atividade no kanban vence no PRAZO INTERNO, e é por ele que o alerta da
// Gestão avisa. Quem perde o prazo interno ainda tem até a DATA LEGAL — depois
// dela é multa. Este aviso é o segundo degrau: atividade ainda aberta a poucos
// dias úteis da data legal, no próprio dia, e depois dela.
//
// Puro, sem banco: quem lê as obrigações e manda o aviso é `alerts.ts`.

import { somarDias } from "@/lib/datas/calendario";
import { ehDiaUtil, type Feriados } from "./calendario";

/** Quantos dias úteis antes da data legal começa o aviso. */
export const DIAS_UTEIS_DE_ANTECEDENCIA = 2;
/** Depois da data legal, avisa só por estes dias corridos — obrigação esquecida há meses não volta todo dia. */
export const DIAS_DEPOIS_DA_DATA_LEGAL = 5;

export type RiscoDeMulta =
  | { situacao: "PERTO"; diasUteis: number }
  | { situacao: "HOJE" }
  | { situacao: "PASSOU"; dias: number };

/** Dias úteis de `de` (exclusive) até `ate` (inclusive). `de` < `ate`. */
function diasUteisEntre(de: string, ate: string, feriados: Feriados): number {
  let n = 0;
  let d = de;
  for (let i = 0; i < 400 && d < ate; i++) {
    d = somarDias(d, 1);
    if (ehDiaUtil(d, feriados)) n++;
  }
  return n;
}

function diasCorridosEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** A situação de uma obrigação ainda aberta, ou nulo quando não é hora de avisar. Datas "AAAA-MM-DD". */
export function riscoDeMulta(dataLegal: string, hoje: string, feriados: Feriados): RiscoDeMulta | null {
  if (dataLegal === hoje) return { situacao: "HOJE" };
  if (dataLegal < hoje) {
    const dias = diasCorridosEntre(dataLegal, hoje);
    return dias <= DIAS_DEPOIS_DA_DATA_LEGAL ? { situacao: "PASSOU", dias } : null;
  }
  const diasUteis = diasUteisEntre(hoje, dataLegal, feriados);
  return diasUteis <= DIAS_UTEIS_DE_ANTECEDENCIA ? { situacao: "PERTO", diasUteis } : null;
}

/**
 * A chave do aviso: um por situação de cada obrigação — "perto", "hoje" e
 * "passou" saem uma vez cada, e não todo dia.
 */
export function chaveDoRisco(obrigacaoId: string, r: RiscoDeMulta): string {
  return `OBRIGACAO_MULTA:${obrigacaoId}:${r.situacao}`;
}

export function mensagemDoRisco(r: RiscoDeMulta, p: { obrigacao: string; empresa: string; dataLegal: string }): string {
  const data = p.dataLegal.split("-").reverse().join("/");
  const oQue = `${p.obrigacao} de ${p.empresa}`;
  if (r.situacao === "HOJE") return `Risco de multa: ${oQue} vence hoje na data legal (${data}) e ainda está aberta.`;
  if (r.situacao === "PASSOU") {
    return `Data legal passou há ${r.dias} ${r.dias === 1 ? "dia" : "dias"} (${data}): ${oQue} ainda está aberta e pode gerar multa.`;
  }
  return `Risco de multa: ${oQue} vence na data legal em ${r.diasUteis} ${r.diasUteis === 1 ? "dia útil" : "dias úteis"} (${data}) e ainda está aberta.`;
}
