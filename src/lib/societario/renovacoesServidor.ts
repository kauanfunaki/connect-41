// A leitura das renovações da empresa (04/11/2026). As certidões e o
// certificado só entram para quem vê essas telas — a faixa não mostra o que a
// tela de origem esconderia.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { acessoAsCertidoes } from "@/lib/certidoes/acesso";
import { ROTULO_DA_CERTIDAO } from "@/lib/certidoes/regras";
import { acessoAosCertificados } from "@/lib/certificados/servidor";
import type { LinhaDeLicenca } from "./licencas-data";
import { diasAte } from "./licencas";
import { ordenarRenovacoes, type Renovacao } from "./renovacoes";

const DIA_MS = 24 * 60 * 60 * 1000;
const diasAteChave = (chave: string, hoje: Date) => Math.round((Date.parse(`${chave}T12:00:00Z`) - Date.parse(`${hoje.toISOString().slice(0, 10)}T12:00:00Z`)) / DIA_MS);

export async function renovacoesDaEmpresa(ctx: AuthContext, companyId: string, licencas: LinhaDeLicenca[], agora = new Date()): Promise<Renovacao[]> {
  const tenantId = ctx.tenantId!;
  const prisma = getPrisma();
  const itens: Renovacao[] = licencas
    .filter((l) => !l.revokedAt)
    .map((l) => ({
      chave: `licenca-${l.id}`,
      tipo: "licenca" as const,
      rotulo: l.kind,
      dias: l.expiresAt ? diasAte(l.expiresAt, agora) : null,
      href: `/licencas?busca=${encodeURIComponent(l.empresaNome)}`,
      acao: "Renovar",
    }));

  const [podeCertidoes, podeCertificados] = await Promise.all([acessoAsCertidoes(ctx), acessoAosCertificados()]);
  if (podeCertidoes) {
    // A certidão que vale de cada tipo: a mais recente.
    const certidoes = await prisma.certidao.findMany({
      where: { tenantId, companyId },
      select: { id: true, tipo: true, situacao: true, validaAte: true, vistaEm: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const vistos = new Set<string>();
    for (const c of certidoes) {
      if (vistos.has(c.tipo)) continue;
      vistos.add(c.tipo);
      if (c.situacao === "NAO_SAIU") continue;
      const nome = ROTULO_DA_CERTIDAO[c.tipo as keyof typeof ROTULO_DA_CERTIDAO] ?? c.tipo;
      itens.push({
        chave: `certidao-${c.id}`,
        tipo: "certidao",
        rotulo: `Certidão ${nome.toLowerCase()}`,
        dias: c.validaAte ? diasAteChave(c.validaAte, agora) : null,
        positiva: c.situacao === "POSITIVA" && !c.vistaEm,
        href: "/certidoes",
        acao: "Ver",
      });
    }
  }
  if (podeCertificados) {
    const certificados = await prisma.digitalCertificate.findMany({
      where: { tenantId, companyId },
      select: { id: true, tipo: true, expiresAt: true },
      orderBy: { expiresAt: "desc" },
      take: 1,
    });
    for (const c of certificados) {
      itens.push({
        chave: `certificado-${c.id}`,
        tipo: "certificado",
        rotulo: c.tipo === "CPF" ? "Certificado e-CPF" : "Certificado e-CNPJ",
        dias: diasAte(c.expiresAt, agora),
        href: "/certificados",
        acao: "Ver no cofre",
      });
    }
  }
  return ordenarRenovacoes(itens);
}
