// Regras do módulo de Documentos Fiscais que não dependem de banco.
//
// Etapa 1 da Fase 2, junto do schema. Vivem aqui, e não espalhadas nas telas,
// porque cada uma é uma decisão que precisa valer igual no upload, na
// sincronização com o SPED e no portal do cliente — três caminhos que escrevem
// e leem o mesmo acervo.

import { digitsOnly } from "@/lib/validation/common";

export type TipoDocumento = "NFE" | "NFCE" | "CTE" | "NFSE";

/**
 * Competência do documento lido do XML: o mês a que ele pertence, "AAAA-MM".
 *
 * String e não data porque é **agrupador de mês**, não instante. Guardar como
 * data obrigaria toda consulta de tela a truncar, o que joga fora o índice.
 *
 * Sai do **dia local da emissão** (`emitidoEmLocal` de src/lib/fiscal/xml.ts),
 * e não do instante em UTC (bug-473, 11/11/2026). Até então valia o UTC, e uma
 * NF-e de 30/09 às 22h em Brasília entrava em outubro no acervo e no SPED.
 * Fiscalmente a nota é de setembro: é o dia impresso nela. O dia local vem do
 * texto do XML, que já traz o fuso de quem emitiu, então o resultado não
 * depende do fuso do servidor — o motivo de antes ter sido UTC continua
 * atendido.
 */
export function competenciaDaEmissao(emitidoEmLocal: string): string {
  return emitidoEmLocal.slice(0, 7);
}

/**
 * Competência a partir de uma **data sem hora** guardada como meia-noite UTC
 * ("2026-09-30" vira 2026-09-30T00:00Z): a data digitada na edição do
 * documento, e o `issuedAt` das notas que vêm do índice do SPED.
 *
 * Não serve para o instante de um XML: em UTC a nota das 22h do último dia já
 * está no mês seguinte. Para XML, `competenciaDaEmissao`.
 */
export function competenciaDe(emitidoEm: Date): string {
  const ano = emitidoEm.getUTCFullYear();
  const mes = String(emitidoEm.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

/**
 * Chave canônica de deduplicação.
 *
 * NF-e, NFC-e e CT-e têm chave de acesso nacional de 44 dígitos, e ela é a
 * identidade — não há o que inventar.
 *
 * NFS-e não tem. É municipal, e a adesão ao padrão nacional é parcial: número
 * se repete entre prestadores, e série é opcional em muitas prefeituras. O
 * menor conjunto que identifica é **prestador + série + número + competência**.
 * A competência entra porque prefeitura que reinicia numeração por ano faria a
 * nota 1 de 2025 colidir com a nota 1 de 2026.
 */
export function chaveDeDeduplicacao(doc: {
  tipo: TipoDocumento;
  chaveAcesso?: string | null;
  emitenteDocumento: string;
  serie?: string | null;
  numero: string;
  competencia: string;
}): string | null {
  if (doc.tipo !== "NFSE") {
    const chave = digitsOnly(doc.chaveAcesso);
    // Sem chave não há identidade: um NF-e assim não entra no acervo, em vez de
    // entrar com uma chave inventada que deduplicaria errado depois.
    return chave && chave.length === 44 ? chave : null;
  }

  const emitente = digitsOnly(doc.emitenteDocumento);
  const numero = doc.numero.trim();
  if (!emitente || !numero) return null;
  // Série ausente vira string vazia, e não é omitida: `NFSE:1:.:5:2026-09` e
  // `NFSE:1::5:2026-09` precisam ser chaves diferentes de verdade, senão a nota
  // sem série colide com a de série "." de outra prefeitura.
  const serie = (doc.serie ?? "").trim();
  return `NFSE:${emitente}:${serie}:${numero}:${doc.competencia}`;
}

export type DirecaoDoLancamento = "PAGAR" | "RECEBER" | "INDEFINIDA";

/**
 * De que lado o documento cai no financeiro.
 *
 * **Derivada, nunca armazenada.** É função do CNPJ/CPF da empresa contra as
 * duas pontas do documento, e guardar o resultado criaria um campo que envelhece
 * sozinho: basta a empresa corrigir o próprio CNPJ para a direção gravada passar
 * a mentir.
 *
 * - empresa é a **destinatária** ⇒ ela recebeu, então tem a **pagar**;
 * - empresa é a **emitente** ⇒ ela vendeu/prestou, então tem a **receber**;
 * - as duas pontas, ou nenhuma ⇒ **indefinida**, e quem decide é o usuário.
 *
 * "As duas pontas" acontece de verdade: transferência entre estabelecimentos da
 * mesma empresa emite nota de si para si. Chutar um lado ali lançaria dinheiro
 * que não existe.
 */
export function direcaoDoLancamento(
  documentoDaEmpresa: string | null | undefined,
  doc: { emitenteDocumento: string | null; destinatarioDocumento: string | null }
): DirecaoDoLancamento {
  const empresa = digitsOnly(documentoDaEmpresa);
  if (!empresa) return "INDEFINIDA";

  const ehEmitente = digitsOnly(doc.emitenteDocumento) === empresa;
  const ehDestinatario = digitsOnly(doc.destinatarioDocumento) === empresa;

  if (ehEmitente && ehDestinatario) return "INDEFINIDA";
  if (ehDestinatario) return "PAGAR";
  if (ehEmitente) return "RECEBER";
  return "INDEFINIDA";
}

/**
 * O documento ainda conta para o financeiro?
 *
 * Nota cancelada não gera lançamento — mas continua no acervo, e é por isso que
 * `situation` é eixo separado de `destination`: cancelar depois de lançar é o
 * caso que dói, e a tela precisa mostrar as duas coisas ao mesmo tempo para
 * alguém poder estornar.
 */
export function contaParaOFinanceiro(doc: {
  situacao: "AUTORIZADA" | "CANCELADA";
  destino: "PENDENTE" | "LANCADO" | "IGNORADO";
}): boolean {
  return doc.situacao === "AUTORIZADA" && doc.destino !== "IGNORADO";
}

/**
 * Cancelamento que chegou depois do lançamento — o que a tela precisa gritar.
 *
 * Não é erro de dado nem estado impossível: a nota foi lançada corretamente e o
 * emissor cancelou depois. Sem destacar, o dinheiro fica lançado contra um
 * documento que não existe mais.
 */
export function precisaDeEstorno(doc: {
  situacao: "AUTORIZADA" | "CANCELADA";
  destino: "PENDENTE" | "LANCADO" | "IGNORADO";
}): boolean {
  return doc.situacao === "CANCELADA" && doc.destino === "LANCADO";
}
