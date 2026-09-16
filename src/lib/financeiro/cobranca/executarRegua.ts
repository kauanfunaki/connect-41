// A execução da régua de cobrança — o que o cron `/api/cron/cobranca-regua`
// chama. O veredito de cada título é `avaliarRegua`; aqui só se busca, se
// reserva o passo e se envia.
//
// ─── Idempotência: reservar antes de enviar ──────────────────────────────────
//
// O log (título, passo) é gravado **antes** do e-mail, com `ok: false`, e o
// unique da tabela é quem decide: duas execuções simultâneas (o n8n repetindo
// uma chamada que demorou) chegam juntas no `create`, e só uma passa. Gravar
// depois do envio abriria a janela em que as duas enviam e só uma registra.
//
// O preço é que uma queda **entre** a reserva e o envio deixa o passo marcado
// sem e-mail — e ele não é retentado. Fica visível na aba Régua como erro
// ("enviando" que nunca terminou). Reenviar sozinho seria arriscar o e-mail em
// dobro a um terceiro, que é o defeito que a régua não pode ter.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { isModuleEnabled } from "@/lib/modules";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { abrirEnvioDeCobranca } from "@/lib/email/sendMail";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "../contas";
import { diasEntre } from "../periodo";
import { situacaoDeCobranca } from "./regras";
import { avaliarRegua, lerPassos, JANELA_DO_ULTIMO_PASSO, type MotivoForaDaRegua } from "./regua";
import { MODULO_DE_COBRANCA, whereVencidosEmAberto } from "./consultas";

/** Envios por execução, somando todos os tenants. O cron chama de novo se sobrar. */
export const LIMITE_PADRAO_DE_ENVIOS = 200;
const PAGINA = 500;
const RESERVA = "enviando";

export type ResultadoDaRegua = {
  tenants: number;
  tenantsSemSmtp: number;
  avaliados: number;
  enviados: number;
  falhas: number;
  /** Passo que outra execução reservou primeiro. */
  jaReservados: number;
  pulados: Partial<Record<MotivoForaDaRegua, number>>;
  /** O limite de envios foi atingido antes de acabar: chamar de novo. */
  maisPendentes: boolean;
};

export async function executarReguaDeCobranca(opcoes: { limite?: number; agora?: Date } = {}): Promise<ResultadoDaRegua> {
  const prisma = getPrisma();
  const agora = opcoes.agora ?? new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const limite = Math.max(1, Math.min(opcoes.limite ?? LIMITE_PADRAO_DE_ENVIOS, 1000));
  const r: ResultadoDaRegua = { tenants: 0, tenantsSemSmtp: 0, avaliados: 0, enviados: 0, falhas: 0, jaReservados: 0, pulados: {}, maisPendentes: false };

  const configs = await prisma.collectionReminderConfig.findMany({ where: { enabled: true }, select: { tenantId: true, steps: true } });

  for (const cfg of configs) {
    if (r.enviados + r.falhas >= limite) {
      r.maisPendentes = true;
      break;
    }
    const passos = lerPassos(cfg.steps);
    if (!passos.ok) continue;
    if (!(await isModuleEnabled(cfg.tenantId, MODULO_DE_COBRANCA))) continue;
    r.tenants += 1;

    const enviar = await abrirEnvioDeCobranca(cfg.tenantId);
    if (!enviar) {
      // Sem SMTP nada é reservado: quando o SMTP for configurado, o passo do
      // dia ainda está devido e sai na execução seguinte.
      r.tenantsSemSmtp += 1;
      console.warn(`[cron/cobranca-regua] tenant ${cfg.tenantId} com régua ligada e sem SMTP configurado`);
      continue;
    }

    const fora = await prisma.collectionReminderOptOut.findMany({ where: { tenantId: cfg.tenantId }, select: { companyId: true } });
    const menor = passos.passos[0]!;
    const maior = passos.passos.at(-1)!;
    const dia = 86_400_000;
    // Só o intervalo de vencimento em que algum passo pode estar devido: menos
    // que o menor passo ainda não chegou; mais que o maior + janela já passou.
    const venceuAte = new Date(`${hojeKey}T12:00:00-03:00`).getTime() - menor * dia;
    const venceuDesde = new Date(`${hojeKey}T12:00:00-03:00`).getTime() - (maior + JANELA_DO_ULTIMO_PASSO) * dia;

    let cursor: string | null = null;
    for (;;) {
      if (r.enviados + r.falhas >= limite) {
        r.maisPendentes = true;
        break;
      }
      const pagina: Awaited<ReturnType<typeof buscarPagina>> = await buscarPagina(cfg.tenantId, hojeKey, fora.map((f) => f.companyId), venceuDesde, venceuAte, cursor);
      if (pagina.length === 0) break;
      cursor = pagina.at(-1)!.id;

      for (const t of pagina) {
        if (r.enviados + r.falhas >= limite) {
          r.maisPendentes = true;
          break;
        }
        r.avaliados += 1;
        const vencimentoKey = saoPauloParts(t.dueDate).dateKey;
        const c = t.collectionContacts[0];
        const ultimoContato = c
          ? { resultado: c.outcome, contatoKey: saoPauloParts(c.contactedAt).dateKey, proximaAcaoKey: c.nextActionAt ? saoPauloParts(c.nextActionAt).dateKey : null }
          : null;
        const situacao = situacaoDeCobranca(
          { status: t.status, closeReason: t.closeReason, paidAt: t.paidAt, vencimentoKey, statusDoAcordo: t.agreement?.status ?? null, ultimoContato },
          hojeKey
        );
        const veredito = avaliarRegua(
          { situacao, vencimentoKey, ultimoContato, email: t.counterparty.email, empresaForaDaRegua: false, enviados: t.reminderLogs.map((l) => l.step) },
          { ligada: true, passos: passos.passos },
          hojeKey
        );
        if (veredito.enviar === null) {
          r.pulados[veredito.motivo] = (r.pulados[veredito.motivo] ?? 0) + 1;
          continue;
        }

        const para = t.counterparty.email!;
        let logId: string;
        try {
          const log = await prisma.collectionReminderLog.create({
            data: { tenantId: cfg.tenantId, entryId: t.id, step: veredito.enviar, to: para, ok: false, error: RESERVA },
            select: { id: true },
          });
          logId = log.id;
        } catch (err) {
          if (isPrismaUniqueError(err)) {
            r.jaReservados += 1;
            continue;
          }
          throw err;
        }

        const envio = await enviar({
          para,
          empresaNome: nomeExibicao(t.company),
          sacadoNome: t.counterparty.name,
          valorCentavos: centavosDeDecimal(t.amount),
          vencimento: t.dueDate,
          diasDeAtraso: diasEntre(vencimentoKey, hojeKey),
          descricao: t.description,
        });
        await prisma.collectionReminderLog.update({
          where: { id: logId },
          data: envio.ok ? { ok: true, error: null, sentAt: new Date() } : { ok: false, error: envio.error.slice(0, 500), sentAt: new Date() },
        });
        if (envio.ok) r.enviados += 1;
        else r.falhas += 1;
      }
      if (pagina.length < PAGINA) break;
    }
  }
  return r;
}

async function buscarPagina(
  tenantId: string,
  hojeKey: string,
  empresasFora: string[],
  venceuDesde: number,
  venceuAte: number,
  cursor: string | null
) {
  const prisma = getPrisma();
  const base = whereVencidosEmAberto({ tenantId, companyIds: null }, hojeKey);
  return prisma.financeEntry.findMany({
    where: {
      ...base,
      AND: [{ dueDate: { gte: new Date(venceuDesde - 86_400_000), lte: new Date(venceuAte + 86_400_000) } }],
      ...(empresasFora.length > 0 ? { companyId: { notIn: empresasFora } } : {}),
      counterparty: { email: { not: null } },
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    select: {
      id: true,
      status: true,
      closeReason: true,
      paidAt: true,
      amount: true,
      dueDate: true,
      description: true,
      company: { select: { name: true, displayName: true } },
      counterparty: { select: { name: true, email: true } },
      agreement: { select: { status: true } },
      collectionContacts: {
        orderBy: [{ contactedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { outcome: true, contactedAt: true, nextActionAt: true },
      },
      reminderLogs: { select: { step: true } },
    },
    orderBy: { id: "asc" },
    take: PAGINA,
  });
}
