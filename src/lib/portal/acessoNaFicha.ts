// A aba "Acesso ao portal" da ficha da empresa (14/10/2026): quem enxerga a
// empresa no portal — ligado direto a ela ou pela matriz — e os outros acessos
// do escritório, para o "Ligar acesso existente".

import { getPrisma } from "@/lib/prisma";
import { formatInstantDate } from "@/lib/format";
import { lerContasDasEmpresas, portalPorEmpresaPronto } from "./empresasDaContaDb";

export type ViaNaFicha = { tipo: "direto"; incluiFiliais: boolean } | { tipo: "matriz"; matrizId: string };

export type AcessoNaFicha = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  ultimoAcesso: string | null;
  via: ViaNaFicha;
};

export type ContaParaLigar = { id: string; nome: string; email: string; ativo: boolean };

export type DadosDoAcessoNaFicha = {
  /** A migration de 14/10/2026 já rodou? Sem ela, a aba só mostra. */
  pronto: boolean;
  acessos: AcessoNaFicha[];
  outras: ContaParaLigar[];
};

export async function acessoAoPortalDaEmpresa(tenantId: string, companyId: string): Promise<DadosDoAcessoNaFicha> {
  const prisma = getPrisma();
  const [pronto, porEmpresa] = await Promise.all([portalPorEmpresaPronto(), lerContasDasEmpresas(tenantId, [companyId])]);
  const vias = porEmpresa.get(companyId) ?? new Map();
  const ids = [...vias.keys()];

  const [contas, outras] = await Promise.all([
    ids.length > 0
      ? prisma.portalUser.findMany({
          where: { tenantId, id: { in: ids } },
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: { id: true, name: true, email: true, active: true, lastLoginAt: true },
        })
      : [],
    prisma.portalUser.findMany({
      where: { tenantId, ...(ids.length > 0 ? { id: { notIn: ids } } : {}) },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, active: true },
    }),
  ]);

  return {
    pronto,
    acessos: contas.map((c) => ({
      id: c.id,
      nome: c.name,
      email: c.email,
      ativo: c.active,
      ultimoAcesso: c.lastLoginAt ? formatInstantDate(c.lastLoginAt) : null,
      via: vias.get(c.id)!,
    })),
    outras: outras.map((c) => ({ id: c.id, nome: c.name, email: c.email, ativo: c.active })),
  };
}
