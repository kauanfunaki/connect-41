"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { canWriteEntity } from "@/lib/auth/policy";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { pick } from "@/lib/forms";
import { cnpjRoot } from "@/lib/clientGroups";
import { nomeExibicao } from "@/lib/companyName";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { portalPorEmpresaPronto } from "@/lib/portal/empresasDaContaDb";
import { confirmacaoConfere } from "@/lib/exclusaoConfirmada";

export type ClienteState = { error: string } | null;

function clienteData(form: FormData) {
  return {
    name: (form.get("name") as string)?.trim().slice(0, 180),
    // Raiz sem máscara e só quando tem 8 dígitos: raiz errada agrupa empresas
    // que não são do mesmo cliente, o que é pior do que não agrupar.
    cnpjRoot: (() => {
      const bruto = pick(form, "cnpjRoot");
      if (!bruto) return null;
      const digitos = bruto.replace(/\D/g, "");
      return digitos.length === 8 ? digitos : cnpjRoot(bruto);
    })(),
    active: form.get("active") === "on",
  };
}

/** "Já existe o cliente X com esta raiz" — o nome é o que a pessoa procura na lista. */
async function mensagemDeRaizRepetida(tenantId: string, raiz: string | null, ignorarId?: string): Promise<string> {
  if (!raiz) return "Já existe um cliente igual a este.";
  const outro = await getPrisma().clientGroup.findFirst({
    where: { tenantId, cnpjRoot: raiz, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { name: true },
  });
  return outro
    ? `Já existe o cliente "${outro.name}" com a raiz de CNPJ ${raiz}. Use esse cliente em vez de criar outro.`
    : `Já existe um cliente com a raiz de CNPJ ${raiz}.`;
}

function validar(data: ReturnType<typeof clienteData>): string | null {
  if (!data.name) return "Nome do cliente é obrigatório.";
  const bruto = data.cnpjRoot;
  if (bruto !== null && bruto.length !== 8) {
    return "Raiz do CNPJ precisa ter 8 dígitos (os 8 primeiros do CNPJ).";
  }
  return null;
}

/** Os ids das empresas marcadas no formulário — só texto, sem repetição. */
function idsDeEmpresas(form: FormData): string[] {
  return [...new Set(form.getAll("empresaIds").filter((v): v is string => typeof v === "string" && v.length > 0))];
}

/**
 * Cria o cliente e, quando o formulário mandou, já vincula as empresas da raiz
 * do CNPJ (13/10/2026): o formulário oferece as empresas cadastradas cuja raiz
 * bate com a digitada. Na mesma transação — cliente criado sem as empresas que
 * a pessoa marcou seria um cliente que não aparece no portal de ninguém.
 */
export async function criarCliente(_prev: ClienteState, form: FormData): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para criar clientes." };

  const data = clienteData(form);
  const erro = validar(data);
  if (erro) return { error: erro };
  const empresaIds = idsDeEmpresas(form);

  const prisma = getPrisma();
  const escopo = await scopedCompanyWhere(ctx);
  let id: string;
  let vinculadas = 0;
  try {
    const criado = await prisma.$transaction(async (tx) => {
      const cliente = await tx.clientGroup.create({ data: { tenantId: ctx.tenantId, ...data } });
      // Escopo do tenant no filtro: os ids vêm do formulário.
      const r = empresaIds.length
        ? await tx.company.updateMany({ where: { id: { in: empresaIds }, ...escopo }, data: { clientGroupId: cliente.id } })
        : { count: 0 };
      return { id: cliente.id, vinculadas: r.count };
    });
    id = criado.id;
    vinculadas = criado.vinculadas;
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: await mensagemDeRaizRepetida(ctx.tenantId, data.cnpjRoot) };
    console.error("[criarCliente]", err);
    return { error: "Erro ao criar cliente. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.create",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: data.name, ...(empresaIds.length ? { empresasVinculadas: empresaIds, vinculadas } : {}) },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function atualizarCliente(_prev: ClienteState, form: FormData): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWriteEntity(ctx)) return { error: "Sem permissão para editar clientes." };

  const id = form.get("id") as string;
  const data = clienteData(form);
  const erro = validar(data);
  if (erro) return { error: erro };

  const prisma = getPrisma();
  // Escopo por tenant na consulta, não no update: `id` vem do formulário.
  const existing = await prisma.clientGroup.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!existing) return { error: "Cliente não encontrado." };

  try {
    await prisma.clientGroup.update({ where: { id }, data });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: await mensagemDeRaizRepetida(ctx.tenantId, data.cnpjRoot, id) };
    console.error("[atualizarCliente]", err);
    return { error: "Erro ao atualizar cliente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.update",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: data.name },
  });

  revalidatePath("/clientes");
  redirect("/clientes");
}

/**
 * Liga e desliga o cliente.
 *
 * Cliente inativo some do seletor de novas empresas e continua respondendo
 * pelas que já tem. Para tirar de vez (cadastro de teste, cliente que saiu),
 * existe desde 13/10/2026 a exclusão de verdade, `excluirCliente`.
 */
export async function alternarAtivoCliente(id: string): Promise<ClienteState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { error: "Sem permissão." };

  const prisma = getPrisma();
  const existing = await prisma.clientGroup.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, active: true, name: true },
  });
  if (!existing) return { error: "Cliente não encontrado." };

  await prisma.clientGroup.update({ where: { id }, data: { active: !existing.active } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existing.active ? "clientGroup.deactivate" : "clientGroup.activate",
    entityType: "ClientGroup",
    entityId: id,
    metadata: { name: existing.name },
  });

  revalidatePath("/clientes");
  return null;
}

/**
 * Inativa vários clientes de uma vez.
 *
 * Só inativa — não existe "reativar em massa" nem exclusão em massa. Reativar
 * é inofensivo e já é um clique na linha. Excluir é um cliente por vez, em
 * `excluirCliente`: a janela mostra o que sai junto (os acessos do portal) e o
 * que fica sem cliente (as empresas) — o que numa lista de vários não caberia.
 *
 * O `updateMany` filtra por `tenantId` junto do `id in`: sem isso um id de
 * outro escritório passaria pelo `in` e seria inativado.
 */
export async function inativarClientesEmMassa(ids: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx) || ids.length === 0) return;

  const prisma = getPrisma();
  const alvos = await prisma.clientGroup.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId, active: true },
    select: { id: true, name: true },
  });
  if (alvos.length === 0) return;

  await prisma.clientGroup.updateMany({
    where: { id: { in: alvos.map((a) => a.id) }, tenantId: ctx.tenantId },
    data: { active: false },
  });

  // Uma entrada por cliente, como na inativação individual: auditoria que
  // registra "5 clientes inativados" não responde qual foi cada um.
  for (const alvo of alvos) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "clientGroup.deactivate",
      entityType: "ClientGroup",
      entityId: alvo.id,
      metadata: { name: alvo.name, emMassa: true },
    });
  }

  revalidatePath("/clientes");
}

// ─── Exclusão de verdade (13/10/2026) ────────────────────────────────────────
//
// Regras aprovadas pelo Kauan: sem histórico, exclui; com histórico, mostra o
// que está ligado e exclui tudo junto; só ADMIN/SUPER_ADMIN; o nome digitado
// confirma; a auditoria guarda quem excluiu e o retrato do que existia.

/** O que a janela de exclusão do cliente mostra antes de a pessoa confirmar. */
export type ResumoDoClienteParaExcluir = {
  nome: string;
  /**
   * A raiz do CNPJ. Desde 14/10/2026 o SPED busca as raízes da fotografia
   * gravada pela migration (`sped_sync_roots`), e não mais dos clientes:
   * excluir o cliente não tira a raiz da busca. Fica para a janela mostrar.
   */
  raiz: string | null;
  /** As empresas — continuam cadastradas, sem cliente. */
  empresas: { id: string; nome: string }[];
  /**
   * Os acessos do portal que ainda guardam este cliente. Desde 14/10/2026
   * continuam: o que cada um vê são as empresas ligadas a ele, não o cliente.
   */
  acessos: { id: string; nome: string; email: string; ativo: boolean }[];
  /** Comunicados enviados a este cliente: continuam, com as empresas que os receberam. */
  comunicados: number;
};

async function clienteParaExcluir(tenantId: string, id: string) {
  return getPrisma().clientGroup.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      cnpjRoot: true,
      active: true,
      companies: { orderBy: { name: "asc" }, select: { id: true, name: true, displayName: true } },
      portalUsers: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, active: true } },
      _count: { select: { announcements: true } },
    },
  });
}

/** Conta o que está ligado ao cliente, para a janela de exclusão. Só leitura. */
export async function resumoDoClienteParaExcluir(id: string): Promise<{ erro: string } | ResumoDoClienteParaExcluir> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluir(ctx)) return { erro: "Só administradores excluem clientes." };

  const cliente = await clienteParaExcluir(ctx.tenantId, id);
  if (!cliente) return { erro: "Cliente não encontrado." };

  return {
    nome: cliente.name,
    raiz: cliente.active ? cliente.cnpjRoot : null,
    empresas: cliente.companies.map((e) => ({ id: e.id, nome: nomeExibicao(e) })),
    acessos: cliente.portalUsers.map((a) => ({ id: a.id, nome: a.name, email: a.email, ativo: a.active })),
    comunicados: cliente._count.announcements,
  };
}

/**
 * Exclui o cliente de verdade.
 *
 * - **Acessos do portal**: continuam (14/10/2026 — até aqui eram excluídos
 *   junto). O acesso é ligado direto às empresas, e o cliente não decide mais
 *   nada do que ele vê; só se apaga a lembrança do cliente na conta. A FK já
 *   faria isso (`SET NULL`, migration 20261014210000); o `updateMany` deixa
 *   escrito aqui. Antes da migration a coluna não aceita vazio: cliente com
 *   acesso não sai até ela rodar.
 * - **Empresas**: continuam cadastradas, sem cliente. A FK já faria isso
 *   (`SET NULL`); o `updateMany` explícito é para ficar escrito aqui, e não só
 *   no schema, que elas sobrevivem.
 * - **Comunicados**: o cliente sai da lista antiga de destinatários
 *   (`CASCADE`); o comunicado continua, com as empresas que o receberam.
 *
 * Até 14/10/2026 a janela mandava os acessos que mostrou, e a exclusão parava
 * se a lista tivesse mudado — eles saíam junto. Como continuam, não precisa.
 */
export async function excluirCliente(id: string, confirmacao: string): Promise<{ erro: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluir(ctx)) return { erro: "Só administradores excluem clientes." };

  const cliente = await clienteParaExcluir(ctx.tenantId, id);
  if (!cliente) return { erro: "Cliente não encontrado." };
  if (!confirmacaoConfere(confirmacao, [cliente.name])) {
    return { erro: `O nome digitado não confere. Digite ${cliente.name} para confirmar.` };
  }

  if (cliente.portalUsers.length > 0 && !(await portalPorEmpresaPronto())) {
    return { erro: "Falta a atualização do banco desta versão do Connect. Até ela rodar, cliente com acesso do portal não pode ser excluído." };
  }

  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.portalUser.updateMany({ where: { tenantId: ctx.tenantId, clientGroupId: cliente.id }, data: { clientGroupId: null } });
      await tx.company.updateMany({ where: { tenantId: ctx.tenantId, clientGroupId: cliente.id }, data: { clientGroupId: null } });
      await tx.clientGroup.delete({ where: { id: cliente.id } });
    });
  } catch (err) {
    console.error("[excluirCliente]", err);
    return { erro: "Erro ao excluir o cliente. Nada foi apagado." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.delete",
    entityType: "ClientGroup",
    entityId: cliente.id,
    metadata: {
      nome: cliente.name,
      raiz: cliente.cnpjRoot,
      ativo: cliente.active,
      empresasSemCliente: cliente.companies.map((e) => ({ id: e.id, nome: nomeExibicao(e) })),
      acessosQueContinuam: cliente.portalUsers.map((a) => ({ id: a.id, nome: a.name, email: a.email, ativo: a.active })),
      comunicados: cliente._count.announcements,
    },
  });

  revalidatePath("/clientes");
  revalidatePath("/admin/portal");
  return { ok: true };
}

// ─── Empresas do cliente (13/10/2026) ────────────────────────────────────────
//
// Até aqui, a única porta para pôr uma empresa num cliente era o "Cliente e
// matriz" do cadastro da empresa, uma por uma. Desde 14/10/2026 o cliente não
// decide mais o que o portal mostra — o acesso é ligado direto às empresas, na
// ficha de cada uma ("Acesso ao portal"). O agrupamento fica até a etapa 3.

/** Uma empresa no seletor do cliente, com o cliente em que ela está hoje. */
export type EmpresaParaVincular = {
  id: string;
  nome: string;
  cnpj: string | null;
  /** O cliente atual, quando ela já tem um — ela sai de lá ao ser vinculada. */
  clienteAtual: string | null;
};

/**
 * As empresas cadastradas cuja raiz de CNPJ é `raiz`, fora do cliente
 * `ignorarClienteId` — a sugestão de vínculo do "Novo cliente".
 *
 * `Company.cnpj` é texto livre, com e sem máscara: a consulta pega as duas
 * formas pelo começo, e a conferência exata é a mesma `cnpjRoot` do resto do
 * sistema (14 dígitos; CPF não entra).
 */
export async function empresasComARaiz(raiz: string, ignorarClienteId?: string): Promise<EmpresaParaVincular[]> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return [];

  const r = String(raiz ?? "").replace(/\D/g, "");
  if (r.length !== 8) return [];
  const mascarada = `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}`;

  const empresas = await getPrisma().company.findMany({
    where: { ...(await scopedCompanyWhere(ctx)), OR: [{ cnpj: { startsWith: r } }, { cnpj: { startsWith: mascarada } }] },
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, name: true, displayName: true, cnpj: true, clientGroupId: true, clientGroup: { select: { name: true } } },
  });

  return empresas
    .filter((e) => cnpjRoot(e.cnpj) === r && (!ignorarClienteId || e.clientGroupId !== ignorarClienteId))
    .map((e) => ({ id: e.id, nome: nomeExibicao(e), cnpj: e.cnpj, clienteAtual: e.clientGroup?.name ?? null }));
}

export type ResultadoDoVinculo = { erro: string } | { ok: true; vinculadas: number; movidas: number };

/**
 * Põe empresas no cliente. Empresa que estava em outro cliente sai de lá — a
 * tela avisa antes, com o nome do cliente atual.
 *
 * Mesma permissão de editar o cliente e o cadastro da empresa, onde o mesmo
 * vínculo já se fazia (`canWriteEntity`). Cliente e empresas conferidos no
 * tenant: os ids vêm do navegador.
 */
export async function vincularEmpresasAoCliente(clienteId: string, companyIds: string[]): Promise<ResultadoDoVinculo> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { erro: "Sem permissão." };

  const ids = [...new Set((Array.isArray(companyIds) ? companyIds : []).filter((v) => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return { erro: "Escolha ao menos uma empresa." };

  const prisma = getPrisma();
  const cliente = await prisma.clientGroup.findFirst({
    where: { id: clienteId, tenantId: ctx.tenantId },
    select: { id: true, name: true },
  });
  if (!cliente) return { erro: "Cliente não encontrado." };

  const empresas = await prisma.company.findMany({
    where: { id: { in: ids }, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, displayName: true, clientGroupId: true, clientGroup: { select: { name: true } } },
  });
  if (empresas.length !== ids.length) return { erro: "Alguma das empresas escolhidas não foi encontrada. Atualize a tela." };

  const aMover = empresas.filter((e) => e.clientGroupId !== cliente.id);
  if (aMover.length === 0) return { ok: true, vinculadas: 0, movidas: 0 };

  await prisma.company.updateMany({
    where: { id: { in: aMover.map((e) => e.id) }, tenantId: ctx.tenantId },
    data: { clientGroupId: cliente.id },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.companies.linked",
    entityType: "ClientGroup",
    entityId: cliente.id,
    metadata: {
      cliente: cliente.name,
      empresas: aMover.map((e) => ({
        id: e.id,
        nome: nomeExibicao(e),
        deCliente: e.clientGroupId ? { id: e.clientGroupId, nome: e.clientGroup?.name ?? null } : null,
      })),
    },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${cliente.id}/editar`);
  return { ok: true, vinculadas: aMover.length, movidas: aMover.filter((e) => e.clientGroupId !== null).length };
}

/**
 * Tira uma empresa do cliente. Ela continua cadastrada, sem cliente — e deixa
 * de aparecer no portal dos acessos deste cliente.
 */
export async function desvincularEmpresaDoCliente(clienteId: string, companyId: string): Promise<{ erro: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWriteEntity(ctx)) return { erro: "Sem permissão." };

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({
    where: { id: companyId, clientGroupId: clienteId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, displayName: true, clientGroup: { select: { name: true } } },
  });
  if (!empresa) return { erro: "Esta empresa já não está neste cliente." };

  await prisma.company.updateMany({
    where: { id: empresa.id, tenantId: ctx.tenantId, clientGroupId: clienteId },
    data: { clientGroupId: null },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "clientGroup.companies.unlinked",
    entityType: "ClientGroup",
    entityId: clienteId,
    metadata: { cliente: empresa.clientGroup?.name ?? null, empresa: { id: empresa.id, nome: nomeExibicao(empresa) } },
  });

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}/editar`);
  return { ok: true };
}
