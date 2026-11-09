// Arquivos — a busca em todas as empresas (09/11/2026): o que toca o banco. As
// regras (quem vê, o que cada palavra procura, o tipo) estão em ./busca.ts.
//
// Três idas ao banco por busca: a árvore de pastas do escritório junto com as
// empresas de cada palavra, os arquivos (já com a régua e o limite) e o nome
// das empresas dos arquivos que voltaram.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { MODULO_ARQUIVOS } from "./regras";
import { SELECT_PASTA, temPrevia } from "./servidor";
import { clausulaDaBusca, empresasDaPalavra, lerFiltroDaBusca, opcoesDoTipo, type FiltroDaBusca, type OpcaoDoTipo } from "./busca";
import { ROTULO_DAS_INTERNAS, enderecoDoAchado, type ArquivoAchado } from "./tela";

export type ResultadoDaBuscaGeral = { itens: ArquivoAchado[]; temMais: boolean };

/**
 * Os arquivos que quem pede vê, em todas as empresas e nas pastas do
 * escritório, mais novos primeiro, até `limite`. `temMais` diz se a lista
 * parou no limite. Com `soPeloNome` (a busca do topo), a palavra procura só no
 * nome do arquivo — a empresa já tem o grupo dela ali.
 */
export async function buscarEmTodasAsEmpresas(
  ctx: AuthContext,
  filtro: Pick<FiltroDaBusca, "palavras" | "tipo" | "limite">,
  { soPeloNome = false }: { soPeloNome?: boolean } = {}
): Promise<ResultadoDaBuscaGeral> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const [pastas, empresasPorPalavra] = await Promise.all([
    // A árvore inteira, lixeira inclusive: o caminho precisa dela para saber o
    // que está dentro de pasta excluída ou de pasta de setor.
    prisma.driveFolder.findMany({ where: { tenantId }, select: SELECT_PASTA }),
    Promise.all(
      filtro.palavras.map(async (palavra) =>
        soPeloNome
          ? []
          : (await prisma.company.findMany({ where: empresasDaPalavra(tenantId, palavra), select: { id: true } })).map((e) => e.id)
      )
    ),
  ]);

  const escopo = clausulaDaBusca({
    tenantId,
    quem: ctx,
    pastas,
    tipo: filtro.tipo,
    palavras: filtro.palavras.map((palavra, i) => ({ palavra, empresas: empresasPorPalavra[i] })),
  });
  if (!escopo) return { itens: [], temMais: false };

  const achados = await prisma.driveFile.findMany({
    where: escopo.where,
    // O `id` desempata: dois arquivos do mesmo envio têm a mesma hora, e sem
    // ele o "Mostrar mais" poderia repetir um e pular outro.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: filtro.limite + 1,
    select: {
      id: true,
      name: true,
      sizeBytes: true,
      mimeType: true,
      createdAt: true,
      folderId: true,
      _count: { select: { guias: { where: { tenantId } }, certidoes: { where: { tenantId } } } },
    },
  });
  const temMais = achados.length > filtro.limite;
  // A consulta já veio pela régua. Esta conferência pega a pasta criada entre
  // a leitura da árvore e a dos arquivos, que a régua não conhecia.
  const vistos = achados.slice(0, filtro.limite).filter((a) => escopo.caminhos.has(a.folderId));

  const ids = [...new Set(vistos.map((a) => escopo.caminhos.get(a.folderId)!.at(-1)!.companyId).filter((c): c is string => !!c))];
  const empresas = ids.length
    ? await prisma.company.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, displayName: true, cnpj: true } })
    : [];
  const empresaPorId = new Map(empresas.map((e) => [e.id, { id: e.id, nome: nomeExibicao(e), cnpj: e.cnpj }]));

  return {
    temMais,
    itens: vistos.map((a) => {
      const caminho = escopo.caminhos.get(a.folderId)!;
      const companyId = caminho.at(-1)!.companyId;
      return {
        id: a.id,
        nome: a.name,
        tamanho: a.sizeBytes,
        previa: temPrevia(a.mimeType, a.name),
        enviadoEm: a.createdAt.toISOString(),
        empresa: companyId ? (empresaPorId.get(companyId) ?? { id: companyId, nome: "Empresa", cnpj: null }) : null,
        pastaId: a.folderId,
        pastaRotulo: caminho.map((p) => p.name).join(" › "),
        vinculo: a._count.guias > 0 ? "guia" : a._count.certidoes > 0 ? "certidao" : null,
      };
    }),
  };
}

/** As opções do filtro "Tipo" deste escritório, para quem pede. */
export async function opcoesDoTipoDoEscritorio(ctx: AuthContext): Promise<OpcaoDoTipo[]> {
  const modelo = await getPrisma().driveTemplateFolder.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sectorCode: true },
  });
  return opcoesDoTipo(ctx, modelo);
}

// ─── Busca do topo (Ctrl+K) ──────────────────────────────────────────────────

/** Quantos arquivos a busca do topo mostra; o resto fica no "Ver todos". */
export const ARQUIVOS_NA_BUSCA_DO_TOPO = 5;

export type ArquivoNaBuscaDoTopo = { id: string; name: string; detalhe: string; href: string };

const NADA_NO_TOPO = { itens: [] as ArquivoNaBuscaDoTopo[], mais: false };

/**
 * Os arquivos da busca do topo (09/11/2026): pelo nome, com a régua dos
 * Arquivos. Abrem na pasta onde estão — o arquivo em si se baixa de lá. Com o
 * módulo desligado, nada: as telas dele respondem 404 (src/app/(app)/arquivos/acesso.ts).
 */
export async function arquivosParaABuscaDoTopo(ctx: AuthContext, q: string): Promise<{ itens: ArquivoNaBuscaDoTopo[]; mais: boolean }> {
  if (!ctx.tenantId || !ctx.userId) return NADA_NO_TOPO;
  const { palavras } = lerFiltroDaBusca({ q });
  if (palavras.length === 0) return NADA_NO_TOPO;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return NADA_NO_TOPO;
  const r = await buscarEmTodasAsEmpresas(ctx, { palavras, tipo: null, limite: ARQUIVOS_NA_BUSCA_DO_TOPO }, { soPeloNome: true });
  return {
    mais: r.temMais,
    itens: r.itens.map((a) => ({ id: a.id, name: a.nome, detalhe: a.empresa?.nome ?? ROTULO_DAS_INTERNAS, href: enderecoDoAchado(a) })),
  };
}
