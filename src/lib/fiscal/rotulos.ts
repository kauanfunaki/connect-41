// Rótulos e cores dos três eixos de estado do documento fiscal.
//
// Vivem juntos porque a tela precisa mostrar os três lado a lado, e é a
// proximidade que faz a leitura funcionar: "veio do SPED / autorizada /
// pendente" conta a história inteira numa linha.

import type {
  FiscalDocumentType,
  FiscalDocumentOrigin,
  FiscalDocumentSituation,
  FiscalDocumentDestination,
} from "@/generated/prisma/enums";

export const TIPO_LABEL: Record<FiscalDocumentType, string> = {
  NFE: "NF-e",
  NFCE: "NFC-e",
  CTE: "CT-e",
  NFSE: "NFS-e",
};

export const ORIGEM_LABEL: Record<FiscalDocumentOrigin, string> = {
  SPED: "SPED",
  UPLOAD: "Upload",
};

export const SITUACAO_LABEL: Record<FiscalDocumentSituation, string> = {
  AUTORIZADA: "Autorizada",
  CANCELADA: "Cancelada",
};

export const DESTINO_LABEL: Record<FiscalDocumentDestination, string> = {
  PENDENTE: "Pendente",
  LANCADO: "Lançado",
  IGNORADO: "Ignorado",
};

type Variante = "success" | "warning" | "danger" | "info";

/**
 * Cancelada é `danger` e ignorado é só `warning`, de propósito: cancelar é fato
 * de fora que invalida o documento; ignorar é decisão nossa, reversível.
 */
export const SITUACAO_VARIANTE: Record<FiscalDocumentSituation, Variante> = {
  AUTORIZADA: "success",
  CANCELADA: "danger",
};

export const DESTINO_VARIANTE: Record<FiscalDocumentDestination, Variante> = {
  PENDENTE: "info",
  LANCADO: "success",
  IGNORADO: "warning",
};

export const DIRECAO_LABEL = {
  PAGAR: "A pagar",
  RECEBER: "A receber",
  INDEFINIDA: "Indefinida",
} as const;

/** "2026-09" → "set/2026". Curto porque vive em filtro e em coluna de tabela. */
export function competenciaLegivel(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const i = Number(mes) - 1;
  return nomes[i] ? `${nomes[i]}/${ano}` : competencia;
}
