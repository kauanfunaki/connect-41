// Os dados societários da ficha e o quadro societário por data (27/11/2026,
// melhoria-892) — a parte do banco. As regras estão em quadro.ts.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { capitalDaFoto, fotoDosSocios, lerFoto, mudancasEntre, type DadosSocietarios, type MudancaNoQuadro, type SocioNaFoto } from "./quadro";

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export class ErroDoQuadro extends Error {}

export type DadosSocietariosNaTela = Omit<DadosSocietarios, "juntaRegistradoEm"> & { juntaRegistradoEm: Date | null };

export async function dadosSocietariosDaEmpresa(tenantId: string, companyId: string): Promise<DadosSocietariosNaTela | null> {
  const c = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: {
      nire: true,
      juntaRegistradoEm: true,
      objetoSocial: true,
      capitalSocial: true,
      capitalIntegralizado: true,
      responsavelLegalNome: true,
      responsavelLegalCpf: true,
      responsavelLegalRg: true,
      responsavelLegalCargo: true,
      responsavelLegalEmail: true,
    },
  });
  return c && { ...c, capitalSocial: num(c.capitalSocial), capitalIntegralizado: num(c.capitalIntegralizado) };
}

/** Grava os dados societários na empresa (a empresa já foi conferida no escopo de quem pede). */
export async function salvarDadosSocietarios(tenantId: string, companyId: string, dados: DadosSocietarios): Promise<void> {
  const r = await getPrisma().company.updateMany({ where: { id: companyId, tenantId }, data: dados });
  if (r.count === 0) throw new ErroDoQuadro("Empresa não encontrada.");
}

// ─── O quadro por data ──────────────────────────────────────────────────────

export type QuadroNaTela = {
  id: string;
  data: Date;
  capitalSocial: number | null;
  socios: SocioNaFoto[];
  origem: "MANUAL" | "PROCESSO";
  processo: { id: string; numero: number } | null;
  registradoPor: string;
  /** O que mudou desde a foto anterior; nulo na primeira. */
  mudancas: MudancaNoQuadro[] | null;
};

/** As fotos da empresa, da mais nova para a mais antiga, com o que mudou em cada uma. */
export async function quadrosDaEmpresa(tenantId: string, companyId: string): Promise<QuadroNaTela[]> {
  const fotos = await getPrisma().companyQuadroSocietario.findMany({
    where: { tenantId, companyId },
    select: { id: true, data: true, capitalSocial: true, socios: true, origem: true, registradoPor: true, process: { select: { id: true, number: true } } },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
    take: 200,
  });
  const lidas = fotos.map((f) => ({ ...f, socios: lerFoto(f.socios) }));
  return lidas
    .map((f, i) => ({
      id: f.id,
      data: f.data,
      capitalSocial: num(f.capitalSocial),
      socios: f.socios,
      origem: f.origem === "PROCESSO" ? ("PROCESSO" as const) : ("MANUAL" as const),
      processo: f.process ? { id: f.process.id, numero: f.process.number } : null,
      registradoPor: f.registradoPor,
      mudancas: i === 0 ? null : mudancasEntre(lidas[i - 1]!.socios, f.socios),
    }))
    .reverse();
}

/** Guarda a foto dos sócios de agora com a data do ato. Usa a transação quando vier. */
export async function guardarQuadro(
  entrada: { tenantId: string; companyId: string; data: Date; origem: "MANUAL" | "PROCESSO"; processId: string | null; registradoPor: string },
  tx: Prisma.TransactionClient = getPrisma()
): Promise<{ id: string; socios: number }> {
  const empresa = await tx.company.findFirst({
    where: { id: entrada.companyId, tenantId: entrada.tenantId },
    select: {
      capitalSocial: true,
      partners: { select: { name: true, document: true, qualification: true, administrator: true, sharePercent: true, quotas: true, capitalAmount: true, exitDate: true } },
    },
  });
  if (!empresa) throw new ErroDoQuadro("Empresa não encontrada.");
  const socios = fotoDosSocios(empresa.partners);
  if (socios.length === 0) throw new ErroDoQuadro("A empresa não tem sócio na sociedade para guardar. Cadastre o quadro em Sócios antes.");
  const criado = await tx.companyQuadroSocietario.create({
    data: {
      tenantId: entrada.tenantId,
      companyId: entrada.companyId,
      data: entrada.data,
      capitalSocial: capitalDaFoto(num(empresa.capitalSocial), socios),
      socios: socios as unknown as Prisma.InputJsonValue,
      origem: entrada.origem,
      processId: entrada.processId,
      registradoPor: entrada.registradoPor.slice(0, 150),
    },
    select: { id: true },
  });
  return { id: criado.id, socios: socios.length };
}

export async function excluirQuadro(tenantId: string, companyId: string, id: string): Promise<Date> {
  const prisma = getPrisma();
  const f = await prisma.companyQuadroSocietario.findFirst({ where: { id, tenantId, companyId }, select: { data: true } });
  if (!f) throw new ErroDoQuadro("Este quadro não existe mais. Recarregue a tela.");
  await prisma.companyQuadroSocietario.delete({ where: { id } });
  return f.data;
}

// ─── O registro na Junta, pelo processo ─────────────────────────────────────

export type RegistroDoProcesso = {
  /** O tipo do processo termina em registro na Junta. */
  aplica: boolean;
  nire: string | null;
  juntaRegistradoEm: Date | null;
  /** Já há foto do quadro guardada por este processo. */
  quadroGuardado: boolean;
  temSocios: boolean;
};

/**
 * Grava o NIRE e a data do registro na empresa do processo e, se pedido, a foto
 * do quadro de agora com a data do registro — numa transação, para a ficha e o
 * histórico não ficarem desencontrados.
 */
export async function registrarNaJunta(
  tenantId: string,
  processId: string,
  e: { nire: string; data: Date; guardarQuadro: boolean; registradoPor: string }
): Promise<{ companyId: string; empresa: string; quadro: boolean }> {
  const prisma = getPrisma();
  const processo = await prisma.process.findFirst({ where: { id: processId, tenantId }, select: { companyId: true, company: { select: { name: true } } } });
  if (!processo) throw new ErroDoQuadro("Processo não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: processo.companyId }, data: { nire: e.nire, juntaRegistradoEm: e.data } });
    if (e.guardarQuadro) {
      await guardarQuadro({ tenantId, companyId: processo.companyId, data: e.data, origem: "PROCESSO", processId, registradoPor: e.registradoPor }, tx);
    }
  });
  return { companyId: processo.companyId, empresa: processo.company.name, quadro: e.guardarQuadro };
}
