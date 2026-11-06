// O arquivo que o agente do motor devolve (06/11/2026), guardado em disco.
//
// ─── Por que em partes ──────────────────────────────────────────────────────
//
// O SPED de um mês grande passa de centenas de MB, e o proxy do Next guarda o
// corpo inteiro de toda requisição em memória e o corta em 26 MB **sem avisar**
// (`proxyClientMaxBodySize`, `next.config.ts`). Por isso o agente manda partes
// de até 8 MiB — o mesmo tamanho do envio de documentos ao motor
// (`src/lib/sped/envioEmPartes.ts`) —, cada uma com o próprio SHA-256.
//
// ─── Onde ficam ─────────────────────────────────────────────────────────────
//
//   storage/sped-fiscal/<tenant>/gerados/partes/<tarefa>/t<tentativa>/parte-00001
//   storage/sped-fiscal/<tenant>/gerados/<revisão>.txt
//
// A pasta é por tentativa: se a máquina cai e a tarefa volta à fila, a próxima
// geração pode sair com outros bytes, e as partes da anterior não servem. A
// junção lê as partes em sequência, calcula o SHA-256 no caminho e só troca o
// arquivo final quando tamanho e hash conferem. Os bytes nunca são
// decodificados: o TXT é ISO-8859-1 e o PVA confere byte a byte.

import "server-only";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { TAMANHO_DA_PARTE, TETO_DO_UPLOAD } from "@/lib/sped/envioEmPartes";

export { TAMANHO_DA_PARTE };
/** O arquivo inteiro: o mesmo teto do envio em partes ao motor. */
export const TETO_DO_ARQUIVO = TETO_DO_UPLOAD;
export const MAXIMO_DE_PARTES = Math.ceil(TETO_DO_ARQUIVO / TAMANHO_DA_PARTE);

export class ErroDoArquivo extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ErroDoArquivo";
  }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const raizPadrao = () => path.resolve(process.cwd(), "storage", "sped-fiscal");

function dentro(raiz: string, relativo: string): string {
  const alvo = path.resolve(raiz, relativo);
  if (!alvo.startsWith(raiz + path.sep)) throw new ErroDoArquivo("Caminho de arquivo inválido.");
  return alvo;
}

function exigirId(valor: string, nome: string) {
  if (!ID.test(valor)) throw new ErroDoArquivo(`${nome} inválido.`);
}

/** A pasta das partes de uma tarefa (sem tentativa) ou de uma tentativa. */
export function pastaDasPartes(tenantId: string, tarefaId: string, tentativa?: number): string {
  exigirId(tenantId, "Escritório"); exigirId(tarefaId, "Tarefa");
  const base = `${tenantId}/gerados/partes/${tarefaId}`;
  if (tentativa === undefined) return base;
  if (!Number.isSafeInteger(tentativa) || tentativa < 1) throw new ErroDoArquivo("Tentativa inválida.");
  return `${base}/t${tentativa}`;
}

/** O caminho relativo do TXT de uma revisão, como fica gravado na geração. */
export function caminhoDoGerado(tenantId: string, revisaoId: string): string {
  exigirId(tenantId, "Escritório"); exigirId(revisaoId, "Revisão");
  return `${tenantId}/gerados/${revisaoId}.txt`;
}

const nomeDaParte = (numero: number) => `parte-${String(numero).padStart(5, "0")}`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export type Parte = { tenantId: string; tarefaId: string; tentativa: number; numero: number; bytes: Uint8Array; sha256: string };

/**
 * Grava uma parte. Os mesmos bytes de novo (a resposta se perdeu e a máquina
 * repetiu) respondem como gravados; bytes diferentes para a mesma parte são
 * conflito — a máquina não pode trocar o arquivo no meio da devolução.
 */
export async function gravarParte(p: Parte, raiz = raizPadrao()): Promise<{ numero: number; tamanho: number; repetida: boolean }> {
  if (!Number.isSafeInteger(p.numero) || p.numero < 1 || p.numero > MAXIMO_DE_PARTES) throw new ErroDoArquivo(`O número da parte vai de 1 a ${MAXIMO_DE_PARTES}.`);
  if (p.bytes.length < 1 || p.bytes.length > TAMANHO_DA_PARTE) throw new ErroDoArquivo("Cada parte tem de 1 byte a 8 MiB.", 413);
  if (!SHA256.test(p.sha256)) throw new ErroDoArquivo("Informe o SHA-256 da parte (X-Parte-SHA256).");
  if (sha256(p.bytes) !== p.sha256) throw new ErroDoArquivo("A parte chegou diferente do que foi enviado (SHA-256 não confere). Envie de novo.", 422);
  const pasta = dentro(raiz, pastaDasPartes(p.tenantId, p.tarefaId, p.tentativa));
  await mkdir(pasta, { recursive: true });
  const alvo = path.join(pasta, nomeDaParte(p.numero));
  const ocupado = await tamanhoDasPartes(pasta, p.numero);
  if (ocupado + p.bytes.length > TETO_DO_ARQUIVO) throw new ErroDoArquivo("O arquivo passa de 500 MB, o limite da devolução.", 413);
  try {
    await writeFile(alvo, p.bytes, { flag: "wx" });
    return { numero: p.numero, tamanho: p.bytes.length, repetida: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    if (sha256(await readFile(alvo)) !== p.sha256) throw new ErroDoArquivo("Esta parte já foi recebida com outros bytes.", 409);
    return { numero: p.numero, tamanho: p.bytes.length, repetida: true };
  }
}

/** O total já gravado na pasta, sem contar a parte que está chegando. */
async function tamanhoDasPartes(pasta: string, menos: number): Promise<number> {
  let total = 0;
  for (const nome of await readdir(pasta)) {
    if (nome === nomeDaParte(menos) || !/^parte-\d{5}$/.test(nome)) continue;
    total += (await stat(path.join(pasta, nome))).size;
  }
  return total;
}

export type Juncao = { tenantId: string; tarefaId: string; tentativa: number; partes: number; tamanho: number; sha256: string; destino: string };

/**
 * Junta as partes no arquivo final. Faltando parte, sobrando parte ou com
 * tamanho e hash que não conferem, recusa sem tocar no destino: a máquina
 * reenvia o que falta e devolve de novo.
 */
export async function juntarPartes(j: Juncao, raiz = raizPadrao()): Promise<{ tamanho: number }> {
  if (!Number.isSafeInteger(j.partes) || j.partes < 1 || j.partes > MAXIMO_DE_PARTES) throw new ErroDoArquivo("Quantidade de partes inválida.");
  if (!Number.isSafeInteger(j.tamanho) || j.tamanho < 1 || j.tamanho > TETO_DO_ARQUIVO) throw new ErroDoArquivo("Tamanho do arquivo inválido.");
  if (!SHA256.test(j.sha256)) throw new ErroDoArquivo("SHA-256 do arquivo inválido.");
  const pasta = dentro(raiz, pastaDasPartes(j.tenantId, j.tarefaId, j.tentativa));
  const presentes = new Set((await readdir(pasta).catch(() => [] as string[])).filter((n) => /^parte-\d{5}$/.test(n)));
  const faltam = Array.from({ length: j.partes }, (_, i) => i + 1).filter((n) => !presentes.has(nomeDaParte(n)));
  if (faltam.length) throw new ErroDoArquivo(`Faltam partes do arquivo: ${faltam.slice(0, 10).join(", ")}${faltam.length > 10 ? "…" : ""}.`, 409);
  if (presentes.size > j.partes) throw new ErroDoArquivo("Chegaram mais partes do que as informadas na devolução.", 409);

  const destino = dentro(raiz, j.destino);
  await mkdir(path.dirname(destino), { recursive: true });
  const temporario = `${destino}.${j.tarefaId}.t${j.tentativa}.montando`;
  const hash = createHash("sha256");
  let total = 0;
  const saida = createWriteStream(temporario, { flags: "w" });
  try {
    for (let n = 1; n <= j.partes; n++) {
      for await (const pedaco of createReadStream(path.join(pasta, nomeDaParte(n)))) {
        const bytes = pedaco as Buffer;
        hash.update(bytes);
        total += bytes.length;
        if (!saida.write(bytes)) await once(saida, "drain");
      }
    }
    saida.end();
    await finished(saida);
  } catch (err) {
    saida.destroy();
    await rm(temporario, { force: true });
    throw err;
  }
  const conferido = hash.digest("hex");
  if (total !== j.tamanho || conferido !== j.sha256) {
    await rm(temporario, { force: true });
    throw new ErroDoArquivo(total !== j.tamanho ? `O arquivo montado tem ${total} bytes, e a devolução diz ${j.tamanho}.` : "O arquivo montado não confere com o SHA-256 da devolução.", 422);
  }
  await rename(temporario, destino);
  return { tamanho: total };
}

/** Apaga as partes de uma tentativa, ou de todas as tentativas da tarefa. Nunca falha por pasta que não existe. */
export async function apagarPartes(tenantId: string, tarefaId: string, tentativa?: number, raiz = raizPadrao()): Promise<void> {
  await rm(dentro(raiz, pastaDasPartes(tenantId, tarefaId, tentativa)), { recursive: true, force: true });
}

/** O TXT gravado, em stream, para a rota de download. */
export async function abrirGerado(relativo: string, raiz = raizPadrao()): Promise<{ corpo: ReadableStream<Uint8Array>; tamanho: number } | null> {
  const alvo = dentro(raiz, relativo);
  const info = await stat(alvo).catch(() => null);
  if (!info?.isFile()) return null;
  return { corpo: Readable.toWeb(createReadStream(alvo)) as ReadableStream<Uint8Array>, tamanho: info.size };
}
