import "server-only";

// Os arquivos dos comprovantes de pagamento em disco (Bloco C, Fase C2, 19/11/2026), no molde dos
// originais da conferência do financeiro (`originaisFinanceiro.ts`, B4).
//
// O original guardava o PDF ou a imagem em base64 numa coluna (`comprovantes.arquivo_base64`). No Connect
// os arquivos ficam em `storage/`, fora de `public/`:
// `storage/contabil-core/comprovantes/<tenantId>/<id do comprovante>.<ext>`. A chave gravada no banco
// (`storageKey`) nunca vem de quem envia, e quem lê confere o formato e o tenant antes de abrir qualquer
// caminho. A exclusão da empresa apaga estes arquivos depois do commit (`src/lib/exclusao/arquivos.ts`,
// pasta "contabil-core/comprovantes"); a exclusão lógica do comprovante não apaga o arquivo, como no
// original (o base64 ficava na linha excluída).

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

export const PASTA_DOS_COMPROVANTES = "contabil-core/comprovantes";

const RAIZ = path.join(process.cwd(), "storage", "contabil-core", "comprovantes");
const EXTENSOES = new Set(["pdf", "png", "jpg", "jpeg", "bin"]);
const CHAVE = /^([^/\\]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z]{3,4})$/;

const armazenamento = criarArmazenamento(PASTA_DOS_COMPROVANTES);

/** A extensão guardada: a do nome, quando é uma das que o comprovante aceita. */
function extensao(nome: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return EXTENSOES.has(ext) && ext !== "bin" ? ext : "bin";
}

/** A chave do arquivo: "<tenantId>/<id do comprovante>.<ext>". */
export function chaveDoArquivo(tenantId: string, comprovanteId: string, nome: string): string {
  return `${tenantId}/${comprovanteId.toLowerCase()}.${extensao(nome)}`;
}

/** A chave é deste armazenamento e deste tenant? (Um valor adulterado no banco não vira leitura fora da pasta.) */
export function chaveValida(tenantId: string, chave: string): boolean {
  const m = CHAVE.exec(chave);
  return !!m && m[1] === tenantId && EXTENSOES.has(m[3]);
}

function caminho(chave: string): string {
  const alvo = path.resolve(RAIZ, chave);
  if (!alvo.startsWith(path.resolve(RAIZ) + path.sep)) throw new Error("Caminho de comprovante inválido.");
  return alvo;
}

/** Grava o arquivo. Chamar dentro da transação, depois da linha criada; se ela falhar, `apagarArquivo`. */
export async function gravarArquivo(tenantId: string, chave: string, conteudo: Uint8Array): Promise<void> {
  if (!chaveValida(tenantId, chave)) throw new Error("Chave de comprovante inválida.");
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
