// O documento fiscal como o cliente o vê no portal (11/11/2026). Puro: a
// tabela de documentos (servidor) e o botão de baixar (cliente) importam daqui,
// e a rota do PDF também — o banco e a rede ficam na rota.

import type { FiscalDocumentOrigin, FiscalDocumentType } from "@/generated/prisma/enums";
import type { DirecaoDoLancamento } from "./documentos";

/**
 * Há PDF para oferecer? Só no documento que veio do motor do SPED com XML
 * guardado (`renderizavel`): é de lá que o PDF sai, montado do XML.
 *
 * - Upload e Omie não guardam arquivo no Connect (`filePath` nunca foi gravado
 *   na entrada por XML) — o Omie, aliás, entra com `renderizavel` falso;
 * - `renderizavel` falso é o motor dizendo que não tem o XML.
 *
 * É a primeira defesa, a que esconde o botão. A segunda é a rota, que confere de
 * novo e responde 409 quando o motor diz `sem_xml_armazenado`.
 */
export function temPdfNoPortal(d: { origin: FiscalDocumentOrigin; renderizavel: boolean }): boolean {
  return d.origin === "SPED" && d.renderizavel;
}

/** O endereço do PDF de um documento no portal. */
export const rotaDoPdfNoPortal = (id: string) => `/portal/documentos/${encodeURIComponent(id)}/pdf`;

/**
 * As raízes de CNPJ em que o motor pode ter indexado a nota, na ordem de
 * tentativa: a da empresa dona da linha primeiro (é por ela que a sincronização
 * a trouxe, no caso comum), depois a do emitente e a do destinatário — a nota
 * entre duas empresas da carteira chega pela raiz da primeira que sincronizou.
 * CPF não tem raiz e fica de fora. Quem chama ainda filtra pelas raízes que o
 * alcance autoriza: esta lista só diz onde procurar, não onde se pode.
 */
export function raizesDoDocumento(d: {
  empresaCnpj: string | null;
  issuerDocument: string | null;
  recipientDocument: string | null;
}): string[] {
  const raizes: string[] = [];
  for (const doc of [d.empresaCnpj, d.issuerDocument, d.recipientDocument]) {
    const digitos = (doc ?? "").replace(/\D/g, "");
    if (digitos.length !== 14) continue;
    const raiz = digitos.slice(0, 8);
    if (!raizes.includes(raiz)) raizes.push(raiz);
  }
  return raizes;
}

const SLUG_DO_TIPO: Record<FiscalDocumentType, string> = {
  NFE: "nota-de-produto",
  NFCE: "nota-de-consumidor",
  CTE: "frete",
  NFSE: "nota-de-servico",
};

/** "nota-de-produto-123-1.pdf": o nome do arquivo baixado, só ASCII (vai no cabeçalho). */
export function nomeDoPdfNoPortal(d: { type: FiscalDocumentType; number: string; series: string | null }): string {
  const limpo = (s: string) => s.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
  const numero = [limpo(d.number), d.series ? limpo(d.series) : ""].filter(Boolean).join("-");
  return `${SLUG_DO_TIPO[d.type]}${numero ? `-${numero}` : ""}.pdf`;
}

/**
 * Venda ou compra, e o nome certo da outra ponta (11/11/2026). O cliente não
 * sabia se a nota era dele vendendo ou comprando: a tabela dizia "Fornecedor ou
 * cliente" para todas.
 *
 * Sai da direção do lançamento: a empresa **emitente** vendeu (a receber), a
 * **destinatária** comprou (a pagar). Indefinida — nota de si para si entre
 * estabelecimentos, ou nenhuma das pontas é a empresa — fica sem selo, com o
 * emitente na linha.
 */
export type LadoNoPortal = { selo: "Venda" | "Compra" | null; rotuloDaContraparte: string };

export function ladoNoPortal(direcao: DirecaoDoLancamento): LadoNoPortal {
  if (direcao === "RECEBER") return { selo: "Venda", rotuloDaContraparte: "Cliente" };
  if (direcao === "PAGAR") return { selo: "Compra", rotuloDaContraparte: "Fornecedor" };
  return { selo: null, rotuloDaContraparte: "Emitente" };
}
