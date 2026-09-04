// Do documento do SPED para a linha do acervo.
//
// Função pura, separada do laço de rede, porque é aqui que moram as decisões
// que erram em silêncio: qual empresa é a dona, o que fazer com valor nulo, e
// como reconhecer o mesmo documento que já entrou por upload.

import type { DocumentoDoSped } from "./client";
import { chaveDeDeduplicacao, type TipoDocumento } from "@/lib/fiscal/documentos";

export type TipoNoAcervo = TipoDocumento;

/**
 * O SPED fala `nfe | cte | nfse`; o acervo tem quatro tipos.
 *
 * **NFC-e não existe do lado de lá.** Uma nota modelo 65 chega como `nfe`, e a
 * chave é quem sabe a verdade — posições 21-22 guardam o modelo. Confiar no
 * campo `tipo` classificaria toda NFC-e como NF-e.
 */
export function tipoNoAcervo(doc: DocumentoDoSped): TipoNoAcervo {
  if (doc.tipo === "cte") return "CTE";
  if (doc.tipo === "nfse") return "NFSE";
  const chave = doc.chave?.replace(/\D/g, "") ?? "";
  return chave.length === 44 && chave.slice(20, 22) === "65" ? "NFCE" : "NFE";
}

/**
 * Valor como string, ou `null`.
 *
 * **`null` não é zero.** Linha `parcial` do índice vem sem valor porque foi
 * montada só do que a chave carrega; gravar zero somaria um número que ninguém
 * apurou no fechamento do mês. A string atravessa sem passar por float, pelo
 * mesmo motivo do parser de XML.
 */
export function valorDoDocumento(doc: DocumentoDoSped): string | null {
  if (doc.valor === null || doc.valor === undefined) return null;
  const bruto = String(doc.valor).trim();
  return bruto === "" ? null : bruto;
}

export type LinhaMapeada = {
  dedupKey: string;
  tipo: TipoNoAcervo;
  chaveAcesso: string | null;
  numero: string;
  serie: string | null;
  emitidoEm: Date;
  competencia: string;
  emitenteNome: string;
  emitenteDocumento: string;
  destinatarioNome: string | null;
  destinatarioDocumento: string | null;
  valor: string | null;
  completude: "COMPLETO" | "PARCIAL";
  renderizavel: boolean;
  spedTipo: string;
  spedIdentificador: string;
};

export type FalhaDeMapeamento = { motivo: "sem_identidade" | "data_invalida" | "sem_emitente"; detalhe: string };

/**
 * Traduz, ou diz por que não deu.
 *
 * A competência vem pronta do índice (`AAAA-MM`) e é usada como veio — derivar
 * da data de emissão discordaria do lado de lá justamente na NFS-e, onde o mês
 * do serviço e o da emissão são diferentes de propósito.
 */
export function mapearDocumento(doc: DocumentoDoSped): LinhaMapeada | FalhaDeMapeamento {
  const emitidoEm = new Date(doc.data_emissao);
  if (Number.isNaN(emitidoEm.getTime())) {
    return { motivo: "data_invalida", detalhe: `data_emissao inválida: ${doc.data_emissao}` };
  }

  const emitenteDocumento = doc.cnpj_emitente?.replace(/\D/g, "") ?? "";
  if (!emitenteDocumento) {
    return { motivo: "sem_emitente", detalhe: "documento sem CNPJ de emitente" };
  }

  const tipo = tipoNoAcervo(doc);
  const chaveAcesso = doc.chave?.replace(/\D/g, "") || null;

  // A mesma chave de deduplicação do upload, de propósito: é o que faz um
  // documento que alguém já subiu à mão ser reconhecido quando a sincronização
  // trouxer o mesmo, em vez de virar uma segunda linha.
  const dedupKey = chaveDeDeduplicacao({
    tipo,
    chaveAcesso,
    emitenteDocumento,
    serie: doc.serie,
    numero: doc.numero,
    competencia: doc.competencia,
  });
  if (!dedupKey) {
    return { motivo: "sem_identidade", detalhe: `${doc.tipo}/${doc.identificador} sem chave nem número utilizável` };
  }

  return {
    dedupKey,
    tipo,
    chaveAcesso,
    numero: doc.numero,
    serie: doc.serie?.trim() || null,
    emitidoEm,
    competencia: doc.competencia,
    emitenteNome: doc.nome_emitente?.trim() || "—",
    emitenteDocumento,
    destinatarioNome: doc.nome_destinatario?.trim() || null,
    destinatarioDocumento: doc.cnpj_destinatario?.replace(/\D/g, "") || null,
    valor: valorDoDocumento(doc),
    completude: doc.detalhe === "parcial" ? "PARCIAL" : "COMPLETO",
    renderizavel: doc.renderizavel !== false,
    spedTipo: doc.tipo,
    spedIdentificador: doc.identificador,
  };
}

/**
 * Qual empresa do escritório é a dona da linha.
 *
 * O `sentido` do índice diz de que lado o contribuinte está, mas quem manda é o
 * cadastro: casa-se pelo documento, nas duas pontas. Nenhuma ponta conhecida
 * devolve `null` — o índice chama isso de `sem_atribuicao` no diagnóstico dele,
 * e é caso esperado, não erro.
 *
 * As duas pontas conhecidas e diferentes também devolve `null`: é a mesma
 * ambiguidade da entrada manual (transferência entre estabelecimentos), e
 * escolher sozinho penduraria a nota na empresa errada em metade dos casos.
 */
export function empresaDaLinha(
  linha: Pick<LinhaMapeada, "emitenteDocumento" | "destinatarioDocumento">,
  empresaPorDocumento: Map<string, string>
): { companyId: string } | { ambigua: true } | null {
  const daEmitente = empresaPorDocumento.get(linha.emitenteDocumento);
  const daDestinataria = linha.destinatarioDocumento
    ? empresaPorDocumento.get(linha.destinatarioDocumento)
    : undefined;

  if (daEmitente && daDestinataria && daEmitente !== daDestinataria) return { ambigua: true };
  const companyId = daEmitente ?? daDestinataria;
  return companyId ? { companyId } : null;
}
