// "Trazer do acervo" (10/11/2026): os documentos que o índice do motor pôs no
// acervo do Connect (`FiscalDocument`, origem SPED, sem arquivo) entram na
// escrituração do SPED pelo XML que o motor guarda.
//
// Até aqui o acervo e a escrituração não se falavam: a escrituração só se monta
// com arquivo importado, e o acervo do índice não tem arquivo. Uma empresa com
// 2.600 documentos no acervo e nenhum na escrituração tinha a geração recusada
// por "Sem documentos fiscais importados".
//
// O caminho não tem importador novo: o motor devolve um zip de XMLs, e o zip
// entra na fila de importação de sempre (`enfileirarArquivo`), que a tela
// processa como um envio manual.
//
// Puro: a seleção, o lote e os contadores. O banco e a rede ficam em
// `acervoServidor.ts`.

import { unzipSync } from "fflate";
import { ErroDoSped, MAXIMO_DE_XMLS_POR_PEDIDO, type DocumentoParaXml, type XmlsDoMotor } from "@/lib/sped/client";

/** Uma linha do acervo, com o que a seleção precisa. */
export type DocumentoDoAcervo = {
  id: string;
  companyId: string;
  /** A identidade do documento no Connect; é a `identity` da escrituração. */
  dedupKey: string;
  spedTipo: string | null;
  spedIdentificador: string | null;
};

export type CandidatoDoAcervo = DocumentoDoAcervo & { motor: DocumentoParaXml };

const TIPOS_DO_MOTOR = new Set<string>(["nfe", "cte", "nfse"]);

/**
 * O par `(tipo, identificador)` do documento no motor — a chave primária do
 * índice dele, a mesma das rotas unitária e de PDF.
 *
 * Não é derivado da chave de acesso nem do `dedupKey`: a sincronização grava o
 * par como veio do índice (`spedTipo`, `spedIdentificador`), e é ele que se
 * devolve, sem normalizar. A NFC-e, que no acervo é `NFCE`, no motor é `nfe` —
 * e é `nfe` que está gravado. Sem o par (linha anterior à coluna, ou que não
 * veio do índice), devolve `null`: inventar o formato do motor pediria um
 * documento que não é este.
 */
export function identificadorDoMotor(doc: Pick<DocumentoDoAcervo, "spedTipo" | "spedIdentificador">): DocumentoParaXml | null {
  const tipo = doc.spedTipo;
  const identificador = doc.spedIdentificador;
  if (!tipo || !TIPOS_DO_MOTOR.has(tipo) || !identificador || !identificador.trim()) return null;
  return { tipo: tipo as DocumentoParaXml["tipo"], identificador };
}

/**
 * O nome com que o XML aparece na fila de importação. O zip do motor traz
 * `<tipo>/<identificador saneado>.xml` — o que não for `[0-9A-Za-z._-]` vira
 * `_` (sped_generator#64) — e a fila guarda só o nome do arquivo (o corte de
 * `enfileirarArquivo`).
 *
 * É só uma pista para o segundo clique não pedir de novo ao motor o que já foi
 * para a fila. A importação não depende dele: lê o próprio XML. Quando a pista
 * falha (dois identificadores que o saneamento junta, e o segundo ganha `~2`),
 * o documento é pedido de novo e a fila o reconhece pelo SHA-256 do XML, sem
 * importação duplicada.
 */
export function nomeNaFila(doc: DocumentoParaXml): string {
  return `${doc.identificador.replace(/[^0-9A-Za-z._-]/g, "_")}.xml`.slice(0, 255);
}

/** A chave de um documento numa empresa: a escrituração e a fila são de cada estabelecimento. */
export const naEmpresa = (companyId: string, chave: string) => `${companyId}|${chave}`;

/** A posição na ordem em que o acervo é pedido: por empresa, depois pelo id. É o cursor entre os lotes. */
export const posicaoNoAcervo = (d: Pick<DocumentoDoAcervo, "companyId" | "id">) => naEmpresa(d.companyId, d.id);

export type SelecaoDoAcervo = {
  /** O que falta pedir ao motor, na ordem de `posicaoNoAcervo`. */
  aPedir: CandidatoDoAcervo[];
  /** Já estavam na escrituração da empresa. */
  naEscrituracao: number;
  /** Já foram para a fila de importação da empresa (em qualquer estado: o resultado está lá). */
  naFila: number;
  /** Sem o par do motor gravado: não dá para pedir sem inventar o identificador. */
  semIdentificador: number;
};

/**
 * O que entra no pedido ao motor.
 *
 * Fica de fora o que já está na escrituração da empresa (pela identidade, que é
 * o `dedupKey` — como o "acervo sem itens" de `carregarBase`), o que já foi
 * para a fila da empresa (é isso que faz o segundo clique não duplicar) e o que
 * não tem o identificador do motor.
 */
export function selecionarDoAcervo(
  documentos: readonly DocumentoDoAcervo[],
  ja: { naEscrituracao: ReadonlySet<string>; naFila: ReadonlySet<string> }
): SelecaoDoAcervo {
  const aPedir: CandidatoDoAcervo[] = [];
  const vistos = new Set<string>();
  let naEscrituracao = 0, naFila = 0, semIdentificador = 0;
  for (const d of documentos) {
    if (ja.naEscrituracao.has(naEmpresa(d.companyId, d.dedupKey))) { naEscrituracao++; continue; }
    const motor = identificadorDoMotor(d);
    if (!motor) { semIdentificador++; continue; }
    if (ja.naFila.has(naEmpresa(d.companyId, nomeNaFila(motor)))) { naFila++; continue; }
    // Duas linhas com o mesmo documento do motor na mesma empresa viram um pedido só.
    const chave = naEmpresa(d.companyId, `${motor.tipo}/${motor.identificador}`);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    aPedir.push({ ...d, motor });
  }
  aPedir.sort((a, b) => (posicaoNoAcervo(a) < posicaoNoAcervo(b) ? -1 : posicaoNoAcervo(a) > posicaoNoAcervo(b) ? 1 : 0));
  return { aPedir, naEscrituracao, naFila, semIdentificador };
}

export const TAMANHO_DO_LOTE = MAXIMO_DE_XMLS_POR_PEDIDO;

/** Quantos ainda faltam depois do cursor. */
export function restantesDepois(aPedir: readonly CandidatoDoAcervo[], depois: string | null): number {
  return depois === null ? aPedir.length : aPedir.filter((d) => posicaoNoAcervo(d) > depois).length;
}

/**
 * O próximo lote: os documentos depois do cursor, até `tamanho` (no máximo
 * 500, o teto da rota), de **uma empresa só** — o zip entra na fila da empresa
 * dona dos documentos.
 *
 * O cursor anda pela posição, não pela seleção: o documento que o motor não
 * tinha fica para trás e não é pedido de novo na mesma rodada.
 */
export function proximoLote(aPedir: readonly CandidatoDoAcervo[], depois: string | null, tamanho: number = TAMANHO_DO_LOTE): CandidatoDoAcervo[] {
  const limite = Math.min(Math.max(1, Math.floor(tamanho)), TAMANHO_DO_LOTE);
  const inicio = depois === null ? 0 : aPedir.findIndex((d) => posicaoNoAcervo(d) > depois);
  if (inicio < 0 || inicio >= aPedir.length) return [];
  const empresa = aPedir[inicio].companyId;
  const lote: CandidatoDoAcervo[] = [];
  for (let i = inicio; i < aPedir.length && lote.length < limite && aPedir[i].companyId === empresa; i++) lote.push(aPedir[i]);
  return lote;
}

/** Cerca de 20 MiB: acima disso o lote é pedido de novo, menor. A fila aceita até 25 MiB por arquivo. */
export const LIMITE_DO_ZIP = 20 * 1024 * 1024;
/** O teto da fila para o zip expandido é 128 MiB; o lote fica abaixo, com folga. */
export const LIMITE_EXPANDIDO = 120 * 1024 * 1024;
/** O teto da fila por arquivo: um XML sozinho acima disso não entra de jeito nenhum. */
export const LIMITE_DA_FILA = 25 * 1024 * 1024;

/**
 * O tamanho do zip, sem descompactar (pelo diretório central): comprimido,
 * expandido, o maior arquivo, quantos arquivos e quantos de cada tipo — a pasta
 * do nome, `<tipo>/…`.
 */
export function medirZip(bytes: Uint8Array): { comprimido: number; expandido: number; maior: number; arquivos: number; porTipo: Record<string, number> } {
  let expandido = 0, maior = 0, arquivos = 0;
  const porTipo: Record<string, number> = {};
  if (bytes.length === 0) return { comprimido: 0, expandido: 0, maior: 0, arquivos: 0, porTipo };
  unzipSync(bytes, { filter: (f) => {
    if (!f.name.endsWith("/")) {
      arquivos++; expandido += f.originalSize; maior = Math.max(maior, f.originalSize);
      const tipo = f.name.includes("/") ? f.name.slice(0, f.name.indexOf("/")) : "";
      porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
    }
    return false;
  } });
  return { comprimido: bytes.length, expandido, maior, arquivos, porTipo };
}

export type ContadoresDoAcervo = {
  /** XMLs que entraram na fila de importação. */
  naFila: number;
  /** O motor tem o documento no índice, mas sem XML guardado (`X-Sem-Xml`). */
  semXml: number;
  /** O motor não achou o documento nesta raiz (`X-Nao-Encontrados`). */
  naoEncontrados: number;
  /** O XML sozinho passa do teto da fila (25 MiB). */
  grandesDemais: number;
  /**
   * CT-e pedidos que não vieram no zip (sem XML ou não achados). O motor só
   * indexa o CT-e já renderizado ou de frete tomado, então o CT-e de saída do
   * acervo costuma voltar "não encontrado" — esperado, e não erro. A tela diz
   * isso em vez de pintar o número de alerta.
   */
  cteFora: number;
};

export const contadoresVazios = (): ContadoresDoAcervo => ({ naFila: 0, semXml: 0, naoEncontrados: 0, grandesDemais: 0, cteFora: 0 });

export function somarContadores(a: ContadoresDoAcervo, b: ContadoresDoAcervo): ContadoresDoAcervo {
  return { naFila: a.naFila + b.naFila, semXml: a.semXml + b.semXml, naoEncontrados: a.naoEncontrados + b.naoEncontrados, grandesDemais: a.grandesDemais + b.grandesDemais, cteFora: a.cteFora + b.cteFora };
}

export type ResultadoDoLote = {
  /** Os documentos que este pedido cobriu — o cursor vai até o último deles. */
  cobertos: CandidatoDoAcervo[];
  contadores: ContadoresDoAcervo;
  /** As importações criadas (ou reaproveitadas) na fila. */
  ids: string[];
  /** O tamanho para o próximo lote: o que coube, quando foi preciso diminuir; senão, o de antes. */
  tamanho: number;
};

/**
 * Pede o lote ao motor e põe o zip na fila.
 *
 * Zip acima de cerca de 20 MiB (ou que a fila recusaria: expandido acima do
 * teto, ou um arquivo acima de 25 MiB) é descartado e o lote é pedido de novo
 * pela metade, até caber — e o tamanho que coube vale para os lotes seguintes.
 * Um documento sozinho que a fila recusaria é contado e pulado, para não
 * travar a rodada nele.
 *
 * Zip sem nenhum XML (tudo sem XML ou não encontrado) não vai para a fila: ela
 * recusa zip vazio, e não há o que importar.
 */
export async function buscarLote(
  lote: readonly CandidatoDoAcervo[],
  deps: {
    pedir: (documentos: DocumentoParaXml[]) => Promise<XmlsDoMotor>;
    enfileirar: (bytes: Uint8Array<ArrayBuffer>) => Promise<string[]>;
    /** O tamanho com que o lote foi cortado; volta igual quando não foi preciso diminuir. */
    tamanho?: number;
    limiteDoZip?: number;
    limiteExpandido?: number;
  }
): Promise<ResultadoDoLote> {
  const limiteDoZip = deps.limiteDoZip ?? LIMITE_DO_ZIP;
  const limiteExpandido = deps.limiteExpandido ?? LIMITE_EXPANDIDO;
  const anterior = Math.min(Math.max(1, Math.floor(deps.tamanho ?? TAMANHO_DO_LOTE)), TAMANHO_DO_LOTE);
  let cobertos = lote.slice(0, TAMANHO_DO_LOTE);
  let reduzido = false;
  if (!cobertos.length) return { cobertos: [], contadores: contadoresVazios(), ids: [], tamanho: anterior };
  for (;;) {
    const xmls = await deps.pedir(cobertos.map((d) => d.motor));
    const ctePedidos = cobertos.filter((d) => d.motor.tipo === "cte").length;
    const contadores: ContadoresDoAcervo = { naFila: 0, semXml: xmls.semXml, naoEncontrados: xmls.naoEncontrados, grandesDemais: 0, cteFora: ctePedidos };
    // Diminuído até um documento só, é ele que é grande, e não o lote: os próximos voltam ao tamanho de antes.
    const tamanho = reduzido && cobertos.length > 1 ? cobertos.length : anterior;
    // Zip vazio é resposta válida: nada veio, e não há o que pôr na fila.
    if (xmls.noZip === 0 || xmls.bytes.length === 0) return { cobertos, contadores, ids: [], tamanho };
    const medida = medirZip(xmls.bytes);
    contadores.cteFora = Math.max(0, ctePedidos - (medida.porTipo.cte ?? 0));
    const cabeNaFila = medida.comprimido <= LIMITE_DA_FILA && medida.maior <= LIMITE_DA_FILA && medida.expandido <= limiteExpandido;
    const cabe = cabeNaFila && medida.comprimido <= limiteDoZip;
    if (!cabe && cobertos.length > 1) {
      cobertos = cobertos.slice(0, Math.ceil(cobertos.length / 2));
      reduzido = true;
      continue;
    }
    if (medida.arquivos === 0) return { cobertos, contadores, ids: [], tamanho };
    // Um documento só e grande demais para a fila: conta e segue, sem mudar o tamanho dos próximos.
    if (!cabeNaFila) return { cobertos, contadores: { ...contadores, grandesDemais: medida.arquivos }, ids: [], tamanho: anterior };
    const ids = await deps.enfileirar(xmls.bytes);
    return { cobertos, contadores: { ...contadores, naFila: ids.length }, ids, tamanho };
  }
}

export const MENSAGEM_SEM_ROTA = "O motor ainda não tem a rota de XML; é preciso atualizar o motor.";
export const MENSAGEM_MOTOR_FORA = "O motor do SPED está fora do ar ou não respondeu a tempo. Nada foi trazido neste lote; tente de novo mais tarde.";

/**
 * O que a tela diz quando o motor não entrega o lote. `null` para o que não é
 * erro do motor (esse segue o caminho de erro de sempre).
 */
export function mensagemDoMotor(err: unknown): string | null {
  if (!(err instanceof ErroDoSped)) return null;
  if (err.codigo === "rota_de_xml_ausente" || err.status === 404 || err.status === 405) return MENSAGEM_SEM_ROTA;
  if (err.status === 0 && err.codigo === null) return MENSAGEM_MOTOR_FORA;
  if (err.status === 401 || err.status === 403) return "O motor recusou a credencial do Connect. Confira a integração do SPED em Administração › Integrações.";
  // 400 traz o motivo em `detail.erro`: corpo_invalido, tipo_invalido, quantidade_invalida ou cnpj_raiz_invalido.
  if (err.status === 400 || err.status === 422 || err.codigo === "corpo_invalido") return `O motor recusou o pedido de XML deste lote${err.codigo ? ` (${err.codigo})` : ""}. Nada foi trazido; avise o suporte do Connect.`;
  if (err.status >= 500) return `O motor do SPED respondeu com erro (${err.status}). Nada foi trazido neste lote; tente de novo mais tarde.`;
  return `O motor do SPED recusou o pedido (${err.status}). Nada foi trazido neste lote.`;
}
