import nodemailer from "nodemailer";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

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

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="font-size: 14px; line-height: 1.5;">Olá,</p>
      <p style="font-size: 14px; line-height: 1.5;">
        <strong>${escapeHtml(input.senderName)}</strong> enviou um novo documento para
        <strong>${escapeHtml(input.companyName)}</strong>:
      </p>
      <p style="font-size: 15px; font-weight: 600; margin: 16px 0;">${escapeHtml(input.documentTitle)}</p>
      <p style="margin: 24px 0;">
        <a href="${viewUrl}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Visualizar documento
        </a>
      </p>
      ${input.hasAttachment ? `<p style="font-size: 13px; color: #555;">O documento inclui um arquivo anexo, disponível para download na página de visualização.</p>` : ""}
      <p style="font-size: 12px; color: #888; margin-top: 32px;">
        Se o botão acima não funcionar, copie e cole este link no navegador:<br />
        <span style="word-break: break-all;">${viewUrl}</span>
      </p>
    </div>
  `;

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
