// Arquivos (Drive) — baixar uma pasta inteira num zip (13/10/2026). Sem banco
// e sem disco: quem chama (./baixarPasta.ts) traz as pastas, os arquivos, a
// régua de acesso e a função que lê o conteúdo.
//
// Três partes:
// - **O que entra.** A pasta e as subpastas que passam na régua de quem pede —
//   a mesma régua do download de um arquivo avulso, recebida pronta. Pasta
//   barrada leva junto tudo que está dentro dela.
// - **Com que nome.** Cada pedaço do caminho vira um nome que o Windows aceita
//   (sem barra, sem `..`, sem `<>:"|?*`, sem CON/PRN...), e nome repetido na
//   mesma pasta do zip ganha " (2)", " (3)".
// - **O zip em si.** Gerado aos pedaços (fflate, sem dependências), um arquivo
//   por vez: o servidor nunca segura o zip inteiro, nem grava arquivo temporário.

import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { formatarBytes } from "@/lib/fileSize";
import { caminhoDaPasta, mapaDePastas, type PastaDoDrive } from "./regras";

// ─── Teto ────────────────────────────────────────────────────────────────────

/**
 * Até onde um zip vai. O arquivo do Drive tem no máximo 10 MB; mil deles cabem
 * em 1 GB, que é bem menos que os 4 GB do formato zip sem a extensão ZIP64 (o
 * fflate não escreve ZIP64). Acima disso, a pessoa baixa por subpasta.
 */
export const MAX_ARQUIVOS_NO_ZIP = 1000;
export const MAX_BYTES_NO_ZIP = 1024 * 1024 * 1024;
/** Subpastas viram entradas no zip também; o formato aguenta 65 mil entradas no total. */
export const MAX_PASTAS_NO_ZIP = 1000;

const numero = new Intl.NumberFormat("pt-BR");

export type ProblemaDoZip = { status: 413 | 422; erro: string };

/** Por que não gerar o zip, ou `null` quando dá. A mensagem vai direto para a pessoa. */
export function problemaDoZip(resumo: { arquivos: number; bytes: number; pastas: number }): ProblemaDoZip | null {
  if (resumo.arquivos === 0) {
    return { status: 422, erro: "Não há arquivo para baixar nesta pasta (nem nas subpastas)." };
  }
  if (resumo.arquivos > MAX_ARQUIVOS_NO_ZIP) {
    return {
      status: 413,
      erro: `A pasta tem ${numero.format(resumo.arquivos)} arquivos, e o zip leva até ${numero.format(MAX_ARQUIVOS_NO_ZIP)}. Baixe as subpastas uma de cada vez.`,
    };
  }
  if (resumo.bytes > MAX_BYTES_NO_ZIP) {
    return {
      status: 413,
      erro: `A pasta tem ${formatarBytes(resumo.bytes)}, e o zip leva até ${formatarBytes(MAX_BYTES_NO_ZIP)}. Baixe as subpastas uma de cada vez.`,
    };
  }
  if (resumo.pastas > MAX_PASTAS_NO_ZIP) {
    return {
      status: 413,
      erro: `A pasta tem ${numero.format(resumo.pastas)} subpastas, e o zip leva até ${numero.format(MAX_PASTAS_NO_ZIP)}. Baixe as subpastas uma de cada vez.`,
    };
  }
  return null;
}

// ─── Nomes ───────────────────────────────────────────────────────────────────

/** Um pedaço de caminho no zip não passa disto (sem contar o " (2)"). */
export const MAX_NOME_NO_ZIP = 120;

/** Proibidos em nome de arquivo no Windows; a barra também separaria pastas no zip. */
const PROIBIDOS = /[<>:"/\\|?*]/g;
/** Nomes de dispositivo do Windows, com ou sem extensão: "CON", "nul.txt", "COM1.pdf". */
const RESERVADOS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\s*\..*)?$/i;
const EXTENSAO = /\.[A-Za-z0-9]{1,5}$/;

function ehControle(codigo: number): boolean {
  return codigo < 0x20 || (codigo >= 0x7f && codigo <= 0x9f);
}

/**
 * Um pedaço de caminho (nome de pasta ou de arquivo) que o Windows, o macOS e
 * o Linux extraem sem surpresa: nunca vira `..` nem sobe de pasta, não tem
 * caractere proibido, não termina em ponto ou espaço (o Windows os apaga e o
 * nome colidiria) e não é nome de dispositivo. Acentos ficam — o zip marca os
 * nomes como UTF-8.
 */
export function nomeSeguroNoZip(bruto: string | null | undefined, reserva = "sem nome"): string {
  let nome = "";
  for (const ch of (bruto ?? "").normalize("NFC")) nome += ehControle(ch.codePointAt(0) ?? 0) ? " " : ch;
  nome = nome.replace(PROIBIDOS, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  if (!nome) nome = reserva;
  if (RESERVADOS.test(nome)) nome = `_${nome}`;
  const letras = [...nome];
  if (letras.length > MAX_NOME_NO_ZIP) {
    const ext = EXTENSAO.exec(nome)?.[0] ?? "";
    nome = `${letras.slice(0, MAX_NOME_NO_ZIP - ext.length).join("").replace(/[. ]+$/, "")}${ext}`;
  }
  return nome;
}

/**
 * Dá nomes sem repetição dentro de uma pasta do zip. A comparação ignora
 * maiúsculas (o Windows não distingue "Guia.pdf" de "guia.pdf"), e pasta e
 * arquivo dividem o mesmo espaço de nomes.
 */
export function criarNomeador(): (bruto: string, ehPasta: boolean) => string {
  const usados = new Set<string>();
  return (bruto, ehPasta) => {
    const nome = nomeSeguroNoZip(bruto);
    // Pasta não tem extensão: "Notas.2026" repetida vira "Notas.2026 (2)".
    const ext = ehPasta ? "" : EXTENSAO.exec(nome)?.[0] ?? "";
    const temExt = ext.length > 0 && ext.length < nome.length;
    const base = temExt ? nome.slice(0, -ext.length) : nome;
    let candidato = nome;
    for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base} (${n})${temExt ? ext : ""}`;
    usados.add(candidato.toLowerCase());
    return candidato;
  };
}

/** O nome do .zip baixado, sem a extensão. */
export const MAX_NOME_DO_ZIP = 150;

/** "Padaria Pão Quente - Fiscal - 2026.zip": os pedaços do nome, cada um seguro, separados por " - ". */
export function nomeDoZip(partes: readonly (string | null | undefined)[]): string {
  let nome =
    partes
      .filter((p): p is string => !!p && !!p.trim())
      .map((p) => nomeSeguroNoZip(p))
      .join(" - ") || "Arquivos";
  const letras = [...nome];
  if (letras.length > MAX_NOME_DO_ZIP) nome = letras.slice(0, MAX_NOME_DO_ZIP).join("").replace(/[-. ]+$/, "");
  return `${nome}.zip`;
}

/**
 * `Content-Disposition` de anexo com acento: `filename` em ASCII para quem não
 * entende o resto, e `filename*` (RFC 5987/6266) em UTF-8 — o que os
 * navegadores usam. `encodeURIComponent` deixa passar `'()*`, que no
 * `filename*` precisam ir codificados.
 */
export function contentDispositionDeAnexo(nome: string): string {
  const ascii = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\%]/g, "_");
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// ─── O que entra ─────────────────────────────────────────────────────────────

/** O mínimo de um arquivo para entrar no zip. Bate com o `select` de ./baixarPasta.ts. */
export type ArquivoParaOZip = {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageKey: string;
  folderId: string;
  createdAt: Date;
  deletedAt: Date | null;
};

export type EntradaDoZip =
  | { tipo: "pasta"; caminho: string }
  | { tipo: "arquivo"; caminho: string; arquivo: ArquivoParaOZip };

export type ConteudoDoZip = {
  /** Na ordem em que vão para o zip. Pasta termina em "/". */
  entradas: EntradaDoZip[];
  arquivos: number;
  bytes: number;
  /** Subpastas (a pasta baixada não conta). */
  pastas: number;
};

/** A régua de quem pede, sobre o caminho completo (da raiz do escopo até a pasta). */
export type Alcance = (caminho: PastaDoDrive[]) => boolean;

const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/**
 * A pasta e as subpastas que entram no zip, a pasta primeiro, cada uma com o
 * caminho completo. Uma subpasta só entra se a de cima entrou **e** o caminho
 * dela passa na régua por conta própria — a régua de setor e de lixeira herda
 * para baixo, e checar as duas coisas impede que o nome de uma pasta barrada
 * apareça no zip como pasta de cima de outra. `null` quando a própria pasta
 * não passa.
 */
export function pastasDoZip(raizId: string, pastas: readonly PastaDoDrive[], alcanca: Alcance): { pasta: PastaDoDrive; caminho: PastaDoDrive[] }[] | null {
  const mapa = mapaDePastas(pastas);
  const raiz = caminhoDaPasta(raizId, mapa);
  if (!raiz || !alcanca(raiz)) return null;

  const filhas = new Map<string, PastaDoDrive[]>();
  for (const p of pastas) {
    if (p.parentId === null) continue;
    const lista = filhas.get(p.parentId) ?? [];
    lista.push(p);
    filhas.set(p.parentId, lista);
  }

  const resultado: { pasta: PastaDoDrive; caminho: PastaDoDrive[] }[] = [];
  const vistas = new Set<string>();
  const fila = [{ pasta: raiz[raiz.length - 1], caminho: raiz }];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    if (vistas.has(atual.pasta.id)) continue;
    vistas.add(atual.pasta.id);
    resultado.push(atual);
    for (const filha of filhas.get(atual.pasta.id) ?? []) {
      const caminho = caminhoDaPasta(filha.id, mapa);
      if (caminho && alcanca(caminho)) fila.push({ pasta: filha, caminho });
    }
  }
  return resultado;
}

/**
 * Monta a lista do zip: caminhos relativos à pasta baixada (ela mesma não vira
 * pasta dentro do zip — o nome do .zip já diz qual é), subpastas vazias
 * incluídas para a estrutura chegar inteira. Arquivo na lixeira ou fora das
 * pastas que passaram na régua não entra. `null` quando a pasta não passa.
 */
export function montarConteudoDoZip(input: {
  raizId: string;
  pastas: readonly PastaDoDrive[];
  arquivos: readonly ArquivoParaOZip[];
  alcanca: Alcance;
}): ConteudoDoZip | null {
  const alcancadas = pastasDoZip(input.raizId, input.pastas, input.alcanca);
  if (!alcancadas) return null;
  const entram = new Set(alcancadas.map((a) => a.pasta.id));

  const subpastas = new Map<string, PastaDoDrive[]>();
  for (const { pasta } of alcancadas) {
    if (pasta.id === input.raizId || pasta.parentId === null) continue;
    const lista = subpastas.get(pasta.parentId) ?? [];
    lista.push(pasta);
    subpastas.set(pasta.parentId, lista);
  }
  const arquivosPorPasta = new Map<string, ArquivoParaOZip[]>();
  for (const a of input.arquivos) {
    if (a.deletedAt !== null || !entram.has(a.folderId)) continue;
    const lista = arquivosPorPasta.get(a.folderId) ?? [];
    lista.push(a);
    arquivosPorPasta.set(a.folderId, lista);
  }

  const conteudo: ConteudoDoZip = { entradas: [], arquivos: 0, bytes: 0, pastas: 0 };
  const visitar = (pastaId: string, prefixo: string) => {
    const nomear = criarNomeador();
    // Pastas primeiro: o nome delas fica estável, e um arquivo com o mesmo nome é que ganha o " (2)".
    const filhas = [...(subpastas.get(pastaId) ?? [])]
      .sort((a, b) => porNome(a.name, b.name) || a.id.localeCompare(b.id))
      .map((p) => ({ pasta: p, caminho: `${prefixo}${nomear(p.name, true)}/` }));
    const arquivos = [...(arquivosPorPasta.get(pastaId) ?? [])].sort(
      (a, b) => porNome(a.name, b.name) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    );
    for (const a of arquivos) {
      conteudo.entradas.push({ tipo: "arquivo", caminho: `${prefixo}${nomear(a.name, false)}`, arquivo: a });
      conteudo.arquivos++;
      conteudo.bytes += a.sizeBytes;
    }
    for (const f of filhas) {
      conteudo.entradas.push({ tipo: "pasta", caminho: f.caminho });
      conteudo.pastas++;
      visitar(f.pasta.id, f.caminho);
    }
  };
  visitar(input.raizId, "");
  return conteudo;
}

// ─── O zip ───────────────────────────────────────────────────────────────────

/**
 * Texto e Office antigo encolhem bem; PDF, imagem, docx/xlsx e zip já vêm
 * comprimidos, e comprimir de novo só gastaria processador do servidor.
 */
const COMPRIME = new Set(["xml", "txt", "csv", "ofx", "ret", "rem", "doc", "xls", "ppt", "msg"]);

export function comprimirNoZip(arquivo: Pick<ArquivoParaOZip, "name" | "mimeType">): boolean {
  if (arquivo.mimeType.startsWith("text/") || arquivo.mimeType.endsWith("/xml")) return true;
  return COMPRIME.has(arquivo.name.split(".").pop()?.toLowerCase() ?? "");
}

export type OpcoesDoStream = {
  /** O conteúdo do arquivo, ou `null` quando ele não está no armazenamento (fica de fora, com registro no log). */
  ler: (arquivo: ArquivoParaOZip) => Promise<Uint8Array | null>;
  /**
   * Chamado uma vez, quando o zip termina (`completo`) ou é interrompido (a
   * pessoa cancelou, a conexão caiu, deu erro), com os arquivos que já tinham
   * entrado. O portal usa para registrar o download de cada um.
   */
  aoTerminar?: (incluidos: ArquivoParaOZip[], completo: boolean) => void | Promise<void>;
};

/**
 * O zip como fluxo de bytes. Cada vez que quem baixa pede mais, entra o
 * próximo arquivo: só um arquivo (até 10 MB) fica na memória por vez.
 */
export function streamDoZip(entradas: readonly EntradaDoZip[], opcoes: OpcoesDoStream): ReadableStream<Uint8Array> {
  const prontos: Uint8Array[] = [];
  let fechou = false;
  let falha: Error | null = null;
  const zip = new Zip((err, pedaco, final) => {
    if (err) {
      falha = err;
      return;
    }
    if (pedaco.length > 0) prontos.push(pedaco);
    if (final) fechou = true;
  });

  const incluidos: ArquivoParaOZip[] = [];
  let avisou = false;
  const terminar = (completo: boolean) => {
    if (avisou) return;
    avisou = true;
    if (!opcoes.aoTerminar) return;
    Promise.resolve()
      .then(() => opcoes.aoTerminar!(incluidos, completo))
      .catch((err) => console.error("[drive] zip: depois de terminar", err));
  };

  async function adicionar(entrada: EntradaDoZip) {
    if (entrada.tipo === "pasta") {
      const pasta = new ZipPassThrough(entrada.caminho);
      zip.add(pasta);
      pasta.push(new Uint8Array(0), true);
      return;
    }
    const bytes = await opcoes.ler(entrada.arquivo);
    if (!bytes) {
      console.error("[drive] zip: arquivo fora do armazenamento", entrada.arquivo.id);
      return;
    }
    const arquivo = comprimirNoZip(entrada.arquivo)
      ? new ZipDeflate(entrada.caminho, { level: 6 })
      : new ZipPassThrough(entrada.caminho);
    arquivo.mtime = entrada.arquivo.createdAt;
    zip.add(arquivo);
    arquivo.push(bytes, true);
    incluidos.push(entrada.arquivo);
  }

  let proxima = 0;
  let encerrou = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (prontos.length === 0 && !fechou) {
          if (falha) throw falha;
          if (proxima < entradas.length) await adicionar(entradas[proxima++]);
          else if (!encerrou) {
            encerrou = true;
            zip.end();
          } else throw new Error("O zip não fechou.");
        }
        if (falha) throw falha;
        while (prontos.length > 0) controller.enqueue(prontos.shift()!);
        if (fechou) {
          controller.close();
          terminar(true);
        }
      } catch (err) {
        zip.terminate();
        terminar(false);
        controller.error(err);
      }
    },
    cancel() {
      zip.terminate();
      terminar(false);
    },
  });
}
