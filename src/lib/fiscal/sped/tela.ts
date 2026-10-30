// O que toda etapa da aba SPED (ICMS/IPI) precisa antes de desenhar (29/10/2026).
//
// O recorte é o do BPO: a EMPRESA, escolhida no mesmo seletor
// (`escolherEmpresaDaTela`, com a última aberta e a empresa em foco), e a
// competência. A empresa vira o estabelecimento do motor pelo CNPJ inteiro
// (`mapearEstabelecimentos`); a raiz sai do estabelecimento, nunca da URL.
// Só entram as empresas que o motor escritura em ICMS/IPI.

import "server-only";
import { getAuthContext, canViewSector, type AuthContext } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { ErroDoMotor } from "@/lib/sped/motor";
import { escolherEmpresaDaTela, type FocoNaTela } from "@/lib/empresas/ultimaEmpresa";
import type { EscolhaDaEmpresa } from "@/lib/empresas/escolhaDaEmpresa";
import { abrirMotor, estabelecimentosDaRaiz, type MotorDoEscritorio } from "@/lib/fiscal/motor/servidor";
import { competenciaPadrao, type EstabelecimentoVisivel } from "@/lib/fiscal/motor/estabelecimentos";
import { param } from "@/lib/fiscal/motor/url";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { ETAPAS_DO_SPED, type EtapaDoSped } from "./etapas";

export type EstabelecimentoDoSped = EstabelecimentoVisivel & { raiz: string };
export type EmpresaDoSeletor = { id: string; nome: string; cnpj: string; logoUrl: string | null; parentCompanyId: string | null };

export type TelaDoSped = {
  ctx: AuthContext;
  motor: MotorDoEscritorio;
  etapa: EtapaDoSped;
  /** As etapas que a pessoa abre (pelo módulo de cada uma). */
  etapas: EtapaDoSped[];
  modulos: string[];
  competencia: string;
  /** O que o seletor oferece. */
  empresas: EmpresaDoSeletor[];
  escolha: EscolhaDaEmpresa;
  foco: FocoNaTela | null;
  /** O estabelecimento da empresa escolhida, ou `null` (a tela pede para escolher). */
  estabelecimento: EstabelecimentoDoSped | null;
  /** Falha ao ler os estabelecimentos de alguma raiz. */
  erro: string | null;
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A competência da URL, ou o mês anterior — o que o fiscal fecha. */
export function competenciaDaUrl(params: Record<string, string | string[] | undefined>, hoje = new Date()): string {
  const c = param(params, "competencia");
  return c && MES.test(c) ? c : competenciaPadrao(hoje);
}

/**
 * A mesma tela no formato das telas antigas do motor (`TelaDoMotor`), para
 * reaproveitar o que já existe nelas (a lista de ajustes, o acompanhamento
 * da execução). Só com a empresa escolhida.
 */
export async function comoTelaDoMotor(tela: TelaDoSped, estab: EstabelecimentoDoSped): Promise<TelaDoMotor> {
  const mapa = await estabelecimentosDaRaiz(tela.ctx.tenantId, estab.raiz);
  return { ctx: tela.ctx, motor: tela.motor, contexto: { raiz: estab.raiz, estabelecimentoId: estab.id, competencia: tela.competencia }, mapa, estabelecimento: estab, modulos: tela.modulos, erro: null };
}

export async function prepararTelaDoSped(params: Record<string, string | string[] | undefined>, etapa: EtapaDoSped): Promise<TelaDoSped | null> {
  const ctx = await getAuthContext();
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor) return null;
  const estados = await getTenantModuleStates(ctx.tenantId);
  const modulos = estados.filter((m) => m.enabled && canViewSector(ctx, m.sectorCodes)).map((m) => m.code);

  const erros: string[] = [];
  const porRaiz = await Promise.all(motor.raizes.map(async (raiz) => {
    try {
      return (await estabelecimentosDaRaiz(ctx.tenantId, raiz)).visiveis.map((e) => ({ ...e, raiz }));
    } catch (err) {
      erros.push(err instanceof ErroDoMotor ? err.message : "Não foi possível ler as empresas no motor SPED.");
      if (!(err instanceof ErroDoMotor)) console.error("[fiscal/sped] estabelecimentos", err);
      return [];
    }
  }));
  const estabelecimentos = porRaiz.flat().filter((e) => e.obrigacoes.includes("icms_ipi"));

  const extras = estabelecimentos.length
    ? await getPrisma().company.findMany({ where: { tenantId: ctx.tenantId, id: { in: estabelecimentos.map((e) => e.companyId) } }, select: { id: true, logoUrl: true, parentCompanyId: true } })
    : [];
  const porId = new Map(extras.map((c) => [c.id, c]));
  const empresas: EmpresaDoSeletor[] = estabelecimentos.map((e) => ({
    id: e.companyId, nome: e.companyNome, cnpj: e.cnpj,
    logoUrl: porId.get(e.companyId)?.logoUrl ?? null, parentCompanyId: porId.get(e.companyId)?.parentCompanyId ?? null,
  }));

  const { escolha, empresa, noSeletor, foco } = await escolherEmpresaDaTela(ctx, param(params, "empresa"), empresas, { comFoco: true });
  return {
    ctx, motor, etapa, modulos,
    etapas: ETAPAS_DO_SPED.filter((e) => modulos.includes(e.modulo)).map((e) => e.chave),
    competencia: competenciaDaUrl(params),
    empresas: noSeletor, escolha, foco,
    estabelecimento: empresa ? estabelecimentos.find((e) => e.companyId === empresa.id) ?? null : null,
    erro: erros[0] ?? null,
  };
}
