// Certificados digitais no Connect: acesso, leitura e importação do relatório.
// Regras de vencimento em ./certificados (puras e testadas).

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { chaveDoCertificado, validarLinha, type CertificadoValidado } from "./certificados";

export const MODULO_CERTIFICADOS = "tech_certificados";

export async function setorDosCertificados(tenantId: string): Promise<string> {
  return (await setorDoModulo(tenantId, MODULO_CERTIFICADOS)) ?? getModuleDef(MODULO_CERTIFICADOS)!.sectorCode;
}

/** null = não vê (a página dá 404). */
export async function acessoAosCertificados() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  const setor = await setorDosCertificados(ctx.tenantId);
  if (!canViewSector(ctx, setor)) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_CERTIFICADOS))) return null;
  return { ctx, tenantId: ctx.tenantId, podeImportar: canActOnSector(ctx, setor) };
}

export async function listarCertificados(tenantId: string) {
  return getPrisma().digitalCertificate.findMany({
    where: { tenantId },
    select: {
      id: true,
      tipo: true,
      documento: true,
      titular: true,
      expiresAt: true,
      cofreEntrada: true,
      conferir: true,
      importedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
    },
    orderBy: { expiresAt: "asc" },
  });
}

export type ResumoDaImportacao = {
  lidas: number;
  descartadas: number;
  novos: number;
  atualizados: number;
  semEmpresa: number;
};

/**
 * Grava o relatório. Idempotente: rodar a mesma importação duas vezes não
 * duplica nada, porque a chave é documento + vencimento. Certificado que sumiu
 * do relatório não é apagado — o histórico de quem teve certificado é útil, e
 * o antigo já aparece como "substituído" quando há um mais novo.
 */
export async function importarCertificados(tenantId: string, linhas: unknown[]): Promise<ResumoDaImportacao> {
  const prisma = getPrisma();
  const validos = new Map<string, CertificadoValidado>();
  let descartadas = 0;
  for (const l of linhas) {
    const c = validarLinha(l);
    if (!c) descartadas++;
    else validos.set(chaveDoCertificado(c), c); // cópias em outras pastas colapsam aqui
  }

  const certs = [...validos.values()];
  const documentos = [...new Set(certs.map((c) => c.documento))];
  const empresas = await prisma.company.findMany({
    where: { tenantId, OR: [{ cnpj: { in: documentos } }, { cpf: { in: documentos } }] },
    select: { id: true, cnpj: true, cpf: true },
  });
  const empresaDo = new Map<string, string>();
  for (const e of empresas) {
    if (e.cnpj) empresaDo.set(e.cnpj, e.id);
    if (e.cpf) empresaDo.set(e.cpf, e.id);
  }

  const existentes = await prisma.digitalCertificate.findMany({
    where: { tenantId, documento: { in: documentos } },
    select: { documento: true, expiresAt: true },
  });
  const jaExiste = new Set(existentes.map(chaveDoCertificado));

  const agora = new Date();
  let novos = 0;
  for (const c of certs) {
    const dados = {
      tipo: c.tipo,
      titular: c.titular,
      cofreEntrada: c.cofreEntrada,
      conferir: c.conferir,
      companyId: empresaDo.get(c.documento) ?? null,
      importedAt: agora,
    };
    await prisma.digitalCertificate.upsert({
      where: { tenantId_documento_expiresAt: { tenantId, documento: c.documento, expiresAt: c.expiresAt } },
      create: { tenantId, documento: c.documento, expiresAt: c.expiresAt, ...dados },
      update: dados,
    });
    if (!jaExiste.has(chaveDoCertificado(c))) novos++;
  }

  return {
    lidas: linhas.length,
    descartadas,
    novos,
    atualizados: certs.length - novos,
    semEmpresa: new Set(certs.filter((c) => !empresaDo.has(c.documento)).map((c) => c.documento)).size,
  };
}
