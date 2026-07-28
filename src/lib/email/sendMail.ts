import nodemailer from "nodemailer";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { formatInstantDateTime } from "@/lib/format";

export type SmtpTestConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export type SmtpResult = { ok: true } | { ok: false; error: string };

export async function verifySmtpConnection(config: SmtpTestConfig): Promise<SmtpResult> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  });
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao conectar ao servidor SMTP." };
  }
}

async function getTenantTransport(tenantId: string) {
  const prisma = getPrisma();
  const config = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId } });
  if (!config) return null;
  const password = decryptSecret(config.passwordEnc);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
  });
  return { transporter, config };
}

// Casco HTML compartilhado — table-based (não div solta) pra renderizar
// direito em clientes de e-mail antigos (Outlook/Gmail via tabela), com
// <head>/meta de verdade em vez de só um <div> flutuando sem <html>. Usado
// hoje só no e-mail de Documentos para Cliente (o único reportado como
// "parecendo amador"); os demais e-mails transacionais deste arquivo ainda
// usam o template antigo — dá pra migrar depois se fizer sentido.
function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title></title>
  </head>
  <body style="margin:0; padding:0; background:#F1F3FA;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F3FA;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background:#FFFFFF; border-radius:12px; overflow:hidden; border:1px solid #E1E5F0; font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background:#1F5EEA; padding:18px 28px;">
                <span style="font-size:16px; font-weight:700; color:#FFFFFF; letter-spacing:-0.2px;">Connect</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px; border-top:1px solid #E1E5F0; background:#F8F9FC;">
                <p style="margin:0; font-size:11px; color:#7B81A0; line-height:1.5; font-family:Arial,Helvetica,sans-serif;">
                  Este e-mail foi enviado automaticamente pelo Connect. Se você não esperava esta mensagem, pode ignorá-la com segurança.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type SendClientDocumentEmailInput = {
  tenantId: string;
  to: string;
  documentTitle: string;
  viewToken: string;
  companyName: string;
  senderName: string;
  hasAttachment: boolean;
};

// Propositalmente NÃO envia o corpo do documento nem o anexo dentro do e-mail —
// só um convite com o link de visualização. Se o conteúdo inteiro fosse
// entregue no próprio e-mail, o cliente poderia lê-lo sem nunca abrir o link,
// e aí a "prova de visualização" (todo o motivo do módulo existir) nunca
// seria registrada.
export async function sendClientDocumentEmail(input: SendClientDocumentEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return {
      ok: false,
      error: "Nenhuma configuração de SMTP cadastrada para este workspace. Configure em Admin > Empresa (Tenant).",
    };
  }
  const { transporter, config } = transport;

  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const viewUrl = `${baseUrl}/d/${input.viewToken}`;

  const html = emailShell(`
    <p style="font-size:14px; line-height:1.6; color:#171A2B; margin:0 0 12px; font-family:Arial,Helvetica,sans-serif;">Olá,</p>
    <p style="font-size:14px; line-height:1.6; color:#171A2B; margin:0 0 18px; font-family:Arial,Helvetica,sans-serif;">
      <strong>${escapeHtml(input.senderName)}</strong> enviou um novo documento para
      <strong>${escapeHtml(input.companyName)}</strong>:
    </p>
    <p style="font-size:16px; font-weight:600; color:#171A2B; margin:0 0 22px; padding:14px 16px; background:#F1F3FA; border-radius:8px; border-left:3px solid #1F5EEA; font-family:Arial,Helvetica,sans-serif;">
      ${escapeHtml(input.documentTitle)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:8px; background:#1F5EEA;">
          <a href="${viewUrl}" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none; font-family:Arial,Helvetica,sans-serif;">
            Visualizar documento
          </a>
        </td>
      </tr>
    </table>
    ${
      input.hasAttachment
        ? `<p style="font-size:13px; color:#4B5170; margin:0 0 18px; font-family:Arial,Helvetica,sans-serif;">📎 O documento inclui um arquivo anexo, disponível para download na página de visualização.</p>`
        : ""
    }
    <p style="font-size:12px; color:#7B81A0; margin:20px 0 0; padding-top:16px; border-top:1px solid #E1E5F0; font-family:Arial,Helvetica,sans-serif;">
      Se o botão acima não funcionar, copie e cole este link no navegador:<br />
      <span style="word-break:break-all; color:#4B5170;">${viewUrl}</span>
    </p>
  `);

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: `Novo documento: ${input.documentTitle}`,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendClientDocumentEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

export type SendPasswordResetEmailInput = {
  tenantId: string;
  to: string;
  resetToken: string;
};

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return { ok: false, error: "Nenhuma configuração de SMTP cadastrada para este workspace." };
  }
  const { transporter, config } = transport;

  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/login/redefinir-senha?token=${input.resetToken}`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 14px; line-height: 1.5;">Olá,</p>
      <p style="font-size: 14px; line-height: 1.5;">
        Recebemos uma solicitação para redefinir a senha da sua conta no Connect. Se foi você, clique no botão abaixo:
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Redefinir senha
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">O link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail.</p>
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Se o botão acima não funcionar, copie e cole este link no navegador:<br />
        <span style="word-break: break-all;">${resetUrl}</span>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: "Redefinição de senha — Connect",
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendPasswordResetEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

export type SendAdmissaoEmailInput = {
  tenantId: string;
  to: string;
  personName: string;
  token: string;
  companyName: string | null;
};

// Convite de admissão digital — o novo colaborador abre o link e preenche os
// próprios dados/documentos. SMTP é por tenant e pode não estar configurado;
// quem gera o link trata isso como best-effort (o caminho principal é copiar o
// link e enviar por onde preferir).
export async function sendAdmissaoEmail(input: SendAdmissaoEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return { ok: false, error: "Nenhuma configuração de SMTP cadastrada para este workspace." };
  }
  const { transporter, config } = transport;

  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const admissaoUrl = `${baseUrl}/admissao/${input.token}`;
  const empresa = input.companyName ? ` na <strong>${escapeHtml(input.companyName)}</strong>` : "";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 14px; line-height: 1.5;">Olá, ${escapeHtml(input.personName)}!</p>
      <p style="font-size: 14px; line-height: 1.5;">
        Para dar continuidade à sua admissão${empresa}, preencha seus dados e envie seus documentos
        pelo link seguro abaixo. Leva poucos minutos.
      </p>
      <p style="margin: 24px 0;">
        <a href="${admissaoUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Preencher minha admissão
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">O link é pessoal e expira em 7 dias.</p>
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Se o botão acima não funcionar, copie e cole este link no navegador:<br />
        <span style="word-break: break-all;">${admissaoUrl}</span>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: "Admissão digital — Connect",
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendAdmissaoEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

export type SendTesteEmailInput = {
  tenantId: string;
  to: string;
  personName: string;
  token: string;
  // Nome do teste pra citar no e-mail — omitido (DISC) usa a copy padrão de
  // perfil comportamental; um template de múltipla escolha passa o próprio nome.
  testName?: string;
};

// Convite de teste (DISC ou modelo de múltipla escolha) — o candidato abre o
// link e responde sozinho. SMTP é por tenant e pode não estar configurado;
// quem gera o link trata isso como best-effort (o caminho principal é copiar
// o link e enviar por onde preferir).
export async function sendTesteEmail(input: SendTesteEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return { ok: false, error: "Nenhuma configuração de SMTP cadastrada para este workspace." };
  }
  const { transporter, config } = transport;

  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const testeUrl = `${baseUrl}/teste/${input.token}`;
  const descricaoTeste = input.testName
    ? `o teste "${escapeHtml(input.testName)}"`
    : "um teste de perfil comportamental (DISC)";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 14px; line-height: 1.5;">Olá, ${escapeHtml(input.personName)}!</p>
      <p style="font-size: 14px; line-height: 1.5;">
        Como parte do processo seletivo, pedimos que você responda ${descricaoTeste}
        pelo link seguro abaixo. Leva poucos minutos.
      </p>
      <p style="margin: 24px 0;">
        <a href="${testeUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Responder o teste
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">O link é pessoal e expira em 7 dias.</p>
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Se o botão acima não funcionar, copie e cole este link no navegador:<br />
        <span style="word-break: break-all;">${testeUrl}</span>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: "Teste do processo seletivo — Connect",
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendTesteEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

export type SendInterviewInviteEmailInput = {
  tenantId: string;
  to: string;
  candidateName: string;
  vagaTitle: string;
  companyName: string | null;
  startAt: Date;
  meetingUrl: string;
};

// Convite de entrevista — enviado ao candidato quando o recrutador agenda uma
// reunião pra ele no funil de recrutamento. Best-effort (SMTP por tenant pode
// não estar configurado): o agendamento em si nunca falha por causa deste e-mail.
export async function sendInterviewInviteEmail(input: SendInterviewInviteEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return { ok: false, error: "Nenhuma configuração de SMTP cadastrada para este workspace." };
  }
  const { transporter, config } = transport;

  const empresa = input.companyName ? ` na <strong>${escapeHtml(input.companyName)}</strong>` : "";
  const dataHora = formatInstantDateTime(input.startAt, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 14px; line-height: 1.5;">Olá, ${escapeHtml(input.candidateName)}!</p>
      <p style="font-size: 14px; line-height: 1.5;">
        Sua entrevista para a vaga <strong>${escapeHtml(input.vagaTitle)}</strong>${empresa} foi agendada:
      </p>
      <p style="font-size: 15px; font-weight: 600; margin: 16px 0;">${dataHora}</p>
      <p style="margin: 24px 0;">
        <a href="${input.meetingUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Entrar na reunião
        </a>
      </p>
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Se o botão acima não funcionar, copie e cole este link no navegador:<br />
        <span style="word-break: break-all;">${input.meetingUrl}</span>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: `Entrevista agendada — ${input.vagaTitle}`,
      html,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendInterviewInviteEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
