import "server-only";

// Os PDFs das faturas de cartão em disco (Bloco C, Fase C3, 23/11/2026), no molde dos comprovantes
// (`originaisComprovantes.ts`, C2) e dos originais do financeiro (`originaisFinanceiro.ts`, B4).
//
// O original guardava o PDF na coluna `fatura_documentos.conteudo`. No Connect os arquivos ficam em
// `storage/`, fora de `public/`: `storage/contabil-core/faturas/<tenantId>/<id do documento>.pdf`. A chave
// gravada no banco (`storageKey`) nunca vem de quem envia, e quem lê confere o formato e o tenant antes de
// abrir qualquer caminho. A exclusão da empresa apaga estes arquivos depois do commit
// (`src/lib/exclusao/arquivos.ts`, pasta "contabil-core/faturas").

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

export const PASTA_DAS_FATURAS = "contabil-core/faturas";

const RAIZ = path.join(process.cwd(), "storage", "contabil-core", "faturas");
const CHAVE = /^([^/\\]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pdf$/;

const armazenamento = criarArmazenamento(PASTA_DAS_FATURAS);

/** A chave do arquivo: "<tenantId>/<id do documento>.pdf" (a fatura só aceita PDF). */
export function chaveDoArquivo(tenantId: string, documentoId: string): string {
  return `${tenantId}/${documentoId.toLowerCase()}.pdf`;
}

/** A chave é deste armazenamento e deste tenant? (Um valor adulterado no banco não vira leitura fora da pasta.) */
export function chaveValida(tenantId: string, chave: string): boolean {
  const m = CHAVE.exec(chave);
  return !!m && m[1] === tenantId;
}

function caminho(chave: string): string {
  const alvo = path.resolve(RAIZ, chave);
  if (!alvo.startsWith(path.resolve(RAIZ) + path.sep)) throw new Error("Caminho de fatura inválido.");
  return alvo;
}

/** Grava o arquivo. Chamar dentro da transação, depois da linha criada; se ela falhar, `apagarArquivo`. */
export async function gravarArquivo(tenantId: string, chave: string, conteudo: Uint8Array): Promise<void> {
  if (!chaveValida(tenantId, chave)) throw new Error("Chave de fatura inválida.");
  const alvo = caminho(chave);
  await mkdir(path.dirname(alvo), { recursive: true });
  await writeFile(alvo, conteudo);
}

/** Lê o arquivo. `null` quando a chave não é deste tenant ou o arquivo sumiu. */
export async function lerArquivo(tenantId: string, chave: string): Promise<Buffer | null> {
  if (!chaveValida(tenantId, chave)) return null;
  return armazenamento.lerAnexo(chave);
}

/** Desfaz a gravação quando a transação do banco não vingou. Arquivo que já não existe não é erro. */
export async function apagarArquivo(tenantId: string, chave: string): Promise<void> {
  if (!chaveValida(tenantId, chave)) return;
  await unlink(caminho(chave)).catch(() => undefined);
}
