// A execução do lembrete de pendência vencida — o que o cron
// `/api/cron/pendencias-lembrete` chama. O veredito de cada pendência é
// `avaliarLembrete`; aqui só se busca, se reserva o passo e se envia.
//
// ─── Idempotência: reservar antes de enviar ──────────────────────────────────
//
// Igual à régua de cobrança: o registro (pendência, passo) é gravado **antes**
// do e-mail, e o unique da tabela decide entre duas execuções simultâneas (o
// n8n repetindo uma chamada que demorou). Uma queda entre a reserva e o envio
// deixa o passo marcado sem e-mail, e ele não é retentado — fica na ficha da
// pendência como "enviando" que nunca terminou. Reenviar sozinho arriscaria o
// mesmo lembrete em dobro, e é o cliente do escritório que recebe.
//
// ─── O que não reserva ───────────────────────────────────────────────────────
//
// Tenant sem SMTP e empresa sem usuário ativo no portal não gravam nada: o
// passo continua devido e sai na execução seguinte, quando o SMTP for
// configurado ou alguém ganhar acesso ao portal — dentro da janela do passo.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { isModuleEnabled } from "@/lib/modules";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { sendPendenciaAoClienteEmail, temSmtpConfigurado } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import { usuariosDoPortalDaEmpresa } from "./avisos";
import {
  avaliarLembrete,
  PASSOS_DO_LEMBRETE,
  JANELA_DO_ULTIMO_LEMBRETE,
  RESERVA_DO_LEMBRETE,
  type MotivoSemLembrete,
} from "./lembrete";

export const MODULO_DE_PENDENCIAS = "bpo_pendencias";

/** Pendências lembradas por execução, somando todos os tenants. O cron chama de novo se sobrar. */
export const LIMITE_PADRAO_DE_LEMBRETES = 200;
const PAGINA = 500;
const DIA = 86_400_000;

export type ResultadoDosLembretes = {
  tenants: number;
  tenantsSemSmtp: number;
  avaliadas: number;
  /** Pendências cujo lembrete saiu para todos os destinatários. */
  enviadas: number;
  /** Pendências com ao menos um e-mail que falhou. */
  comFalha: number;
  /** Passo que outra execução reservou primeiro. */
  jaReservadas: number;
  semDestinatario: number;
  puladas: Partial<Record<MotivoSemLembrete, number>>;
  /** O limite foi atingido antes de acabar: chamar de novo. */
  maisPendentes: boolean;
};

export async function executarLembretesDePendencia(opcoes: { limite?: number; agora?: Date } = {}): Promise<ResultadoDosLembretes> {
  const prisma = getPrisma();
  const agora = opcoes.agora ?? new Date();
  const hojeKey = saoPauloParts(agora).dateKey;
  const limite = Math.max(1, Math.min(opcoes.limite ?? LIMITE_PADRAO_DE_LEMBRETES, 1000));
  const r: ResultadoDosLembretes = {
    tenants: 0,
    tenantsSemSmtp: 0,
    avaliadas: 0,
    enviadas: 0,
    comFalha: 0,
    jaReservadas: 0,
    semDestinatario: 0,
    puladas: {},
    maisPendentes: false,
  };

  // Só o intervalo de prazo em que algum passo pode estar devido, com um dia de
  // folga de cada lado — quem decide é `avaliarLembrete`, não a consulta.
  const meioDiaDeHoje = new Date(`${hojeKey}T12:00:00-03:00`).getTime();
  const menor = PASSOS_DO_LEMBRETE[0]!;
  const maior = PASSOS_DO_LEMBRETE.at(-1)!;
  const venceuAte = new Date(meioDiaDeHoje - (menor - 1) * DIA);
  const venceuDesde = new Date(meioDiaDeHoje - (maior + JANELA_DO_ULTIMO_LEMBRETE + 1) * DIA);
  const noIntervalo = { status: "ABERTA" as const, dueDate: { gte: venceuDesde, lte: venceuAte } };

  const porTenant = await prisma.clientRequest.groupBy({ by: ["tenantId"], where: noIntervalo });

  for (const { tenantId } of porTenant) {
    if (r.enviadas + r.comFalha >= limite) {
      r.maisPendentes = true;
      break;
    }
    if (!(await isModuleEnabled(tenantId, MODULO_DE_PENDENCIAS))) continue;
    r.tenants += 1;

    if (!(await temSmtpConfigurado(tenantId))) {
      r.tenantsSemSmtp += 1;
      console.warn(`[cron/pendencias-lembrete] tenant ${tenantId} com pendência vencida e sem SMTP configurado`);
      continue;
    }

    // Os destinatários são por empresa; uma empresa costuma ter várias pendências.
    const destinatariosDa = new Map<string, Awaited<ReturnType<typeof usuariosDoPortalDaEmpresa>>>();

    let cursor: string | null = null;
    for (;;) {
      if (r.enviadas + r.comFalha >= limite) {
        r.maisPendentes = true;
        break;
      }
      const pagina: Awaited<ReturnType<typeof buscarPagina>> = await buscarPagina(tenantId, noIntervalo, cursor);
      if (pagina.length === 0) break;
      cursor = pagina.at(-1)!.id;

      for (const p of pagina) {
        if (r.enviadas + r.comFalha >= limite) {
          r.maisPendentes = true;
          break;
        }
        r.avaliadas += 1;
        const veredito = avaliarLembrete(
          { status: p.status, prazoKey: p.dueDate ? saoPauloParts(p.dueDate).dateKey : null, enviados: p.reminders.map((l) => l.step) },
          hojeKey
        );
        if (veredito.enviar === null) {
          r.puladas[veredito.motivo] = (r.puladas[veredito.motivo] ?? 0) + 1;
          continue;
        }

        let destinatarios = destinatariosDa.get(p.companyId);
        if (!destinatarios) {
          destinatarios = await usuariosDoPortalDaEmpresa(tenantId, p.companyId);
          destinatariosDa.set(p.companyId, destinatarios);
        }
        if (destinatarios.length === 0) {
          r.semDestinatario += 1;
          continue;
        }

        let registroId: string;
        try {
          const registro = await prisma.clientRequestReminder.create({
            data: { tenantId, requestId: p.id, step: veredito.enviar, recipients: destinatarios.length, ok: false, error: RESERVA_DO_LEMBRETE },
            select: { id: true },
          });
          registroId = registro.id;
        } catch (err) {
          if (isPrismaUniqueError(err)) {
            r.jaReservadas += 1;
            continue;
          }
          throw err;
        }

        // O push acompanha o lembrete, mas fica fora da contabilidade do
        // `ClientRequestReminder`: o registro é do envio de e-mail, que é o que
        // a régua reserva por passo. Contar push ali faria o passo parecer
        // entregue a quem não recebeu e-mail nenhum.
        const [envio] = await Promise.all([
          sendPendenciaAoClienteEmail({
            tenantId,
            destinatarios: destinatarios.map((u) => ({ email: u.email, nome: u.name })),
            requestId: p.id,
            titulo: p.title,
            motivo: "lembrete",
            prazo: p.dueDate,
          }),
          avisarClientePorPush(tenantId, destinatarios.map((u) => u.id), {
            tipo: "pendencia",
            motivo: "lembrete",
            titulo: p.title,
            requestId: p.id,
          }),
        ]);
        const falhas = envio.semSmtp ? destinatarios.length : envio.falhas;
        await prisma.clientRequestReminder.update({
          where: { id: registroId },
          data: {
            ok: falhas === 0,
            failures: falhas,
            error:
              falhas === 0
                ? null
                : envio.semSmtp
                  ? "SMTP do workspace não configurado no momento do envio."
                  : `${falhas} de ${destinatarios.length} e-mail(s) falharam — ver o log do servidor.`,
            sentAt: new Date(),
          },
        });
        if (falhas === 0) r.enviadas += 1;
        else r.comFalha += 1;
      }
      if (pagina.length < PAGINA) break;
    }
  }
  return r;
}

async function buscarPagina(
  tenantId: string,
  noIntervalo: { status: "ABERTA"; dueDate: { gte: Date; lte: Date } },
  cursor: string | null
) {
  return getPrisma().clientRequest.findMany({
    where: { tenantId, ...noIntervalo, ...(cursor ? { id: { gt: cursor } } : {}) },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      companyId: true,
      reminders: { select: { step: true } },
    },
    orderBy: { id: "asc" },
    take: PAGINA,
  });
}
