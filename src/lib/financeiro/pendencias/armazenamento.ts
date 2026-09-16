// Gravação e leitura dos anexos das pendências em disco.
//
// Fora de `public/`, como os currículos e os documentos para cliente: o arquivo
// só sai pelas duas rotas autenticadas (a interna e a do portal), cada uma
// conferindo o próprio escopo antes de ler o disco.

import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { MAXIMO_DE_ANEXOS, validarAnexo } from "./anexo";

const STORAGE_DIR = path.join(process.cwd(), "storage", "client-requests");

export type AnexoGravado = { fileName: string; fileUrl: string; mimeType: string; sizeBytes: number };

/** Os arquivos de um campo múltiplo, sem as entradas vazias que o navegador manda quando nada foi escolhido. */
export function arquivosDoFormulario(formData: FormData, campo: string): File[] {
  return formData.getAll(campo).filter((v): v is File => v instanceof File && v.size > 0);
}

/**
 * Confere **todos** os arquivos antes de gravar o primeiro: um lote com um
 * arquivo recusado não deixa os outros órfãos no disco.
 */
export async function gravarAnexos(
  tenantId: string,
  arquivos: File[]
): Promise<{ ok: true; anexos: AnexoGravado[] } | { ok: false; erro: string }> {
  if (arquivos.length > MAXIMO_DE_ANEXOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_ANEXOS} anexos por mensagem.` };

  const conferidos: { bytes: Uint8Array; nome: string; mime: string; ext: string }[] = [];
  for (const arquivo of arquivos) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const v = validarAnexo(arquivo.name, bytes);
    if (!v.ok) return { ok: false, erro: v.erro };
    conferidos.push({ bytes, nome: v.nome, mime: v.tipo.mime, ext: v.tipo.ext });
  }

  const dir = path.join(STORAGE_DIR, tenantId);
  if (conferidos.length > 0) await mkdir(dir, { recursive: true });
  const anexos: AnexoGravado[] = [];
  for (const c of conferidos) {
    const guardado = `${randomUUID()}.${c.ext}`;
    await writeFile(path.join(dir, guardado), c.bytes);
    anexos.push({ fileName: c.nome, fileUrl: `${tenantId}/${guardado}`, mimeType: c.mime, sizeBytes: c.bytes.length });
  }
  return { ok: true, anexos };
}

/** Desfaz a gravação quando a transação do banco não vingou. Best-effort. */
export async function apagarAnexosGravados(anexos: AnexoGravado[]): Promise<void> {
  await Promise.all(anexos.map((a) => unlink(caminhoDoAnexo(a.fileUrl)).catch(() => undefined)));
}

/**
 * Caminho em disco. `fileUrl` é sempre "<tenantId>/<uuid>.<ext>", gravado por
 * `gravarAnexos` e nunca vindo de quem pede; mesmo assim a checagem de prefixo
 * fica, para um valor adulterado no banco não virar leitura fora da pasta.
 */
function caminhoDoAnexo(fileUrl: string): string {
  const alvo = path.resolve(STORAGE_DIR, fileUrl);
  if (!alvo.startsWith(path.resolve(STORAGE_DIR) + path.sep)) throw new Error("Caminho de anexo inválido.");
  return alvo;
}

export async function lerAnexo(fileUrl: string): Promise<Buffer | null> {
  try {
    return await readFile(caminhoDoAnexo(fileUrl));
  } catch {
    return null;
  }
}

/** A resposta de download, igual nas duas rotas. Sempre anexo e sem sniffing: o tipo é o conferido na entrada. */
export function respostaDoAnexo(conteudo: Buffer, anexo: { fileName: string; mimeType: string }): Response {
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": anexo.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(anexo.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
