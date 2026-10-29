// As quatro etapas da aba SPED (EFD ICMS/IPI), na ordem do trabalho do mês
// (29/10/2026). Puro.
//
// Classificação, Apuração e Fechamento são processados no Connect, sobre o
// arquivo e as leituras do motor; Gerar SPED pede a geração ao motor.

export const ETAPAS_DO_SPED = [
  { chave: "classificacao", rotulo: "Classificação", modulo: "fiscal_classificacao", resumo: "Destinação e crédito de cada produto de entrada." },
  { chave: "apuracao", rotulo: "Apuração", modulo: "fiscal_icms_ipi", resumo: "Apuração do ICMS, ajustes e livro fiscal." },
  { chave: "fechamento", rotulo: "Fechamento", modulo: "fiscal_contribuicoes", resumo: "Documentos, faturamento e pendências da competência." },
  { chave: "gerar", rotulo: "Gerar SPED", modulo: "fiscal_operacao", resumo: "Geração no motor, validação e download do arquivo." },
] as const;

export type EtapaDoSped = (typeof ETAPAS_DO_SPED)[number]["chave"];

export const CAMINHO_DO_SPED = "/fiscal/sped";

export function caminhoDaEtapa(etapa: EtapaDoSped): string {
  return `${CAMINHO_DO_SPED}/${etapa}`;
}

/** O endereço de uma etapa com a empresa e a competência (e o que mais vier). */
export function hrefDoSped(etapa: EtapaDoSped, recorte: { empresa?: string | null; competencia?: string | null }, extra: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams();
  if (recorte.empresa) q.set("empresa", recorte.empresa);
  if (recorte.competencia) q.set("competencia", recorte.competencia);
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${caminhoDaEtapa(etapa)}?${s}` : caminhoDaEtapa(etapa);
}

export function ehEtapa(valor: string | undefined): valor is EtapaDoSped {
  return ETAPAS_DO_SPED.some((e) => e.chave === valor);
}
