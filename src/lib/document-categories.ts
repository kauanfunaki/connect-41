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
