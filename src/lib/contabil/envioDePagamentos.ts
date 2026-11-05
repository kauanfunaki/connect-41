// Os tipos de documento que a etapa Pagamentos sem nota recebe (03/11/2026),
// à parte da importação para a tela poder montar a lista.

/** O que se envia na etapa. O recibo já diz se é de motorista: o Connect não tem a pasta da rede para adivinhar. */
export const TIPOS_DE_ENVIO = {
  rpa: { rotulo: "RPA (lote de recibos de autônomo)", tipo: "rpa", categoria: "" },
  recibo_motorista: { rotulo: "Recibos de motorista", tipo: "recibo", categoria: "recibo_motorista" },
  recibo_outros: { rotulo: "Recibos de outras despesas", tipo: "recibo", categoria: "recibo_outros" },
  contrato_motorista: { rotulo: "Contratos de motorista", tipo: "contrato_motorista", categoria: "" },
  contrato_locacao: { rotulo: "Contratos de locação", tipo: "contrato_locacao", categoria: "" },
  planilha_bpo: { rotulo: "Planilha de pagamentos do BPO (faturas)", tipo: "planilha_bpo", categoria: "" },
  fatura_pdf: { rotulo: "PDFs das faturas (comprovantes)", tipo: "fatura", categoria: "" },
} as const;
export type TipoDeEnvio = keyof typeof TIPOS_DE_ENVIO;
