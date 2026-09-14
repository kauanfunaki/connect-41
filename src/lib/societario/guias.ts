// Onde a guia de uma taxa fica guardada.
//
// Fora de `public/`, como os anexos internos (`src/app/api/documents`): guia de
// taxa tem CNPJ, inscrição e valor do cliente, e não pode ser servida por
// caminho estático sem checagem de permissão.
//
// `ProcessFee.documentUrl` guarda `<tenantId>/<uuid>.pdf`. O campo nasceu como
// "ponteiro" genérico — o robô do SIMA ainda vai gravar lá a DAM capturada —,
// então quem lê confere o formato antes de abrir arquivo: um valor que não é
// deste armazenamento não vira caminho de disco.

import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), "storage", "societario-guias");

const NOME_GUARDADO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/**
 * O caminho em disco de uma guia, ou `null` quando o valor não é deste
 * armazenamento **ou não é deste tenant**.
 *
 * O tenant do valor tem de ser o de quem pede: sem esta conferência, um
 * `documentUrl` apontando para a pasta de outro cliente anexaria a guia dele
 * num e-mail nosso.
 */
export function caminhoDaGuia(tenantId: string, documentUrl: string): string | null {
  const partes = documentUrl.split("/");
  if (partes.length !== 2) return null;
  const [dono, nome] = partes;
  if (dono !== tenantId || !NOME_GUARDADO.test(nome)) return null;
  return path.join(STORAGE_DIR, dono, nome);
}

/** Grava a guia e devolve o valor para `ProcessFee.documentUrl`. */
export async function salvarGuia(tenantId: string, conteudo: Buffer): Promise<string> {
  const nome = `${randomUUID()}.pdf`;
  const dir = path.join(STORAGE_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, nome), conteudo);
  return `${tenantId}/${nome}`;
}

/** Lê a guia guardada. `null` quando o valor não serve ou o arquivo sumiu. */
export async function lerGuia(tenantId: string, documentUrl: string): Promise<Buffer | null> {
  const caminho = caminhoDaGuia(tenantId, documentUrl);
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch {
    // Arquivo apagado ou volume trocado: a tela pede a guia de novo em vez de
    // mandar e-mail sem anexo.
    return null;
  }
}
