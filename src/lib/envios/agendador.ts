// O que os envios ao cliente fazem sozinhos (22/10/2026), no agendador interno
// (`startAlertScheduler`, a cada 15 minutos): o envio agendado sai na hora
// marcada, e o lembrete de não lido sai quando o prazo vence.
//
// ─── Nunca em dobro: travar antes de enviar ──────────────────────────────────
//
// Os dois passos gravam a trava com um `updateMany` condicional ANTES de
// mandar qualquer e-mail — a mesma régua da repetição das contas e do
// lembrete de pendência. Duas passadas ao mesmo tempo (dois processos, ou o
// "Enviar agora" da tela no mesmo minuto) disputam a mesma linha, e só a que
// mudou a linha (`count === 1`) envia:
// - agendado: `status DRAFT → PUBLISHED` com a data ainda marcada;
// - lembrete: `reminderSentAt null → agora`.
// Uma queda entre a trava e o e-mail deixa o passo dado sem e-mail, e ele não
// é retentado: mandar de novo sozinho arriscaria o cliente receber duas vezes.
// O e-mail que falha fica sem `sentAt` na ficha ("o e-mail não saiu — use
// Reenviar"), como no envio feito pela tela.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/modules";
import { generateRecipientToken } from "@/lib/clientDocuments";
import { sendClientDocumentEmail } from "@/lib/email/sendMail";
import { avisarClientePorPush } from "@/lib/portal/avisos";
import { usuariosAtivosDasEmpresas } from "@/lib/portal/empresasDaContaDb";
import { emailDoDestinatario } from "./regras";
import { emailsDoAgendamento } from "./agendamento";
import { avaliarLembreteDoEnvio, publicadoAteParaLembrete } from "./lembrete";

/** Envios tratados por passada, em cada passo; o resto sai na próxima (15 min). */
const POR_PASSADA = 50;

// ─── O e-mail do envio ───────────────────────────────────────────────────────

export type ResultadoDaEntrega = { enviados: string[]; falhas: string[] };

/**
 * Manda o envio por e-mail a cada endereço: a linha de destinatário do
 * endereço (a que já existe, ou uma nova com token próprio) e o e-mail com o
 * link dela. `sentAt` só é gravado no e-mail que saiu. Usado pela tela
 * ("Enviar por e-mail") e pelo envio agendado.
 */
export async function entregarPorEmail(input: {
  tenantId: string;
  documento: { id: string; title: string; fileUrl: string | null };
  empresaNome: string;
  remetente: string;
  emails: Iterable<string>;
}): Promise<ResultadoDaEntrega> {
  const prisma = getPrisma();
  const r: ResultadoDaEntrega = { enviados: [], falhas: [] };
  for (const bruto of input.emails) {
    const email = emailDoDestinatario(bruto);
    let recipient = await prisma.clientDocumentRecipient.findFirst({ where: { clientDocumentId: input.documento.id, email } });
    if (!recipient) {
      recipient = await prisma.clientDocumentRecipient.create({
        data: { clientDocumentId: input.documento.id, email, token: generateRecipientToken() },
      });
    }
    const envio = await sendClientDocumentEmail({
      tenantId: input.tenantId,
      to: email,
      documentTitle: input.documento.title,
      viewToken: recipient.token,
      companyName: input.empresaNome,
      senderName: input.remetente,
      hasAttachment: !!input.documento.fileUrl,
    });
    if (envio.ok) {
      await prisma.clientDocumentRecipient.update({ where: { id: recipient.id }, data: { sentAt: new Date() } });
      r.enviados.push(email);
    } else {
      r.falhas.push(`${email}: ${envio.error}`);
    }
  }
  return r;
}

// ─── O envio agendado ────────────────────────────────────────────────────────

export type ResultadoDoAgendado = { publicado: false } | ({ publicado: true } & ResultadoDaEntrega);

/**
 * Publica o rascunho agendado e manda os e-mails escolhidos no agendamento.
 * `vencidoAte`: o agendador só pega o que já venceu; o "Enviar agora" da tela
 * não passa data. `por`: quem mandou já (a tela), ou `null` (o agendador).
 * Devolve `publicado: false` quando outra passada publicou antes, o
 * agendamento foi cancelado ou o envio não existe — e nada é enviado.
 */
export async function publicarEnvioAgendado(
  id: string,
  opcoes: { agora: Date; vencidoAte?: Date; por: { userId: string; tenantId: string } | null }
): Promise<ResultadoDoAgendado> {
  const prisma = getPrisma();
  const trava = await prisma.clientDocument.updateMany({
    where: {
      id,
      status: "DRAFT",
      scheduledFor: opcoes.vencidoAte ? { not: null, lte: opcoes.vencidoAte } : { not: null },
      ...(opcoes.por ? { tenantId: opcoes.por.tenantId } : {}),
    },
    data: { status: "PUBLISHED", publishedAt: opcoes.agora },
  });
  if (trava.count !== 1) return { publicado: false };

  const doc = await prisma.clientDocument.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      title: true,
      fileUrl: true,
      scheduledEmails: true,
      company: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!doc) return { publicado: false };

  const emails = emailsDoAgendamento(doc.scheduledEmails);
  let remetente = doc.createdBy.name;
  if (opcoes.por) {
    const quem = await prisma.user.findUnique({ where: { id: opcoes.por.userId }, select: { name: true } });
    remetente = quem?.name ?? remetente;
  }
  const entrega = emails.length
    ? await entregarPorEmail({ tenantId: doc.tenantId, documento: doc, empresaNome: doc.company.name, remetente, emails })
    : { enviados: [], falhas: [] };

  await logAudit({
    tenantId: doc.tenantId,
    userId: opcoes.por?.userId ?? "",
    action: opcoes.por ? "clientDocument.scheduled_send_now" : "clientDocument.scheduled_send",
    entityType: "ClientDocument",
    entityId: doc.id,
    metadata: { title: doc.title, emails: entrega.enviados, falhas: entrega.falhas.length },
  });
  return { publicado: true, ...entrega };
}

/** Os agendados cuja hora chegou, de todos os escritórios. */
export async function enviarAgendadosVencidos(opcoes: { agora?: Date } = {}): Promise<{ publicados: number; emails: number; falhas: number }> {
  const agora = opcoes.agora ?? new Date();
  const vencidos = await getPrisma().clientDocument.findMany({
    where: { status: "DRAFT", scheduledFor: { not: null, lte: agora }, tenant: { active: true } },
    orderBy: { scheduledFor: "asc" },
    take: POR_PASSADA,
    select: { id: true },
  });
  const r = { publicados: 0, emails: 0, falhas: 0 };
  for (const { id } of vencidos) {
    try {
      const feito = await publicarEnvioAgendado(id, { agora, vencidoAte: agora, por: null });
      if (!feito.publicado) continue;
      r.publicados += 1;
      r.emails += feito.enviados.length;
      r.falhas += feito.falhas.length;
    } catch (err) {
      console.error(`[envios] falha no envio agendado ${id}`, err);
    }
  }
  return r;
}

// ─── O lembrete de não lido ──────────────────────────────────────────────────

/** Os lembretes vencidos, de todos os escritórios: um por envio, nunca dois. */
export async function enviarLembretesDevidos(opcoes: { agora?: Date } = {}): Promise<{ lembrados: number; emails: number; falhas: number }> {
  const prisma = getPrisma();
  const agora = opcoes.agora ?? new Date();
  const candidatos = await prisma.clientDocument.findMany({
    where: {
      status: "PUBLISHED",
      reminderDays: { not: null },
      reminderSentAt: null,
      publishedAt: { lte: publicadoAteParaLembrete(agora) },
      recipients: { none: { firstViewedAt: { not: null } } },
      tenant: { active: true },
    },
    orderBy: { publishedAt: "asc" },
    take: POR_PASSADA,
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      title: true,
      fileUrl: true,
      status: true,
      publishedAt: true,
      reminderDays: true,
      reminderSentAt: true,
      company: { select: { name: true } },
      createdBy: { select: { name: true } },
      recipients: { select: { id: true, email: true, token: true, sentAt: true, firstViewedAt: true, signedAt: true } },
    },
  });

  const r = { lembrados: 0, emails: 0, falhas: 0 };
  const canalDo = new Map<string, boolean>();
  for (const d of candidatos) {
    if (!avaliarLembreteDoEnvio(d, agora).devido) continue;
    try {
      const trava = await prisma.clientDocument.updateMany({
        where: { id: d.id, status: "PUBLISHED", reminderSentAt: null },
        data: { reminderSentAt: agora },
      });
      if (trava.count !== 1) continue;
      r.lembrados += 1;

      // O e-mail: a quem recebeu o envio por e-mail (a linha com `sentAt`).
      const enviados: string[] = [];
      for (const linha of d.recipients.filter((l) => l.sentAt)) {
        const envio = await sendClientDocumentEmail({
          tenantId: d.tenantId,
          to: linha.email,
          documentTitle: d.title,
          viewToken: linha.token,
          companyName: d.company.name,
          senderName: d.createdBy.name,
          hasAttachment: !!d.fileUrl,
          lembrete: true,
        });
        if (envio.ok) enviados.push(linha.email);
        else r.falhas += 1;
      }
      r.emails += enviados.length;

      // O push: a quem tem portal da empresa, se o portal mostra envios.
      if (!canalDo.has(d.tenantId)) canalDo.set(d.tenantId, await isModuleEnabled(d.tenantId, "portal_solicitacoes"));
      let push = 0;
      if (canalDo.get(d.tenantId)) {
        const usuarios = await usuariosAtivosDasEmpresas(d.tenantId, [d.companyId]);
        if (usuarios.length > 0) {
          await avisarClientePorPush(d.tenantId, usuarios.map((u) => u.id), { tipo: "envio", motivo: "lembrete", titulo: d.title, id: d.id });
          push = usuarios.length;
        }
      }

      await logAudit({
        tenantId: d.tenantId,
        userId: "", // o agendador: sem pessoa (vira null na trilha)
        action: "clientDocument.reminder",
        entityType: "ClientDocument",
        entityId: d.id,
        metadata: { title: d.title, dias: d.reminderDays, emails: enviados, push },
      });
    } catch (err) {
      console.error(`[envios] falha no lembrete do envio ${d.id}`, err);
    }
  }
  return r;
}

/** Os dois passos, na ordem: o agendado que sai agora ainda não tem lembrete devido. */
export async function rodarEnviosAutomaticos(opcoes: { agora?: Date } = {}) {
  const agendados = await enviarAgendadosVencidos(opcoes);
  const lembretes = await enviarLembretesDevidos(opcoes);
  return { agendados, lembretes };
}
