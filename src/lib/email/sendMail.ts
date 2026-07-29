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
// hoje só no e-mail de Documentos para Cliente (o único reportado até agora);
// os demais e-mails transacionais deste arquivo ainda usam o template antigo
// — dá pra migrar depois se fizer sentido.
//
// A logo vai como <img> (ícone PNG real de public/icons, não SVG — suporte a
// SVG inline é inconsistente entre clientes de e-mail, principalmente
// Outlook desktop) + "Connect" como texto de verdade ao lado, não texto
// dentro de imagem. `eyebrow` é o subtítulo abaixo da logo (varia por
// e-mail — aqui só "Compartilhamento de documentos" usa isso).
function emailShell(bodyHtml: string, eyebrow: string): string {
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <!-- Trava o e-mail em modo claro — sem isso, Apple Mail/Outlook.com/Gmail
         reinterpretam as cores em dark mode e invertem fundo branco -> escuro,
         o que também derruba o fundo do botão (vira link azul sublinhado cru). -->
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title></title>
    <!--[if mso]>
    <style type="text/css">
      table { border-collapse: collapse; }
      .fallback-font { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
    <style type="text/css">
      :root { color-scheme: light; supported-color-schemes: light; }
      body, table, td, p, a, span { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    </style>
  </head>
  <body style="margin:0; padding:0; background:#F1F3FA;" bgcolor="#F1F3FA">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F3FA;" bgcolor="#F1F3FA">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; width:100%; background:#FFFFFF; border-radius:14px; overflow:hidden; border:1px solid #E4E8F2; font-family:Arial,Helvetica,sans-serif;" bgcolor="#FFFFFF">
            <tr>
              <td align="center" style="padding:36px 28px 20px;" bgcolor="#FFFFFF">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle; padding-right:8px;">
                      <img src="${baseUrl}/icons/icon-192.png" width="26" height="26" alt="Connect" style="display:block; border-radius:7px; border:0; outline:none;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <span style="font-size:19px; font-weight:700; color:#0B1F42 !important; letter-spacing:-0.3px;">Connect</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 0; font-size:13px; color:#7B81A0 !important; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(eyebrow)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;" bgcolor="#FFFFFF"><div style="border-top:1px solid #EDF0F7; line-height:1px; font-size:1px;">&nbsp;</div></td>
            </tr>
            <tr>
              <td style="padding:28px;" bgcolor="#FFFFFF">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 28px; border-top:1px solid #EDF0F7; background:#FAFBFD;" bgcolor="#FAFBFD">
                <p style="margin:0; font-size:11px; color:#9AA1B5 !important; line-height:1.6; font-family:Arial,Helvetica,sans-serif;">
                  Este e-mail foi enviado automaticamente pelo Connect.<br />
                  © ${year} Connect
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

  const html = emailShell(
    `
    <p style="font-size:14px; line-height:1.6; color:#171A2B !important; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">
      <strong>${escapeHtml(input.senderName)}</strong> compartilhou um novo documento com você em nome de
      <strong>${escapeHtml(input.companyName)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; background:#F7F9FC; border:1px solid #E9ECF5; border-radius:10px;" bgcolor="#F7F9FC">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 4px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; color:#8993AD !important; text-transform:uppercase; font-family:Arial,Helvetica,sans-serif;">Documento</p>
          <p style="margin:0 0 3px; font-size:15px; font-weight:700; color:#0B1F42 !important; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.documentTitle)}</p>
          <p style="margin:0; font-size:12.5px; color:#7B81A0 !important; font-family:Arial,Helvetica,sans-serif;">Disponível para visualização</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${viewUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" strokecolor="#1F5EEA" fillcolor="#1F5EEA">
          <w:anchorlock/>
          <center style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Visualizar documento</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:8px; background:#1F5EEA;" bgcolor="#1F5EEA">
                <a href="${viewUrl}" style="display:inline-block; padding:12px 28px; font-size:14px; font-weight:600; color:#FFFFFF !important; text-decoration:none !important; font-family:Arial,Helvetica,sans-serif; border-radius:8px; background:#1F5EEA;">
                  Visualizar documento
                </a>
              </td>
            </tr>
          </table>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    ${
      input.hasAttachment
        ? `<p style="font-size:12px; color:#8993AD !important; margin:0 0 24px; text-align:center; font-family:Arial,Helvetica,sans-serif;">📎 Este documento possui um arquivo anexo, disponível para download na página de visualização.</p>`
        : ""
    }

    <div style="border-top:1px solid #EDF0F7; margin:0 0 18px; line-height:1px; font-size:1px;">&nbsp;</div>

    <p style="font-size:12px; color:#7B81A0 !important; margin:0; font-family:Arial,Helvetica,sans-serif;">
      Caso o botão não funcione, copie e cole este link no navegador:<br />
      <span style="word-break:break-all; color:#4B5170 !important;">${viewUrl}</span>
    </p>
  `,
    "Compartilhamento de documentos"
  );

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
