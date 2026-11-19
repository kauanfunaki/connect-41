// Notas fiscais (Bloco C, Fase C1, 18/11/2026): o que os leitores devolvem. Porte de `NotaParseada`
// (`src/domain/notas/xml_parser.py`), que o leitor de XML e o leitor visual (PDF e imagem, por IA)
// devolvem igual.
//
// Datas e horas são texto ISO 8601 com o fuso do documento quando ele traz ("2026-03-05T10:20:00-03:00");
// dinheiro é `Dec`, nunca number.

import type { Dec } from "../motor/decimal";

export type TipoNota = "nfe" | "nfse";

/** Procedência da nota, em ordem decrescente de confiança (a coluna `origem` do original). */
export type OrigemNota = "xml_assinado" | "xml_nao_verificado" | "ocr";

export type NotaLida = {
  tipo: TipoNota;
  numero: string;
  serie: string | null;
  cnpjEmitente: string;
  nomeEmitente: string | null;
  cnpjDestinatario: string | null;
  valor: Dec;
  dataEmissao: string;
  chaveAcesso: string | null;
  observacao: string | null;
  /**
   * `null` = a assinatura conferiu. Preenchido = a nota entra assim mesmo, com o motivo registrado
   * (decisão do escritório em 01/09/2026: os XML do downloader de DF-e vêm alterados depois de
   * assinados; quem dá fé é o protocolo da SEFAZ).
   */
  assinaturaNaoVerificada: string | null;
};
