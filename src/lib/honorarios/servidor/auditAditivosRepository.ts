// Leituras dos Aditivos (e de Contratos e Honorários): o inventário de uma
// varredura e as empresas ativas, no formato de linha do Aditiva Pronto.

import { db, tenantAtual } from "./contexto";
import { listarEmpresas } from "./auditRepository";

export interface ArquivoDoJobRow {
  nome_pasta: string;
  caminho_relativo: string;
  nome: string;
  ext: string;
  tamanho: number;
  modificado_em: Date;
  pdf_assinado: number | null;
  pdf_marca: string | null;
}

export async function listarArquivosDoJob(jobId: string): Promise<ArquivoDoJobRow[]> {
  const job = await db().honorarioSyncJob.findFirst({ where: { id: jobId, tenantId: tenantAtual() }, select: { id: true } });
  if (!job) return [];
  const arquivos = await db().honorarioArquivo.findMany({
    where: { jobId },
    select: {
      caminhoRelativo: true,
      nome: true,
      ext: true,
      tamanho: true,
      modificadoEm: true,
      pdfAssinado: true,
      pdfMarca: true,
      pasta: { select: { nomePasta: true } },
    },
  });
  return arquivos.map((a) => ({
    nome_pasta: a.pasta.nomePasta,
    caminho_relativo: a.caminhoRelativo,
    nome: a.nome,
    ext: a.ext,
    tamanho: Number(a.tamanho),
    modificado_em: a.modificadoEm,
    pdf_assinado: a.pdfAssinado === null ? null : a.pdfAssinado ? 1 : 0,
    pdf_marca: a.pdfMarca,
  }));
}

export interface EmpresaAtivaRow {
  id: string;
  razao_social: string;
  cnpj: string;
  responsavel: string | null;
}

export async function listarEmpresasAtivas(): Promise<EmpresaAtivaRow[]> {
  return (await listarEmpresas())
    .filter((e) => e.inativo === 0)
    .map((e) => ({ id: e.id, razao_social: e.razao_social, cnpj: e.cnpj, responsavel: e.responsavel }));
}

/**
 * Termos aditivos gerados pelo próprio app, por empresa. No Aditiva era a
 * tabela `generated_documents`; a geração do termo em Word não veio para o
 * Connect (decisão de 11/11/2026), então não há gerado no app.
 */
export async function contarGeradosNoApp(inicio: Date, fim: Date): Promise<Map<string, { qtd: number; ultimo: Date }>> {
  void inicio;
  void fim;
  return new Map();
}
