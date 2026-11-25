"use server";

// As categorias do cliente no Fluxo de caixa (25/11/2026, funcionalidade-837):
// a nomenclatura própria de cada empresa e o de-para das categorias do Omie
// para ela. Quem mantém é a equipe do BPO; o cliente só vê.
//
// Tudo grava em `ClientCategory` e `ClientCategoryMapping`, com a empresa:
// nada aqui toca `FinanceCategory`, o plano padrão do escritório nem o de-para
// de outra empresa.

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { linhasDoCsv, ErroCsv } from "@/lib/contabil-core/planilha/csv";
import { chaveDeTexto, linhaDoCodigo } from "@/lib/fluxoDeCaixa/estrutura";
import {
  MAX_NOME_DO_CLIENTE,
  lerDePara,
  planejarDePara,
  resumoDoPlano,
  type LinhaDoDePara,
  type ModoDoDePara,
  type PlanoDoDePara,
} from "@/lib/fluxoDeCaixa/dePara";
import { planoDaEmpresaParaODePara } from "@/lib/fluxoDeCaixa/categoriasDoClienteServidor";

const MODULE = "bpo_fluxo_caixa";
const SECTOR = getModuleDef(MODULE)!.sectorCode;
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

export type AcaoDasCategorias = { error: string } | { success: true };

type Contexto = { ok: true; tenantId: string; userId: string; prisma: ReturnType<typeof getPrisma> };

/** A mesma régua da tela do Fluxo de caixa, mais a empresa e o foco. */
async function contexto(companyId: string): Promise<Contexto | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { ok: false, erro: "Não autenticado." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false, erro: "O Fluxo de caixa não está ligado neste escritório." };
  if (!canViewSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) return { ok: false, erro: "Sem permissão no Fluxo de caixa." };

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { ok: false, erro: foraDoFoco };
  return { ok: true, tenantId: ctx.tenantId, userId: ctx.userId, prisma };
}

function auditar(c: Contexto, companyId: string, action: string, metadata: Record<string, string | number | null>) {
  return logAudit({ tenantId: c.tenantId, userId: c.userId, action, entityType: "Company", entityId: companyId, metadata });
}

function nomeLimpo(valor: string): string | null {
  const nome = valor.replace(/\s+/g, " ").trim();
  return nome && nome.length <= MAX_NOME_DO_CLIENTE ? nome : null;
}

/** Já existe outra com o mesmo nome, ignorando caixa e acento? */
async function nomeEmUso(c: Contexto, companyId: string, nome: string, menos?: string): Promise<boolean> {
  const todas = await c.prisma.clientCategory.findMany({ where: { tenantId: c.tenantId, companyId }, select: { id: true, name: true } });
  const k = chaveDeTexto(nome);
  return todas.some((t) => t.id !== menos && chaveDeTexto(t.name) === k);
}

const JA_EXISTE = "Já existe uma categoria do cliente com esse nome nesta empresa.";

export async function criarCategoriaDoCliente(companyId: string, nome: string, linha: string): Promise<AcaoDasCategorias> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  const limpo = nomeLimpo(nome);
  if (!limpo) return { error: `Escreva o nome, com até ${MAX_NOME_DO_CLIENTE} letras.` };
  if (!linhaDoCodigo(linha)) return { error: "Escolha a linha do fluxo." };
  if (await nomeEmUso(c, companyId, limpo)) return { error: JA_EXISTE };

  const ultima = await c.prisma.clientCategory.aggregate({ where: { tenantId: c.tenantId, companyId }, _max: { position: true } });
  try {
    const criada = await c.prisma.clientCategory.create({
      data: { tenantId: c.tenantId, companyId, name: limpo, line: linha, position: (ultima._max.position ?? -1) + 1 },
      select: { id: true },
    });
    await auditar(c, companyId, "fluxo.categoria_cliente.criar", { clientCategoryId: criada.id, nome: limpo, linha });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: JA_EXISTE };
    throw err;
  }
  revalidatePath("/fluxo-de-caixa");
  return { success: true };
}

export async function editarCategoriaDoCliente(
  companyId: string,
  id: string,
  mudanca: { nome?: string; linha?: string }
): Promise<AcaoDasCategorias> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  const atual = await c.prisma.clientCategory.findFirst({ where: { id, tenantId: c.tenantId, companyId }, select: { name: true, line: true } });
  if (!atual) return { error: "Categoria do cliente não encontrada." };

  const data: { name?: string; line?: string } = {};
  if (mudanca.nome !== undefined) {
    const limpo = nomeLimpo(mudanca.nome);
    if (!limpo) return { error: `Escreva o nome, com até ${MAX_NOME_DO_CLIENTE} letras.` };
    if (await nomeEmUso(c, companyId, limpo, id)) return { error: JA_EXISTE };
    data.name = limpo;
  }
  if (mudanca.linha !== undefined) {
    if (!linhaDoCodigo(mudanca.linha)) return { error: "Linha do fluxo desconhecida." };
    data.line = mudanca.linha;
  }
  if (Object.keys(data).length === 0) return { success: true };

  try {
    await c.prisma.clientCategory.update({ where: { id }, data });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: JA_EXISTE };
    throw err;
  }
  await auditar(c, companyId, "fluxo.categoria_cliente.editar", {
    clientCategoryId: id,
    nomeAntes: atual.name,
    nome: data.name ?? atual.name,
    linhaAntes: atual.line,
    linha: data.line ?? atual.line,
  });
  revalidatePath("/fluxo-de-caixa");
  return { success: true };
}

/** Apaga a categoria do cliente; as categorias do Omie ligadas a ela ficam sem (voltam à sugerida). */
export async function apagarCategoriaDoCliente(companyId: string, id: string): Promise<AcaoDasCategorias> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  const atual = await c.prisma.clientCategory.findFirst({
    where: { id, tenantId: c.tenantId, companyId },
    select: { name: true, _count: { select: { mappings: true } } },
  });
  if (!atual) return { error: "Categoria do cliente não encontrada." };
  // As ligações vão junto, em cascata no banco.
  await c.prisma.clientCategory.delete({ where: { id } });
  await auditar(c, companyId, "fluxo.categoria_cliente.apagar", { clientCategoryId: id, nome: atual.name, ligacoes: atual._count.mappings });
  revalidatePath("/fluxo-de-caixa");
  return { success: true };
}

/** Liga (ou, com `clienteId` nulo, desliga) uma categoria do Omie da empresa a uma categoria do cliente. */
export async function ligarCategoria(companyId: string, categoryId: string, clienteId: string | null): Promise<AcaoDasCategorias> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  // A categoria tem de valer para a empresa: id de categoria de outro cliente não passa.
  const doPlano = await planoDaEmpresaParaODePara(c.tenantId, companyId);
  const categoria = doPlano.find((p) => p.id === categoryId);
  if (!categoria) return { error: "Categoria não encontrada no plano desta empresa." };

  if (clienteId === null) {
    const { count } = await c.prisma.clientCategoryMapping.deleteMany({ where: { tenantId: c.tenantId, companyId, categoryId } });
    if (count > 0) await auditar(c, companyId, "fluxo.categoria_cliente.desligar", { categoryId, categoria: categoria.name });
  } else {
    const cliente = await c.prisma.clientCategory.findFirst({ where: { id: clienteId, tenantId: c.tenantId, companyId }, select: { name: true } });
    if (!cliente) return { error: "Categoria do cliente não encontrada." };
    await c.prisma.clientCategoryMapping.upsert({
      where: { companyId_categoryId: { companyId, categoryId } },
      create: { tenantId: c.tenantId, companyId, categoryId, clientCategoryId: clienteId },
      update: { clientCategoryId: clienteId },
    });
    await auditar(c, companyId, "fluxo.categoria_cliente.ligar", { categoryId, categoria: categoria.name, clientCategoryId: clienteId, cliente: cliente.name });
  }
  revalidatePath("/fluxo-de-caixa");
  return { success: true };
}

// ─── Importar e copiar ──────────────────────────────────────────────────────

export type PreviaDoDePara = {
  modo: ModoDoDePara;
  plano: PlanoDoDePara;
  resumo: ReturnType<typeof resumoDoPlano>;
};

type LeituraDoArquivo = { ok: true; modo: ModoDoDePara; linhas: LinhaDoDePara[] } | { ok: false; erro: string };

async function lerArquivo(form: FormData): Promise<LeituraDoArquivo> {
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return { ok: false, erro: "Escolha a planilha do de-para (.xlsx ou .csv)." };
  if (arquivo.size === 0) return { ok: false, erro: "O arquivo está vazio." };
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: "Arquivo maior que 8 MB." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  // xlsx é um zip: começa com "PK".
  const ehXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  try {
    if (ehXlsx) {
      const livro = new ExcelJS.Workbook();
      await livro.xlsx.load(bytes.buffer as ArrayBuffer);
      const aba = livro.worksheets[0];
      if (!aba) return { ok: false, erro: "A planilha não tem nenhuma aba." };
      const matriz: unknown[][] = [];
      aba.eachRow({ includeEmpty: true }, (row) => {
        const vals: unknown[] = [];
        for (let col = 1; col <= Math.max(row.cellCount, aba.columnCount); col++) vals.push(row.getCell(col).value ?? null);
        matriz.push(vals);
      });
      return lerDePara(matriz as Parameters<typeof lerDePara>[0]);
    }
    return lerDePara(linhasDoCsv(bytes));
  } catch (err) {
    if (err instanceof ErroCsv) return { ok: false, erro: err.message };
    console.error("[fluxo/lerArquivo]", err);
    return { ok: false, erro: "Não consegui abrir o arquivo. Use a planilha em .xlsx ou salva como .csv." };
  }
}

async function planejar(c: Contexto, companyId: string, modo: ModoDoDePara, linhas: LinhaDoDePara[]): Promise<PreviaDoDePara> {
  const [plano, existentes, atuais] = await Promise.all([
    planoDaEmpresaParaODePara(c.tenantId, companyId),
    c.prisma.clientCategory.findMany({ where: { tenantId: c.tenantId, companyId }, select: { id: true, name: true, line: true } }),
    c.prisma.clientCategoryMapping.findMany({ where: { tenantId: c.tenantId, companyId }, select: { categoryId: true, clientCategoryId: true } }),
  ]);
  const p = planejarDePara(linhas, plano, existentes, atuais, modo);
  return { modo, plano: p, resumo: resumoDoPlano(p) };
}

/** Grava o plano numa transação: linhas que mudam, categorias novas e as ligações. */
async function aplicar(c: Contexto, companyId: string, p: PlanoDoDePara): Promise<void> {
  await c.prisma.$transaction(async (tx) => {
    for (const m of p.mudamDeLinha) {
      await tx.clientCategory.update({ where: { id: m.id }, data: { line: m.para } });
    }
    const ultima = await tx.clientCategory.aggregate({ where: { tenantId: c.tenantId, companyId }, _max: { position: true } });
    let posicao = (ultima._max.position ?? -1) + 1;
    for (const n of p.novas) {
      await tx.clientCategory.create({ data: { tenantId: c.tenantId, companyId, name: n.nome, line: n.linha, position: posicao++ } });
    }
    const todas = await tx.clientCategory.findMany({ where: { tenantId: c.tenantId, companyId }, select: { id: true, name: true } });
    const idPorChave = new Map(todas.map((t) => [chaveDeTexto(t.name), t.id]));
    for (const l of p.ligacoes.filter((x) => x.muda)) {
      const clientCategoryId = idPorChave.get(chaveDeTexto(l.cliente));
      if (!clientCategoryId) continue;
      await tx.clientCategoryMapping.upsert({
        where: { companyId_categoryId: { companyId, categoryId: l.categoryId } },
        create: { tenantId: c.tenantId, companyId, categoryId: l.categoryId, clientCategoryId },
        update: { clientCategoryId },
      });
    }
  });
}

/** A prévia da importação — nada é gravado. */
export async function preverImportacaoDoDePara(companyId: string, form: FormData): Promise<{ error: string } | { previa: PreviaDoDePara }> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  const leitura = await lerArquivo(form);
  if (!leitura.ok) return { error: leitura.erro };
  return { previa: await planejar(c, companyId, leitura.modo, leitura.linhas) };
}

/** Importa: relê o arquivo e refaz o plano no servidor, sem confiar na prévia. */
export async function importarDePara(companyId: string, form: FormData): Promise<{ error: string } | { resumo: PreviaDoDePara["resumo"] }> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  const leitura = await lerArquivo(form);
  if (!leitura.ok) return { error: leitura.erro };
  const { plano, resumo, modo } = await planejar(c, companyId, leitura.modo, leitura.linhas);
  if (resumo.mudam === 0 && resumo.novas === 0 && resumo.mudamDeLinha === 0) return { error: "A planilha não muda nada no de-para desta empresa." };
  await aplicar(c, companyId, plano);
  await auditar(c, companyId, "fluxo.categoria_cliente.importar", {
    modo,
    arquivo: (form.get("arquivo") as File).name.slice(0, 180),
    ligacoes: resumo.mudam,
    novas: resumo.novas,
    mudamDeLinha: resumo.mudamDeLinha,
    semPar: resumo.semPar,
  });
  revalidatePath("/fluxo-de-caixa");
  return { resumo };
}

/** As linhas do de-para de outra empresa do escritório, como se viessem de planilha. */
async function linhasDeOutraEmpresa(c: Contexto, origemId: string): Promise<LinhaDoDePara[] | null> {
  const origem = await c.prisma.company.findFirst({ where: { id: origemId, tenantId: c.tenantId }, select: { id: true } });
  if (!origem) return null;
  const ligacoes = await c.prisma.clientCategoryMapping.findMany({
    where: { tenantId: c.tenantId, companyId: origemId },
    select: { category: { select: { name: true } }, clientCategory: { select: { name: true, line: true } } },
  });
  // O código da linha: `linhaDeTexto` aceita o código, então a outra empresa
  // passa a linha exata que tem.
  return ligacoes.map((l, i) => ({ linha: i + 1, omie: l.category.name, cliente: l.clientCategory.name, linhaDoFluxo: l.clientCategory.line }));
}

export async function preverCopiaDoDePara(companyId: string, origemId: string): Promise<{ error: string } | { previa: PreviaDoDePara }> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  if (origemId === companyId) return { error: "Escolha outra empresa." };
  const linhas = await linhasDeOutraEmpresa(c, origemId);
  if (!linhas) return { error: "Empresa de origem não encontrada." };
  if (linhas.length === 0) return { error: "A empresa escolhida não tem de-para." };
  return { previa: await planejar(c, companyId, "ligacoes", linhas) };
}

export async function copiarDePara(companyId: string, origemId: string): Promise<{ error: string } | { resumo: PreviaDoDePara["resumo"] }> {
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };
  if (origemId === companyId) return { error: "Escolha outra empresa." };
  const linhas = await linhasDeOutraEmpresa(c, origemId);
  if (!linhas) return { error: "Empresa de origem não encontrada." };
  const { plano, resumo } = await planejar(c, companyId, "ligacoes", linhas);
  if (resumo.mudam === 0 && resumo.novas === 0 && resumo.mudamDeLinha === 0) return { error: "Não há nada a copiar: o de-para desta empresa já é igual." };
  await aplicar(c, companyId, plano);
  await auditar(c, companyId, "fluxo.categoria_cliente.copiar", { origemId, ligacoes: resumo.mudam, novas: resumo.novas, semPar: resumo.semPar });
  revalidatePath("/fluxo-de-caixa");
  return { resumo };
}
