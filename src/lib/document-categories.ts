import type { DocumentCategory } from "@/generated/prisma/enums";

// Rótulos das categorias de documento. Extraído do DocumentsSection quando a
// etapa "Documentos" do cadastro de pessoa passou a oferecer upload também —
// os dois lugares precisam oferecer exatamente as mesmas opções.
export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  ADMISSAO:    "Admissão",
  ASO:         "ASO",
  CURRICULO:   "Currículo",
  ATESTADO:    "Atestado",
  CERTIFICADO: "Certificado",
  RECIBO:      "Recibo",
  CONTRATO:    "Contrato",
  OUTRO:       "Outro",
};

export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as DocumentCategory[];

/**
 * Teto de um documento anexado (`/api/documents` e o formulário). Até 28/10/2026
 * a tela dizia 20 MB e a rota recusava acima de 10 MB; cabe nos 26 MB que o
 * proxy guarda (`proxyClientMaxBodySize`).
 */
export const TETO_DOS_DOCUMENTOS_MB = 20;
