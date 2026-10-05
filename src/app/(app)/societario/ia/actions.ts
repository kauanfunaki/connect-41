"use server";

// As ações da IA do Societário (29/09): rodar a varredura, ler um contrato
// social, e aprovar ou rejeitar o que a IA propôs.
//
// Quem pede e quem aprova é o coordenador do setor (decisão de 28/09): no
// protótipo o analista disparava e o gestor aprovava; aqui as duas pontas são
// da coordenação, que é quem responde pelo que o setor grava.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { notifySector, notifyUser } from "@/lib/notifications";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { concluirProposta, propostaDoSetor } from "@/lib/ia/propostas";
import { prioridadeDepois } from "@/lib/societario/varredura";
import { lerContrato, planejarContrato, type SocioLido } from "@/lib/societario/contratoSocial";
import {
  AGENTE_CONTRATO,
  AGENTE_VARREDURA,
  lerContratoSocial,
  rodarVarredura,
  type PayloadDaVarredura,
  type PayloadDoContrato,
} from "@/lib/societario/iaDoSetor";

const SECTOR = "societario";
const MODULE = "societario_processos";
const MAX_PDF = 10 * 1024 * 1024;

export type AcaoDaIa = { error: string } | { ok: true; mensagem?: string };

async function coordenacao() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { erro: "Não autenticado", ctx: null, setor: SECTOR } as const;
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { erro: "Módulo do Societário desligado.", ctx: null, setor: SECTOR } as const;
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canManageSector(ctx, setor)) {
    return { erro: "Só a coordenação do Societário usa e aprova a IA do setor.", ctx: null, setor } as const;
  }
  return { erro: null, ctx, setor } as const;
}

function mensagemDeErroDaIa(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (/desligad/i.test(m)) return "Esta função de IA está desligada. Ligue em Administração › Inteligência Artificial.";
  if (/chave|api key|configur/i.test(m)) return "O escritório não tem chave de IA configurada.";
  if (/teto|limite/i.test(m)) return "O teto de gasto desta função de IA no mês foi atingido.";
  return "A IA não conseguiu responder agora. Tente de novo em alguns minutos.";
}

// ─── Varredura ───────────────────────────────────────────────────────────────

export async function rodarVarreduraAction(): Promise<AcaoDaIa> {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" };
  let r;
  try {
    r = await rodarVarredura({ tenantId: ctx.tenantId, userId: ctx.userId, sectorCode: setor });
  } catch (err) {
    console.error("[rodarVarredura]", err);
    return { error: mensagemDeErroDaIa(err) };
  }
  if (r.tipo === "vazia") {
    return { ok: true, mensagem: "Nenhuma pendência: não há exigência vencida, processo parado, prazo vencido nem licença vencendo." };
  }
  revalidatePath("/societario/ia");
  redirect(`/societario/ia/${r.propostaId}`);
}

/**
 * Aplica a varredura aprovada: cada processo marcado sobe para prioridade ALTA
 * (URGENTE fica) e o responsável é avisado com o próximo passo; licença
 * marcada vira aviso para o setor. Nada de processo novo — a exigência já tem
 * processo (decisão de 28/09).
 */
export async function aplicarVarredura(propostaId: string, chavesMarcadas: string[]): Promise<AcaoDaIa> {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" };
  const proposta = await propostaDoSetor(propostaId, ctx.tenantId, setor);
  if (!proposta || proposta.agentCode !== AGENTE_VARREDURA) return { error: "Proposta não encontrada." };
  if (proposta.status !== "PENDENTE") return { error: "Esta proposta já foi revisada." };

  const payload = proposta.payload as unknown as PayloadDaVarredura;
  const marcadas = new Set(chavesMarcadas);
  const itens = payload.avaliacao.itens.filter((i) => marcadas.has(i.chave));
  if (itens.length === 0) return { error: "Marque ao menos uma pendência, ou rejeite a proposta." };

  const prisma = getPrisma();
  const sinalDa = new Map(payload.sinais.map((s) => [s.chave, s]));
  const processosFeitos = new Set<string>();
  let processosSubiram = 0;

  for (const item of itens) {
    const sinal = sinalDa.get(item.chave);
    if (!sinal) continue;
    const proximoPasso = item.recomendacao ? ` Próximo passo: ${item.recomendacao}` : "";
    if (sinal.processoId) {
      if (processosFeitos.has(sinal.processoId)) continue;
      processosFeitos.add(sinal.processoId);
      const processo = await prisma.process.findFirst({
        where: { id: sinal.processoId, tenantId: ctx.tenantId },
        select: { id: true, priority: true, ownerUserId: true },
      });
      if (!processo) continue;
      const nova = prioridadeDepois(processo.priority);
      if (nova !== processo.priority) {
        await prisma.process.update({ where: { id: processo.id }, data: { priority: nova } });
        processosSubiram++;
      }
      // Leva quem aprovou a proposta da varredura — a foto no sino (05/10/2026).
      const aviso = {
        tenantId: ctx.tenantId,
        type: "PROCESS_VARREDURA",
        message: `Varredura do Societário: ${sinal.detalhe}${proximoPasso}`.slice(0, 480),
        entityId: processo.id,
        actorUserId: ctx.userId,
      };
      if (processo.ownerUserId) await notifyUser(processo.ownerUserId, aviso);
      else await notifySector(setor, aviso);
    } else if (sinal.licencaId) {
      await notifySector(setor, {
        tenantId: ctx.tenantId,
        type: "LICENCA_VARREDURA",
        message: `Varredura do Societário: ${sinal.titulo} — ${sinal.detalhe}${proximoPasso}`.slice(0, 480),
        actorUserId: ctx.userId,
      });
    }
  }

  const todas = itens.length === payload.avaliacao.itens.length;
  const fechou = await concluirProposta({
    id: propostaId,
    tenantId: ctx.tenantId,
    status: todas ? "APROVADA" : "EDITADA",
    appliedPayload: { chaves: itens.map((i) => i.chave) },
    reviewedById: ctx.userId,
  });
  if (!fechou) return { error: "Outra pessoa revisou esta proposta ao mesmo tempo." };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "societario.ia.varredura_aplicada",
    entityType: "AgentProposal",
    entityId: propostaId,
    metadata: { itens: itens.length, de: payload.avaliacao.itens.length, processosSubiram },
  });
  revalidatePath("/societario/ia");
  revalidatePath("/processos");
  return {
    ok: true,
    mensagem: `${itens.length} ${itens.length === 1 ? "pendência encaminhada" : "pendências encaminhadas"}; ${processosSubiram} ${processosSubiram === 1 ? "processo subiu" : "processos subiram"} para prioridade alta.`,
  };
}

export async function rejeitarProposta(propostaId: string, motivo: string): Promise<AcaoDaIa> {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" };
  const proposta = await propostaDoSetor(propostaId, ctx.tenantId, setor);
  if (!proposta) return { error: "Proposta não encontrada." };
  const fechou = await concluirProposta({
    id: propostaId,
    tenantId: ctx.tenantId,
    status: "REJEITADA",
    notes: motivo.trim().slice(0, 1000) || null,
    reviewedById: ctx.userId,
  });
  if (!fechou) return { error: "Esta proposta já foi revisada." };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "societario.ia.proposta_rejeitada",
    entityType: "AgentProposal",
    entityId: propostaId,
    metadata: { agente: proposta.agentCode },
  });
  revalidatePath("/societario/ia");
  return { ok: true };
}

// ─── Contrato social ─────────────────────────────────────────────────────────

export type LeituraState = { error: string } | null;

export async function lerContratoSocialAction(_prev: LeituraState, form: FormData): Promise<LeituraState> {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" };

  const companyId = String(form.get("companyId") ?? "");
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha o PDF do contrato social." };
  if (arquivo.size > MAX_PDF) return { error: "O PDF passa de 10 MB." };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "O arquivo não é um PDF." };

  const empresa = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId: ctx.tenantId },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "Empresa não encontrada." };

  let propostaId: string;
  try {
    const r = await lerContratoSocial({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      sectorCode: setor,
      companyId: empresa.id,
      empresaNome: nomeExibicao(empresa),
      pdfBase64: bytes.toString("base64"),
      nomeDoArquivo: arquivo.name.slice(0, 120) || "contrato.pdf",
    });
    propostaId = r.propostaId;
  } catch (err) {
    console.error("[lerContratoSocial]", err);
    return { error: mensagemDeErroDaIa(err) };
  }
  revalidatePath("/societario/ia");
  redirect(`/societario/ia/${propostaId}`);
}

/**
 * Grava os sócios que o coordenador aprovou. As linhas vêm da tela, já
 * corrigidas por ele, e passam de novo pela mesma conferência da leitura da IA
 * (`lerContrato`) — a action é alcançável por POST, e um CPF inválido não entra
 * por aqui também. O plano é refeito contra o cadastro de agora.
 */
export async function aplicarContrato(propostaId: string, linhas: SocioLido[]): Promise<AcaoDaIa> {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" };
  const proposta = await propostaDoSetor(propostaId, ctx.tenantId, setor);
  if (!proposta || proposta.agentCode !== AGENTE_CONTRATO || !proposta.entityId) return { error: "Proposta não encontrada." };
  if (proposta.status !== "PENDENTE") return { error: "Esta proposta já foi revisada." };
  const companyId = proposta.entityId;

  const conferidas = lerContrato({ socios: linhas, confianca: "MEDIA" }).socios;
  if (conferidas.length === 0) return { error: "Nenhum sócio para gravar. Marque ao menos um, ou rejeite a proposta." };
  if (conferidas.length !== linhas.length) return { error: "Toda linha marcada precisa de nome." };

  const prisma = getPrisma();
  const cadastrados = await prisma.companyPartner.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    select: {
      id: true,
      name: true,
      document: true,
      documentMasked: true,
      exitDate: true,
      sharePercent: true,
      quotas: true,
      capitalAmount: true,
      administrator: true,
      qualification: true,
      entryDate: true,
    },
  });
  const plano = planejarContrato(
    cadastrados.map((c) => ({
      ...c,
      sharePercent: c.sharePercent === null ? null : Number(c.sharePercent),
      capitalAmount: c.capitalAmount === null ? null : Number(c.capitalAmount),
    })),
    conferidas
  );
  const porId = new Map(cadastrados.map((c) => [c.id, c]));
  const dataOuNulo = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`) : null);

  try {
    await prisma.$transaction(async (tx) => {
      for (const n of plano.novos) {
        await tx.companyPartner.create({
          data: {
            tenantId: ctx.tenantId,
            companyId,
            name: n.nome,
            document: n.documento,
            sharePercent: n.participacao,
            quotas: n.quotas,
            capitalAmount: n.capital,
            administrator: n.administrador,
            qualification: n.qualificacao,
            entryDate: dataOuNulo(n.entrada),
            origin: "CONTRATO",
          },
        });
      }
      for (const a of plano.atualizar) {
        const atual = porId.get(a.id)!;
        const l = a.lido;
        await tx.companyPartner.update({
          where: { id: a.id },
          data: {
            ...(l.participacao !== null ? { sharePercent: l.participacao } : {}),
            ...(l.quotas !== null ? { quotas: l.quotas } : {}),
            ...(l.capital !== null ? { capitalAmount: l.capital } : {}),
            administrator: l.administrador,
            ...(!atual.document && l.documento ? { document: l.documento } : {}),
            ...(!atual.qualification && l.qualificacao ? { qualification: l.qualificacao } : {}),
            ...(!atual.entryDate && l.entrada ? { entryDate: dataOuNulo(l.entrada) } : {}),
          },
        });
      }
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Já existe um sócio com um destes documentos nesta empresa. Confira os CPFs." };
    console.error("[aplicarContrato]", err);
    return { error: "Erro ao gravar os sócios. Tente novamente." };
  }

  const original = (proposta.payload as unknown as PayloadDoContrato).leitura.socios;
  const semMudanca = JSON.stringify(original) === JSON.stringify(conferidas);
  const fechou = await concluirProposta({
    id: propostaId,
    tenantId: ctx.tenantId,
    status: semMudanca ? "APROVADA" : "EDITADA",
    appliedPayload: { socios: conferidas } as unknown as object,
    reviewedById: ctx.userId,
  });
  if (!fechou) return { error: "Os sócios foram gravados, mas outra pessoa revisou esta proposta ao mesmo tempo." };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "empresa.socio.importado_do_contrato",
    entityType: "Company",
    entityId: companyId,
    metadata: { propostaId, novos: plano.novos.length, atualizados: plano.atualizar.length, editada: !semMudanca },
  });
  revalidatePath(`/empresas/${companyId}/socios`);
  revalidatePath("/societario/ia");
  return {
    ok: true,
    mensagem: `${plano.novos.length} ${plano.novos.length === 1 ? "sócio novo" : "sócios novos"} e ${plano.atualizar.length} ${plano.atualizar.length === 1 ? "atualizado" : "atualizados"}.`,
  };
}

/** A prévia do que aprovar faria, para a tela recalcular enquanto a pessoa corrige. */
export async function previaDoContrato(propostaId: string, linhas: SocioLido[]) {
  const { erro, ctx, setor } = await coordenacao();
  if (erro || !ctx) return { error: erro ?? "Falha" } as const;
  const proposta = await propostaDoSetor(propostaId, ctx.tenantId, setor);
  if (!proposta || proposta.agentCode !== AGENTE_CONTRATO || !proposta.entityId) return { error: "Proposta não encontrada." } as const;
  const cadastrados = await getPrisma().companyPartner.findMany({
    where: { tenantId: ctx.tenantId, companyId: proposta.entityId },
    select: {
      id: true,
      name: true,
      document: true,
      documentMasked: true,
      exitDate: true,
      sharePercent: true,
      quotas: true,
      capitalAmount: true,
      administrator: true,
      qualification: true,
      entryDate: true,
    },
  });
  const conferidas = lerContrato({ socios: linhas, confianca: "MEDIA" });
  return {
    plano: planejarContrato(
      cadastrados.map((c) => ({
        ...c,
        sharePercent: c.sharePercent === null ? null : Number(c.sharePercent),
        capitalAmount: c.capitalAmount === null ? null : Number(c.capitalAmount),
      })),
      conferidas.socios
    ),
    avisos: conferidas.avisos,
  } as const;
}
