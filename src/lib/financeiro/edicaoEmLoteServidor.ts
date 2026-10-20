"use server";

// Alterar as contas marcadas de uma vez (lote D, 20/10) — a janela "Alterar
// marcadas" de Contas a pagar e a receber. As regras são puras e moram em
// `edicaoEmLote.ts`; aqui, a leitura, a conferência e a gravação.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { presaAoOmie } from "@/lib/integracoes/omie/virada";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { travasDaEdicao } from "./edicao";
import { podeEditarOTipo } from "./acessoDaConta";
import { competenciaValida, dataValida, instanteDaData } from "./periodo";
import type { ForaDoLote } from "./baixa/lote";
import { nomeDaContaBancaria } from "./contaPrevista";
import { ehContaForaDoCaixa, TIPOS_FORA_DO_CAIXA } from "./tiposDeConta";
import {
  campoDoLote,
  categoriasEmComum,
  idsMarcados,
  separarAlteracao,
  valeNaEmpresa,
  type ContaDaAlteracao,
  type EscolhaDaAlteracao,
} from "./edicaoEmLote";

type Opcao = { id: string; nome: string };

const CAMPOS_DA_CONTA = {
  id: true,
  companyId: true,
  kind: true,
  status: true,
  paidAt: true,
  closeReason: true,
  fiscalDocumentId: true,
  agreementId: true,
  omieTitleId: true,
  omieMovementId: true,
  omieReconciledAt: true,
  paidPrincipal: true,
  categoryId: true,
  costCenterId: true,
  projectId: true,
  bankAccountId: true,
  competence: true,
  dueDate: true,
  forecastDate: true,
  updatedAt: true,
  bankMatches: { select: { id: true }, take: 1 },
  _count: { select: { allocations: true } },
  counterparty: { select: { name: true } },
  company: { select: { name: true, displayName: true, omieCutoverAt: true } },
} as const;

async function lerContas(tenantId: string, ids: string[]) {
  return getPrisma().financeEntry.findMany({ where: { id: { in: ids }, tenantId }, select: CAMPOS_DA_CONTA, orderBy: { dueDate: "asc" } });
}

type ContaLida = Awaited<ReturnType<typeof lerContas>>[number];

/** O veredito da janela "Editar" de uma conta, conta a conta — a mesma leitura de `edicaoServidor`. */
function comoAlteracao(c: ContaLida): ContaDaAlteracao {
  const v = travasDaEdicao({
    status: c.status,
    paidAt: c.paidAt,
    closeReason: c.closeReason,
    fiscalDocumentId: c.fiscalDocumentId,
    agreementId: c.agreementId,
    // Até a virada da empresa (lote E): depois, o Connect é a fonte.
    doOmie: presaAoOmie(c, c.company),
    conciliada: c.bankMatches.length > 0 || c.omieReconciledAt !== null,
    temBaixa: Number(c.paidPrincipal.toString()) > 0,
  });
  return {
    id: c.id,
    kind: c.kind,
    empresaId: c.companyId,
    contraparteNome: c.counterparty.name,
    encerrada: v.pode ? null : v.motivo,
    travas: v.pode ? v.travas : {},
    rateada: c._count.allocations > 0,
  };
}

/**
 * As contas marcadas, conferidas: do tenant, todas existentes, de um tipo só
 * (a tela é de pagar ou de receber) e com o acesso ao setor desse tipo.
 */
async function contasMarcadas(valores: unknown[]) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado." } as const;
  const ids = idsMarcados(valores);
  if ("erro" in ids) return { erro: ids.erro } as const;
  const contas = await lerContas(ctx.tenantId, ids);
  if (contas.length !== ids.length) return { erro: "Alguma conta marcada não existe mais — atualize a tela." } as const;
  const tipos = new Set(contas.map((c) => c.kind));
  if (tipos.size !== 1) return { erro: "Marque contas de um tipo só — a pagar ou a receber." } as const;
  const kind = contas[0]!.kind;
  const acesso = await podeEditarOTipo(kind);
  if (!acesso.ctx) return { erro: acesso.erro ?? "Sem permissão." } as const;
  return { ctx: acesso.ctx, tenantId: ctx.tenantId, kind, contas } as const;
}

/** As categorias do tipo, com onde estão escondidas, nas empresas pedidas. */
async function categoriasDoPlano(tenantId: string, kind: "PAGAR" | "RECEBER", empresas: string[], id?: string) {
  const categorias = await getPrisma().financeCategory.findMany({
    where: { tenantId, kind, active: true, ...(id ? { id } : {}), OR: [{ companyId: null }, { companyId: { in: empresas } }] },
    select: { id: true, name: true, companyId: true, ocultaEm: { where: { companyId: { in: empresas } }, select: { companyId: true } } },
    orderBy: { name: "asc" },
  });
  return categorias.map((c) => ({ id: c.id, nome: c.name, empresaId: c.companyId, ocultaEm: c.ocultaEm.map((o) => o.companyId) }));
}

export type DadosDaAlteracao =
  | {
      ok: true;
      kind: "PAGAR" | "RECEBER";
      contas: ContaDaAlteracao[];
      /** As empresas das contas marcadas, com os projetos e as contas bancárias ativas de cada uma. */
      empresas: (Opcao & { projetos: Opcao[]; contas: Opcao[] })[];
      /** As categorias que valem em todas as empresas marcadas. */
      categorias: Opcao[];
    }
  | { ok: false; erro: string };

/** O que a janela precisa para abrir: cada conta com as travas dela, e as listas dos seletores. */
export async function dadosDaAlteracaoEmLote(valores: string[]): Promise<DadosDaAlteracao> {
  const lidas = await contasMarcadas(Array.isArray(valores) ? valores : []);
  if ("erro" in lidas) return { ok: false, erro: lidas.erro! };
  const { tenantId, kind, contas } = lidas;

  const empresas = new Map<string, string>();
  for (const c of contas) empresas.set(c.companyId, nomeExibicao(c.company));
  const ids = [...empresas.keys()];
  const [categorias, projetos, contasBancarias] = await Promise.all([
    categoriasDoPlano(tenantId, kind, ids),
    getPrisma().financeProject.findMany({
      where: { tenantId, companyId: { in: ids }, active: true },
      select: { id: true, name: true, companyId: true },
      orderBy: { name: "asc" },
    }),
    getPrisma().bankAccount.findMany({
      where: { tenantId, companyId: { in: ids }, active: true, type: { notIn: [...TIPOS_FORA_DO_CAIXA] } },
      select: { id: true, nickname: true, accountNumber: true, companyId: true },
      orderBy: { nickname: "asc" },
    }),
  ]);

  return {
    ok: true,
    kind,
    contas: contas.map(comoAlteracao),
    empresas: [...empresas]
      .map(([id, nome]) => ({
        id,
        nome,
        projetos: projetos.filter((p) => p.companyId === id).map((p) => ({ id: p.id, nome: p.name })),
        contas: contasBancarias.filter((c) => c.companyId === id).map((c) => ({ id: c.id, nome: nomeDaContaBancaria(c) })),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    categorias: categoriasEmComum(categorias, ids).map((c) => ({ id: c.id, nome: c.nome })),
  };
}

export type ResultadoDaAlteracao =
  | { error: string }
  | {
      ok: true;
      alteradas: number;
      /** Já tinham o que foi escolhido — nada a gravar. */
      jaEstavam: number;
      /** As que ficaram de fora agora: travaram ou mudaram desde que a janela abriu. */
      ficaram: ForaDoLote[];
    };

/**
 * Grava a alteração nas contas marcadas. Os campos escolhidos vêm em
 * `campos`; o que não veio fica como está em cada conta.
 *
 * Relê as contas e as travas na hora: o que a janela mostrou pode ter mudado.
 * Cada conta grava sozinha, condicionada ao `updatedAt` lido — a que alguém
 * pagou ou editou no meio-tempo fica de fora, e as outras seguem. A auditoria
 * guarda o antes e o depois de cada campo, como a edição de uma conta.
 */
export async function alterarContasEmLote(formData: FormData): Promise<ResultadoDaAlteracao> {
  const texto = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const campos = [...new Set(formData.getAll("campos"))].filter(campoDoLote);
  if (campos.length === 0) return { error: "Escolha o que mudar." };

  const lidas = await contasMarcadas(formData.getAll("entryIds"));
  if ("erro" in lidas) return { error: lidas.erro! };
  const { ctx, tenantId, kind, contas } = lidas;
  const prisma = getPrisma();
  const empresas = [...new Set(contas.map((c) => c.companyId))];
  const escolha: EscolhaDaAlteracao = { campos };

  let vencimento: Date | undefined;
  if (campos.includes("vencimento")) {
    const key = dataValida(texto("vencimento"));
    if (!key) return { error: "Informe um vencimento válido." };
    vencimento = instanteDaData(key);
  }

  // Previsão em branco é "tirar": a conta volta a ser prevista no vencimento.
  let previsao: Date | null | undefined;
  if (campos.includes("previsao")) {
    const bruto = texto("previsao");
    previsao = null;
    if (bruto) {
      const key = dataValida(bruto);
      if (!key) return { error: "Data de previsão inválida." };
      previsao = instanteDaData(key);
    }
  }

  let competencia: string | undefined;
  if (campos.includes("competencia")) {
    const c = competenciaValida(texto("competencia"));
    if (!c) return { error: "Competência inválida — use o formato AAAA-MM." };
    competencia = c;
  }

  if (campos.includes("categoria")) {
    const id = texto("categoryId") || null;
    escolha.categoriaId = id;
    if (id) {
      const [categoria] = await categoriasDoPlano(tenantId, kind, empresas, id);
      if (!categoria) return { error: "Categoria não encontrada (ou inativa) para este tipo de conta." };
      escolha.categoriaValeEm = new Set(empresas.filter((e) => valeNaEmpresa(categoria, e)));
    }
  }

  if (campos.includes("centro")) {
    const id = texto("costCenterId") || null;
    escolha.centroDaEmpresa = null;
    if (id) {
      const centro = await prisma.costCenter.findFirst({ where: { id, tenantId }, select: { companyId: true, active: true } });
      if (!centro) return { error: "Centro de custo não encontrado." };
      if (!centro.active) return { error: "Centro de custo inativo — escolha outro ou reative no cadastro." };
      escolha.centroDaEmpresa = centro.companyId;
    }
  }

  if (campos.includes("projeto")) {
    const id = texto("projectId") || null;
    escolha.projetoDaEmpresa = null;
    if (id) {
      const projeto = await prisma.financeProject.findFirst({ where: { id, tenantId }, select: { companyId: true, active: true } });
      if (!projeto) return { error: "Projeto não encontrado." };
      if (!projeto.active) return { error: "Projeto inativo — escolha outro ou reative no cadastro." };
      escolha.projetoDaEmpresa = projeto.companyId;
    }
  }

  if (campos.includes("conta")) {
    const id = texto("bankAccountId") || null;
    escolha.contaDaEmpresa = null;
    if (id) {
      const conta = await prisma.bankAccount.findFirst({ where: { id, tenantId }, select: { companyId: true, active: true, type: true } });
      if (!conta) return { error: "Conta corrente não encontrada." };
      if (ehContaForaDoCaixa(conta.type)) return { error: "Em lote, a conta corrente prevista é de banco — escolha uma." };
      if (!conta.active) return { error: "Conta corrente inativa — escolha outra ou reative em Banco e caixa." };
      escolha.contaDaEmpresa = conta.companyId;
    }
  }

  const porId = new Map(contas.map((c) => [c.id, c]));
  const { entram, ficam } = separarAlteracao(contas.map(comoAlteracao), escolha);
  const chaveDoDia = (d: Date) => saoPauloParts(d).dateKey;

  let alteradas = 0;
  let jaEstavam = 0;
  for (const { id } of entram) {
    const conta = porId.get(id)!;
    const data: Prisma.FinanceEntryUncheckedUpdateManyInput = {};
    const antes: Record<string, string | null> = {};
    const depois: Record<string, string | null> = {};
    const mudar = (
      coluna: "dueDate" | "forecastDate" | "competence" | "categoryId" | "costCenterId" | "projectId" | "bankAccountId",
      de: string | null,
      para: string | null,
      valor: unknown
    ) => {
      if (de === para) return;
      (data as Record<string, unknown>)[coluna] = valor;
      antes[coluna] = de;
      depois[coluna] = para;
    };
    if (vencimento) mudar("dueDate", chaveDoDia(conta.dueDate), chaveDoDia(vencimento), vencimento);
    if (previsao !== undefined) {
      mudar("forecastDate", conta.forecastDate && chaveDoDia(conta.forecastDate), previsao && chaveDoDia(previsao), previsao);
    }
    if (competencia) mudar("competence", conta.competence, competencia, competencia);
    if (campos.includes("categoria")) mudar("categoryId", conta.categoryId, escolha.categoriaId ?? null, escolha.categoriaId ?? null);
    if (campos.includes("centro")) {
      const centroId = escolha.centroDaEmpresa === null ? null : texto("costCenterId");
      mudar("costCenterId", conta.costCenterId, centroId, centroId);
    }
    if (campos.includes("projeto")) {
      const projetoId = escolha.projetoDaEmpresa === null ? null : texto("projectId");
      mudar("projectId", conta.projectId, projetoId, projetoId);
    }
    if (campos.includes("conta")) {
      const contaId = escolha.contaDaEmpresa === null ? null : texto("bankAccountId");
      mudar("bankAccountId", conta.bankAccountId, contaId, contaId);
    }

    if (Object.keys(data).length === 0) {
      jaEstavam++;
      continue;
    }
    const r = await prisma.financeEntry.updateMany({ where: { id, tenantId, updatedAt: conta.updatedAt }, data });
    if (r.count !== 1) {
      ficam.push({ id, contraparteNome: conta.counterparty.name, motivo: "Mudou enquanto a janela estava aberta (baixa, conciliação ou outra edição)." });
      continue;
    }
    alteradas++;
    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: "finance.edit",
      entityType: "FinanceEntry",
      entityId: id,
      metadata: { kind, antes, depois, emLote: true },
    });
  }

  if (alteradas > 0) {
    for (const p of ["/pagar", "/receber", "/lancamentos", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises", "/conciliacao", "/aprovacoes"]) {
      revalidatePath(p);
    }
    revalidatePath("/cobranca", "layout");
  }
  return { ok: true, alteradas, jaEstavam, ficaram: ficam };
}
