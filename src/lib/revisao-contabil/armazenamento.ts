// Onde ficam os arquivos originais da revisão do fechamento.
//
// Fora de `public/`, como as guias do Societário (src/lib/societario/guias.ts):
// balancete, razão e guias têm CNPJ e valores do cliente, e só saem por rota
// que confere o módulo. `RevisaoDocumento.arquivo` guarda `<tenantId>/<uuid>.<ext>`;
// quem lê confere o formato e o tenant antes de abrir qualquer caminho.

import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), "storage", "revisao-contabil");

const EXTENSOES = new Set(["pdf", "csv", "txt", "xlsx", "xls", "zip", "bin"]);
const NOME_GUARDADO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z]{3,4})$/;

/** A extensão guardada: a do arquivo, quando é uma das que o módulo recebe. */
export function extensaoGuardada(nome: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return EXTENSOES.has(ext) && ext !== "bin" ? ext : "bin";
}

/** O caminho em disco, ou `null` quando o valor não é deste armazenamento ou não é deste tenant. */
export function caminhoDoArquivo(tenantId: string, arquivo: string): string | null {
  const partes = arquivo.split("/");
  if (partes.length !== 2) return null;
  const [dono, nome] = partes;
  const m = NOME_GUARDADO.exec(nome);
  if (dono !== tenantId || !m || !EXTENSOES.has(m[1])) return null;
  return path.join(STORAGE_DIR, dono, nome);
}

/** Grava o arquivo e devolve o valor para `RevisaoDocumento.arquivo`. */
export async function guardarArquivo(tenantId: string, nomeOriginal: string, conteudo: Uint8Array): Promise<string> {
  const nome = `${randomUUID()}.${extensaoGuardada(nomeOriginal)}`;
  const dir = path.join(STORAGE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, nome), conteudo);
  return `${tenantId}/${nome}`;
}

/** Lê o arquivo guardado. `null` quando o valor não serve ou o arquivo sumiu. */
export async function lerArquivo(tenantId: string, arquivo: string): Promise<Buffer | null> {
  const caminho = caminhoDoArquivo(tenantId, arquivo);
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch {
    return null;
  }
}

/** Apaga o arquivo guardado; arquivo que já não existe não é erro. */
export async function apagarArquivo(tenantId: string, arquivo: string): Promise<void> {
  const caminho = caminhoDoArquivo(tenantId, arquivo);
  if (!caminho) return;
  await unlink(caminho).catch(() => undefined);
}
