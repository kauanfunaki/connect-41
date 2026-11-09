import "server-only";

// Cadastros do Contábil Core (Fase 2, 09/11/2026): empresas ligadas ao cadastro do Connect, plano de
// contas, contas bancárias (agências), contrapartes e regras. Porte das regras de negócio de
// `src/domain/{empresas,plano_contas,agencias,contrapartes,regras}/service.py`.
//
// Toda gravação calcula as colunas de unicidade por `motor/chaves.ts`, e a duplicidade é recusada pelo
// próprio banco (P2002): não há janela entre "conferi que não existe" e "gravei".

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { agenciaChave, codigoAtivo, contraparteChaveAtiva, historicoNormalizado, regraChaveAtiva } from "../motor/chaves";
import type { EntradaAgencia, EntradaConta, EntradaContraparte, EntradaRegra } from "../entradas";
import { ehDuplicado, empresaDoTenant, falha, NAO_ENCONTRADA, ok, type Resultado } from "./base";

const REGIMES = ["simples_nacional", "lucro_presumido", "lucro_real"] as const;
export type Regime = (typeof REGIMES)[number];

/** O regime do cadastro do Connect, quando ele diz um dos três que o Contábil Core conhece. */
export function regimeDoCadastro(kind: string | null | undefined): Regime | null {
  if (kind === "SIMPLES_NACIONAL" || kind === "MEI") return "simples_nacional";
  if (kind === "LUCRO_PRESUMIDO") return "lucro_presumido";
  if (kind === "LUCRO_REAL") return "lucro_real";
  return null;
}

// ─── Empresas ─────────────────────────────────────────────────────────────

export async function listarEmpresas(tenantId: string) {
  return getPrisma().coreEmpresa.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, razaoSocial: true, cnpj: true, regimeTributario: true, ativa: true, company: { select: { id: true, name: true, displayName: true } } },
    orderBy: { razaoSocial: "asc" },
  });
}

/** Empresas do cadastro com CNPJ que ainda não estão no Contábil Core. */
export async function empresasParaLigar(tenantId: string) {
  return getPrisma().company.findMany({
    where: { tenantId, cnpj: { not: null }, coreEmpresa: null },
    select: { id: true, name: true, displayName: true, cnpj: true, taxRegimeKind: true },
    orderBy: { name: "asc" },
    take: 2000,
  });
}

/** Põe uma empresa do cadastro no Contábil Core. O CNPJ é o do cadastro: é por ele que a carga liga as duas. */
export async function ligarEmpresa(tenantId: string, companyId: string, regime: string): Promise<Resultado<{ id: string; nome: string }>> {
  if (!(REGIMES as readonly string[]).includes(regime)) return falha("Escolha o regime tributário.");
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true, name: true, cnpj: true } });
  if (!company?.cnpj) return falha("Escolha uma empresa do cadastro com CNPJ.");
  try {
    const e = await prisma.coreEmpresa.create({
      data: { tenantId, companyId: company.id, cnpj: company.cnpj, razaoSocial: company.name.slice(0, 300), regimeTributario: regime },
      select: { id: true },
    });
    return ok({ id: e.id, nome: company.name });
  } catch (e) {
    if (ehDuplicado(e)) return falha("Esta empresa (ou outra com o mesmo CNPJ) já está no Contábil Core.");
    throw e;
  }
}

// ─── Plano de contas ──────────────────────────────────────────────────────

export async function listarContas(tenantId: string, empresaId: string) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  return getPrisma().corePlanoConta.findMany({
    where: { tenantId, empresaId, deletedAt: null },
    select: { id: true, contaNumero: true, codigo: true, descricao: true, tipo: true, tipoSa: true, paiId: true },
    orderBy: { codigo: "asc" },
  });
}

async function contaDaEmpresa(tx: Prisma.TransactionClient, tenantId: string, empresaId: string, contaId: string) {
  return tx.corePlanoConta.findFirst({ where: { id: contaId, tenantId, empresaId, deletedAt: null }, select: { id: true, codigo: true, tipoSa: true } });
}

export async function criarConta(tenantId: string, empresaId: string, d: EntradaConta): Promise<Resultado<{ id: string; nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  if (d.paiId && !(await contaDaEmpresa(prisma, tenantId, empresaId, d.paiId))) return falha("Conta pai não encontrada nesta empresa.");
  try {
    const c = await prisma.corePlanoConta.create({
      data: {
        tenantId, empresaId, contaNumero: d.contaNumero, codigo: d.codigo, descricao: d.descricao, tipo: d.tipo, tipoSa: d.tipoSa,
        paiId: d.paiId, codigoAtivo: codigoAtivo({ codigo: d.codigo, deletedAt: null }),
      },
      select: { id: true },
    });
    return ok({ id: c.id, nome: `${d.codigo} ${d.descricao}` });
  } catch (e) {
    if (ehDuplicado(e)) return falha(`Já existe a conta ${d.codigo} nesta empresa.`);
    throw e;
  }
}

/** O código é imutável depois de criado (como no original): muda descrição, tipo e código reduzido. */
export async function editarConta(tenantId: string, empresaId: string, contaId: string, d: EntradaConta): Promise<Resultado<{ nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const atual = await contaDaEmpresa(prisma, tenantId, empresaId, contaId);
  if (!atual) return falha("Conta não encontrada nesta empresa.");
  if (atual.codigo !== d.codigo) return falha("O código da conta não muda depois de criado. Crie uma conta nova.");
  await prisma.corePlanoConta.update({
    where: { id: contaId },
    data: { contaNumero: d.contaNumero, descricao: d.descricao, tipo: d.tipo, tipoSa: d.tipoSa },
  });
  return ok({ nome: `${d.codigo} ${d.descricao}` });
}

/**
 * Exclui (soft delete) a conta. Recusa conta em uso por regra, contraparte, conta bancária ou
 * lançamento vivo, e conta com filhas: o original deixava isso para a tela; aqui o servidor garante.
 */
export async function excluirConta(tenantId: string, empresaId: string, contaId: string): Promise<Resultado<{ nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const conta = await tx.corePlanoConta.findFirst({ where: { id: contaId, tenantId, empresaId, deletedAt: null }, select: { id: true, codigo: true, descricao: true } });
    if (!conta) return falha<{ nome: string }>("Conta não encontrada nesta empresa.");
    const [filhas, regras, contrapartes, agencias, registros] = await Promise.all([
      tx.corePlanoConta.count({ where: { paiId: contaId, deletedAt: null } }),
      tx.coreRegra.count({ where: { contaId, deletedAt: null, ativa: true } }),
      tx.coreContraparte.count({ where: { contaContabilId: contaId, deletedAt: null, ativa: true } }),
      tx.coreAgencia.count({ where: { contaContabilId: contaId, deletedAt: null } }),
      tx.coreRegistro.count({ where: { contaId, deletedAt: null } }),
    ]);
    const usos = [
      filhas && `${filhas} conta(s) filha(s)`,
      regras && `${regras} regra(s)`,
      contrapartes && `${contrapartes} contraparte(s)`,
      agencias && "a conta bancária",
      registros && `${registros} lançamento(s)`,
    ].filter(Boolean);
    if (usos.length) return falha<{ nome: string }>(`A conta ${conta.codigo} está em uso (${usos.join(", ")}). Troque antes de excluir.`);
    const agora = new Date();
    await tx.corePlanoConta.update({ where: { id: contaId }, data: { deletedAt: agora, codigoAtivo: null } });
    return ok({ nome: `${conta.codigo} ${conta.descricao}` });
  });
}

// ─── Contas bancárias (agências) ──────────────────────────────────────────

export async function listarAgencias(tenantId: string, empresaId: string) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  return getPrisma().coreAgencia.findMany({
    where: { tenantId, empresaId, deletedAt: null },
    select: {
      id: true, bancoSigla: true, agencia: true, numero: true, digito: true, ativa: true, contaContabilId: true,
      contaContabil: { select: { codigo: true, descricao: true, contaNumero: true } },
    },
    orderBy: [{ bancoSigla: "asc" }, { agencia: "asc" }, { numero: "asc" }],
  });
}

/** "SICOOB 1234 98765 4", como a `descricao` do original. */
export function descricaoDaAgencia(a: { bancoSigla: string; agencia: string; numero: string; digito: string | null }): string {
  return [a.bancoSigla, a.agencia, a.numero, a.digito].filter(Boolean).join(" ");
}

export async function salvarAgencia(tenantId: string, empresaId: string, agenciaId: string | null, d: EntradaAgencia): Promise<Resultado<{ id: string; nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  if (d.contaContabilId && !(await contaDaEmpresa(prisma, tenantId, empresaId, d.contaContabilId))) {
    return falha("Conta do Plano de Contas não encontrada nesta empresa.");
  }
  const dados = {
    bancoSigla: d.bancoSigla, agencia: d.agencia, numero: d.numero, digito: d.digito, contaContabilId: d.contaContabilId,
    chave: agenciaChave(d),
  };
  try {
    let id = agenciaId;
    if (agenciaId) {
      const r = await prisma.coreAgencia.updateMany({ where: { id: agenciaId, tenantId, empresaId, deletedAt: null }, data: dados });
      if (r.count === 0) return falha("Conta bancária não encontrada nesta empresa.");
    } else {
      id = (await prisma.coreAgencia.create({ data: { tenantId, empresaId, ...dados }, select: { id: true } })).id;
    }
    return ok({ id: id!, nome: descricaoDaAgencia(d) });
  } catch (e) {
    if (!ehDuplicado(e)) throw e;
    const conta = d.contaContabilId && (await prisma.coreAgencia.findFirst({ where: { contaContabilId: d.contaContabilId, NOT: { id: agenciaId ?? "" } }, select: { id: true } }));
    if (conta) return falha("Esta conta do Plano de Contas já está vinculada a outra conta bancária.");
    return falha(`Já existe a conta ${d.bancoSigla} ag.${d.agencia} c/c ${d.numero} nesta empresa.`);
  }
}

/** Inativar não apaga: o histórico de transações continua, e a exportação pode incluir a conta. */
export async function mudarAtivaDaAgencia(tenantId: string, empresaId: string, agenciaId: string, ativa: boolean): Promise<Resultado<{ nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const a = await prisma.coreAgencia.findFirst({ where: { id: agenciaId, tenantId, empresaId, deletedAt: null } });
  if (!a) return falha("Conta bancária não encontrada nesta empresa.");
  await prisma.coreAgencia.update({ where: { id: agenciaId }, data: { ativa } });
  return ok({ nome: descricaoDaAgencia(a) });
}

// ─── Contrapartes ─────────────────────────────────────────────────────────

export async function listarContrapartes(tenantId: string, empresaId: string, busca?: string) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  const termo = busca?.trim();
  const digitos = termo?.replace(/\D/g, "");
  return getPrisma().coreContraparte.findMany({
    where: {
      tenantId, empresaId, deletedAt: null,
      ...(termo ? { OR: [{ razaoSocial: { contains: termo } }, { nomeFantasia: { contains: termo } }, ...(digitos ? [{ documento: { contains: digitos } }] : [])] } : {}),
    },
    select: {
      id: true, tipo: true, documento: true, razaoSocial: true, nomeFantasia: true, origem: true, ativa: true, contaContabilId: true,
      contaContabil: { select: { codigo: true, descricao: true } },
    },
    orderBy: { razaoSocial: "asc" },
    take: 500,
  });
}

/**
 * O mesmo documento pode ser fornecedor e cliente, cada um com a sua conta (ADR-016). `ambos` é uma
 * conta só para os dois lados e não convive com os vínculos específicos.
 */
async function documentoLivre(tx: Prisma.TransactionClient, empresaId: string, documento: string, tipo: string, excluirId: string | null) {
  const incompativeis = tipo === "ambos" ? ["fornecedor", "cliente", "ambos"] : [tipo, "ambos"];
  const existe = await tx.coreContraparte.findFirst({
    where: { empresaId, documento, tipo: { in: incompativeis }, ativa: true, deletedAt: null, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
    select: { id: true },
  });
  return !existe;
}

export async function salvarContraparte(
  tenantId: string,
  userId: string,
  empresaId: string,
  contraparteId: string | null,
  d: EntradaContraparte,
  ativa = true,
): Promise<Resultado<{ id: string; nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      if (!(await contaDaEmpresa(tx, tenantId, empresaId, d.contaContabilId))) return falha<{ id: string; nome: string }>("Conta contábil não encontrada nesta empresa.");
      if (ativa && !(await documentoLivre(tx, empresaId, d.documento, d.tipo, contraparteId))) {
        return falha<{ id: string; nome: string }>("Já existe uma contraparte ativa com este documento e tipo compatível.");
      }
      const chaveAtiva = contraparteChaveAtiva({ ativa, deletedAt: null, documento: d.documento, tipo: d.tipo });
      if (contraparteId) {
        // O documento não muda: é a identidade da contraparte.
        const r = await tx.coreContraparte.updateMany({
          where: { id: contraparteId, tenantId, empresaId, deletedAt: null, documento: d.documento },
          data: { tipo: d.tipo, razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia, contaContabilId: d.contaContabilId, ativa, chaveAtiva },
        });
        if (r.count === 0) return falha<{ id: string; nome: string }>("Contraparte não encontrada nesta empresa (o documento não muda depois de criado).");
        return ok({ id: contraparteId, nome: d.razaoSocial });
      }
      const c = await tx.coreContraparte.create({
        data: {
          tenantId, empresaId, tipo: d.tipo, documento: d.documento, razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia,
          contaContabilId: d.contaContabilId, origem: "manual", confirmadoEm: new Date(), confirmadoPorId: userId, ativa, chaveAtiva,
        },
        select: { id: true },
      });
      return ok({ id: c.id, nome: d.razaoSocial });
    });
  } catch (e) {
    if (ehDuplicado(e)) return falha("Já existe uma contraparte ativa com este documento e tipo.");
    throw e;
  }
}

// ─── Regras ───────────────────────────────────────────────────────────────

export async function listarRegras(tenantId: string, empresaId: string, filtro: { busca?: string; agenciaId?: string | null; apenasAtivas?: boolean } = {}) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  const termo = filtro.busca?.trim();
  return getPrisma().coreRegra.findMany({
    where: {
      tenantId, empresaId, deletedAt: null,
      ...(filtro.apenasAtivas ? { ativa: true } : {}),
      // A global vale para a agência: sem ela no filtro, o contador concluiria que a regra sumiu.
      ...(filtro.agenciaId ? { OR: [{ agenciaId: filtro.agenciaId }, { agenciaId: null }] } : {}),
      ...(termo
        ? { AND: [{ OR: [{ descricao: { contains: termo } }, { historico: { contains: termo } }, { conta: { codigo: { contains: termo } } }, { conta: { descricao: { contains: termo } } }] }] }
        : {}),
    },
    select: {
      id: true, descricao: true, historico: true, dc: true, tipo: true, manterHistorico: true, ativa: true, agenciaId: true, contaId: true,
      conta: { select: { codigo: true, descricao: true } },
      agencia: { select: { bancoSigla: true, agencia: true, numero: true, digito: true } },
    },
    orderBy: { historico: "asc" },
    take: 1000,
  });
}

export async function salvarRegra(tenantId: string, empresaId: string, regraId: string | null, d: EntradaRegra, ativa = true): Promise<Resultado<{ id: string; nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  if (!(await contaDaEmpresa(prisma, tenantId, empresaId, d.contaId))) return falha("Conta contábil não encontrada nesta empresa.");
  if (d.agenciaId && !(await prisma.coreAgencia.findFirst({ where: { id: d.agenciaId, tenantId, empresaId, deletedAt: null }, select: { id: true } }))) {
    return falha("Conta bancária não encontrada nesta empresa.");
  }
  const hn = historicoNormalizado(d.historico);
  const dados = {
    contaId: d.contaId, agenciaId: d.agenciaId, descricao: d.descricao, historico: d.historico, historicoNormalizado: hn,
    dc: d.dc, tipo: d.tipo, manterHistorico: d.manterHistorico, ativa,
    chaveAtiva: regraChaveAtiva({ ativa, deletedAt: null, agenciaId: d.agenciaId, historicoNormalizado: hn }),
  };
  try {
    if (regraId) {
      const r = await prisma.coreRegra.updateMany({ where: { id: regraId, tenantId, empresaId, deletedAt: null }, data: dados });
      if (r.count === 0) return falha("Regra não encontrada nesta empresa.");
      return ok({ id: regraId, nome: d.historico });
    }
    const r = await prisma.coreRegra.create({ data: { tenantId, empresaId, ...dados }, select: { id: true } });
    return ok({ id: r.id, nome: d.historico });
  } catch (e) {
    if (ehDuplicado(e)) return falha("Já existe uma regra ativa com este padrão no banco selecionado.");
    throw e;
  }
}

/** Desativar é preferível a apagar: a regra inativa não é aplicada pelo NEO, e as decisões antigas continuam apontando para ela. */
export async function mudarAtivaDaRegra(tenantId: string, empresaId: string, regraId: string, ativa: boolean): Promise<Resultado<{ nome: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const r = await prisma.coreRegra.findFirst({ where: { id: regraId, tenantId, empresaId, deletedAt: null } });
  if (!r) return falha("Regra não encontrada nesta empresa.");
  try {
    await prisma.coreRegra.update({
      where: { id: regraId },
      data: { ativa, chaveAtiva: regraChaveAtiva({ ativa, deletedAt: null, agenciaId: r.agenciaId, historicoNormalizado: r.historicoNormalizado }) },
    });
  } catch (e) {
    if (ehDuplicado(e)) return falha("Já existe outra regra ativa com este padrão no banco selecionado. Desative-a antes.");
    throw e;
  }
  return ok({ nome: r.historico });
}
