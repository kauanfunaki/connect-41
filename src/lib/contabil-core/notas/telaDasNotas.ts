// A tela das notas fiscais (Bloco C, Fase C1, 18/11/2026): o que o servidor devolve e a lógica pura da
// aba "Notas" (porte do `Notas.tsx` do Contábil Core). Puro: serve ao servidor, ao navegador e aos testes.

import type { OrigemNota, TipoNota } from "./tipos";
import type { StatusNota } from "./servico";

/** A transação ligada, como a lista do original resume (`transacao_descricao`, `_valor`, `_dc`). */
export type TransacaoDaNota = {
  historico: string;
  /** Decimal em texto, com 2 casas ("800.00"). */
  valor: string;
  dc: string;
  /** "AAAA-MM-DD" */
  data: string;
  /** A transação saiu (importação desfeita): a nota continua ligada a ela, como no original. */
  desfeita: boolean;
};

/** Uma nota como a tela a mostra (`NotaFiscalResponse`, em camelCase). */
export type NotaDaTela = {
  id: string;
  tipo: TipoNota;
  numero: string;
  serie: string | null;
  cnpjEmitente: string;
  nomeEmitente: string | null;
  cnpjDestinatario: string | null;
  /** Decimal em texto, com 2 casas. */
  valor: string;
  /** Instante ISO (UTC). */
  dataEmissao: string;
  status: StatusNota;
  transacaoId: string | null;
  transacao: TransacaoDaNota | null;
  chaveAcesso: string | null;
  observacao: string | null;
  origem: OrigemNota;
  assinaturaMotivo: string | null;
};

export type ListaDeNotas = { itens: NotaDaTela[]; total: number; pagina: number; porPagina: number };

/** Uma transação pendente para associar (o diálogo "Associar transação"). */
export type TransacaoParaAssociar = { id: string; data: string; historico: string; dc: string; valor: string };

/** O resultado de um arquivo importado, como a rota devolve. */
export type ImportacaoDeNotas = { importadas: number; duplicadas: number; erros: string[]; mensagem: string };

// ─── Rótulos ────────────────────────────────────────────────────────────────

export const ROTULO_DO_TIPO: Record<TipoNota, string> = { nfe: "NF-e", nfse: "NFS-e" };

export const ROTULO_DO_STATUS: Record<StatusNota, { texto: string; tom: "atencao" | "sucesso" | "perigo" }> = {
  pendente: { texto: "Pendente", tom: "atencao" },
  associada: { texto: "Associada", tom: "sucesso" },
  cancelada: { texto: "Cancelada", tom: "perigo" },
};

/**
 * A procedência, como o original mostra: XML com assinatura conferida não tem selo; "OCR" para a nota
 * lida de PDF ou imagem; "assinatura não conferida" para o XML autorizado cuja assinatura não fecha,
 * com o motivo registrado.
 */
export function seloDaProcedencia(n: Pick<NotaDaTela, "origem" | "assinaturaMotivo">): { texto: string; explicacao: string } | null {
  if (n.origem === "ocr") return { texto: "OCR", explicacao: "Extraída de PDF/imagem por OCR — sem verificação de assinatura digital." };
  if (n.origem === "xml_nao_verificado") {
    return {
      texto: "assinatura não conferida",
      explicacao:
        "A nota foi autorizada pela SEFAZ, mas a assinatura digital do arquivo não pôde ser conferida" +
        (n.assinaturaMotivo ? `: ${n.assinaturaMotivo}.` : ".") +
        " Costuma acontecer com XML reempacotado por downloader de DF-e, que altera o conteúdo depois de assinado.",
    };
  }
  return null;
}

/**
 * O dia da emissão para mostrar. A nota sem hora (NFS-e só com a data, cadastro à mão) é gravada à
 * meia-noite UTC, como no original; mostrada no fuso do escritório, cairia no dia anterior. Por isso a
 * meia-noite UTC exata mostra o dia gravado; o resto, o dia em Brasília.
 */
export function diaDaEmissao(iso: string): { data: Date; fuso: "UTC" | "America/Sao_Paulo" } {
  const data = new Date(iso);
  return { data, fuso: iso.endsWith("T00:00:00.000Z") ? "UTC" : "America/Sao_Paulo" };
}

/**
 * O valor digitado no cadastro à mão → o texto do decimal: "1.234,56" e "1234,56" viram "1234.56";
 * sem vírgula, o ponto é o separador decimal ("1234.56").
 */
export function valorDigitado(texto: string): string {
  const t = texto.trim().replace(/\s/g, "");
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}

/** O dia do cadastro à mão como o original enviava (`new Date("AAAA-MM-DD").toISOString()`): meia-noite UTC. */
export const emissaoDigitada = (dia: string) => `${dia}T00:00:00.000Z`;

/** "000123-1": o número com a série, como a tabela do original. */
export const numeroComSerie = (n: Pick<NotaDaTela, "numero" | "serie">) => `${n.numero}${n.serie ? `-${n.serie}` : ""}`;

/** Que ação a linha oferece: associar (sem transação e não cancelada) ou remover a associação. */
export function acaoDaLinha(n: Pick<NotaDaTela, "transacaoId" | "status">): "associar" | "desassociar" | null {
  if (!n.transacaoId && n.status !== "cancelada") return "associar";
  if (n.transacaoId) return "desassociar";
  return null;
}

/** Cancelar aparece em toda nota que ainda não está cancelada. */
export const podeCancelar = (n: Pick<NotaDaTela, "status">) => n.status !== "cancelada";

// ─── Filtros ────────────────────────────────────────────────────────────────

export const NOTAS_POR_PAGINA = 20;

export type FiltrosDaTela = {
  tipo: "" | TipoNota;
  status: "" | StatusNota;
  numero: string;
  emitente: string;
  cnpj: string;
  chave: string;
  /** "AAAA-MM-DD" */
  de: string;
  ate: string;
};

export const FILTROS_VAZIOS: FiltrosDaTela = { tipo: "", status: "", numero: "", emitente: "", cnpj: "", chave: "", de: "", ate: "" };

export const filtrosAtivos = (f: FiltrosDaTela) => Object.values(f).some(Boolean);

/** A consulta da lista: só o que está preenchido, mais a página. */
export function consultaDaLista(empresaId: string, f: FiltrosDaTela, pagina: number): URLSearchParams {
  const q = new URLSearchParams({ empresa: empresaId, pagina: String(pagina), porPagina: String(NOTAS_POR_PAGINA) });
  for (const [chave, valor] of Object.entries(f)) if (valor.trim()) q.set(chave, valor.trim());
  return q;
}

// ─── Arquivos ───────────────────────────────────────────────────────────────

const ARQUIVO_VALIDO = /\.(xml|zip|pdf|png|jpe?g)$/i;
export const ACEITA = ".xml,.XML,.zip,.ZIP,.pdf,.PDF,.png,.PNG,.jpg,.JPG,.jpeg,.JPEG";

/** Os arquivos que a importação aceita (pela extensão, como o original), e quantos ficaram de fora. */
export function separarArquivos<T extends { name: string }>(arquivos: readonly T[]): { validos: T[]; ignorados: number } {
  const validos = arquivos.filter((a) => ARQUIVO_VALIDO.test(a.name));
  return { validos, ignorados: arquivos.length - validos.length };
}

/**
 * Junta o resultado de cada arquivo (um envio por arquivo, para um XML com defeito não derrubar os
 * outros). A falha do envio inteiro entra como erro daquele arquivo ("nota.xml: frase").
 */
export function somarImportacoes(partes: readonly ({ nome: string } & ({ ok: true; valor: ImportacaoDeNotas } | { ok: false; erro: string }))[]) {
  let importadas = 0;
  let duplicadas = 0;
  const erros: string[] = [];
  for (const p of partes) {
    if (p.ok) {
      importadas += p.valor.importadas;
      duplicadas += p.valor.duplicadas;
      erros.push(...p.valor.erros);
    } else erros.push(`${p.nome}: ${p.erro}`);
  }
  return { importadas, duplicadas, erros };
}

/** O aviso depois de importar, como o do original. */
export function avisoDaImportacao(r: { importadas: number; duplicadas: number; erros: readonly string[] }): { titulo: string; texto: string; tom: "sucesso" | "atencao" | "erro" } {
  const n = r.erros.length;
  return {
    titulo: r.importadas > 0 ? "Importação concluída" : "Nenhuma nota importada",
    texto: `${r.importadas} nota(s) importada(s), ${r.duplicadas} duplicada(s) ignorada(s).${n ? ` ${n} erro(s) — veja os detalhes abaixo.` : ""}`,
    tom: n && r.importadas === 0 ? "erro" : n ? "atencao" : "sucesso",
  };
}

/** O texto do cancelamento: a associação SAI junto (o serviço do original solta a transação). */
export const textoDoCancelamento = (n: Pick<NotaDaTela, "transacaoId">) =>
  n.transacaoId
    ? "A associação com a transação também é desfeita, e a nota deixa de ficar disponível para novas associações."
    : "A nota deixa de ficar disponível para novas associações.";
