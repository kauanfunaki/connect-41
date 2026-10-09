// Arquivos (Drive) — o que toca o banco e o disco. As regras de quem vê e quem
// mexe estão em ./regras.ts; aqui elas são aplicadas sobre o que o banco
// devolve, e o formato de saída é o de ./tela.ts.
//
// Cada consulta carrega todas as pastas do escopo (uma empresa, ou as internas
// do escritório) e monta o caminho em memória. Uma empresa tem dezenas de
// pastas, não milhares, e o caminho completo é o que decide setor e
// compartilhamento — buscar pai por pai no banco seria uma consulta por nível.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";
import { getAllSectors } from "@/lib/sectors";
import { nomeExibicao } from "@/lib/companyName";
import { validarArquivoDoDrive } from "./tipoDoArquivo";
import {
  CHAVE_ENVIADOS,
  DIAS_NA_LIXEIRA,
  MODELO_PADRAO,
  NOME_DE_ENVIADOS,
  caminhoDaPasta,
  caminhoDoCliente,
  caminhoNaLixeira,
  chaveDoModelo,
  clienteVeCaminho,
  ehPastaDaCasa,
  mapaDePastas,
  ordenarPastas,
  podeMexerNoCaminho,
  podeMexerNoDrive,
  podeRestringirAoSetor,
  podeVerCaminho,
  raizesDoCliente,
  type PastaDoDrive,
} from "./regras";
import type { ArquivoNaTela, DestinoNaTela, NavegadorNaTela, PastaNaTela, ResultadoDaBusca } from "./tela";

/** Um arquivo por envio: o Drive manda arquivo a arquivo, com progresso de cada um. */
export const armazenamentoDoDrive = criarArmazenamento("drive", { validar: validarArquivoDoDrive, maximoPorEnvio: 1 });

export const SELECT_PASTA = {
  id: true,
  name: true,
  parentId: true,
  companyId: true,
  sectorCode: true,
  systemKey: true,
  sharedWithPortal: true,
  deletedAt: true,
} as const;

/** Todas as pastas do escopo, lixeira inclusive (o caminho precisa delas para saber o que está dentro de pasta excluída). */
export async function pastasDoEscopo(tenantId: string, companyId: string | null): Promise<PastaDoDrive[]> {
  return getPrisma().driveFolder.findMany({ where: { tenantId, companyId }, select: SELECT_PASTA });
}

// ─── Modelo e pastas da casa ─────────────────────────────────────────────────

/**
 * O modelo de pastas do escritório, criado com o padrão na primeira vez. O
 * `@@unique([tenantId, name])` com `skipDuplicates` segura duas pessoas abrindo
 * os Arquivos ao mesmo tempo.
 */
export async function modeloDoEscritorio(tenantId: string) {
  const prisma = getPrisma();
  if ((await prisma.driveTemplateFolder.count({ where: { tenantId } })) === 0) {
    await prisma.driveTemplateFolder.createMany({
      data: MODELO_PADRAO.map((m, i) => ({ tenantId, ...m, position: i })),
      skipDuplicates: true,
    });
  }
  return prisma.driveTemplateFolder.findMany({ where: { tenantId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
}

/** A posição de cada pasta do modelo, pela chave que a pasta da empresa carrega. */
function posicaoDoModelo(modelo: { id: string; position: number }[]): Map<string, number> {
  return new Map(modelo.map((m) => [chaveDoModelo(m.id), m.position]));
}

/**
 * Cria o que falta das pastas da casa de uma empresa: as do modelo ativo e
 * "Enviados pelo cliente". Roda toda vez que alguém abre os Arquivos da empresa
 * — é assim que uma pasta nova no modelo chega a quem já existia. O unique
 * `(tenantId, companyId, systemKey)` com `skipDuplicates` torna a corrida inofensiva.
 */
export async function garantirPastasDaEmpresa(tenantId: string, companyId: string) {
  const prisma = getPrisma();
  const modelo = await modeloDoEscritorio(tenantId);
  const existentes = new Set(
    (
      await prisma.driveFolder.findMany({
        where: { tenantId, companyId, systemKey: { not: null } },
        select: { systemKey: true },
      })
    ).map((p) => p.systemKey)
  );
  const faltando = [
    ...modelo
      .filter((m) => m.active && !existentes.has(chaveDoModelo(m.id)))
      .map((m) => ({
        tenantId,
        companyId,
        name: m.name,
        sectorCode: m.sectorCode,
        sharedWithPortal: m.sharedWithPortal,
        systemKey: chaveDoModelo(m.id),
      })),
    ...(existentes.has(CHAVE_ENVIADOS)
      ? []
      : [{ tenantId, companyId, name: NOME_DE_ENVIADOS, sharedWithPortal: true, systemKey: CHAVE_ENVIADOS }]),
  ];
  if (faltando.length > 0) await prisma.driveFolder.createMany({ data: faltando, skipDuplicates: true });
  return modelo;
}

/** A empresa, se for do escritório. */
export async function empresaDoDrive(tenantId: string, companyId: string) {
  const empresa = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: { id: true, name: true, displayName: true },
  });
  return empresa ? { id: empresa.id, nome: nomeExibicao(empresa) } : null;
}

// ─── Equipe ──────────────────────────────────────────────────────────────────

const SELECT_ARQUIVO = {
  id: true,
  name: true,
  sizeBytes: true,
  mimeType: true,
  createdAt: true,
  folderId: true,
  uploadedByPortalUserId: true,
  uploadedByUser: { select: { name: true } },
  uploadedByPortal: { select: { name: true } },
  _count: { select: { accesses: true } },
  accesses: { orderBy: { createdAt: "desc" as const }, take: 1, select: { createdAt: true } },
} as const;

type ArquivoDoBanco = {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: Date;
  uploadedByPortalUserId: string | null;
  uploadedByUser: { name: string } | null;
  uploadedByPortal: { name: string } | null;
  _count: { accesses: number };
  accesses: { createdAt: Date }[];
};

const EXTENSOES_COM_PREVIA = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp"]);

/** Prévia pelo tipo gravado — o mesmo que `tipoNoDrive` decidiu na entrada. */
export function temPrevia(mime: string, nome: string): boolean {
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  return EXTENSOES_COM_PREVIA.has(nome.split(".").pop()?.toLowerCase() ?? "");
}

function arquivoNaTela(a: ArquivoDoBanco): ArquivoNaTela {
  return {
    id: a.id,
    nome: a.name,
    tamanho: a.sizeBytes,
    mime: a.mimeType,
    previa: temPrevia(a.mimeType, a.name),
    enviadoEm: a.createdAt.toISOString(),
    enviadoPor: a.uploadedByPortal?.name ?? a.uploadedByUser?.name ?? null,
    peloCliente: a.uploadedByPortalUserId !== null,
    acessosDoCliente: a._count.accesses,
    ultimoAcessoDoCliente: a.accesses[0]?.createdAt.toISOString() ?? null,
  };
}

/**
 * O que a tela da equipe mostra numa pasta (ou no primeiro nível, com
 * `pastaId` nulo). `null` quando a empresa não é do escritório, a pasta não
 * existe, está na lixeira ou é de um setor fora do alcance — a página responde
 * 404 nos três casos, sem dizer qual.
 */
export async function navegadorDaEquipe(
  ctx: AuthContext,
  companyId: string | null,
  pastaId: string | null
): Promise<NavegadorNaTela | null> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;

  let empresa: { id: string; nome: string } | null = null;
  let posicao = new Map<string, number>();
  if (companyId) {
    empresa = await empresaDoDrive(tenantId, companyId);
    if (!empresa) return null;
    posicao = posicaoDoModelo(await garantirPastasDaEmpresa(tenantId, companyId));
  }

  const pastas = await pastasDoEscopo(tenantId, companyId);
  const mapa = mapaDePastas(pastas);
  const visivel = (p: PastaDoDrive) => {
    const c = caminhoDaPasta(p.id, mapa);
    return !!c && !caminhoNaLixeira(c) && podeVerCaminho(ctx, c);
  };

  let caminho: PastaDoDrive[] = [];
  if (pastaId) {
    const c = caminhoDaPasta(pastaId, mapa);
    if (!c || caminhoNaLixeira(c) || !podeVerCaminho(ctx, c)) return null;
    caminho = c;
  }
  const atual = caminho.at(-1) ?? null;

  const filhas = ordenarPastas(
    pastas.filter((p) => p.parentId === (pastaId ?? null) && p.deletedAt === null && visivel(p)),
    posicao
  );

  const [arquivosDoBanco, contagem, todosOsSetores, uso] = await Promise.all([
    pastaId
      ? prisma.driveFile.findMany({
          where: { tenantId, folderId: pastaId, deletedAt: null },
          orderBy: { name: "asc" },
          select: SELECT_ARQUIVO,
        })
      : Promise.resolve([] as ArquivoDoBanco[]),
    filhas.length
      ? prisma.driveFile.groupBy({
          by: ["folderId"],
          where: { tenantId, folderId: { in: filhas.map((f) => f.id) }, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    // Com os inativos: uma pasta pode ser de um setor que foi desligado.
    getAllSectors(tenantId),
    prisma.driveFile.aggregate({
      where: { tenantId, deletedAt: null, folder: { companyId, deletedAt: null } },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
  ]);

  const rotulos = new Map(todosOsSetores.map((s) => [s.code, s.label]));
  const arquivosPorPasta = new Map(contagem.map((c) => [c.folderId, c._count._all]));
  const subpastasPorPasta = new Map<string, number>();
  for (const p of pastas) {
    if (p.parentId && p.deletedAt === null) subpastasPorPasta.set(p.parentId, (subpastasPorPasta.get(p.parentId) ?? 0) + 1);
  }

  const subpastas: PastaNaTela[] = filhas.map((p) => ({
    id: p.id,
    nome: p.name,
    setor: p.sectorCode ? rotulos.get(p.sectorCode) ?? p.sectorCode : null,
    setorCode: p.sectorCode,
    daCasa: ehPastaDaCasa(p),
    enviados: p.systemKey === CHAVE_ENVIADOS,
    compartilhada: p.sharedWithPortal,
    itens: (arquivosPorPasta.get(p.id) ?? 0) + (subpastasPorPasta.get(p.id) ?? 0),
  }));

  const destinos: DestinoNaTela[] = pastas
    .filter((p) => p.deletedAt === null)
    .map((p) => ({ p, c: caminhoDaPasta(p.id, mapa) }))
    .filter((x): x is { p: PastaDoDrive; c: PastaDoDrive[] } => !!x.c && !caminhoNaLixeira(x.c) && podeMexerNoCaminho(ctx, x.c))
    .map(({ c }) => ({ id: c.at(-1)!.id, rotulo: c.map((p) => p.name).join(" › "), caminhoIds: c.map((p) => p.id) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base", numeric: true }));

  const setores = todosOsSetores
    .filter((s) => s.active && podeRestringirAoSetor(ctx, s.code))
    .map((s) => ({ code: s.code, label: s.label }));

  const compartilhadaPor = atual && !atual.sharedWithPortal ? caminho.find((p) => p.sharedWithPortal)?.name ?? null : null;

  return {
    empresa,
    pasta: atual && {
      id: atual.id,
      nome: atual.name,
      setor: atual.sectorCode ? rotulos.get(atual.sectorCode) ?? atual.sectorCode : null,
      setorCode: atual.sectorCode,
      daCasa: ehPastaDaCasa(atual),
      enviados: atual.systemKey === CHAVE_ENVIADOS,
      compartilhada: atual.sharedWithPortal,
      compartilhadaPor,
    },
    caminho: caminho.map((p) => ({ id: p.id, nome: p.name })),
    subpastas,
    arquivos: (arquivosDoBanco as ArquivoDoBanco[]).map(arquivoNaTela),
    podeMexer: atual ? podeMexerNoCaminho(ctx, caminho) : podeMexerNoDrive(ctx),
    setores,
    destinos,
    uso: { arquivos: uso._count._all, bytes: uso._sum.sizeBytes ?? 0 },
  };
}

/** Busca por nome de arquivo dentro do escopo, respeitando setor e lixeira. */
export async function buscarNoDrive(ctx: AuthContext, companyId: string | null, termo: string): Promise<ResultadoDaBusca[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const prisma = getPrisma();
  const [pastas, achados] = await Promise.all([
    pastasDoEscopo(ctx.tenantId, companyId),
    prisma.driveFile.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null, name: { contains: t }, folder: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: SELECT_ARQUIVO,
    }),
  ]);
  const mapa = mapaDePastas(pastas);
  const resultados: ResultadoDaBusca[] = [];
  for (const a of achados) {
    const c = caminhoDaPasta(a.folderId, mapa);
    if (!c || caminhoNaLixeira(c) || !podeVerCaminho(ctx, c)) continue;
    resultados.push({ ...arquivoNaTela(a), pastaId: a.folderId, pastaRotulo: c.map((p) => p.name).join(" › ") });
  }
  return resultados;
}

/**
 * Uma pasta para a equipe agir, com o caminho já conferido. `null` quando não
 * existe, é de outro escritório, está na lixeira ou é de setor fora do alcance.
 */
export async function pastaParaAEquipe(ctx: AuthContext, pastaId: string) {
  const pasta = await getPrisma().driveFolder.findFirst({ where: { id: pastaId, tenantId: ctx.tenantId }, select: SELECT_PASTA });
  if (!pasta) return null;
  const pastas = await pastasDoEscopo(ctx.tenantId, pasta.companyId);
  const mapa = mapaDePastas(pastas);
  const caminho = caminhoDaPasta(pasta.id, mapa);
  if (!caminho || caminhoNaLixeira(caminho) || !podeVerCaminho(ctx, caminho)) return null;
  return { pasta, caminho, pastas, mapa };
}

/** Um arquivo para a equipe abrir ou mexer. Mesmos `null` de `pastaParaAEquipe`, mais arquivo na lixeira. */
export async function arquivoParaAEquipe(ctx: AuthContext, arquivoId: string) {
  const arquivo = await getPrisma().driveFile.findFirst({
    where: { id: arquivoId, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true, name: true, mimeType: true, storageKey: true, folderId: true },
  });
  if (!arquivo) return null;
  const alvo = await pastaParaAEquipe(ctx, arquivo.folderId);
  return alvo ? { arquivo, ...alvo } : null;
}

// ─── Envio ───────────────────────────────────────────────────────────────────

export type ResultadoDoEnvio = { ok: true; arquivoId: string; nome: string } | { ok: false; erro: string };

/** Grava o arquivo e a linha do banco; se o banco falhar, apaga o que foi para o disco. */
export async function guardarArquivo(input: {
  tenantId: string;
  folderId: string;
  arquivo: File;
  uploadedByUserId?: string | null;
  uploadedByPortalUserId?: string | null;
}): Promise<ResultadoDoEnvio> {
  const gravado = await armazenamentoDoDrive.gravarAnexos(input.tenantId, [input.arquivo]);
  if (!gravado.ok) return { ok: false, erro: gravado.erro };
  const [g] = gravado.anexos;
  try {
    const criado = await getPrisma().driveFile.create({
      data: {
        tenantId: input.tenantId,
        folderId: input.folderId,
        name: g.fileName,
        storageKey: g.fileUrl,
        mimeType: g.mimeType,
        sizeBytes: g.sizeBytes,
        uploadedByUserId: input.uploadedByUserId ?? null,
        uploadedByPortalUserId: input.uploadedByPortalUserId ?? null,
      },
      select: { id: true, name: true },
    });
    return { ok: true, arquivoId: criado.id, nome: criado.name };
  } catch (err) {
    await armazenamentoDoDrive.apagarAnexosGravados(gravado.anexos);
    throw err;
  }
}

// ─── Cliente (portal) ────────────────────────────────────────────────────────

export type NavegadorDoCliente = {
  empresa: { id: string; nome: string };
  pasta: { id: string; nome: string; enviados: boolean } | null;
  caminho: { id: string; nome: string }[];
  subpastas: { id: string; nome: string; itens: number; enviados: boolean }[];
  arquivos: { id: string; nome: string; tamanho: number; previa: boolean; enviadoEm: string; seu: boolean }[];
  enviadosId: string | null;
};

/**
 * O que o cliente vê numa empresa: no primeiro nível, as pastas compartilhadas;
 * dentro de uma, o que está nela. `null` quando a pasta não está compartilhada
 * (nem por cima) ou está na lixeira. A empresa já vem conferida contra o
 * alcance do cliente por quem chama.
 */
export async function navegadorDoCliente(
  tenantId: string,
  companyId: string,
  pastaId: string | null,
  portalUserId: string
): Promise<NavegadorDoCliente | null> {
  const prisma = getPrisma();
  const empresa = await empresaDoDrive(tenantId, companyId);
  if (!empresa) return null;
  const posicao = posicaoDoModelo(await garantirPastasDaEmpresa(tenantId, companyId));
  const pastas = await pastasDoEscopo(tenantId, companyId);
  const mapa = mapaDePastas(pastas);

  let caminho: PastaDoDrive[] = [];
  if (pastaId) {
    const c = caminhoDaPasta(pastaId, mapa);
    if (!c || !clienteVeCaminho(c)) return null;
    caminho = caminhoDoCliente(c);
  }
  const atual = caminho.at(-1) ?? null;

  const filhas = ordenarPastas(
    atual ? pastas.filter((p) => p.parentId === atual.id && p.deletedAt === null) : raizesDoCliente(pastas),
    posicao
  );

  const [arquivos, contagem] = await Promise.all([
    atual
      ? prisma.driveFile.findMany({
          where: { tenantId, folderId: atual.id, deletedAt: null },
          orderBy: [{ createdAt: "desc" }],
          select: { id: true, name: true, sizeBytes: true, mimeType: true, createdAt: true, uploadedByPortalUserId: true },
        })
      : Promise.resolve([]),
    filhas.length
      ? prisma.driveFile.groupBy({
          by: ["folderId"],
          where: { tenantId, folderId: { in: filhas.map((f) => f.id) }, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const porPasta = new Map(contagem.map((c) => [c.folderId, c._count._all]));
  const subPorPasta = new Map<string, number>();
  for (const p of pastas) {
    if (p.parentId && p.deletedAt === null) subPorPasta.set(p.parentId, (subPorPasta.get(p.parentId) ?? 0) + 1);
  }

  return {
    empresa,
    pasta: atual && { id: atual.id, nome: atual.name, enviados: atual.systemKey === CHAVE_ENVIADOS },
    caminho: caminho.map((p) => ({ id: p.id, nome: p.name })),
    subpastas: filhas.map((p) => ({
      id: p.id,
      nome: p.name,
      itens: (porPasta.get(p.id) ?? 0) + (subPorPasta.get(p.id) ?? 0),
      enviados: p.systemKey === CHAVE_ENVIADOS,
    })),
    arquivos: arquivos.map((a) => ({
      id: a.id,
      nome: a.name,
      tamanho: a.sizeBytes,
      previa: temPrevia(a.mimeType, a.name),
      enviadoEm: a.createdAt.toISOString(),
      seu: a.uploadedByPortalUserId === portalUserId,
    })),
    enviadosId: pastas.find((p) => p.systemKey === CHAVE_ENVIADOS && p.deletedAt === null)?.id ?? null,
  };
}

/** Um arquivo que o cliente pode abrir: da empresa no alcance dele e numa pasta compartilhada fora da lixeira. */
export async function arquivoParaOCliente(tenantId: string, companyIds: string[], arquivoId: string) {
  const arquivo = await getPrisma().driveFile.findFirst({
    where: { id: arquivoId, tenantId, deletedAt: null, folder: { companyId: { in: companyIds } } },
    select: { id: true, name: true, mimeType: true, storageKey: true, folderId: true, folder: { select: { companyId: true } } },
  });
  if (!arquivo?.folder.companyId) return null;
  const pastas = await pastasDoEscopo(tenantId, arquivo.folder.companyId);
  const caminho = caminhoDaPasta(arquivo.folderId, mapaDePastas(pastas));
  if (!caminho || !clienteVeCaminho(caminho)) return null;
  return arquivo;
}

/** A pasta "Enviados pelo cliente" da empresa, criada se faltar. */
export async function pastaDeEnviados(tenantId: string, companyId: string): Promise<string> {
  await garantirPastasDaEmpresa(tenantId, companyId);
  const pasta = await getPrisma().driveFolder.findFirstOrThrow({
    where: { tenantId, companyId, systemKey: CHAVE_ENVIADOS },
    select: { id: true },
  });
  return pasta.id;
}

// ─── Lixeira ─────────────────────────────────────────────────────────────────

export type ItemDaLixeira = {
  tipo: "pasta" | "arquivo";
  id: string;
  nome: string;
  /** "Empresa › Fiscal › 2026" ou "Pastas internas › Modelos". */
  onde: string;
  excluidoEm: string;
  /** Some de vez nesta data. */
  someEm: string;
  podeRestaurar: boolean;
  /** Por que não dá para restaurar, quando não dá. */
  motivo: string | null;
};

/** O que está na lixeira e quem pede pode ver, das pastas e arquivos de todas as empresas e das internas. */
export async function lixeiraDaEquipe(ctx: AuthContext): Promise<ItemDaLixeira[]> {
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const [pastasExcluidas, arquivosExcluidos] = await Promise.all([
    prisma.driveFolder.findMany({ where: { tenantId, deletedAt: { not: null } }, select: SELECT_PASTA, orderBy: { deletedAt: "desc" }, take: 300 }),
    prisma.driveFile.findMany({
      where: { tenantId, deletedAt: { not: null } },
      select: { id: true, name: true, deletedAt: true, folderId: true, folder: { select: { companyId: true } } },
      orderBy: { deletedAt: "desc" },
      take: 300,
    }),
  ]);

  const escopos = new Set<string | null>([
    ...pastasExcluidas.map((p) => p.companyId),
    ...arquivosExcluidos.map((a) => a.folder.companyId),
  ]);
  const ids = [...escopos].filter((x): x is string => x !== null);
  const [pastasDosEscopos, empresas] = await Promise.all([
    prisma.driveFolder.findMany({
      where: { tenantId, OR: [{ companyId: { in: ids } }, ...(escopos.has(null) ? [{ companyId: null }] : [])] },
      select: SELECT_PASTA,
    }),
    prisma.company.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, displayName: true } }),
  ]);
  const mapa = mapaDePastas(pastasDosEscopos);
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  const dono = (companyId: string | null) => (companyId ? nomeDaEmpresa.get(companyId) ?? "Empresa" : "Pastas internas");
  const someEm = (d: Date) => new Date(d.getTime() + DIAS_NA_LIXEIRA * 86_400_000).toISOString();

  const itens: ItemDaLixeira[] = [];
  for (const p of pastasExcluidas) {
    const c = caminhoDaPasta(p.id, mapa);
    if (!c || !podeVerCaminho(ctx, c)) continue;
    const acimaNaLixeira = c.slice(0, -1).some((x) => x.deletedAt !== null);
    itens.push({
      tipo: "pasta",
      id: p.id,
      nome: p.name,
      onde: [dono(p.companyId), ...c.slice(0, -1).map((x) => x.name)].join(" › "),
      excluidoEm: p.deletedAt!.toISOString(),
      someEm: someEm(p.deletedAt!),
      podeRestaurar: !acimaNaLixeira && podeMexerNoCaminho(ctx, c),
      motivo: acimaNaLixeira ? "Restaure antes a pasta de cima." : null,
    });
  }
  for (const a of arquivosExcluidos) {
    const c = caminhoDaPasta(a.folderId, mapa);
    if (!c || !podeVerCaminho(ctx, c)) continue;
    const pastaNaLixeira = caminhoNaLixeira(c);
    itens.push({
      tipo: "arquivo",
      id: a.id,
      nome: a.name,
      onde: [dono(a.folder.companyId), ...c.map((x) => x.name)].join(" › "),
      excluidoEm: a.deletedAt!.toISOString(),
      someEm: someEm(a.deletedAt!),
      podeRestaurar: !pastaNaLixeira && podeMexerNoCaminho(ctx, c),
      motivo: pastaNaLixeira ? "A pasta dele também está na lixeira: restaure a pasta antes." : null,
    });
  }
  return itens.sort((x, y) => y.excluidoEm.localeCompare(x.excluidoEm));
}


// ─── Início dos Arquivos ─────────────────────────────────────────────────────

export type EnvioRecenteDoCliente = {
  id: string;
  nome: string;
  previa: boolean;
  enviadoEm: string;
  quem: string | null;
  empresa: { id: string; nome: string };
};

/**
 * O que os clientes mandaram pelo portal nos últimos 30 dias, mais novo
 * primeiro, só do que quem pede vê (setor dono no caminho, fora da lixeira).
 */
export async function chegouDoCliente(ctx: AuthContext, limite = 12): Promise<EnvioRecenteDoCliente[]> {
  const prisma = getPrisma();
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const recentes = await prisma.driveFile.findMany({
    where: { tenantId: ctx.tenantId, uploadedByPortalUserId: { not: null }, deletedAt: null, createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    take: limite * 4,
    select: {
      id: true,
      name: true,
      mimeType: true,
      createdAt: true,
      folderId: true,
      folder: { select: { companyId: true } },
      uploadedByPortal: { select: { name: true } },
    },
  });
  const ids = [...new Set(recentes.map((r) => r.folder.companyId).filter((c): c is string => !!c))];
  if (ids.length === 0) return [];
  const [pastas, empresas] = await Promise.all([
    prisma.driveFolder.findMany({ where: { tenantId: ctx.tenantId, companyId: { in: ids } }, select: SELECT_PASTA }),
    prisma.company.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true, displayName: true } }),
  ]);
  const mapa = mapaDePastas(pastas);
  const nome = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  const vistos: EnvioRecenteDoCliente[] = [];
  for (const r of recentes) {
    const companyId = r.folder.companyId;
    const c = caminhoDaPasta(r.folderId, mapa);
    if (!companyId || !c || caminhoNaLixeira(c) || !podeVerCaminho(ctx, c)) continue;
    vistos.push({
      id: r.id,
      nome: r.name,
      previa: temPrevia(r.mimeType, r.name),
      enviadoEm: r.createdAt.toISOString(),
      quem: r.uploadedByPortal?.name ?? null,
      empresa: { id: companyId, nome: nome.get(companyId) ?? "Empresa" },
    });
    if (vistos.length >= limite) break;
  }
  return vistos;
}
