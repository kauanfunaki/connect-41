import { isValidCNPJ, isValidCPF, digitsOnly } from "@/lib/validation/common";

/**
 * O documento pelo qual uma empresa é identificada num documento fiscal.
 *
 * Existe como tipo próprio, e não como `string | null`, porque é a guarda da
 * regra decidida em 2026-09-03: **empresa sem documento não recebe documento
 * fiscal**. Com `string | null` circulando, a regra seria um `if` que alguém
 * esquece uma vez — e o efeito de esquecer é `where: { cnpj: null }`, que no
 * MySQL casa com todas as empresas sem CNPJ do tenant e pendura a nota na
 * primeira que aparecer.
 *
 * Mesma ideia do `FiscalDocumentScope` do protótipo: o filtro que não pode
 * faltar vira argumento obrigatório, e esquecer vira erro de compilação.
 */
export type DocumentoFiscal =
  | { tipo: "CNPJ"; digitos: string }
  | { tipo: "CPF"; digitos: string };

/** O que uma `Company` precisa expor para ser casada com um documento. */
export type EmpresaIdentificavel = {
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
  cnpj: string | null;
  cpf: string | null;
};

/**
 * Documento pelo qual esta empresa é identificada, ou `null` quando ela não
 * tem nenhum.
 *
 * Lê o campo que corresponde ao `kind`, e só ele. Uma PF com CNPJ preenchido
 * por engano não passa a ser casável por CNPJ: o cadastro é que está errado, e
 * mascarar isso aqui esconderia o erro em vez de mostrá-lo.
 */
export function documentoDaEmpresa(empresa: EmpresaIdentificavel): DocumentoFiscal | null {
  const bruto = empresa.kind === "PESSOA_FISICA" ? empresa.cpf : empresa.cnpj;
  const digitos = digitsOnly(bruto);
  if (!digitos) return null;

  if (empresa.kind === "PESSOA_FISICA") {
    return isValidCPF(digitos) ? { tipo: "CPF", digitos } : null;
  }
  return isValidCNPJ(digitos) ? { tipo: "CNPJ", digitos } : null;
}

/**
 * A regra, dita em uma linha: empresa sem documento válido não entra no acervo
 * fiscal. Serve à tela — para avisar no cadastro em vez de deixar o usuário
 * descobrir quando a nota não achar empresa.
 */
export function podeReceberDocumentoFiscal(empresa: EmpresaIdentificavel): boolean {
  return documentoDaEmpresa(empresa) !== null;
}

/**
 * Classifica o documento que veio do XML (emitente ou destinatário).
 *
 * Decide pelo tamanho, que é o único critério disponível: o XML da SEFAZ traz
 * `<CNPJ>` e `<CPF>` em tags distintas, mas NFS-e municipal nem sempre — várias
 * emitem um `<Cpf Cnpj>` genérico. Onze dígitos é CPF, catorze é CNPJ; qualquer
 * outro tamanho é lixo e vira `null`, nunca um palpite.
 *
 * Documento com dígito verificador inválido também vira `null`. Casar por
 * documento inválido é como casar por `null`: acha a empresa errada com a
 * mesma confiança com que acharia a certa.
 */
export function lerDocumentoFiscal(bruto: string | null | undefined): DocumentoFiscal | null {
  const digitos = digitsOnly(bruto);
  if (!digitos) return null;

  if (digitos.length === 11) {
    return isValidCPF(digitos) ? { tipo: "CPF", digitos } : null;
  }
  if (digitos.length === 14) {
    return isValidCNPJ(digitos) ? { tipo: "CNPJ", digitos } : null;
  }
  return null;
}

/**
 * Fragmento de `where` do Prisma que casa a empresa com este documento.
 *
 * É o único caminho por onde uma consulta de casamento deve montar o filtro de
 * documento, e é por isso que ele recebe `DocumentoFiscal` e não uma string: o
 * tipo não tem estado "ausente", então não existe entrada que produza
 * `{ cnpj: null }`.
 *
 * O `tenantId` continua sendo do chamador porque o alcance é dele — mas o par
 * (tenantId, documento) é único no banco pelos dois índices, então a consulta
 * devolve no máximo uma empresa.
 */
export function filtroDeCasamento(doc: DocumentoFiscal): { cnpj: string } | { cpf: string } {
  return doc.tipo === "CNPJ" ? { cnpj: doc.digitos } : { cpf: doc.digitos };
}

/** Rótulo do campo na tela — "CNPJ" ou "CPF", conforme o tipo da empresa. */
export function rotuloDoDocumento(kind: EmpresaIdentificavel["kind"]): "CNPJ" | "CPF" {
  return kind === "PESSOA_FISICA" ? "CPF" : "CNPJ";
}
