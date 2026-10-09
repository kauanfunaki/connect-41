"use server";

// O modelo de pastas dos Arquivos (09/10/2026): as pastas que toda empresa
// ganha ao abrir os Arquivos dela. Só administrador mexe.
//
// O que muda no modelo chega às empresas assim:
// - pasta nova: aparece na próxima vez que alguém abrir os Arquivos de cada empresa;
// - nome e setor: mudam na hora em todas as empresas (as pastas da casa não se
//   renomeiam por empresa, então não há o que preservar);
// - "compartilhada": é só o começo de cada pasta nova — compartilhar é decisão
//   por empresa, e mudar o modelo não mexe no que a equipe decidiu;
// - desligar: empresa nova não ganha mais; quem já tem continua com a pasta.
//
// Não há excluir: as pastas das empresas apontam para o modelo pela chave.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { chaveDoModelo, validarNomeDaPasta } from "@/lib/drive/regras";

export type ResultadoDoModelo = { error: string } | { ok: true };

async function administrador() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role) || ctx.subscriptionReadOnly) return null;
  return ctx;
}

type Dados = { nome: string; setor: string | null; compartilhada: boolean };

async function validar(tenantId: string, dados: Dados): Promise<{ ok: true; nome: string; setor: string | null } | { ok: false; erro: string }> {
  const v = validarNomeDaPasta(dados.nome);
  if (!v.ok) return { ok: false, erro: v.erro };
  const setor = dados.setor || null;
  if (setor && !(await getActiveSectors(tenantId)).some((s) => s.code === setor)) return { ok: false, erro: "Setor não encontrado." };
  return { ok: true, nome: v.nome, setor };
}

function revalidar() {
  revalidatePath("/admin/arquivos");
  revalidatePath("/arquivos", "layout");
}

export async function criarPastaDoModelo(dados: Dados): Promise<ResultadoDoModelo> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador mexe no modelo de pastas." };
  const v = await validar(ctx.tenantId, dados);
  if (!v.ok) return { error: v.erro };
  const prisma = getPrisma();
  const ultima = await prisma.driveTemplateFolder.aggregate({ where: { tenantId: ctx.tenantId }, _max: { position: true } });
  try {
    const criada = await prisma.driveTemplateFolder.create({
      data: { tenantId: ctx.tenantId, name: v.nome, sectorCode: v.setor, sharedWithPortal: dados.compartilhada, position: (ultima._max.position ?? -1) + 1 },
      select: { id: true },
    });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "drive.template_create", entityType: "DriveTemplateFolder", entityId: criada.id, metadata: { nome: v.nome, setor: v.setor } });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe uma pasta com esse nome no modelo." };
    throw err;
  }
  revalidar();
  return { ok: true };
}

export async function editarPastaDoModelo(id: string, dados: Dados): Promise<ResultadoDoModelo> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador mexe no modelo de pastas." };
  const prisma = getPrisma();
  const atual = await prisma.driveTemplateFolder.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!atual) return { error: "Pasta do modelo não encontrada." };
  const v = await validar(ctx.tenantId, dados);
  if (!v.ok) return { error: v.erro };
  try {
    await prisma.$transaction([
      prisma.driveTemplateFolder.update({ where: { id }, data: { name: v.nome, sectorCode: v.setor, sharedWithPortal: dados.compartilhada } }),
      // Nome e setor valem para a pasta de cada empresa, que é a mesma pasta da casa.
      prisma.driveFolder.updateMany({ where: { tenantId: ctx.tenantId, systemKey: chaveDoModelo(id) }, data: { name: v.nome, sectorCode: v.setor } }),
    ]);
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe uma pasta com esse nome no modelo." };
    throw err;
  }
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.template_update",
    entityType: "DriveTemplateFolder",
    entityId: id,
    metadata: { de: { nome: atual.name, setor: atual.sectorCode }, para: { nome: v.nome, setor: v.setor } },
  });
  revalidar();
  return { ok: true };
}

export async function alternarPastaDoModelo(id: string): Promise<ResultadoDoModelo> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador mexe no modelo de pastas." };
  const prisma = getPrisma();
  const atual = await prisma.driveTemplateFolder.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { active: true } });
  if (!atual) return { error: "Pasta do modelo não encontrada." };
  await prisma.driveTemplateFolder.update({ where: { id }, data: { active: !atual.active } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: atual.active ? "drive.template_disable" : "drive.template_enable", entityType: "DriveTemplateFolder", entityId: id });
  revalidar();
  return { ok: true };
}

/** Troca de lugar com a vizinha de cima ou de baixo. A ordem é a das pastas na tela de cada empresa. */
export async function moverPastaDoModelo(id: string, direcao: "subir" | "descer"): Promise<ResultadoDoModelo> {
  const ctx = await administrador();
  if (!ctx) return { error: "Só administrador mexe no modelo de pastas." };
  const prisma = getPrisma();
  const todas = await prisma.driveTemplateFolder.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const i = todas.findIndex((t) => t.id === id);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= todas.length) return { ok: true };
  const ordem = todas.map((t) => t.id);
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  // Regrava a ordem inteira: corrige de quebra posições repetidas.
  await prisma.$transaction(ordem.map((tid, posicao) => prisma.driveTemplateFolder.update({ where: { id: tid }, data: { position: posicao } })));
  revalidar();
  return { ok: true };
}
