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
// Alguns clientes de e-mail (ex.: várias combinações de Gmail/Outlook.com)
// reescrevem cores no dark mode por conta própria e IGNORAM color-scheme —
// então em vez de brigar pra forçar modo claro, o template assume os dois
// temas de verdade: classes CSS com @media (prefers-color-scheme: dark)
// trocam fundo/texto/borda, e a logo tem duas versões (clara/escura) que se
// alternam por CSS, igual ao <html class="dark"> do app em si.
function emailShell(bodyHtml: string, eyebrow: string): string {
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title></title>
    <style type="text/css">
      body, table, td, p, a, span { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      .logo-dark { display: none; }
      .email-bg { background: #F1F3FA; }
      .email-card { background: #FFFFFF; border-color: #E4E8F2 !important; }
      .email-divider { border-color: #EDF0F7 !important; }
      .email-footer { background: #FAFBFD; }
      .email-text { color: #171A2B !important; }
      .email-text-strong { color: #0B1F42 !important; }
      .email-text-muted { color: #7B81A0 !important; }
      .email-text-faint { color: #9AA1B5 !important; }
      .doc-card { background: #F7F9FC !important; border-color: #E9ECF5 !important; }
      @media (prefers-color-scheme: dark) {
        .logo-light { display: none; }
        .logo-dark { display: block !important; }
        .email-bg { background: #0F1015 !important; }
        .email-card { background: #1A1B22 !important; border-color: #2A2C36 !important; }
        .email-divider { border-color: #2A2C36 !important; }
        .email-footer { background: #16171D !important; }
        .email-text { color: #F1F2F6 !important; }
        .email-text-strong { color: #F5F7FB !important; }
        .email-text-muted { color: #9098AC !important; }
        .email-text-faint { color: #767C90 !important; }
        .doc-card { background: #22242C !important; border-color: #2E3038 !important; }
      }
    </style>
  </head>
  <body class="email-bg" style="margin:0; padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" class="email-card" style="max-width:520px; width:100%; border-radius:14px; overflow:hidden; border:1px solid; font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td align="center" class="email-card" style="padding:36px 28px 20px;">
                <img src="${baseUrl}/brand/logo-horizontal-light.png" height="28" alt="Connect" class="logo-light" style="display:block; border:0; outline:none; height:28px; width:auto;" />
                <img src="${baseUrl}/brand/logo-horizontal-dark.png" height="28" alt="Connect" class="logo-dark" style="display:none; border:0; outline:none; height:28px; width:auto;" />
                <p class="email-text-muted" style="margin:12px 0 0; font-size:13px; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(eyebrow)}</p>
              </td>
            </tr>
            <tr>
              <td class="email-card" style="padding:0 28px;"><div class="email-divider" style="border-top:1px solid; line-height:1px; font-size:1px;">&nbsp;</div></td>
            </tr>
            <tr>
              <td class="email-card" style="padding:28px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td align="center" class="email-footer email-divider" style="padding:18px 28px; border-top:1px solid;">
                <p class="email-text-faint" style="margin:0; font-size:11px; line-height:1.6; font-family:Arial,Helvetica,sans-serif;">
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

  // Botão como imagem pré-renderizada (texto "Visualizar documento" já
  // desenhado em branco sobre azul), não texto real dentro de <a>/<span> —
  // alguns clientes de e-mail recolorem texto de link à força mesmo com
  // color:#fff!important em cascata dupla, e imagem não sofre essa reescrita.
  // O <v:roundrect> é só o fallback do Outlook desktop (não renderiza <img>
  // com cantos arredondados direito via VML de qualquer forma).
  const html = emailShell(
    `
    <p class="email-text" style="font-size:14px; line-height:1.6; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">
      <strong>${escapeHtml(input.senderName)}</strong> compartilhou um novo documento com você em nome de
      <strong>${escapeHtml(input.companyName)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="doc-card" style="margin:0 0 24px; border:1px solid; border-radius:10px;">
      <tr>
        <td style="padding:16px 18px;">
          <p class="email-text-muted" style="margin:0 0 4px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-family:Arial,Helvetica,sans-serif;">Documento</p>
          <p class="email-text-strong" style="margin:0 0 3px; font-size:15px; font-weight:700; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.documentTitle)}</p>
          <p class="email-text-muted" style="margin:0; font-size:12.5px; font-family:Arial,Helvetica,sans-serif;">Disponível para visualização</p>
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
          <a href="${viewUrl}" style="display:inline-block; text-decoration:none; line-height:0;">
            <img src="${baseUrl}/brand/email-btn-view-document.png" width="220" height="40" alt="Visualizar documento" style="display:block; border:0; outline:none;" />
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    ${
      input.hasAttachment
        ? `<p class="email-text-muted" style="font-size:12px; margin:0 0 24px; text-align:center; font-family:Arial,Helvetica,sans-serif;">📎 Este documento possui um arquivo anexo, disponível para download na página de visualização.</p>`
        : ""
    }

    <div class="email-divider" style="border-top:1px solid; margin:0 0 18px; line-height:1px; font-size:1px;">&nbsp;</div>

    <p class="email-text-muted" style="font-size:12px; margin:0; font-family:Arial,Helvetica,sans-serif;">
      Caso o botão não funcione, copie e cole este link no navegador:<br />
      <span style="word-break:break-all;">${viewUrl}</span>
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
