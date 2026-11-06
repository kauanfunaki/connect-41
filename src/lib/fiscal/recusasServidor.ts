// XML fiscal recusado — gravar e contar (06/11/2026). A parte pura está em ./recusas.ts.

import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { pistasDoXml, resumirPorMunicipio, TAMANHO_MAXIMO_GUARDADO, type ResumoDoMunicipio, type TipoProvavel } from "./recusas";

export type OrigemDaRecusa = "entrada" | "sped_local";

export type RecusaDeXml = {
  tenantId: string;
  companyId: string | null;
  origem: OrigemDaRecusa;
  nomeDoArquivo: string;
  xml: string;
  motivo: string;
  detalhe: string;
  userId: string | null;
};

type Banco = Pick<PrismaClient, "fiscalXmlRefusal">;

/**
 * Grava a recusa, uma linha por arquivo: o mesmo XML reenviado soma em
 * `timesSeen` em vez de virar outra linha, e motivo e detalhe passam a ser os
 * do último envio (o leitor pode ter mudado desde o primeiro).
 */
export async function registrarRecusaDeXml(r: RecusaDeXml, db: Banco = getPrisma()): Promise<void> {
  const sha256 = createHash("sha256").update(r.xml, "utf8").digest("hex");
  const bytes = Buffer.byteLength(r.xml, "utf8");
  const pistas = pistasDoXml(r.xml);
  const motivo = r.motivo.slice(0, 40);
  const detalhe = r.detalhe.slice(0, 500);
  await db.fiscalXmlRefusal.upsert({
    where: { tenantId_sha256: { tenantId: r.tenantId, sha256 } },
    create: {
      tenantId: r.tenantId,
      companyId: r.companyId,
      source: r.origem,
      fileName: r.nomeDoArquivo.slice(0, 255),
      sha256,
      bytes,
      reason: motivo,
      detail: detalhe,
      probableType: pistas.tipoProvavel,
      rootTag: pistas.raiz,
      municipalityCode: pistas.municipio,
      xml: bytes <= TAMANHO_MAXIMO_GUARDADO ? r.xml : null,
      lastSeenById: r.userId,
    },
    update: {
      timesSeen: { increment: 1 },
      lastSeenAt: new Date(),
      lastSeenById: r.userId,
      reason: motivo,
      detail: detalhe,
      // A empresa do último envio vale mais que nenhuma; nenhuma não apaga a anterior.
      ...(r.companyId ? { companyId: r.companyId } : {}),
    },
  });
}

/**
 * A mesma gravação, sem nunca derrubar quem chamou: a entrada de XML e a
 * importação do SPED continuam a responder a pessoa mesmo se a contagem falhar.
 */
export async function registrarRecusaSemTravar(r: RecusaDeXml, db?: Banco): Promise<void> {
  try {
    await registrarRecusaDeXml(r, db);
  } catch (e) {
    console.error("[fiscal] recusa de XML não registrada:", e instanceof Error ? e.message : e);
  }
}

export const DIAS_DO_RESUMO = 90;
const ULTIMAS = 50;

export type RecusaNaLista = {
  id: string;
  arquivo: string;
  origem: string;
  motivo: string;
  detalhe: string;
  tipo: TipoProvavel;
  municipio: string | null;
  vezes: number;
  ultima: Date;
  empresa: string | null;
};

export type ResumoDasRecusas = {
  arquivos: number;
  nfse: number;
  municipios: number;
  porMunicipio: ResumoDoMunicipio[];
  ultimas: RecusaNaLista[];
};

/** O que a tela mostra: os últimos `DIAS_DO_RESUMO` dias, NFS-e por município e as recusas mais novas. */
export async function resumoDasRecusas(tenantId: string, agora = new Date()): Promise<ResumoDasRecusas> {
  const db = getPrisma();
  const desde = new Date(agora.getTime() - DIAS_DO_RESUMO * 24 * 60 * 60 * 1000);
  const noPeriodo = { tenantId, lastSeenAt: { gte: desde } };

  const [arquivos, porMunicipioEMotivo, ultimas] = await Promise.all([
    db.fiscalXmlRefusal.count({ where: noPeriodo }),
    db.fiscalXmlRefusal.groupBy({
      by: ["municipalityCode", "reason"],
      where: { ...noPeriodo, probableType: "nfse" },
      _count: { _all: true },
      _max: { lastSeenAt: true },
    }),
    db.fiscalXmlRefusal.findMany({
      where: noPeriodo,
      orderBy: { lastSeenAt: "desc" },
      take: ULTIMAS,
      select: {
        id: true,
        fileName: true,
        source: true,
        reason: true,
        detail: true,
        probableType: true,
        municipalityCode: true,
        timesSeen: true,
        lastSeenAt: true,
        companyId: true,
      },
    }),
  ]);

  const idsDasEmpresas = [...new Set(ultimas.map((u) => u.companyId).filter((id): id is string => !!id))];
  const empresas = idsDasEmpresas.length
    ? await db.company.findMany({ where: { tenantId, id: { in: idsDasEmpresas } }, select: { id: true, name: true, displayName: true } })
    : [];
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, e.displayName ?? e.name]));

  const porMunicipio = resumirPorMunicipio(
    porMunicipioEMotivo.map((g) => ({
      municipio: g.municipalityCode,
      motivo: g.reason,
      quantidade: g._count._all,
      ultima: g._max.lastSeenAt ?? agora,
    })),
  );

  return {
    arquivos,
    nfse: porMunicipio.reduce((soma, m) => soma + m.arquivos, 0),
    municipios: porMunicipio.filter((m) => m.municipio !== null).length,
    porMunicipio,
    ultimas: ultimas.map((u) => ({
      id: u.id,
      arquivo: u.fileName,
      origem: u.source,
      motivo: u.reason,
      detalhe: u.detail,
      tipo: u.probableType as TipoProvavel,
      municipio: u.municipalityCode,
      vezes: u.timesSeen,
      ultima: u.lastSeenAt,
      empresa: u.companyId ? (nomeDaEmpresa.get(u.companyId) ?? null) : null,
    })),
  };
}
