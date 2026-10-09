// Autorizações de acesso no Connect: quem acessa, a carteira por raiz de CNPJ
// e a gravação. Regras puras em ./regras.

import { getPrisma } from "@/lib/prisma";
// Só o tipo de auth/context: o agendador dos alertas importa este arquivo, e
// auth/context traz next/headers (foi o que quebrou o build da fase 2 do Drive).
import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, canViewSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { hojeIso } from "@/lib/datas/calendario";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj } from "@/lib/format";
import type { TaxRegimeKind } from "@/generated/prisma/enums";
import {
  chaveDaAutorizacao,
  formatarChave,
  lerListaDeDocumentos,
  MODULO_AUTORIZACOES,
  situacaoDaAutorizacao,
  validarAutorizacao,
  validarQuemRecebe,
  type EntradaDaAutorizacao,
  type Situacao,
  type StatusDaAutorizacao,
} from "./regras";

export async function setorDasAutorizacoes(tenantId: string): Promise<string> {
  return (await setorDoModulo(tenantId, MODULO_AUTORIZACOES)) ?? getModuleDef(MODULO_AUTORIZACOES)!.sectorCode;
}

/** podeEditar: marca a situação dos clientes. podeConfigurar: define quem recebe (a coordenação do setor). */
export type AcessoAsAutorizacoes = { ctx: AuthContext; tenantId: string; podeEditar: boolean; podeConfigurar: boolean };

/** null = não vê (a página dá 404 e a ficha não mostra o bloco). */
export async function acessoAsAutorizacoes(c: AuthContext): Promise<AcessoAsAutorizacoes | null> {
  if (!c.tenantId) return null;
  if (!(await isModuleEnabled(c.tenantId, MODULO_AUTORIZACOES))) return null;
  const setor = await setorDasAutorizacoes(c.tenantId);
  if (!canViewSector(c, setor)) return null;
  return { ctx: c, tenantId: c.tenantId, podeEditar: canActOnSector(c, setor), podeConfigurar: canManageSector(c, setor) };
}

export type QuemRecebe = { nome: string; cnpj: string };

/** Quem recebe as autorizações, com o CNPJ formatado. null = ninguém definiu ainda. */
export async function quemRecebe(tenantId: string): Promise<QuemRecebe | null> {
  const g = await getPrisma().accessAuthorizationGrantee.findUnique({ where: { tenantId }, select: { name: true, cnpj: true } });
  return g ? { nome: g.name, cnpj: formatCnpj(g.cnpj) } : null;
}

/**
 * O que o formulário de "quem recebe" sugere quando ninguém definiu: o nome e
 * o CNPJ do workspace. Só sugestão, nunca o padrão do pedido — o workspace
 * pode estar no nome de uma empresa que não é o escritório contábil.
 */
export async function sugestaoDeQuemRecebe(tenantId: string): Promise<QuemRecebe> {
  const t = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { name: true, cnpj: true } });
  return { nome: t?.name ?? "", cnpj: t?.cnpj ? formatCnpj(t.cnpj) : "" };
}

export async function definirQuemRecebe(acesso: AcessoAsAutorizacoes, nome: string, cnpj: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!acesso.podeConfigurar) return { ok: false, erro: "Só a coordenação do setor define quem recebe as autorizações." };
  const v = validarQuemRecebe(nome, cnpj);
  if (!v.ok) return v;
  const prisma = getPrisma();
  const antes = await prisma.accessAuthorizationGrantee.findUnique({ where: { tenantId: acesso.tenantId }, select: { name: true, cnpj: true } });
  const dados = { name: v.nome, cnpj: v.cnpj, updatedByUserId: acesso.ctx.userId };
  await prisma.accessAuthorizationGrantee.upsert({ where: { tenantId: acesso.tenantId }, create: { tenantId: acesso.tenantId, ...dados }, update: dados });
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: "autorizacoes.quem_recebe",
    entityType: "AccessAuthorizationGrantee",
    entityId: acesso.tenantId,
    metadata: { de: antes, para: { name: v.nome, cnpj: v.cnpj } },
  });
  return { ok: true };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/** Dia de calendário gravado ao meio-dia UTC ↔ "AAAA-MM-DD". */
const paraIso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const paraData = (iso: string | null): Date | null => (iso ? new Date(`${iso}T12:00:00Z`) : null);

const SELECT_REGISTRO = {
  id: true,
  documento: true,
  status: true,
  requestedAt: true,
  receivedAt: true,
  validatedAt: true,
  expiresAt: true,
  allServices: true,
  services: true,
  notes: true,
  checkedVia: true,
  checkedAt: true,
  updatedByUserId: true,
  updatedAt: true,
} as const;

/** O registro como a tela recebe: datas em texto, quem mexeu por último pelo nome. */
export type AutorizacaoNaTela = {
  status: StatusDaAutorizacao;
  requestedAt: string | null;
  receivedAt: string | null;
  validatedAt: string | null;
  expiresAt: string | null;
  allServices: boolean;
  services: string | null;
  notes: string | null;
  conferidaPeloSerpro: boolean;
  atualizadaPor: string | null;
  atualizadaEm: string;
};

type Registro = {
  status: StatusDaAutorizacao;
  requestedAt: Date | null;
  receivedAt: Date | null;
  validatedAt: Date | null;
  expiresAt: Date | null;
  allServices: boolean;
  services: string | null;
  notes: string | null;
  checkedVia: string;
  updatedByUserId: string | null;
  updatedAt: Date;
};

function paraTela(r: Registro, nomes: Map<string, string>): AutorizacaoNaTela {
  return {
    status: r.status,
    requestedAt: paraIso(r.requestedAt),
    receivedAt: paraIso(r.receivedAt),
    validatedAt: paraIso(r.validatedAt),
    expiresAt: paraIso(r.expiresAt),
    allServices: r.allServices,
    services: r.services,
    notes: r.notes,
    conferidaPeloSerpro: r.checkedVia === "SERPRO",
    atualizadaPor: r.updatedByUserId ? (nomes.get(r.updatedByUserId) ?? null) : null,
    atualizadaEm: r.updatedAt.toISOString(),
  };
}

async function nomesDosUsuarios(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const users = await getPrisma().user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

type EmpresaDaCarteira = {
  id: string;
  name: string;
  displayName: string | null;
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
  cnpj: string | null;
  cpf: string | null;
  parentCompanyId: string | null;
  taxRegimeKind: TaxRegimeKind | null;
  taxNoMovement: boolean;
};

/**
 * Quem representa a raiz na lista: a matriz pelo CNPJ (0001), senão a que não
 * é filial de ninguém no cadastro, senão a primeira pelo nome.
 */
function representante(empresas: EmpresaDaCarteira[]): EmpresaDaCarteira {
  const ordenadas = [...empresas].sort((a, b) => nomeExibicao(a).localeCompare(nomeExibicao(b), "pt-BR"));
  return (
    ordenadas.find((e) => e.kind === "PESSOA_FISICA" || e.cnpj?.slice(8, 12) === "0001") ??
    ordenadas.find((e) => !e.parentCompanyId) ??
    ordenadas[0]
  );
}

export type LinhaDaCarteira = {
  chave: string;
  documento: string;
  empresa: { id: string; nome: string };
  filiais: { id: string; nome: string }[];
  regime: TaxRegimeKind | null;
  semMovimento: boolean;
  situacao: Situacao;
  registro: AutorizacaoNaTela | null;
};

/** As empresas ativas agrupadas pela chave (raiz do CNPJ ou CPF), e quantas ficaram sem documento. */
async function empresasAtivasPorChave(tenantId: string): Promise<{ porChave: Map<string, EmpresaDaCarteira[]>; semDocumento: number }> {
  const empresas: EmpresaDaCarteira[] = await getPrisma().company.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, displayName: true, kind: true, cnpj: true, cpf: true, parentCompanyId: true, taxRegimeKind: true, taxNoMovement: true },
  });
  const porChave = new Map<string, EmpresaDaCarteira[]>();
  let semDocumento = 0;
  for (const e of empresas) {
    const chave = chaveDaAutorizacao(e);
    if (!chave) {
      semDocumento++;
      continue;
    }
    const lista = porChave.get(chave);
    if (lista) lista.push(e);
    else porChave.set(chave, [e]);
  }
  return { porChave, semDocumento };
}

/** Quem representa cada chave nos avisos: a matriz, com o nome da tela. Só empresas ativas. */
export async function representantesDasChaves(tenantId: string): Promise<Map<string, { id: string; nome: string }>> {
  const { porChave } = await empresasAtivasPorChave(tenantId);
  return new Map([...porChave.entries()].map(([chave, grupo]) => {
    const rep = representante(grupo);
    return [chave, { id: rep.id, nome: nomeExibicao(rep) }];
  }));
}

/**
 * A carteira: uma linha por raiz de CNPJ (ou CPF) das empresas ativas, com a
 * situação da autorização. Empresa ativa sem documento válido não tem o que
 * autorizar — vai só na contagem, para a tela avisar.
 */
export async function carteiraDasAutorizacoes(tenantId: string, hoje = hojeIso()): Promise<{ linhas: LinhaDaCarteira[]; semDocumento: number }> {
  const prisma = getPrisma();
  const { porChave, semDocumento } = await empresasAtivasPorChave(tenantId);

  const registros = await prisma.accessAuthorization.findMany({
    where: { tenantId, documento: { in: [...porChave.keys()] } },
    select: SELECT_REGISTRO,
  });
  const registroDa = new Map(registros.map((r) => [r.documento, r]));
  const nomes = await nomesDosUsuarios(registros.map((r) => r.updatedByUserId));

  const linhas = [...porChave.entries()].map(([chave, grupo]): LinhaDaCarteira => {
    const rep = representante(grupo);
    const r = registroDa.get(chave);
    const registro = r ? paraTela(r, nomes) : null;
    return {
      chave,
      documento: formatarChave(chave),
      empresa: { id: rep.id, nome: nomeExibicao(rep) },
      filiais: grupo.filter((e) => e.id !== rep.id).map((e) => ({ id: e.id, nome: nomeExibicao(e) })),
      regime: rep.taxRegimeKind,
      semMovimento: rep.taxNoMovement,
      situacao: situacaoDaAutorizacao(registro, hoje),
      registro,
    };
  });
  linhas.sort((a, b) => a.empresa.nome.localeCompare(b.empresa.nome, "pt-BR"));
  return { linhas, semDocumento };
}

export type AutorizacaoDaEmpresa =
  | { semDocumento: true }
  | {
      semDocumento: false;
      chave: string;
      documento: string;
      /** Outras empresas cadastradas com a mesma raiz (matriz e filiais). */
      mesmaRaiz: number;
      situacao: Situacao;
      registro: AutorizacaoNaTela | null;
    };

/** A autorização vista da ficha de uma empresa — a da raiz dela. */
export async function autorizacaoDaEmpresa(tenantId: string, companyId: string, hoje = hojeIso()): Promise<AutorizacaoDaEmpresa | null> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { kind: true, cnpj: true, cpf: true } });
  if (!empresa) return null;
  const chave = chaveDaAutorizacao(empresa);
  if (!chave) return { semDocumento: true };
  const [r, mesmaRaiz] = await Promise.all([
    prisma.accessAuthorization.findUnique({ where: { tenantId_documento: { tenantId, documento: chave } }, select: SELECT_REGISTRO }),
    chave.length === 8
      ? prisma.company.count({ where: { tenantId, id: { not: companyId }, cnpj: { startsWith: chave } } })
      : Promise.resolve(0),
  ]);
  const registro = r ? paraTela(r, await nomesDosUsuarios([r.updatedByUserId])) : null;
  return { semDocumento: false, chave, documento: formatarChave(chave), mesmaRaiz, situacao: situacaoDaAutorizacao(registro, hoje), registro };
}

// ─── Gravação ────────────────────────────────────────────────────────────────

/** Chaves de todas as empresas do tenant (qualquer status): só se grava autorização de quem está cadastrado. */
async function chavesCadastradas(tenantId: string): Promise<Set<string>> {
  const empresas = await getPrisma().company.findMany({ where: { tenantId }, select: { kind: true, cnpj: true, cpf: true } });
  return new Set(empresas.map(chaveDaAutorizacao).filter((x): x is string => !!x));
}

async function gravar(acesso: AcessoAsAutorizacoes, chave: string, entrada: EntradaDaAutorizacao, hoje: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const anterior = await prisma.accessAuthorization.findUnique({
    where: { tenantId_documento: { tenantId: acesso.tenantId, documento: chave } },
    select: { id: true, status: true, requestedAt: true, receivedAt: true },
  });
  const v = validarAutorizacao(entrada, hoje, anterior ? { requestedAt: paraIso(anterior.requestedAt), receivedAt: paraIso(anterior.receivedAt) } : null);
  if (!v.ok) return v;
  const d = v.dados;
  const dados = {
    status: d.status,
    requestedAt: paraData(d.requestedAt),
    receivedAt: paraData(d.receivedAt),
    validatedAt: paraData(d.validatedAt),
    expiresAt: paraData(d.expiresAt),
    allServices: d.allServices,
    services: d.services,
    notes: d.notes,
    checkedVia: "MANUAL",
    checkedAt: new Date(),
    updatedByUserId: acesso.ctx.userId,
  };
  const salvo = await prisma.accessAuthorization.upsert({
    where: { tenantId_documento: { tenantId: acesso.tenantId, documento: chave } },
    create: { tenantId: acesso.tenantId, documento: chave, ...dados },
    update: dados,
    select: { id: true },
  });
  await logAudit({
    tenantId: acesso.tenantId,
    userId: acesso.ctx.userId,
    action: "autorizacoes.salvar",
    entityType: "AccessAuthorization",
    entityId: salvo.id,
    metadata: { documento: chave, de: anterior?.status ?? null, para: d.status, expiresAt: d.expiresAt },
  });
  return { ok: true };
}

export async function salvarAutorizacao(
  acesso: AcessoAsAutorizacoes,
  chave: string,
  entrada: EntradaDaAutorizacao
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!acesso.podeEditar) return { ok: false, erro: "Sem permissão para alterar autorizações." };
  if (!(await chavesCadastradas(acesso.tenantId)).has(chave)) return { ok: false, erro: "Empresa não encontrada." };
  return gravar(acesso, chave, entrada, hojeIso());
}

export type ResumoDoLote = { atualizadas: number; semEmpresa: string[]; invalidos: string[]; erro: string | null };

/** Teto por lote: a carteira da 41 tem ~340 raízes; mil é folga, não limite de uso. */
export const MAXIMO_NO_LOTE = 1000;

/**
 * A mesma situação para vários clientes de uma vez, a partir da lista colada
 * (os CNPJs da aba "Recebidas" do Portal, de uma planilha). Matriz e filial
 * contam uma vez. Documento sem empresa no Connect volta na lista, sem gravar.
 */
export async function salvarEmLote(acesso: AcessoAsAutorizacoes, texto: string, entrada: EntradaDaAutorizacao): Promise<ResumoDoLote> {
  const resumo: ResumoDoLote = { atualizadas: 0, semEmpresa: [], invalidos: [], erro: null };
  if (!acesso.podeEditar) return { ...resumo, erro: "Sem permissão para alterar autorizações." };
  const { chaves, invalidos } = lerListaDeDocumentos(texto);
  resumo.invalidos = invalidos;
  if (chaves.length === 0) return { ...resumo, erro: "Nenhum CNPJ ou CPF válido na lista." };
  if (chaves.length > MAXIMO_NO_LOTE) return { ...resumo, erro: `Lista grande demais (máximo de ${MAXIMO_NO_LOTE} documentos).` };

  const hoje = hojeIso();
  // Confere a entrada uma vez antes de gravar qualquer linha: um erro aqui
  // (validade passada, por exemplo) vale para o lote inteiro.
  const previa = validarAutorizacao(entrada, hoje);
  if (!previa.ok) return { ...resumo, erro: previa.erro };

  const cadastradas = await chavesCadastradas(acesso.tenantId);
  for (const chave of chaves) {
    if (!cadastradas.has(chave)) {
      resumo.semEmpresa.push(formatarChave(chave));
      continue;
    }
    const r = await gravar(acesso, chave, entrada, hoje);
    if (r.ok) resumo.atualizadas++;
    else if (!resumo.erro) resumo.erro = `${formatarChave(chave)}: ${r.erro}`;
  }
  return resumo;
}
