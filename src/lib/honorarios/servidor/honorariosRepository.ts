// Honorários: valor informado à mão, leitura do Acessórias e envios.
// Mesmas funções e formato de linha do Aditiva Pronto, pelo Prisma e presas
// ao escritório da chamada.

import { Prisma } from "@/generated/prisma/client";
import { db, tenantAtual } from "./contexto";
import { comMascara } from "./auditRepository";

const texto = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());
/** JSON gravado: `null` no banco vira `Prisma.DbNull` (e não o JSON "null"). */
const json = (v: unknown) => (v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

// ── Valor informado à mão ─────────────────────────────────────────

export type OrigemManual = "digitado" | "acessorias";

export interface ManualRow {
  company_id: string;
  valor: string;
  documento: string | null;
  observacao: string | null;
  origem: OrigemManual;
  informado_por: string;
  informado_em: Date;
}

export async function listarManuais(): Promise<ManualRow[]> {
  const m = await db().honorarioManual.findMany({ where: { tenantId: tenantAtual() } });
  return m.map((x) => ({
    company_id: x.companyId,
    valor: x.valor.toString(),
    documento: x.documento,
    observacao: x.observacao,
    origem: x.origem as OrigemManual,
    informado_por: x.informadoPor,
    informado_em: x.informadoEm,
  }));
}

export async function gravarManual(d: {
  companyId: string;
  valor: number;
  documento: string | null;
  observacao: string | null;
  origem: OrigemManual;
  conta: string;
  agora: Date;
}): Promise<void> {
  const tenantId = tenantAtual();
  const dados = {
    valor: new Prisma.Decimal(d.valor.toFixed(2)),
    documento: d.documento?.slice(0, 1000) ?? null,
    observacao: d.observacao?.slice(0, 300) ?? null,
    origem: d.origem,
    informadoPor: d.conta.slice(0, 150),
    informadoEm: d.agora,
  };
  await db().honorarioManual.upsert({
    where: { companyId: d.companyId },
    create: { companyId: d.companyId, tenantId, ...dados },
    update: dados,
  });
}

export async function apagarManual(companyId: string): Promise<void> {
  await db().honorarioManual.deleteMany({ where: { companyId, tenantId: tenantAtual() } });
}

async function empresaAtivaDoEscritorio(companyId: string) {
  return db().company.findFirst({
    where: { id: companyId, tenantId: tenantAtual(), status: "ACTIVE", cnpj: { not: null } },
    select: { cnpj: true },
  });
}

export async function empresaAtiva(companyId: string): Promise<boolean> {
  return !!(await empresaAtivaDoEscritorio(companyId));
}

/** CNPJ da empresa ativa (com máscara); null se não existe ou está inativa. */
export async function cnpjDaEmpresaAtiva(companyId: string): Promise<string | null> {
  const e = await empresaAtivaDoEscritorio(companyId);
  return e?.cnpj ? comMascara(e.cnpj) : null;
}

// ── Leitura do Acessórias ─────────────────────────────────────────

export interface AcessoriasEmpresaRow {
  cnpj_digitos: string;
  identificador: string;
  acessorias_id: string | null;
  razao: string | null;
  situacao: string | null;
  honorario: string | null;
  lido_em: Date;
}

export interface AcessoriasEmpresa {
  cnpjDigitos: string;
  identificador: string;
  acessoriasId: string | null;
  razao: string | null;
  situacao: string | null;
  honorario: number | null;
}

type AcessoriasDoBanco = {
  cnpjDigitos: string;
  identificador: string;
  acessoriasId: string | null;
  razao: string | null;
  situacao: string | null;
  honorario: Prisma.Decimal | null;
  lidoEm: Date;
};

const paraAcessoriasRow = (a: AcessoriasDoBanco): AcessoriasEmpresaRow => ({
  cnpj_digitos: a.cnpjDigitos,
  identificador: a.identificador,
  acessorias_id: a.acessoriasId,
  razao: a.razao,
  situacao: a.situacao,
  honorario: texto(a.honorario),
  lido_em: a.lidoEm,
});

export async function acessoriasDoCnpj(cnpjDigitos: string): Promise<AcessoriasEmpresaRow | null> {
  const a = await db().honorarioAcessoriasEmpresa.findFirst({ where: { tenantId: tenantAtual(), cnpjDigitos } });
  return a ? paraAcessoriasRow(a) : null;
}

export async function listarAcessorias(): Promise<AcessoriasEmpresaRow[]> {
  const a = await db().honorarioAcessoriasEmpresa.findMany({ where: { tenantId: tenantAtual() } });
  return a.map(paraAcessoriasRow);
}

const dadosAcessorias = (e: AcessoriasEmpresa, agora: Date) => ({
  identificador: e.identificador.slice(0, 20),
  acessoriasId: e.acessoriasId?.slice(0, 20) ?? null,
  razao: e.razao?.slice(0, 300) ?? null,
  situacao: e.situacao?.slice(0, 50) ?? null,
  honorario: e.honorario === null ? null : new Prisma.Decimal(e.honorario.toFixed(2)),
  lidoEm: agora,
});

/** Troca a leitura inteira (o que sumiu do Acessórias some daqui também). */
export async function substituirAcessorias(empresas: AcessoriasEmpresa[], agora: Date): Promise<void> {
  const tenantId = tenantAtual();
  // Um CNPJ repetido na resposta fica com a primeira linha (no Aditiva, o
  // ON DUPLICATE KEY só trocava o identificador).
  const unicas = [...new Map(empresas.map((e) => [e.cnpjDigitos, e])).values()];
  await db().$transaction(
    async (tx) => {
      await tx.honorarioAcessoriasEmpresa.deleteMany({ where: { tenantId } });
      for (let i = 0; i < unicas.length; i += 500) {
        await tx.honorarioAcessoriasEmpresa.createMany({
          data: unicas.slice(i, i + 500).map((e) => ({ tenantId, cnpjDigitos: e.cnpjDigitos, ...dadosAcessorias(e, agora) })),
        });
      }
    },
    { timeout: 60_000 },
  );
}

export async function gravarAcessoriasUma(e: AcessoriasEmpresa, agora: Date): Promise<void> {
  const tenantId = tenantAtual();
  const dados = dadosAcessorias(e, agora);
  await db().honorarioAcessoriasEmpresa.upsert({
    where: { tenantId_cnpjDigitos: { tenantId, cnpjDigitos: e.cnpjDigitos } },
    create: { tenantId, cnpjDigitos: e.cnpjDigitos, ...dados },
    update: dados,
  });
}

// ── Envios ────────────────────────────────────────────────────────

export interface NovoEnvio {
  companyId: string;
  cnpjDigitos: string;
  razaoSocial: string;
  valorAnterior: number | null;
  valorEnviado: number;
  fonte: "documento" | "manual";
  documento: string | null;
  conta: string;
  ip: string | null;
  status: "ok" | "erro";
  erro: string | null;
  outrosCampos: string[] | null;
  fichaAntes: unknown;
  fichaDepois: unknown;
  agora: Date;
}

export async function registrarEnvio(e: NovoEnvio): Promise<string> {
  const r = await db().honorarioAcessoriasEnvio.create({
    data: {
      tenantId: tenantAtual(),
      companyId: e.companyId,
      cnpjDigitos: e.cnpjDigitos,
      razaoSocial: e.razaoSocial.slice(0, 300),
      valorAnterior: e.valorAnterior === null ? null : new Prisma.Decimal(e.valorAnterior.toFixed(2)),
      valorEnviado: new Prisma.Decimal(e.valorEnviado.toFixed(2)),
      fonte: e.fonte,
      documento: e.documento?.slice(0, 1000) ?? null,
      conta: e.conta.slice(0, 150),
      ip: e.ip?.slice(0, 64) ?? null,
      status: e.status,
      erro: e.erro?.slice(0, 1000) ?? null,
      outrosCampos: e.outrosCampos?.length ? e.outrosCampos : Prisma.DbNull,
      fichaAntes: json(e.fichaAntes),
      fichaDepois: json(e.fichaDepois),
      enviadoEm: e.agora,
    },
    select: { id: true },
  });
  return r.id;
}

export interface EnvioRow {
  id: string;
  company_id: string;
  cnpj_digitos: string;
  razao_social: string;
  valor_anterior: string | null;
  valor_enviado: string;
  fonte: "documento" | "manual";
  documento: string | null;
  conta: string;
  status: "ok" | "erro";
  erro: string | null;
  outros_campos: string[] | string | null;
  enviado_em: Date;
  conferido_em: Date | null;
  conferido_por: string | null;
}

type EnvioDoBanco = {
  id: string;
  companyId: string;
  cnpjDigitos: string;
  razaoSocial: string;
  valorAnterior: Prisma.Decimal | null;
  valorEnviado: Prisma.Decimal;
  fonte: string;
  documento: string | null;
  conta: string;
  status: string;
  erro: string | null;
  outrosCampos: Prisma.JsonValue;
  enviadoEm: Date;
  conferidoEm: Date | null;
  conferidoPor: string | null;
};

const paraEnvioRow = (e: EnvioDoBanco): EnvioRow => ({
  id: e.id,
  company_id: e.companyId,
  cnpj_digitos: e.cnpjDigitos,
  razao_social: e.razaoSocial,
  valor_anterior: texto(e.valorAnterior),
  valor_enviado: e.valorEnviado.toString(),
  fonte: e.fonte as EnvioRow["fonte"],
  documento: e.documento,
  conta: e.conta,
  status: e.status as EnvioRow["status"],
  erro: e.erro,
  outros_campos: Array.isArray(e.outrosCampos) ? (e.outrosCampos as string[]) : null,
  enviado_em: e.enviadoEm,
  conferido_em: e.conferidoEm,
  conferido_por: e.conferidoPor,
});

export async function listarEnvios(limite: number): Promise<EnvioRow[]> {
  const e = await db().honorarioAcessoriasEnvio.findMany({
    where: { tenantId: tenantAtual() },
    orderBy: { enviadoEm: "desc" },
    take: limite,
  });
  return e.map(paraEnvioRow);
}

/** Último envio de cada empresa. */
export async function ultimosEnviosPorEmpresa(): Promise<EnvioRow[]> {
  const e = await db().honorarioAcessoriasEnvio.findMany({
    where: { tenantId: tenantAtual() },
    orderBy: { enviadoEm: "desc" },
  });
  const porEmpresa = new Map<string, EnvioDoBanco>();
  for (const x of e) if (!porEmpresa.has(x.companyId)) porEmpresa.set(x.companyId, x);
  return [...porEmpresa.values()].map(paraEnvioRow);
}

/** Envio que mexeu em outro campo e ninguém conferiu ainda: trava os próximos. */
export async function buscarBloqueio(): Promise<(EnvioRow & { ficha_antes: unknown; ficha_depois: unknown }) | null> {
  const e = await db().honorarioAcessoriasEnvio.findFirst({
    where: { tenantId: tenantAtual(), outrosCampos: { not: Prisma.DbNull }, conferidoEm: null },
    orderBy: { enviadoEm: "desc" },
  });
  return e ? { ...paraEnvioRow(e), ficha_antes: e.fichaAntes, ficha_depois: e.fichaDepois } : null;
}

/** Já houve um envio que confirmou o valor sem mexer em mais nada? (libera o envio em lote) */
export async function existeEnvioLimpo(): Promise<boolean> {
  return !!(await db().honorarioAcessoriasEnvio.findFirst({
    where: { tenantId: tenantAtual(), status: "ok", outrosCampos: { equals: Prisma.DbNull } },
    select: { id: true },
  }));
}

export async function marcarConferido(id: string, conta: string, agora: Date): Promise<boolean> {
  const r = await db().honorarioAcessoriasEnvio.updateMany({
    where: { id, tenantId: tenantAtual(), conferidoEm: null },
    data: { conferidoEm: agora, conferidoPor: conta.slice(0, 150) },
  });
  return r.count > 0;
}
