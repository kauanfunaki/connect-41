// Conta do candidato no portal de vagas — credenciais e leitura dos dados.
//
// Identidade = (tenant, e-mail da inscrição). Sem senha: o candidato pede um
// link, o link (30 min, uso único) abre uma sessão (7 dias) guardada num cookie
// httpOnly restrito ao caminho do portal daquele escritório. Só o hash de cada
// credencial vai para o banco.
//
// O link não entra sozinho ao ser aberto: a página pede um clique. Leitor de
// e-mail corporativo abre os links da mensagem para checar segurança, e um
// link de uso único gasto por ele deixaria o candidato sem conseguir entrar.

import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";

export const VALIDADE_DO_LINK_MS = 30 * 60_000;
export const VALIDADE_DA_SESSAO_MS = 7 * 24 * 60 * 60_000;

export const cookieDaSessao = (slug: string) => ({ nome: "candidato_sessao", caminho: `/carreiras/${slug}` });

function hash(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** O e-mail tem alguma inscrição de candidato neste escritório? */
export async function temInscricao(tenantId: string, email: string): Promise<boolean> {
  const n = await getPrisma().person.count({ where: { tenantId, type: "CANDIDATO", email } });
  return n > 0;
}

async function criar(tenantId: string, email: string, tipo: "LINK" | "SESSAO", validadeMs: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await getPrisma().candidatoAcesso.create({
    data: { tenantId, email, tipo, tokenHash: hash(raw), expiresAt: new Date(Date.now() + validadeMs) },
  });
  return raw;
}

export const criarLink = (tenantId: string, email: string) => criar(tenantId, email, "LINK", VALIDADE_DO_LINK_MS);

/**
 * Troca o link por uma sessão. Marca o link como usado **antes** de criar a
 * sessão e só se ninguém o usou no meio (update condicional) — dois cliques
 * simultâneos no mesmo link não abrem duas sessões.
 */
export async function trocarLinkPorSessao(tenantId: string, raw: string): Promise<string | null> {
  const prisma = getPrisma();
  const agora = new Date();
  const r = await prisma.candidatoAcesso.findFirst({
    where: { tenantId, tipo: "LINK", tokenHash: hash(raw), usedAt: null, expiresAt: { gt: agora } },
    select: { id: true, email: true },
  });
  if (!r) return null;
  const marcado = await prisma.candidatoAcesso.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: agora } });
  if (marcado.count !== 1) return null;
  return criar(tenantId, r.email, "SESSAO", VALIDADE_DA_SESSAO_MS);
}

/** O e-mail da sessão, ou null se ela não vale mais. */
export async function emailDaSessao(tenantId: string, raw: string | undefined): Promise<string | null> {
  if (!raw || !/^[0-9a-f]{64}$/.test(raw)) return null;
  const r = await getPrisma().candidatoAcesso.findFirst({
    where: { tenantId, tipo: "SESSAO", tokenHash: hash(raw), usedAt: null, expiresAt: { gt: new Date() } },
    select: { email: true },
  });
  return r?.email ?? null;
}

/** Sair: a sessão vira usada, e o cookie antigo não abre mais nada. */
export async function encerrarSessao(tenantId: string, raw: string | undefined): Promise<void> {
  if (!raw) return;
  await getPrisma().candidatoAcesso.updateMany({
    where: { tenantId, tipo: "SESSAO", tokenHash: hash(raw), usedAt: null },
    data: { usedAt: new Date() },
  });
}

/**
 * Tudo o que a conta mostra. **Só** o que o candidato pode ver: nada de nota da
 * triagem, observação do recrutador, motivo de reprovação ou avaliação de
 * entrevista.
 */
export async function dadosDaConta(tenantId: string, email: string, agora: Date) {
  const prisma = getPrisma();
  const pessoas = await prisma.person.findMany({
    where: { tenantId, type: "CANDIDATO", email },
    select: { id: true, name: true, phone: true, dataDeletionRequestedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = pessoas.map((p) => p.id);
  if (ids.length === 0) return null;

  const candidaturas = await prisma.candidatura.findMany({
    where: { tenantId, personId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      stage: true,
      createdAt: true,
      resumeUrl: true,
      vaga: { select: { title: true, company: { select: { tradeName: true, name: true } } } },
      meetings: {
        where: { endAt: { gte: agora } },
        orderBy: { startAt: "asc" },
        select: { id: true, title: true, startAt: true, endAt: true, meetingUrl: true },
      },
    },
  });

  const testes = await prisma.assessmentLink.findMany({
    where: { tenantId, personId: { in: ids }, status: "PENDENTE", expiresAt: { gt: agora } },
    orderBy: { expiresAt: "asc" },
    select: { id: true, token: true, type: true, expiresAt: true, candidaturaId: true, template: { select: { name: true } } },
  });

  return {
    nome: pessoas[0]!.name,
    telefone: pessoas.find((p) => p.phone)?.phone ?? null,
    exclusaoPedidaEm: pessoas.find((p) => p.dataDeletionRequestedAt)?.dataDeletionRequestedAt ?? null,
    personIds: ids,
    candidaturas,
    testes,
  };
}
