"use server";

// Ações dos Arquivos pela equipe (09/10/2026). Cada uma carrega a pasta (ou o
// arquivo) com o caminho inteiro e confere a régua de ./regras.ts antes de
// mexer: setor dono no caminho, lixeira, pasta da casa e escopo (pasta de uma
// empresa nunca vai para outra empresa nem para as internas).
//
// Devolvem `{ error }` em vez de lançar, como as outras actions do app; a tela
// mostra a frase. O envio de arquivo não está aqui: é a rota /api/arquivos/enviar,
// que dá progresso.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import {
  CHAVE_ENVIADOS,
  MODULO_ARQUIVOS,
  caminhoDaPasta,
  caminhoNaLixeira,
  ehPastaDaCasa,
  mapaDePastas,
  moverCriaCiclo,
  podeMexerNoCaminho,
  podeMexerNoDrive,
  podeRestringirAoSetor,
  podeVerCaminho,
  validarNomeDaPasta,
  validarNomeDoArquivo,
} from "@/lib/drive/regras";
import { arquivoParaAEquipe, empresaDoDrive, pastaParaAEquipe, pastasDoEscopo } from "@/lib/drive/servidor";
import { avisarClienteDaPasta } from "@/lib/drive/avisos";

export type ResultadoDaAcao = { error: string } | { ok: true; aviso?: string | null };

const ERRO_SEM_PERMISSAO = "Você não pode mexer nesta pasta.";

async function contexto(): Promise<AuthContext | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Sua sessão expirou. Entre de novo." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS))) return { error: "Os Arquivos estão desligados neste escritório." };
  return ctx;
}

/** As telas que mostram a pasta: a dos Arquivos, a aba da empresa e o portal. */
function revalidar(companyId: string | null) {
  revalidatePath("/arquivos", "layout");
  if (companyId) revalidatePath(`/empresas/${companyId}`);
  revalidatePath("/portal/arquivos");
}

/** Já existe uma pasta com esse nome no mesmo lugar (fora da lixeira)? O MySQL compara sem caixa e sem acento. */
async function nomeOcupado(tenantId: string, companyId: string | null, parentId: string | null, nome: string, exceto?: string) {
  const achada = await getPrisma().driveFolder.findFirst({
    where: { tenantId, companyId, parentId, name: nome, deletedAt: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true },
  });
  return achada !== null;
}

// ─── Pastas ──────────────────────────────────────────────────────────────────

export async function criarPasta(input: {
  companyId: string | null;
  parentId: string | null;
  nome: string;
  setor: string | null;
}): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;

  const v = validarNomeDaPasta(input.nome);
  if (!v.ok) return { error: v.erro };

  let companyId = input.companyId;
  if (input.parentId) {
    const pai = await pastaParaAEquipe(ctx, input.parentId);
    if (!pai) return { error: "A pasta onde você quer criar não existe mais." };
    if (!podeMexerNoCaminho(ctx, pai.caminho)) return { error: ERRO_SEM_PERMISSAO };
    companyId = pai.pasta.companyId;
  } else {
    if (!podeMexerNoDrive(ctx)) return { error: "Você não pode criar pastas." };
    if (companyId && !(await empresaDoDrive(ctx.tenantId, companyId))) return { error: "Empresa não encontrada." };
  }

  const setor = input.setor || null;
  if (setor && !podeRestringirAoSetor(ctx, setor)) return { error: "Você só pode restringir a pasta a um setor em que trabalha." };
  if (await nomeOcupado(ctx.tenantId, companyId, input.parentId, v.nome)) return { error: "Já existe uma pasta com esse nome aqui." };

  const pasta = await getPrisma().driveFolder.create({
    data: { tenantId: ctx.tenantId, companyId, parentId: input.parentId, name: v.nome, sectorCode: setor, createdById: ctx.userId },
    select: { id: true },
  });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.folder_create",
    entityType: "DriveFolder",
    entityId: pasta.id,
    metadata: { nome: v.nome, companyId, parentId: input.parentId, setor },
  });
  revalidar(companyId);
  return { ok: true };
}

/** Carrega a pasta para mexer: existe, à vista, pode mexer e, quando pedido, não é da casa. */
async function pastaParaMexer(ctx: AuthContext, id: string, opcoes: { foraDaCasa?: boolean } = {}) {
  const alvo = await pastaParaAEquipe(ctx, id);
  if (!alvo) return { error: "Pasta não encontrada." } as const;
  if (!podeMexerNoCaminho(ctx, alvo.caminho)) return { error: ERRO_SEM_PERMISSAO } as const;
  if (opcoes.foraDaCasa && ehPastaDaCasa(alvo.pasta)) {
    return { error: "Esta é uma pasta do modelo do escritório: não muda de nome, de lugar, nem vai para a lixeira." } as const;
  }
  return alvo;
}

export async function renomearPasta(id: string, nome: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await pastaParaMexer(ctx, id, { foraDaCasa: true });
  if ("error" in alvo) return alvo;
  const v = validarNomeDaPasta(nome);
  if (!v.ok) return { error: v.erro };
  if (await nomeOcupado(ctx.tenantId, alvo.pasta.companyId, alvo.pasta.parentId, v.nome, id)) {
    return { error: "Já existe uma pasta com esse nome aqui." };
  }
  await getPrisma().driveFolder.update({ where: { id }, data: { name: v.nome } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.folder_rename",
    entityType: "DriveFolder",
    entityId: id,
    metadata: { de: alvo.pasta.name, para: v.nome },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

/** Restringe a pasta a um setor, ou abre para todos (`setor` nulo). Pasta da casa segue o modelo. */
export async function alterarSetorDaPasta(id: string, setor: string | null): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await pastaParaMexer(ctx, id, { foraDaCasa: true });
  if ("error" in alvo) return alvo;
  const novo = setor || null;
  if (novo && !podeRestringirAoSetor(ctx, novo)) return { error: "Você só pode restringir a pasta a um setor em que trabalha." };
  // Abrir uma pasta de setor é decisão de quem pode agir no setor de hoje — a
  // checagem do caminho acima já garante isso.
  await getPrisma().driveFolder.update({ where: { id }, data: { sectorCode: novo } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.folder_sector",
    entityType: "DriveFolder",
    entityId: id,
    metadata: { de: alvo.pasta.sectorCode, para: novo },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

export async function moverPasta(id: string, destinoId: string | null): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await pastaParaMexer(ctx, id, { foraDaCasa: true });
  if ("error" in alvo) return alvo;
  if (destinoId === alvo.pasta.parentId) return { ok: true };

  if (destinoId) {
    const destino = alvo.mapa.get(destinoId);
    const caminho = destino ? caminhoDaPasta(destinoId, alvo.mapa) : null;
    // `alvo.mapa` só tem pastas do mesmo escopo: destino de outra empresa (ou
    // das internas) não está nele e cai aqui como "não encontrada".
    if (!destino || !caminho || caminhoNaLixeira(caminho) || !podeVerCaminho(ctx, caminho)) return { error: "Pasta de destino não encontrada." };
    if (!podeMexerNoCaminho(ctx, caminho)) return { error: "Você não pode mexer na pasta de destino." };
    if (moverCriaCiclo(id, destinoId, alvo.mapa)) return { error: "Uma pasta não pode ir para dentro dela mesma." };
  }
  if (await nomeOcupado(ctx.tenantId, alvo.pasta.companyId, destinoId, alvo.pasta.name, id)) {
    return { error: "No destino já existe uma pasta com esse nome." };
  }
  await getPrisma().driveFolder.update({ where: { id }, data: { parentId: destinoId } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.folder_move",
    entityType: "DriveFolder",
    entityId: id,
    metadata: { de: alvo.pasta.parentId, para: destinoId },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

export async function excluirPasta(id: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await pastaParaMexer(ctx, id, { foraDaCasa: true });
  if ("error" in alvo) return alvo;
  await getPrisma().driveFolder.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.folder_delete",
    entityType: "DriveFolder",
    entityId: id,
    metadata: { nome: alvo.pasta.name, companyId: alvo.pasta.companyId },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

/**
 * Compartilha (ou deixa de compartilhar) a pasta com o cliente no portal e,
 * se pedido, avisa por e-mail e no celular. Só pasta de empresa: as internas
 * não têm cliente. "Enviados pelo cliente" fica sempre compartilhada — é por
 * ela que o cliente manda arquivos.
 */
export async function compartilharPasta(id: string, compartilhar: boolean, avisar: boolean): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await pastaParaMexer(ctx, id);
  if ("error" in alvo) return alvo;
  const { pasta } = alvo;
  if (!pasta.companyId) return { error: "Pastas internas do escritório não vão para o portal." };
  if (pasta.systemKey === CHAVE_ENVIADOS && !compartilhar) {
    return { error: "“Enviados pelo cliente” fica sempre compartilhada: é por ela que o cliente manda arquivos." };
  }

  if (pasta.sharedWithPortal !== compartilhar) {
    await getPrisma().driveFolder.update({ where: { id }, data: { sharedWithPortal: compartilhar } });
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: compartilhar ? "drive.folder_share" : "drive.folder_unshare",
      entityType: "DriveFolder",
      entityId: id,
      metadata: { nome: pasta.name, companyId: pasta.companyId },
    });
  }

  let aviso: string | null = null;
  const vistaPeloCliente = compartilhar || alvo.caminho.some((p) => p.id !== id && p.sharedWithPortal);
  if (avisar && vistaPeloCliente) {
    const empresa = await empresaDoDrive(ctx.tenantId, pasta.companyId);
    if (empresa) {
      const r = await avisarClienteDaPasta({
        tenantId: ctx.tenantId,
        companyId: pasta.companyId,
        empresaNome: empresa.nome,
        pastaId: id,
        pastaNome: pasta.name,
      });
      aviso = r.problema ?? (r.avisados === 1 ? "Cliente avisado." : `${r.avisados} pessoas do cliente avisadas.`);
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "drive.folder_notify",
        entityType: "DriveFolder",
        entityId: id,
        metadata: { avisados: r.avisados, problema: r.problema },
      });
    }
  }
  revalidar(pasta.companyId);
  return { ok: true, aviso };
}

// ─── Arquivos ────────────────────────────────────────────────────────────────

async function arquivoParaMexer(ctx: AuthContext, id: string) {
  const alvo = await arquivoParaAEquipe(ctx, id);
  if (!alvo) return { error: "Arquivo não encontrado." } as const;
  if (!podeMexerNoCaminho(ctx, alvo.caminho)) return { error: ERRO_SEM_PERMISSAO } as const;
  return alvo;
}

export async function renomearArquivo(id: string, nome: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await arquivoParaMexer(ctx, id);
  if ("error" in alvo) return alvo;
  const v = validarNomeDoArquivo(nome, alvo.arquivo.name);
  if (!v.ok) return { error: v.erro };
  await getPrisma().driveFile.update({ where: { id }, data: { name: v.nome } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.file_rename",
    entityType: "DriveFile",
    entityId: id,
    metadata: { de: alvo.arquivo.name, para: v.nome },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

export async function moverArquivo(id: string, destinoId: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await arquivoParaMexer(ctx, id);
  if ("error" in alvo) return alvo;
  if (destinoId === alvo.arquivo.folderId) return { ok: true };
  const caminho = alvo.mapa.has(destinoId) ? caminhoDaPasta(destinoId, alvo.mapa) : null;
  if (!caminho || caminhoNaLixeira(caminho) || !podeVerCaminho(ctx, caminho)) return { error: "Pasta de destino não encontrada." };
  if (!podeMexerNoCaminho(ctx, caminho)) return { error: "Você não pode mexer na pasta de destino." };
  await getPrisma().driveFile.update({ where: { id }, data: { folderId: destinoId } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.file_move",
    entityType: "DriveFile",
    entityId: id,
    metadata: { de: alvo.arquivo.folderId, para: destinoId },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

export async function excluirArquivo(id: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const alvo = await arquivoParaMexer(ctx, id);
  if ("error" in alvo) return alvo;
  await getPrisma().driveFile.update({ where: { id }, data: { deletedAt: new Date(), deletedById: ctx.userId } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "drive.file_delete",
    entityType: "DriveFile",
    entityId: id,
    metadata: { nome: alvo.arquivo.name, pastaId: alvo.arquivo.folderId },
  });
  revalidar(alvo.pasta.companyId);
  return { ok: true };
}

// ─── Lixeira ─────────────────────────────────────────────────────────────────

/** Tira da lixeira. Só quando nada acima dela também está na lixeira. */
export async function restaurar(tipo: "pasta" | "arquivo", id: string): Promise<ResultadoDaAcao> {
  const ctx = await contexto();
  if ("error" in ctx) return ctx;
  const prisma = getPrisma();

  const alvo =
    tipo === "pasta"
      ? await prisma.driveFolder.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: { not: null } }, select: { id: true, companyId: true, parentId: true } })
      : await prisma.driveFile.findFirst({
          where: { id, tenantId: ctx.tenantId, deletedAt: { not: null } },
          select: { id: true, folderId: true, folder: { select: { companyId: true } } },
        });
  if (!alvo) return { error: "Não está mais na lixeira." };

  const companyId = "companyId" in alvo ? alvo.companyId : alvo.folder.companyId;
  const mapa = mapaDePastas(await pastasDoEscopo(ctx.tenantId, companyId));
  const caminho = caminhoDaPasta("folderId" in alvo ? alvo.folderId : alvo.id, mapa);
  if (!caminho || !podeVerCaminho(ctx, caminho)) return { error: "Não está mais na lixeira." };
  if (!podeMexerNoCaminho(ctx, caminho)) return { error: ERRO_SEM_PERMISSAO };
  const acima = tipo === "pasta" ? caminho.slice(0, -1) : caminho;
  if (caminhoNaLixeira(acima)) return { error: "A pasta de cima também está na lixeira: restaure ela antes." };

  if (tipo === "pasta") {
    const pasta = mapa.get(id)!;
    if (await nomeOcupado(ctx.tenantId, companyId, pasta.parentId, pasta.name, id)) {
      return { error: "Já existe outra pasta com esse nome no lugar dela. Renomeie a outra antes." };
    }
    await prisma.driveFolder.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  } else {
    await prisma.driveFile.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  }
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: tipo === "pasta" ? "drive.folder_restore" : "drive.file_restore",
    entityType: tipo === "pasta" ? "DriveFolder" : "DriveFile",
    entityId: id,
  });
  revalidar(companyId);
  return { ok: true };
}
