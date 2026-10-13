// Os arquivos em disco de um cadastro excluído.
//
// O banco apaga as linhas (e as cascatas), mas nunca o arquivo que a linha
// apontava. A lista é montada dentro da transação, antes de apagar, e os
// arquivos saem DEPOIS do commit — a mesma ordem da lixeira dos Arquivos
// (src/lib/drive/lixeira.ts): se o disco falhar, sobra um arquivo órfão que
// ninguém vê; a ordem contrária deixaria linha apontando para o nada.
//
// Falha ao apagar um arquivo não desfaz a exclusão: vai para o log do servidor
// e para a conta que a tela mostra.

import { unlink } from "fs/promises";
import path from "path";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";
import { caminhoDaGuia } from "@/lib/societario/guias";
import type { Tx } from "./comum";

/** As pastas sob `storage/`, cada uma com "<tenantId>/<uuid>.<ext>" no banco. */
export type PastaDoStorage =
  | "documents"
  | "client-documents"
  | "client-requests"
  | "company-messages"
  | "service-requests"
  | "societario-processos"
  | "drive"
  | "resumes";

export type ArquivosDoCadastro = {
  storage: Partial<Record<PastaDoStorage, string[]>>;
  /** Guias de taxa do Societário (`ProcessFee.documentUrl`), que conferem o tenant no caminho. */
  guias: { tenantId: string; documentUrl: string }[];
  /** Logo da empresa e foto do usuário, em `public/uploads/<pasta>/`. */
  publicos: { pasta: "companies" | "avatars"; url: string }[];
  /**
   * Currículos: o mesmo arquivo pode servir a várias candidaturas (o candidato
   * atualiza pelo portal e a nova versão vale para todas em andamento) e à
   * mensagem do WhatsApp que o trouxe. Só sai o que ninguém mais usa.
   */
  curriculos: string[];
};

export function semArquivos(): ArquivosDoCadastro {
  return { storage: {}, guias: [], publicos: [], curriculos: [] };
}

export function juntarArquivos(a: ArquivosDoCadastro, b: ArquivosDoCadastro): ArquivosDoCadastro {
  const storage: ArquivosDoCadastro["storage"] = { ...a.storage };
  for (const [pasta, lista] of Object.entries(b.storage) as [PastaDoStorage, string[]][]) {
    storage[pasta] = [...(storage[pasta] ?? []), ...lista];
  }
  return {
    storage,
    guias: [...a.guias, ...b.guias],
    publicos: [...a.publicos, ...b.publicos],
    curriculos: [...a.curriculos, ...b.curriculos],
  };
}

export function anotar(arquivos: ArquivosDoCadastro, pasta: PastaDoStorage, urls: (string | null | undefined)[]): void {
  const validas = urls.filter((u): u is string => !!u);
  if (validas.length > 0) arquivos.storage[pasta] = [...(arquivos.storage[pasta] ?? []), ...validas];
}

export function totalDeArquivos(a: ArquivosDoCadastro): number {
  return (
    Object.values(a.storage).reduce((s, l) => s + (l?.length ?? 0), 0) + a.guias.length + a.publicos.length + a.curriculos.length
  );
}

/** Os currículos da lista que nenhuma candidatura nem mensagem usa mais — rodar depois do commit. */
export async function curriculosSemUso(db: Tx, urls: string[]): Promise<string[]> {
  const unicos = [...new Set(urls)];
  if (unicos.length === 0) return [];
  const [candidaturas, mensagens] = await Promise.all([
    db.candidatura.findMany({ where: { resumeUrl: { in: unicos } }, select: { resumeUrl: true } }),
    db.whatsappMessage.findMany({ where: { mediaUrl: { in: unicos } }, select: { mediaUrl: true } }),
  ]);
  const emUso = new Set([...candidaturas.map((c) => c.resumeUrl), ...mensagens.map((m) => m.mediaUrl)]);
  return unicos.filter((u) => !emUso.has(u));
}

const NOME_PUBLICO = /^[a-zA-Z0-9-]+\.(jpg|png|webp)$/;

/** "/api/company-logos/<id>.png?v=123" → caminho em public/uploads/companies, ou null se não for nosso. */
function caminhoPublico(pasta: "companies" | "avatars", url: string): string | null {
  const nome = url.split("?")[0].split("/").pop() ?? "";
  if (!NOME_PUBLICO.test(nome)) return null;
  return path.join(process.cwd(), "public", "uploads", pasta, nome);
}

async function apagarUm(caminho: string | null, rotulo: string): Promise<number> {
  if (!caminho) return 0;
  try {
    await unlink(caminho);
    return 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return 0;
    console.error(`[exclusao:arquivo] ${rotulo}`, err);
    return 1;
  }
}

/**
 * Apaga do disco. Devolve quantos ficaram (falha que não é "já não existia").
 * Os currículos precisam ter passado por `curriculosSemUso` antes.
 */
export async function apagarArquivos(a: ArquivosDoCadastro): Promise<number> {
  let falhas = 0;
  for (const [pasta, urls] of Object.entries(a.storage) as [PastaDoStorage, string[]][]) {
    if (urls.length > 0) falhas += await criarArmazenamento(pasta).apagarArquivos([...new Set(urls)]);
  }
  if (a.curriculos.length > 0) falhas += await criarArmazenamento("resumes").apagarArquivos([...new Set(a.curriculos)]);
  for (const g of a.guias) falhas += await apagarUm(caminhoDaGuia(g.tenantId, g.documentUrl), `guia ${g.documentUrl}`);
  for (const p of a.publicos) falhas += await apagarUm(caminhoPublico(p.pasta, p.url), `${p.pasta} ${p.url}`);
  return falhas;
}
