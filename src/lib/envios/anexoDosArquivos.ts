// O anexo do envio ao cliente tirado dos Arquivos da empresa (lote 2,
// 28/10/2026). Até aqui o envio só aceitava um arquivo subido na hora: a guia
// que o Serpro já tinha posto na pasta Guias precisava ser baixada e subida de
// novo.
//
// A régua de quem vê é a dos Arquivos (`arquivoParaAEquipe`: setor, lixeira),
// e o arquivo tem de ser da própria empresa do envio. O envio guarda uma
// cópia — ver `saveClientDocumentBytes`.

import type { AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { armazenamentoDoDrive, arquivoParaAEquipe, buscarNoDrive } from "@/lib/drive/servidor";
import { cabeNoEnvio, saveClientDocumentBytes, type SavedClientDocumentFile } from "@/lib/clientDocuments";

export type ArquivoParaOEnvio = { id: string; nome: string; pasta: string };

const NAO_ACHOU = "O arquivo escolhido não está mais nos Arquivos desta empresa. Escolha de novo.";

/** O arquivo, se a pessoa vê e se ele é da empresa — para a tela já chegar com ele escolhido. */
export async function arquivoParaOEnvio(ctx: AuthContext, companyId: string, arquivoId: string): Promise<ArquivoParaOEnvio | null> {
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return null;
  const alvo = await arquivoParaAEquipe(ctx, arquivoId);
  if (!alvo || alvo.pasta.companyId !== companyId) return null;
  return { id: alvo.arquivo.id, nome: alvo.arquivo.name, pasta: alvo.caminho.map((p) => p.name).join(" › ") };
}

/** A busca do campo: só o que cabe no envio (PDF ou imagem, até 10 MB). */
export async function arquivosParaOEnvio(ctx: AuthContext, companyId: string, termo: string): Promise<ArquivoParaOEnvio[]> {
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return [];
  const achados = await buscarNoDrive(ctx, companyId, termo);
  return achados
    .filter((a) => cabeNoEnvio(a.mime, a.tamanho))
    .slice(0, 20)
    .map((a) => ({ id: a.id, nome: a.nome, pasta: a.pastaRotulo }));
}

export async function anexoDosArquivos(
  ctx: AuthContext,
  companyId: string,
  arquivoId: string
): Promise<{ ok: true; anexo: SavedClientDocumentFile } | { ok: false; erro: string }> {
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return { ok: false, erro: "Os Arquivos estão desligados neste escritório." };
  const alvo = await arquivoParaAEquipe(ctx, arquivoId);
  if (!alvo || alvo.pasta.companyId !== companyId) return { ok: false, erro: NAO_ACHOU };
  const bytes = await armazenamentoDoDrive.lerAnexo(alvo.arquivo.storageKey);
  if (!bytes) return { ok: false, erro: NAO_ACHOU };
  try {
    return { ok: true, anexo: await saveClientDocumentBytes(ctx.tenantId, { nome: alvo.arquivo.name, mime: alvo.arquivo.mimeType, bytes }) };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Erro ao copiar o arquivo dos Arquivos." };
  }
}
