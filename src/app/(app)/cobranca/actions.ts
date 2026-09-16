"use server";

// Cobrança, do lado da equipe: contato, responsável, acordo (criar, quebrar,
// desfazer), baixa por perda e a configuração da régua.
//
// Toda escrita de mais de uma linha é uma transação, e toda mudança de estado é
// um `updateMany` condicionado ao estado lido: se alguém baixou o título
// enquanto outra pessoa montava o acordo, o acordo não nasce por cima do
// pagamento — a transação volta inteira com mensagem.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { getSectorUsers } from "@/lib/sectorUsers";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { competenciaDoInstante, instanteDaData } from "@/lib/financeiro/periodo";
import {
  validarContato,
  validarMotivoDaPerda,
  podeBaixarPorPerda,
  podeReverterPerda,
  statusDeVolta,
  TAMANHO_MAXIMO_DO_MOTIVO,
} from "@/lib/financeiro/cobranca/regras";
import {
  validarSelecaoDoAcordo,
  validarTermosDoAcordo,
  gerarParcelas,
  podeQuebrar,
  podeDesfazer,
  categoriaDasParcelas,
} from "@/lib/financeiro/cobranca/acordo";
import { lerPassos, textoDosPassos } from "@/lib/financeiro/cobranca/regua";
import { MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";

const MODULE = MODULO_DE_COBRANCA;

export type Resultado = { error: string } | { ok: true };
export type ResultadoDoAcordo = { error: string } | { ok: true; acordoId: string };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão na cobrança." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo de cobrança não habilitado." };
  return {
    ok: true as const,
    ctx,
    setor,
    tenantId: ctx.tenantId,
    userId: ctx.userId || null,
    gerencia: canManageSector(ctx, setor),
    prisma: getPrisma(),
  };
}

// A cobrança mexe no em aberto de `/receber`, no fluxo de caixa e na DRE
// econômica — e o portal mostra títulos e acordos.
function revalidar() {
  revalidatePath("/cobranca", "layout");
  for (const p of ["/receber", "/lancamentos", "/fluxo-de-caixa", "/dre/economica", "/dre/analises", "/portal/cobranca", "/portal", "/portal/receber"]) {
    revalidatePath(p);
  }
}

function texto(formData: FormData, k: string): string {
  return String(formData.get(k) ?? "").trim();
}

function hojeKey(): string {
  return saoPauloParts(new Date()).dateKey;
}

async function tituloDoTenant(prisma: ReturnType<typeof getPrisma>, tenantId: string, entryId: string) {
  return prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      closeReason: true,
      paidAt: true,
      dueDate: true,
      amount: true,
      agreementId: true,
      companyId: true,
      counterparty: { select: { name: true } },
      agreement: { select: { status: true } },
    },
  });
}

// ─── Contato ────────────────────────────────────────────────────────────────

export async function registrarContato(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const entryId = texto(formData, "entryId");
  const titulo = await tituloDoTenant(c.prisma, c.tenantId, entryId);
  if (!titulo || titulo.kind !== "RECEBER") return { error: "Título não encontrado." };
  // Pago e cancelado comum não estão em cobrança; renegociado cobra-se nas
  // parcelas. Perda aceita contato: é justamente o que se registra antes de
  // reverter uma perda porque o sacado reapareceu.
  if (titulo.status === "PAGO" || titulo.paidAt !== null) return { error: "Título pago não está em cobrança." };
  if (titulo.status === "CANCELADO" && titulo.closeReason !== "PERDA") {
    return { error: titulo.closeReason === "RENEGOCIADO" ? "Título renegociado — registre o contato numa parcela do acordo." : "Lançamento cancelado." };
  }

  const v = validarContato(
    {
      canal: texto(formData, "canal"),
      resultado: texto(formData, "resultado"),
      contatoEm: texto(formData, "contatoEm"),
      proximaAcao: texto(formData, "proximaAcao"),
      notas: String(formData.get("notas") ?? ""),
    },
    hojeKey()
  );
  if (!v.ok) return { error: v.erro };

  const criado = await c.prisma.collectionContact.create({
    data: {
      tenantId: c.tenantId,
      entryId: titulo.id,
      contactedAt: instanteDaData(v.dados.contatoKey),
      channel: v.dados.canal,
      outcome: v.dados.resultado,
      notes: v.dados.notas,
      nextActionAt: v.dados.proximaAcaoKey ? instanteDaData(v.dados.proximaAcaoKey) : null,
      userId: c.userId,
    },
    select: { id: true },
  });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.contact",
    entityType: "FinanceEntry",
    entityId: titulo.id,
    metadata: { contatoId: criado.id, canal: v.dados.canal, resultado: v.dados.resultado, proximaAcao: v.dados.proximaAcaoKey },
  });
  revalidar();
  return { ok: true };
}

// ─── Responsável ────────────────────────────────────────────────────────────

/** Atribui (ou tira, com `userId` vazio) o responsável pela cobrança do título. */
export async function atribuirResponsavel(entryId: string, userId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const titulo = await tituloDoTenant(c.prisma, c.tenantId, entryId);
  if (!titulo || titulo.kind !== "RECEBER") return { error: "Título não encontrado." };

  let nome: string | null = null;
  if (userId) {
    // Responsável é quem atua no setor que opera a cobrança neste tenant.
    const usuarios = await getSectorUsers(c.tenantId, c.setor);
    const u = usuarios.find((x) => x.id === userId);
    if (!u) return { error: "Usuário não encontrado no setor da cobrança." };
    nome = u.name;
  }

  await c.prisma.$transaction(async (tx) => {
    await tx.financeEntry.updateMany({ where: { id: titulo.id, tenantId: c.tenantId }, data: { collectionOwnerId: userId || null } });
    await tx.collectionEvent.create({
      data: { tenantId: c.tenantId, entryId: titulo.id, kind: "RESPONSAVEL_ALTERADO", reason: nome ?? "sem responsável", userId: c.userId },
    });
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.owner",
    entityType: "FinanceEntry",
    entityId: titulo.id,
    metadata: { responsavel: userId || null },
  });
  revalidar();
  return { ok: true };
}

// ─── Acordo ─────────────────────────────────────────────────────────────────

/**
 * Cria o acordo: encerra os originais como renegociados e cria as parcelas.
 *
 * Os originais são lidos de novo **e** atualizados um a um condicionados ao
 * status lido — cada um guarda o próprio status anterior, que é o que o
 * desfazer devolve.
 */
export async function criarAcordo(formData: FormData): Promise<ResultadoDoAcordo> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const ids = [...new Set(formData.getAll("entryIds").map((v) => String(v)).filter(Boolean))];
  if (ids.length === 0) return { error: "Escolha ao menos um título." };
  if (ids.length > 200) return { error: "Títulos demais num só acordo." };
  const hoje = hojeKey();

  const termos = validarTermosDoAcordo(
    {
      valor: texto(formData, "valor"),
      parcelas: texto(formData, "parcelas"),
      primeiroVencimento: texto(formData, "primeiroVencimento"),
      notas: String(formData.get("notas") ?? ""),
    },
    hoje
  );
  if (!termos.ok) return { error: termos.erro };

  try {
    const resumo = await c.prisma.$transaction(
      async (tx) => {
        const originais = await tx.financeEntry.findMany({
          where: { id: { in: ids }, tenantId: c.tenantId },
          select: {
            id: true,
            kind: true,
            status: true,
            closeReason: true,
            paidAt: true,
            companyId: true,
            counterpartyId: true,
            categoryId: true,
            dueDate: true,
            amount: true,
            agreementId: true,
            collectionOwnerId: true,
            counterparty: { select: { name: true } },
            agreement: { select: { status: true } },
          },
        });
        if (originais.length !== ids.length) throw new Recusa("Algum título escolhido não existe.");

        const titulos = originais.map((o) => ({
          id: o.id,
          kind: o.kind,
          status: o.status,
          closeReason: o.closeReason,
          paidAt: o.paidAt,
          companyId: o.companyId,
          counterpartyId: o.counterpartyId,
          vencimentoKey: saoPauloParts(o.dueDate).dateKey,
          valorCentavos: centavosDeDecimal(o.amount),
          statusDoAcordo: o.agreement?.status ?? null,
        }));
        const selecao = validarSelecaoDoAcordo(titulos, hoje);
        if (!selecao.ok) throw new Recusa(selecao.erro);

        const agora = new Date();
        const acordo = await tx.collectionAgreement.create({
          data: {
            tenantId: c.tenantId,
            companyId: selecao.companyId,
            counterpartyId: selecao.counterpartyId,
            originalAmount: decimalDeCentavos(selecao.originalCentavos),
            agreedAmount: decimalDeCentavos(termos.dados.acordadoCentavos),
            installments: termos.dados.parcelas,
            firstDueDate: instanteDaData(termos.dados.primeiroVencimentoKey),
            intervalMonths: 1,
            agreedAt: agora,
            status: "ATIVO",
            notes: termos.dados.notas,
            createdById: c.userId,
          },
          select: { id: true },
        });

        for (const o of originais) {
          const encerrado = await tx.financeEntry.updateMany({
            where: {
              id: o.id,
              tenantId: c.tenantId,
              kind: "RECEBER",
              status: o.status,
              closeReason: null,
              paidAt: null,
              agreementId: o.agreementId,
            },
            data: { status: "CANCELADO", closeReason: "RENEGOCIADO", statusBeforeClose: o.status, renegotiatedAgreementId: acordo.id },
          });
          if (encerrado.count !== 1) throw new Recusa(`${o.counterparty.name}: um título acabou de mudar (baixa ou cancelamento) — atualize a tela.`);
        }
        await tx.collectionEvent.createMany({
          data: originais.map((o) => ({ tenantId: c.tenantId, entryId: o.id, kind: "RENEGOCIADO" as const, agreementId: acordo.id, userId: c.userId })),
        });

        const sacado = originais[0]!.counterparty.name;
        const categoria = categoriaDasParcelas(originais.map((o) => ({ categoryId: o.categoryId, valorCentavos: centavosDeDecimal(o.amount) })));
        const responsavel = originais.find((o) => o.collectionOwnerId)?.collectionOwnerId ?? null;
        const parcelas = gerarParcelas({
          totalCentavos: termos.dados.acordadoCentavos,
          parcelas: termos.dados.parcelas,
          primeiroVencimentoKey: termos.dados.primeiroVencimentoKey,
        });
        for (const p of parcelas) {
          const vencimento = instanteDaData(p.vencimentoKey);
          await tx.financeEntry.create({
            data: {
              tenantId: c.tenantId,
              companyId: selecao.companyId,
              kind: "RECEBER",
              // Digitada por uma pessoa, como o lançamento manual: nasce conferida.
              status: "CONFERIDO",
              // Parcela é a receber — alçada é de contas a pagar e não se aplica.
              approvalStatus: "NAO_REQUER",
              counterpartyId: selecao.counterpartyId,
              categoryId: categoria,
              competence: competenciaDoInstante(vencimento),
              dueDate: vencimento,
              amount: decimalDeCentavos(p.valorCentavos),
              description: `Acordo — parcela ${p.numero}/${parcelas.length} · ${sacado}`.slice(0, 255),
              createdById: c.userId,
              reviewedById: c.userId,
              reviewedAt: agora,
              agreementId: acordo.id,
              collectionOwnerId: responsavel,
            },
          });
        }
        return { acordoId: acordo.id, companyId: selecao.companyId, originais: ids, original: selecao.originalCentavos };
      },
      { timeout: 30_000, maxWait: 10_000 }
    );

    await logAudit({
      tenantId: c.tenantId,
      userId: c.ctx.userId,
      action: "financeiro.collection.agreement_created",
      entityType: "CollectionAgreement",
      entityId: resumo.acordoId,
      metadata: {
        companyId: resumo.companyId,
        originais: resumo.originais,
        original: decimalDeCentavos(resumo.original),
        acordado: decimalDeCentavos(termos.dados.acordadoCentavos),
        parcelas: termos.dados.parcelas,
        primeiroVencimento: termos.dados.primeiroVencimentoKey,
      },
    });
    revalidar();
    return { ok: true, acordoId: resumo.acordoId };
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }
}

function motivoOpcional(bruto: string | null | undefined): { ok: true; motivo: string | null } | { ok: false; erro: string } {
  const m = (bruto ?? "").trim();
  if (m.length > TAMANHO_MAXIMO_DO_MOTIVO) return { ok: false, erro: `Motivo com mais de ${TAMANHO_MAXIMO_DO_MOTIVO} caracteres.` };
  return { ok: true, motivo: m === "" ? null : m };
}

/** Quebrado: as parcelas não pagas continuam em aberto e voltam à cobrança comum. */
export async function quebrarAcordo(acordoId: string, motivoBruto: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const m = motivoOpcional(motivoBruto);
  if (!m.ok) return { error: m.erro };

  try {
    await c.prisma.$transaction(async (tx) => {
      const a = await tx.collectionAgreement.findFirst({
        where: { id: acordoId, tenantId: c.tenantId },
        select: { id: true, status: true, parcelas: { select: { id: true, status: true, paidAt: true } } },
      });
      if (!a) throw new Recusa("Acordo não encontrado.");
      const v = podeQuebrar(a.status);
      if (!v.pode) throw new Recusa(v.motivo);
      const mudou = await tx.collectionAgreement.updateMany({
        where: { id: a.id, tenantId: c.tenantId, status: "ATIVO" },
        data: { status: "QUEBRADO", closedAt: new Date(), closedById: c.userId },
      });
      if (mudou.count !== 1) throw new Recusa("O acordo acabou de mudar — atualize a tela.");
      const abertas = a.parcelas.filter((p) => p.status !== "PAGO" && p.paidAt === null && p.status !== "CANCELADO");
      if (abertas.length > 0) {
        await tx.collectionEvent.createMany({
          data: abertas.map((p) => ({ tenantId: c.tenantId, entryId: p.id, kind: "ACORDO_QUEBRADO" as const, agreementId: a.id, reason: m.motivo, userId: c.userId })),
        });
      }
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.agreement_broken",
    entityType: "CollectionAgreement",
    entityId: acordoId,
    metadata: { motivo: m.motivo },
  });
  revalidar();
  return { ok: true };
}

/**
 * Desfaz: cancela as parcelas e devolve os originais ao em aberto, cada um ao
 * status que tinha. Só sem parcela paga — ver `podeDesfazer`.
 */
export async function desfazerAcordo(acordoId: string, motivoBruto: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const m = motivoOpcional(motivoBruto);
  if (!m.ok) return { error: m.erro };

  try {
    await c.prisma.$transaction(async (tx) => {
      const a = await tx.collectionAgreement.findFirst({
        where: { id: acordoId, tenantId: c.tenantId },
        select: {
          id: true,
          status: true,
          parcelas: { select: { id: true, status: true, closeReason: true, paidAt: true } },
          originais: { select: { id: true, status: true, closeReason: true, statusBeforeClose: true } },
        },
      });
      if (!a) throw new Recusa("Acordo não encontrado.");
      const v = podeDesfazer(a.status, a.parcelas);
      if (!v.pode) throw new Recusa(v.motivo);

      const mudou = await tx.collectionAgreement.updateMany({
        where: { id: a.id, tenantId: c.tenantId, status: a.status },
        data: { status: "DESFEITO", closedAt: new Date(), closedById: c.userId },
      });
      if (mudou.count !== 1) throw new Recusa("O acordo acabou de mudar — atualize a tela.");

      const vivas = a.parcelas.filter((p) => p.status !== "CANCELADO");
      const canceladas = await tx.financeEntry.updateMany({
        where: { agreementId: a.id, tenantId: c.tenantId, status: { in: ["PROVISORIO", "CONFERIDO"] }, paidAt: null, closeReason: null, bankMatch: { is: null } },
        data: { status: "CANCELADO", closeReason: "CANCELADO" },
      });
      if (canceladas.count !== vivas.length) throw new Recusa("Uma parcela acabou de ser baixada ou conciliada — atualize a tela.");

      // Só os que continuam encerrados por **este** acordo voltam.
      for (const o of a.originais.filter((x) => x.status === "CANCELADO" && x.closeReason === "RENEGOCIADO")) {
        const voltou = await tx.financeEntry.updateMany({
          where: { id: o.id, tenantId: c.tenantId, status: "CANCELADO", closeReason: "RENEGOCIADO", renegotiatedAgreementId: a.id },
          // O vínculo com o acordo fica, como histórico: quem manda é o motivo.
          data: { status: statusDeVolta(o.statusBeforeClose), closeReason: null, statusBeforeClose: null },
        });
        if (voltou.count !== 1) throw new Recusa("Um título original acabou de mudar — atualize a tela.");
      }
      if (a.originais.length > 0) {
        await tx.collectionEvent.createMany({
          data: a.originais.map((o) => ({ tenantId: c.tenantId, entryId: o.id, kind: "DEVOLVIDO_AO_ABERTO" as const, agreementId: a.id, reason: m.motivo, userId: c.userId })),
        });
      }
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.agreement_undone",
    entityType: "CollectionAgreement",
    entityId: acordoId,
    metadata: { motivo: m.motivo },
  });
  revalidar();
  return { ok: true };
}

// ─── Perda ──────────────────────────────────────────────────────────────────

/** Baixa por perda. Só a coordenação, com motivo. */
export async function baixarPorPerda(entryId: string, motivoBruto: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação baixa título por perda." };
  const motivo = validarMotivoDaPerda(motivoBruto);
  if (!motivo.ok) return { error: motivo.erro };

  const titulo = await tituloDoTenant(c.prisma, c.tenantId, entryId);
  if (!titulo) return { error: "Título não encontrado." };
  const v = podeBaixarPorPerda(
    {
      kind: titulo.kind,
      status: titulo.status,
      closeReason: titulo.closeReason,
      paidAt: titulo.paidAt,
      vencimentoKey: saoPauloParts(titulo.dueDate).dateKey,
      statusDoAcordo: titulo.agreement?.status ?? null,
    },
    hojeKey()
  );
  if (!v.pode) return { error: v.motivo };

  try {
    await c.prisma.$transaction(async (tx) => {
      const mudou = await tx.financeEntry.updateMany({
        where: {
          id: titulo.id,
          tenantId: c.tenantId,
          kind: "RECEBER",
          status: titulo.status,
          closeReason: null,
          paidAt: null,
          OR: [{ agreementId: null }, { agreement: { status: { not: "ATIVO" } } }],
        },
        data: {
          status: "CANCELADO",
          closeReason: "PERDA",
          statusBeforeClose: titulo.status,
          lossAt: new Date(),
          lossReason: motivo.motivo,
          lossById: c.userId,
        },
      });
      if (mudou.count !== 1) throw new Recusa("O título acabou de mudar — atualize a tela.");
      await tx.collectionEvent.create({
        data: { tenantId: c.tenantId, entryId: titulo.id, kind: "PERDA", reason: motivo.motivo, userId: c.userId },
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.loss",
    entityType: "FinanceEntry",
    entityId: titulo.id,
    metadata: { valor: titulo.amount.toString(), contraparte: titulo.counterparty.name, motivo: motivo.motivo },
  });
  revalidar();
  return { ok: true };
}

/**
 * Reverte a perda: o título volta ao em aberto e sai da linha de perdas da DRE
 * econômica (a perda deixa de existir). O evento fica — é a prova de que houve
 * perda e de quem voltou atrás.
 */
export async function reverterPerda(entryId: string, motivoBruto: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação reverte baixa por perda." };
  const m = motivoOpcional(motivoBruto);
  if (!m.ok) return { error: m.erro };

  const titulo = await c.prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId: c.tenantId },
    select: { id: true, status: true, closeReason: true, statusBeforeClose: true, amount: true, lossReason: true },
  });
  if (!titulo) return { error: "Título não encontrado." };
  const v = podeReverterPerda(titulo);
  if (!v.pode) return { error: v.motivo };

  try {
    await c.prisma.$transaction(async (tx) => {
      const mudou = await tx.financeEntry.updateMany({
        where: { id: titulo.id, tenantId: c.tenantId, status: "CANCELADO", closeReason: "PERDA" },
        data: {
          status: statusDeVolta(titulo.statusBeforeClose),
          closeReason: null,
          statusBeforeClose: null,
          lossAt: null,
          lossReason: null,
          lossById: null,
        },
      });
      if (mudou.count !== 1) throw new Recusa("O título acabou de mudar — atualize a tela.");
      await tx.collectionEvent.create({
        data: { tenantId: c.tenantId, entryId: titulo.id, kind: "PERDA_REVERTIDA", reason: m.motivo, userId: c.userId },
      });
    });
  } catch (err) {
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.loss_reverted",
    entityType: "FinanceEntry",
    entityId: titulo.id,
    metadata: { valor: titulo.amount.toString(), motivoDaPerda: titulo.lossReason, motivo: m.motivo },
  });
  revalidar();
  return { ok: true };
}

// ─── Régua ──────────────────────────────────────────────────────────────────

/** Liga, desliga e define os passos. Só a coordenação: é e-mail a terceiro em nome do cliente. */
export async function salvarRegua(formData: FormData): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação configura a régua." };
  const passos = lerPassos(texto(formData, "passos"));
  if (!passos.ok) return { error: passos.erro };
  const ligada = texto(formData, "ligada") === "1";

  await c.prisma.collectionReminderConfig.upsert({
    where: { tenantId: c.tenantId },
    create: { tenantId: c.tenantId, enabled: ligada, steps: textoDosPassos(passos.passos), updatedById: c.userId },
    update: { enabled: ligada, steps: textoDosPassos(passos.passos), updatedById: c.userId },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.collection.reminder_config",
    entityType: "CollectionReminderConfig",
    entityId: c.tenantId,
    metadata: { ligada, passos: passos.passos },
  });
  revalidar();
  return { ok: true };
}

/** Tira a empresa da régua (ou devolve). */
export async function alternarEmpresaNaRegua(companyId: string, fora: boolean): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!c.gerencia) return { error: "Só a coordenação altera a régua." };
  const empresa = await c.prisma.company.findFirst({ where: { id: companyId, tenantId: c.tenantId }, select: { id: true } });
  if (!empresa) return { error: "Empresa não encontrada." };

  if (fora) {
    // Idempotente: tirar de novo quem já está fora não é erro.
    await c.prisma.collectionReminderOptOut.upsert({
      where: { companyId: empresa.id },
      create: { tenantId: c.tenantId, companyId: empresa.id, createdById: c.userId },
      update: {},
    });
  } else {
    await c.prisma.collectionReminderOptOut.deleteMany({ where: { tenantId: c.tenantId, companyId: empresa.id } });
  }
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: fora ? "financeiro.collection.reminder_opt_out" : "financeiro.collection.reminder_opt_in",
    entityType: "Company",
    entityId: empresa.id,
  });
  revalidar();
  return { ok: true };
}
