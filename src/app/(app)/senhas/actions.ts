"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { pick } from "@/lib/forms";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import { isModuleEnabled } from "@/lib/modules";
import { pessoasQuePodemSerMarcadas } from "@/lib/apoio/senhasServidor";
import {
  daLinhaDoBanco,
  lerQuemVe,
  opcoesAoCriar,
  podeExcluirCredencial,
  podeRevelarCredencial,
  recusaDaEdicao,
  recusaDeQuemVe,
  restricoesValidas,
  visibilidadeDe,
} from "@/lib/apoio/regrasDasSenhas";

export type BpoCredencialState = ActionState;

// Cofre por setor (05/11/2026): cada credencial é de um setor
// (`BpoCredential.sectorCode`), e quem ver, revelar, editar ou excluir é
// decidido pelo setor DELA — e não mais pelo setor que opera a tela. Criar
// recebe o setor da tela (`setorDaTelaDoApoio`), conferido de novo aqui.
//
// Senha pessoal e "todos do setor, menos…" (10/11/2026, pedido do Kauan): as
// regras moram em `src/lib/apoio/regrasDasSenhas.ts`, e cada action relê a
// credencial do banco e confere por elas — o que a tela mostra ou esconde é
// só conforto, nunca a trava.
const MODULE = "bpo_senhas";

/** O que as regras leem da credencial, com as marcas de "menos…". */
const SELECAO_DA_REGRA = {
  id: true,
  title: true,
  sectorCode: true,
  visibility: true,
  createdById: true,
  restrictions: { select: { userId: true } },
} as const;

function credencialData(form: FormData) {
  return {
    title:     (form.get("title") as string)?.trim(),
    companyId: pick(form, "companyId"),
    username:  pick(form, "username"),
    url:       pick(form, "url"),
    notes:     pick(form, "notes"),
  };
}

/** Os ids marcados no seletor de "menos…" (um campo `restritos` por pessoa). */
function marcadosNoFormulario(form: FormData): string[] {
  return form.getAll("restritos").map((v) => String(v));
}

const SEM_NINGUEM_MARCADO = "Marque quem do setor não vê a senha, ou escolha “Todos do setor”.";

export async function criarCredencial(
  setor: string,
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!setor || !(await isModuleEnabled(ctx.tenantId, MODULE))) return { error: "O Repositório de senhas está desligado." };

  // Quem vê (10/11/2026). Sem a escolha no formulário, "todos do setor" — o de antes.
  const quemVe = lerQuemVe(form.get("quemVe")) ?? "SETOR";
  const opcoes = opcoesAoCriar(ctx, setor);
  if (!opcoes.includes(quemVe)) {
    return {
      error: opcoes.includes("PESSOAL")
        ? "Só a coordenação do setor cadastra credenciais do setor. Você pode cadastrar uma pessoal, só sua."
        : "Só a coordenação do setor pode cadastrar credenciais.",
    };
  }

  const data = credencialData(form);
  const password = (form.get("password") as string)?.trim();
  if (!data.title) return { error: "Título é obrigatório" };
  if (!password) return { error: "Senha é obrigatória" };

  let restritos: string[] = [];
  if (quemVe === "RESTRITA") {
    const elegiveis = (await pessoasQuePodemSerMarcadas(ctx.tenantId, setor)).map((p) => p.id);
    restritos = restricoesValidas(marcadosNoFormulario(form), elegiveis, { criadorId: ctx.userId, quemMarcaId: ctx.userId });
    if (restritos.length === 0) return { error: SEM_NINGUEM_MARCADO };
  }
  const visibility = visibilidadeDe(quemVe);
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  let id: string;
  try {
    const created = await prisma.bpoCredential.create({
      data: {
        tenantId,
        sectorCode: setor,
        title: data.title,
        companyId: data.companyId,
        username: data.username,
        url: data.url,
        notes: data.notes,
        passwordEnc: encryptSecret(password),
        createdById: ctx.userId,
        visibility,
        ...(restritos.length > 0 ? { restrictions: { create: restritos.map((userId) => ({ tenantId, userId })) } } : {}),
      },
    });
    id = created.id;
  } catch (err) {
    console.error("[criarCredencial]", err);
    return { error: "Erro ao criar credencial. Tente novamente." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "bpoCredential.create",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: data.title, visibilidade: visibility, ...(restritos.length > 0 ? { naoVeem: restritos.length } : {}) },
  });

  revalidatePath("/senhas");
  return null;
}

export async function atualizarCredencial(
  id: string,
  _prev: BpoCredencialState,
  form: FormData
): Promise<BpoCredencialState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const existing = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: SELECAO_DA_REGRA });
  if (!existing) return { error: "Credencial não encontrada." };
  const regra = daLinhaDoBanco(existing);
  const recusa = recusaDaEdicao(ctx, regra);
  if (recusa) return { error: recusa };

  const data = credencialData(form);
  if (!data.title) return { error: "Título é obrigatório" };
  const password = (form.get("password") as string)?.trim();

  // Quem vê (10/11/2026). Sem a escolha no formulário, fica como está — nem
  // visibilidade nem marcas mudam. `null` em `marcas`: não mexe nelas.
  const pedido = lerQuemVe(form.get("quemVe"));
  let visibility = regra.visibility;
  let marcas: string[] | null = null;
  if (pedido) {
    const recusaDaEscolha = recusaDeQuemVe(ctx, regra, pedido);
    if (recusaDaEscolha) return { error: recusaDaEscolha };
    visibility = visibilidadeDe(pedido);
    if (pedido === "RESTRITA") {
      const elegiveis = (await pessoasQuePodemSerMarcadas(ctx.tenantId, existing.sectorCode)).map((p) => p.id);
      marcas = restricoesValidas(marcadosNoFormulario(form), elegiveis, { criadorId: existing.createdById, quemMarcaId: ctx.userId });
      if (marcas.length === 0) return { error: SEM_NINGUEM_MARCADO };
    } else {
      // "Todos do setor" tira as marcas; a pessoal não usa marca (já é só do dono).
      marcas = [];
    }
  }
  const tenantId = ctx.tenantId;

  try {
    await prisma.$transaction([
      prisma.bpoCredential.update({
        where: { id },
        data: {
          title: data.title,
          companyId: data.companyId,
          username: data.username,
          url: data.url,
          notes: data.notes,
          visibility,
          // Senha só é regravada se o usuário digitou uma nova — campo vazio no
          // formulário de edição significa "manter a atual" (nunca mostramos a
          // senha real ali pra não expô-la desnecessariamente).
          ...(password ? { passwordEnc: encryptSecret(password) } : {}),
        },
      }),
      // As marcas que saíram, e as novas — as que ficam mantêm a data de quando entraram.
      ...(marcas === null
        ? []
        : [
            prisma.bpoCredentialRestriction.deleteMany({
              where: { credentialId: id, ...(marcas.length > 0 ? { userId: { notIn: marcas } } : {}) },
            }),
            ...(marcas.length > 0
              ? [prisma.bpoCredentialRestriction.createMany({ data: marcas.map((userId) => ({ tenantId, credentialId: id, userId })), skipDuplicates: true })]
              : []),
          ]),
    ]);
  } catch (err) {
    console.error("[atualizarCredencial]", err);
    return { error: "Erro ao atualizar credencial." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "bpoCredential.update",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: data.title, visibilidade: visibility, ...(marcas !== null ? { naoVeem: marcas.length } : {}) },
  });

  revalidatePath("/senhas");
  return null;
}

export async function excluirCredencial(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  const existing = await prisma.bpoCredential.findFirst({ where: { id, tenantId: ctx.tenantId }, select: SELECAO_DA_REGRA });
  // Excluir senha do cofre: só o administrador (13/10/2026) — inclusive a
  // pessoal dos outros, sem nunca ver a senha. A pessoal sai também pelas
  // mãos do dono (10/11/2026). Ver `podeExcluirCredencial`.
  if (!existing || !podeExcluirCredencial(ctx, daLinhaDoBanco(existing))) return;

  try {
    await prisma.bpoCredential.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCredencial]", err);
    return;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "bpoCredential.delete",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: existing.title, visibilidade: existing.visibility },
  });

  revalidatePath("/senhas");
}

// Revela a senha em texto puro — qualquer colaborador do setor pode (não só
// o coordenador), mas cada revelação fica registrada em BpoCredentialView
// (auditoria de acesso, informação sensível) e, desde 10/11/2026, também na
// Auditoria do escritório. A pessoal, só o dono revela; quem está marcado em
// "menos…" é recusado, mesmo chamando a action direto.
export async function revelarCredencial(id: string): Promise<{ error: string } | { password: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const credential = await prisma.bpoCredential.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      title: true,
      passwordEnc: true,
      sectorCode: true,
      visibility: true,
      createdById: true,
      // Só a marca de quem pede: é a única que decide aqui.
      restrictions: { where: { userId: ctx.userId }, select: { userId: true } },
    },
  });
  if (!credential) return { error: "Credencial não encontrada." };
  // A senha de um setor não se revela a quem é de outro (cofre por setor,
  // 05/11/2026), a pessoal só ao dono, e a do setor não a quem está marcado.
  if (!podeRevelarCredencial(ctx, daLinhaDoBanco(credential))) return { error: "Sem permissão para ver esta credencial." };

  let password: string;
  try {
    password = decryptSecret(credential.passwordEnc);
  } catch (err) {
    console.error("[revelarCredencial]", err);
    return { error: "Erro ao decriptar a senha." };
  }

  await prisma.bpoCredentialView.create({
    data: { tenantId: ctx.tenantId, credentialId: id, userId: ctx.userId },
  });
  // Nunca a senha, o usuário ou a URL nos detalhes: a Auditoria é lida por
  // quem administra, e a pessoal não se revela nem a ele.
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "bpoCredential.reveal",
    entityType: "BpoCredential",
    entityId: id,
    metadata: { title: credential.title, setor: credential.sectorCode, visibilidade: credential.visibility },
  });

  return { password };
}
