import "server-only";

// Os originais da conferência do financeiro em disco (Bloco B, Fase B4, 12/11/2026).
//
// O original guardava os bytes no PostgreSQL (`financeiro_documentos.conteudo`). No Connect os
// arquivos ficam em `storage/`, fora de `public/`, como os da Revisão do fechamento e do Drive:
// `storage/contabil-core/financeiro/<tenantId>/<id do documento>.<ext>`. A chave gravada no banco
// (`storageKey`) nunca vem de quem envia, e quem lê confere o formato e o tenant antes de abrir
// qualquer caminho. A exclusão da empresa apaga estes arquivos depois do commit
// (`src/lib/exclusao/arquivos.ts`, pasta "contabil-core/financeiro").

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

export const PASTA_DOS_ORIGINAIS = "contabil-core/financeiro";

const RAIZ = path.join(process.cwd(), "storage", "contabil-core", "financeiro");
const EXTENSOES = new Set(["pdf", "xls", "xlsx", "bin"]);
const CHAVE = /^([^/\\]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z]{3,4})$/;

const armazenamento = criarArmazenamento(PASTA_DOS_ORIGINAIS);

/** A extensão guardada: a do nome, quando é uma das que a conferência recebe. */
function extensao(nome: string): string {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return EXTENSOES.has(ext) && ext !== "bin" ? ext : "bin";
}

/** A chave do original: "<tenantId>/<id do documento>.<ext>". */
export function chaveDoOriginal(tenantId: string, documentoId: string, nome: string): string {
  return `${tenantId}/${documentoId.toLowerCase()}.${extensao(nome)}`;
}

/** A chave é deste armazenamento e deste tenant? (Um valor adulterado no banco não vira leitura fora da pasta.) */
export function chaveValida(tenantId: string, chave: string): boolean {
  const m = CHAVE.exec(chave);
  return !!m && m[1] === tenantId && EXTENSOES.has(m[3]);
}

function caminho(chave: string): string {
  const alvo = path.resolve(RAIZ, chave);
  if (!alvo.startsWith(path.resolve(RAIZ) + path.sep)) throw new Error("Caminho de original inválido.");
  return alvo;
}

/** Grava o original. Chamar dentro da transação, depois da versão avançar; se ela falhar, `apagarOriginal`. */
export async function gravarOriginal(tenantId: string, chave: string, conteudo: Uint8Array): Promise<void> {
  if (!chaveValida(tenantId, chave)) throw new Error("Chave de original inválida.");
  const alvo = caminho(chave);
  await mkdir(path.dirname(alvo), { recursive: true });
  await writeFile(alvo, conteudo);
}

/** Lê o original. `null` quando a chave não é deste tenant ou o arquivo sumiu. */
export async function lerOriginal(tenantId: string, chave: string): Promise<Buffer | null> {
  if (!chaveValida(tenantId, chave)) return null;
  return armazenamento.lerAnexo(chave);
}

/** Desfaz a gravação quando a transação do banco não vingou. Arquivo que já não existe não é erro. */
export async function apagarOriginal(tenantId: string, chave: string): Promise<void> {
  if (!chaveValida(tenantId, chave)) return;
  await unlink(caminho(chave)).catch(() => undefined);
}
