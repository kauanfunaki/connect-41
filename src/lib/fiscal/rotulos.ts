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

/**
 * O tipo como o cliente do portal lê (11/11/2026). A sigla é a língua da
 * equipe; para quem não é contador, "NFC-e" solta não diz nada. A sigla segue
 * na dica (`TIPO_SIGLA_PORTAL`), para quem precisa dela com o sistema dele ou o
 * contador de fora. A equipe continua com `TIPO_LABEL`.
 */
export const TIPO_LABEL_PORTAL: Record<FiscalDocumentType, string> = {
  NFE: "Nota de produto",
  NFCE: "Nota de consumidor",
  CTE: "Frete",
  NFSE: "Nota de serviço",
};

/** A dica do tipo no portal: a sigla e o que ela quer dizer. */
export const TIPO_SIGLA_PORTAL: Record<FiscalDocumentType, string> = {
  NFE: "NF-e · nota fiscal eletrônica",
  NFCE: "NFC-e · nota fiscal de consumidor eletrônica",
  CTE: "CT-e · conhecimento de transporte eletrônico",
  NFSE: "NFS-e · nota fiscal de serviço eletrônica",
};

export const ORIGEM_LABEL:Record<FiscalDocumentOrigin, string> = {
  SPED: "SPED",
  UPLOAD: "Upload",
  OMIE: "Omie",
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

/**
 * "2026-10" → "outubro de 2026", para o portal (11/11/2026): "Out/26" é
 * abreviação de planilha, e o cliente lê no celular, onde há espaço para a
 * palavra inteira. Fora do formato, devolve o texto como veio.
 */
export function competenciaPorExtenso(competencia: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competencia);
  if (!m) return competencia;
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(m[2]) - 1]} de ${m[1]}`;
}
