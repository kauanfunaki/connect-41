// Certificados digitais no Connect: acesso, leitura e importação do relatório.
// Regras de vencimento em ./certificados (puras e testadas).

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { chaveDoCertificado, validarLinha, type CertificadoValidado } from "./certificados";
import { DIAS_DA_CONTAGEM, type RenovacaoValidada, type UsoDeclarado, type UsoDoDocumento } from "./usos";

export const MODULO_CERTIFICADOS = "tech_certificados";

export async function setorDosCertificados(tenantId: string): Promise<string> {
  return (await setorDoModulo(tenantId, MODULO_CERTIFICADOS)) ?? getModuleDef(MODULO_CERTIFICADOS)!.sectorCode;
}

/** null = não vê (a página dá 404). */
export async function acessoAosCertificados() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  // Os setores da tela (21/10/2026), não só o dono: ver `setoresDoModulo`.
  const setores = (await setoresDoModulo(ctx.tenantId, MODULO_CERTIFICADOS)) ?? [getModuleDef(MODULO_CERTIFICADOS)!.sectorCode];
  if (!canViewSector(ctx, setores)) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_CERTIFICADOS))) return null;
  return {
    ctx,
    tenantId: ctx.tenantId,
    setores,
    podeImportar: canActOnSector(ctx, setores),
    // O "Usado por" à mão é de quem coordena (05/11/2026): é ele que diz que um
    // certificado segura a NFS-e ou a procuração, e isso pesa na renovação.
    podeDeclararUso: canManageSector(ctx, setores),
  };
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
      renovacaoStatus: true,
      renovacaoResponsavelId: true,
      renovacaoCustoCentavos: true,
      renovacaoPagaQuem: true,
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

// ─── Usos e renovação (05/11/2026) ─────────────────────────────────────────

/**
 * Os usos de cada documento, com a contagem dos últimos 30 dias, e o dia em
 * que o registro começou (o "sem uso há 90 dias" só é justo depois de 90 dias
 * de registro — a tela avisa enquanto não chegou lá).
 */
export async function usosDosDocumentos(tenantId: string, agora = new Date()): Promise<{ porDocumento: Map<string, UsoDoDocumento[]>; registroDesde: Date | null }> {
  const prisma = getPrisma();
  const desde = new Date(agora.getTime() - DIAS_DA_CONTAGEM * 86_400_000);
  const [usos, dias, primeiro] = await Promise.all([
    prisma.digitalCertificateUse.findMany({
      where: { tenantId },
      select: { documento: true, uso: true, descricao: true, declarado: true, ultimoUsoAt: true },
    }),
    prisma.digitalCertificateUseDay.groupBy({
      by: ["documento", "uso"],
      where: { tenantId, dia: { gte: new Date(`${desde.toISOString().slice(0, 10)}T00:00:00Z`) } },
      _sum: { vezes: true },
    }),
    prisma.digitalCertificateUseDay.aggregate({ where: { tenantId }, _min: { dia: true } }),
  ]);
  const vezes = new Map(dias.map((d) => [`${d.documento}:${d.uso}`, d._sum.vezes ?? 0]));
  const porDocumento = new Map<string, UsoDoDocumento[]>();
  for (const u of usos) {
    const lista = porDocumento.get(u.documento) ?? [];
    lista.push({ ...u, vezes30: vezes.get(`${u.documento}:${u.uso}`) ?? 0 });
    porDocumento.set(u.documento, lista);
  }
  return { porDocumento, registroDesde: primeiro._min.dia ?? null };
}

/** Quem pode cuidar de uma renovação: a equipe ativa dos setores da tela. */
export async function equipeDosCertificados(tenantId: string, setores: string[]) {
  return getPrisma().user.findMany({
    where: {
      tenantId,
      active: true,
      OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { role: { in: ["SECTOR_ADMIN", "SECTOR_USER"] }, sectors: { some: { sectorCode: { in: setores } } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });
}

/**
 * Grava o "Usado por" de um documento: marca os declarados, desmarca os que
 * saíram e apaga a linha que não tem mais nada (nem declarada, nem registrada).
 * O registro automático (último uso) não é tocado.
 */
export async function declararUsos(tenantId: string, documento: string, usos: UsoDeclarado[], userId: string | null): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const marcados = usos.map((u) => u.uso);
    await tx.digitalCertificateUse.updateMany({
      where: { tenantId, documento, declarado: true, uso: { notIn: marcados.length ? marcados : ["-"] } },
      data: { declarado: false, declaradoPorId: null },
    });
    await tx.digitalCertificateUse.deleteMany({ where: { tenantId, documento, declarado: false, ultimoUsoAt: null } });
    for (const u of usos) {
      await tx.digitalCertificateUse.upsert({
        where: { tenantId_documento_uso: { tenantId, documento, uso: u.uso } },
        create: { tenantId, documento, uso: u.uso, descricao: u.descricao, declarado: true, declaradoPorId: userId },
        update: { declarado: true, descricao: u.descricao, declaradoPorId: userId },
      });
    }
  });
}

/** Grava a renovação de um certificado do tenant. false = não achou. */
export async function gravarRenovacao(tenantId: string, id: string, dados: RenovacaoValidada, setores: string[]): Promise<{ ok: true } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  if (dados.responsavelId) {
    const equipe = await equipeDosCertificados(tenantId, setores);
    if (!equipe.some((u) => u.id === dados.responsavelId)) return { ok: false, erro: "O responsável precisa ser da equipe da tela." };
  }
  const r = await prisma.digitalCertificate.updateMany({
    where: { id, tenantId },
    data: {
      renovacaoStatus: dados.status,
      renovacaoResponsavelId: dados.responsavelId,
      renovacaoCustoCentavos: dados.custoCentavos,
      renovacaoPagaQuem: dados.pagaQuem,
      renovacaoAtualizadaEm: new Date(),
    },
  });
  return r.count === 1 ? { ok: true } : { ok: false, erro: "Certificado não encontrado." };
}
