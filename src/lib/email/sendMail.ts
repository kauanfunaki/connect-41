import nodemailer from "nodemailer";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";

export type SmtpTestConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
};

export type SmtpResult = { ok: true } | { ok: false; error: string };

/**
 * Envia e registra o que o servidor de fato respondeu.
 *
 * `sendMail` devolve `accepted`, `rejected` e `response` — a resposta literal do
 * relay — e o código descartava os três, retornando só `{ ok: true }`. Com isso
 * "entregou" e "aceitou e descartou" ficam indistinguíveis no log, que é
 * exatamente o buraco que fez a investigação de 2026-09-04 durar uma sessão
 * inteira: o Connect mandava de `noreply@41tech.com.br`, domínio cujo DNS proíbe
 * envio (`SPF -all` + `DMARC p=reject` + MX nulo), o relay local aceitava sem
 * reclamar, o Gmail descartava do outro lado, e **não sobrava registro nenhum**
 * de que a mensagem tinha morrido. Nem erro, nem bounce.
 *
 * Cuidado ao ler: `accepted`/`rejected` são o veredito do **próximo salto**, não
 * da entrega final. Um relay que aceita tudo devolve `accepted` mesmo para
 * endereço que vai quicar depois. O que isto separa é "nem saiu daqui" de "saiu
 * e sumiu lá fora" — que era a pergunta sem resposta.
 *
 * Registra e devolve a resposta: quem decide o que fazer com a falha continua
 * sendo o `catch` de cada função, e quem precisa mostrar `rejected` na tela (o
 * envio da taxa ao cliente) lê do retorno.
 */
async function enviarComRegistro(
  transporter: nodemailer.Transporter,
  rotulo: string,
  mensagem: Parameters<nodemailer.Transporter["sendMail"]>[0]
) {
  const info = await transporter.sendMail(mensagem);
  console.info(
    `[${rotulo}] enviado`,
    JSON.stringify({
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      // O envelope diz de quem o relay ACHA que é a mensagem — é o endereço que
      // o receptor confere contra o SPF, e nem sempre é igual ao cabeçalho From.
      envelopeFrom: info.envelope?.from,
    })
  );
  return info;
}

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
// O template COMMITA num visual claro só, de propósito. A tentativa anterior
// (dois temas de verdade, com @media (prefers-color-scheme: dark) trocando
// fundo/texto e alternando duas versões da logo) quebrou no Outlook, que é o
// cliente usado na prática:
//   - Outlook desktop renderiza com o motor do Word, que NÃO suporta
//     `display:none` — a logo escura aparecia junto com a clara ("Connect
//     Connect" lado a lado), independente do CSS.
//   - Outlook.com descarta @media (prefers-color-scheme), então a troca por
//     tema nunca chegava a acontecer.
// Por isso: uma logo só, cores de fundo repetidas no atributo `bgcolor` além
// do CSS (o motor do Word ignora background em CSS mas respeita o atributo), e
// `color-scheme: light` no meta pra o Apple Mail não auto-inverter um layout
// que assume fundo claro.
//
// O `bgcolor`, porém, NÃO segura o "Alternar tela de fundo" do Outlook: esse
// botão inverte a mensagem inteira à força. E o Outlook não inverte imagens —
// então o wordmark navy sumia sobre o card escurecido. Daí a logo do e-mail
// ser um asset próprio (`logo-horizontal-email.png`, wordmark no azul da
// marca em vez de navy): fica legível tanto no fundo claro quanto no escuro,
// sem depender de detectar o tema. Não dá pra reaproveitar as variantes
// light/dark do app aqui — cada uma só funciona num dos dois fundos.
function emailShell(bodyHtml: string, eyebrow: string): string {
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title></title>
    <style type="text/css">
      body, table, td, p, a, span { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      .email-bg { background: #F1F3FA; }
      .email-card { background: #FFFFFF; border-color: #E4E8F2 !important; }
      .email-divider { border-color: #EDF0F7 !important; }
      .email-footer { background: #FAFBFD; }
      .email-text { color: #171A2B !important; }
      .email-text-strong { color: #0B1F42 !important; }
      .email-text-muted { color: #7B81A0 !important; }
      .email-text-faint { color: #9AA1B5 !important; }
      .doc-card { background: #F7F9FC !important; border-color: #E9ECF5 !important; }
    </style>
  </head>
  <body class="email-bg" bgcolor="#F1F3FA" style="margin:0; padding:0; background-color:#F1F3FA;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" bgcolor="#F1F3FA" style="background-color:#F1F3FA;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" class="email-card" bgcolor="#FFFFFF" style="max-width:520px; width:100%; border-radius:14px; overflow:hidden; border:1px solid; background-color:#FFFFFF; font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td align="center" class="email-card" bgcolor="#FFFFFF" style="padding:36px 28px 20px; background-color:#FFFFFF;">
                <img src="${baseUrl}/brand/logo-horizontal-email.png" height="28" alt="Connect" style="display:block; border:0; outline:none; height:28px; width:auto;" />
                <p class="email-text-muted" style="margin:12px 0 0; font-size:13px; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(eyebrow)}</p>
              </td>
            </tr>
            <tr>
              <td class="email-card" bgcolor="#FFFFFF" style="padding:0 28px; background-color:#FFFFFF;"><div class="email-divider" style="border-top:1px solid; line-height:1px; font-size:1px;">&nbsp;</div></td>
            </tr>
            <tr>
              <td class="email-card" bgcolor="#FFFFFF" style="padding:28px; background-color:#FFFFFF;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td align="center" class="email-footer email-divider" bgcolor="#FAFBFD" style="padding:18px 28px; border-top:1px solid; background-color:#FAFBFD;">
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

  // Botão "bulletproof": tabela com `bgcolor` + <a> estilizado inline, com
  // <v:roundrect> como fallback do Outlook desktop (que não faz border-radius).
  //
  // Já foi uma imagem pré-renderizada aqui — a ideia era que imagem não sofre
  // a reescrita de cor que alguns clientes aplicam em texto de link. Não
  // sobreviveu ao Outlook, que bloqueia imagem externa por padrão: sem a
  // imagem sobrava só o `alt` como texto cru, sem cor nem espaçamento. Texto
  // real sempre renderiza, então é a troca certa — o `bgcolor` no <td> segura
  // o fundo azul mesmo onde o CSS é descartado.
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

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <!-- Espaçamento como linha vazia, não margin: o motor do Word (Outlook
           desktop) ignora margin em <table>, e era por isso que o botão ficava
           colado no cartão do documento. -->
      <tr><td height="24" style="height:24px; line-height:24px; font-size:0;">&nbsp;</td></tr>
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${viewUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" strokecolor="#1F5EEA" fillcolor="#1F5EEA">
          <w:anchorlock/>
          <center style="color:#FFFFFF; mso-style-textfill-fill-color:#FFFFFF; mso-style-textfill-fill-alpha:100%; font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">Visualizar documento</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="#1F5EEA" style="border-radius:8px; background-color:#1F5EEA;">
                <a href="${viewUrl}" style="display:inline-block; padding:13px 30px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; line-height:18px; color:#FFFFFF; text-decoration:none; border-radius:8px;">
                  <span style="color:#FFFFFF; mso-style-textfill-fill-color:#FFFFFF; mso-style-textfill-fill-alpha:100%; text-decoration:none;">Visualizar documento</span>
                </a>
              </td>
            </tr>
          </table>
          <!--<![endif]-->
        </td>
      </tr>
      <tr><td height="24" style="height:24px; line-height:24px; font-size:0;">&nbsp;</td></tr>
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
    await enviarComRegistro(transporter, "sendClientDocumentEmail", {
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
  /** Cliente do portal redefine em `/portal/redefinir-senha`, não em `/login/...`. */
  destino?: "interno" | "portal";
};

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<SmtpResult> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return { ok: false, error: "Nenhuma configuração de SMTP cadastrada para este workspace." };
  }
  const { transporter, config } = transport;

  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const caminho = input.destino === "portal" ? "/portal/redefinir-senha" : "/login/redefinir-senha";
  const resetUrl = `${baseUrl}${caminho}?token=${input.resetToken}`;

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
    await enviarComRegistro(transporter, "sendPasswordResetEmail", {
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
    await enviarComRegistro(transporter, "sendAdmissaoEmail", {
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
    await enviarComRegistro(transporter, "sendTesteEmail", {
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
    await enviarComRegistro(transporter, "sendInterviewInviteEmail", {
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

export type SendTaxaAoClienteEmailInput = {
  tenantId: string;
  para: string[];
  assunto: string;
  empresaNome: string;
  descricao: string;
  valorCentavos: number;
  vencimento: Date | null;
  anexo: { nome: string; conteudo: Buffer };
};

export type ResultadoDoEnvioDaTaxa = { ok: true; recusados: string[] } | { ok: false; error: string };

/** Endereço de `accepted`/`rejected`, que o nodemailer devolve como texto ou objeto. */
function enderecoDe(r: unknown): string {
  if (typeof r === "string") return r;
  return (r as { address?: string } | null)?.address ?? "";
}

// Guia de taxa do Societário para os contatos da empresa — o passo 3 do fluxo do
// Bombeiros ("enviar aos e-mails da empresa cadastrados no Acessórias").
//
// Diferente do e-mail de Documentos para Cliente, este SIM leva o anexo: não há
// prova de visualização a registrar, e o que o cliente precisa é pagar a guia.
//
// Devolve os recusados pelo relay em vez de só `ok`: com três contatos, "enviado"
// quando um deles voltou é o tipo de meia verdade que só aparece no vencimento.
export async function sendTaxaAoClienteEmail(input: SendTaxaAoClienteEmailInput): Promise<ResultadoDoEnvioDaTaxa> {
  const transport = await getTenantTransport(input.tenantId);
  if (!transport) {
    return {
      ok: false,
      error: "Nenhuma configuração de SMTP cadastrada para este workspace. Configure em Admin > Empresa (Tenant).",
    };
  }
  const { transporter, config } = transport;

  const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.valorCentavos / 100);
  const vencimento = input.vencimento ? formatInstantDate(input.vencimento) : null;

  const html = emailShell(
    `
    <p class="email-text" style="font-size:14px; line-height:1.6; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">
      Olá! Segue em anexo a guia de <strong>${escapeHtml(input.descricao)}</strong> de
      <strong>${escapeHtml(input.empresaNome)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="doc-card" style="margin:0 0 20px; border:1px solid; border-radius:10px;">
      <tr>
        <td style="padding:16px 18px;">
          <p class="email-text-muted" style="margin:0 0 4px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-family:Arial,Helvetica,sans-serif;">Valor</p>
          <p class="email-text-strong" style="margin:0 0 12px; font-size:15px; font-weight:700; font-family:Arial,Helvetica,sans-serif;">${valor}</p>
          ${
            vencimento
              ? `<p class="email-text-muted" style="margin:0 0 4px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-family:Arial,Helvetica,sans-serif;">Vencimento</p>
          <p class="email-text-strong" style="margin:0; font-size:15px; font-weight:700; font-family:Arial,Helvetica,sans-serif;">${vencimento}</p>`
              : ""
          }
        </td>
      </tr>
    </table>

    <p class="email-text-muted" style="font-size:12px; margin:0; font-family:Arial,Helvetica,sans-serif;">
      Em caso de dúvida sobre a guia, entre em contato com o escritório.
    </p>
  `,
    "Societário"
  );

  try {
    const info = await enviarComRegistro(transporter, "sendTaxaAoClienteEmail", {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.para,
      subject: input.assunto,
      html,
      attachments: [{ filename: input.anexo.nome, content: input.anexo.conteudo, contentType: "application/pdf" }],
    });
    const recusados = ((info.rejected ?? []) as unknown[]).map(enderecoDe).filter(Boolean);
    return { ok: true, recusados };
  } catch (err) {
    console.error("[sendTaxaAoClienteEmail]", err);
    return { ok: false, error: "Falha ao enviar e-mail. Verifique a configuração de SMTP." };
  }
}

/** O botão "bulletproof" do e-mail de documentos, reaproveitado pelos avisos do portal. */
function botaoDoEmail(url: string, rotulo: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td height="8" style="height:8px; line-height:8px; font-size:0;">&nbsp;</td></tr>
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" strokecolor="#1F5EEA" fillcolor="#1F5EEA">
          <w:anchorlock/>
          <center style="color:#FFFFFF; font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${escapeHtml(rotulo)}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr>
              <td align="center" bgcolor="#1F5EEA" style="border-radius:8px; background-color:#1F5EEA;">
                <a href="${url}" style="display:inline-block; padding:13px 30px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; line-height:18px; color:#FFFFFF; text-decoration:none; border-radius:8px;">
                  <span style="color:#FFFFFF; text-decoration:none;">${escapeHtml(rotulo)}</span>
                </a>
              </td>
            </tr>
          </table>
          <!--<![endif]-->
        </td>
      </tr>
      <tr><td height="24" style="height:24px; line-height:24px; font-size:0;">&nbsp;</td></tr>
    </table>
    <p class="email-text-muted" style="font-size:12px; margin:0; font-family:Arial,Helvetica,sans-serif;">
      Caso o botão não funcione, copie e cole este link no navegador:<br />
      <span style="word-break:break-all;">${url}</span>
    </p>`;
}

/** Resultado de um aviso a vários destinatários, um e-mail por pessoa. */
export type ResultadoDoAviso = { enviados: number; falhas: number; semSmtp: boolean };

/**
 * Um e-mail por destinatário, e não um com todos no `to`: os usuários do portal
 * de um grupo não precisam descobrir o endereço uns dos outros por um aviso.
 *
 * Sem SMTP configurado devolve `semSmtp` em vez de erro — o aviso é
 * complemento; a pendência e a aprovação existem e aparecem no portal com ou
 * sem e-mail, e quem chamou registra o que não saiu.
 */
async function enviarAvisoIndividual(
  tenantId: string,
  rotulo: string,
  mensagens: { to: string; subject: string; html: string }[]
): Promise<ResultadoDoAviso> {
  if (mensagens.length === 0) return { enviados: 0, falhas: 0, semSmtp: false };
  const transport = await getTenantTransport(tenantId);
  if (!transport) return { enviados: 0, falhas: mensagens.length, semSmtp: true };
  const { transporter, config } = transport;
  let enviados = 0;
  let falhas = 0;
  for (const m of mensagens) {
    try {
      await enviarComRegistro(transporter, rotulo, { from: `"${config.fromName}" <${config.fromEmail}>`, ...m });
      enviados++;
    } catch (err) {
      console.error(`[${rotulo}]`, err);
      falhas++;
    }
  }
  return { enviados, falhas, semSmtp: false };
}

export type SendPendenciaAoClienteEmailInput = {
  tenantId: string;
  destinatarios: { email: string; nome: string }[];
  requestId: string;
  titulo: string;
  motivo: "nova" | "resposta" | "lembrete";
  /** Só no lembrete: o prazo que passou. */
  prazo?: Date | null;
};

/** O tenant tem SMTP configurado? Para quem precisa saber antes de reservar um envio. */
export async function temSmtpConfigurado(tenantId: string): Promise<boolean> {
  const config = await getPrisma().tenantSmtpConfig.findUnique({ where: { tenantId }, select: { id: true } });
  return config !== null;
}

// Pendência aberta ou respondida pela equipe, ou lembrete de pendência vencida.
// O corpo leva **só o título** e o link: descrição e conversa podem citar valor,
// conta, documento — e e-mail é o canal que se encaminha sem pensar. O conteúdo
// fica atrás do login do portal.
export async function sendPendenciaAoClienteEmail(input: SendPendenciaAoClienteEmailInput): Promise<ResultadoDoAviso> {
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const url = `${baseUrl}/portal/pendencias/${input.requestId}`;
  const assunto = {
    nova: `Nova pendência: ${input.titulo}`,
    resposta: `Resposta na pendência: ${input.titulo}`,
    lembrete: `Lembrete: pendência vencida — ${input.titulo}`,
  }[input.motivo];
  const abertura = {
    nova: "A equipe abriu uma pendência para você:",
    resposta: "A equipe respondeu na pendência:",
    lembrete: input.prazo
      ? `A pendência abaixo venceu em ${formatInstantDate(input.prazo)} e ainda aguarda a sua resposta:`
      : "A pendência abaixo está vencida e ainda aguarda a sua resposta:",
  }[input.motivo];
  const mensagens = input.destinatarios.map((d) => ({
    to: d.email,
    subject: assunto,
    html: emailShell(
      `
    <p class="email-text" style="font-size:14px; line-height:1.6; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">
      Olá, ${escapeHtml(d.nome)}. ${escapeHtml(abertura)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="doc-card" style="margin:0 0 16px; border:1px solid; border-radius:10px;">
      <tr>
        <td style="padding:16px 18px;">
          <p class="email-text-muted" style="margin:0 0 4px; font-size:10.5px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-family:Arial,Helvetica,sans-serif;">Pendência</p>
          <p class="email-text-strong" style="margin:0; font-size:15px; font-weight:700; font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.titulo)}</p>
        </td>
      </tr>
    </table>
    ${botaoDoEmail(url, "Abrir no portal")}
  `,
      "Portal do cliente"
    ),
  }));
  return enviarAvisoIndividual(input.tenantId, "sendPendenciaAoClienteEmail", mensagens);
}

export type SendAprovacaoPendenteEmailInput = {
  tenantId: string;
  destinatarios: { email: string; nome: string; quantidade: number }[];
};

// Contas a pagar esperando aprovação. Leva só a contagem — valor, fornecedor e
// empresa ficam no portal, pelo mesmo motivo do aviso de pendência. Um e-mail
// por aprovador, com a contagem dele: a importação de uma planilha com cem
// títulos manda cem avisos se cada título virar um e-mail.
export async function sendAprovacaoPendenteEmail(input: SendAprovacaoPendenteEmailInput): Promise<ResultadoDoAviso> {
  const baseUrl = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const url = `${baseUrl}/portal/aprovacoes`;
  const mensagens = input.destinatarios.map((d) => {
    const frase =
      d.quantidade === 1 ? "Há 1 conta a pagar aguardando a sua aprovação." : `Há ${d.quantidade} contas a pagar aguardando a sua aprovação.`;
    return {
      to: d.email,
      subject: d.quantidade === 1 ? "Conta a pagar aguardando aprovação" : `${d.quantidade} contas a pagar aguardando aprovação`,
      html: emailShell(
        `
    <p class="email-text" style="font-size:14px; line-height:1.6; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">
      Olá, ${escapeHtml(d.nome)}. ${frase} A baixa só é feita depois da aprovação.
    </p>
    ${botaoDoEmail(url, "Revisar no portal")}
  `,
        "Portal do cliente"
      ),
    };
  });
  return enviarAvisoIndividual(input.tenantId, "sendAprovacaoPendenteEmail", mensagens);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Régua de cobrança ─────────────────────────────────────────────────────

export type LembreteDeCobranca = {
  para: string;
  /** A empresa cliente — a credora. É quem assina o e-mail. */
  empresaNome: string;
  sacadoNome: string;
  valorCentavos: number;
  vencimento: Date;
  diasDeAtraso: number;
  descricao: string | null;
};

/**
 * Abre o envio da régua de cobrança para um tenant: um transporte para o lote
 * inteiro, em vez de um por e-mail. `null` quando o tenant não tem SMTP — o
 * cron registra isso e segue para o próximo tenant, sem quebrar.
 *
 * O e-mail vai ao **sacado**, que não é cliente do escritório nem usuário do
 * Connect. Por isso não usa `emailShell`: sem a marca do Connect, sem link
 * nenhum (nem de portal, nem de app), e com o nome da empresa credora no
 * remetente e no topo — é a empresa cliente cobrando, pelo SMTP do escritório.
 */
export async function abrirEnvioDeCobranca(tenantId: string) {
  const transport = await getTenantTransport(tenantId);
  if (!transport) return null;
  const { transporter, config } = transport;
  const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return async function enviar(l: LembreteDeCobranca): Promise<SmtpResult> {
    const valor = moeda.format(l.valorCentavos / 100);
    const vencimento = formatInstantDate(l.vencimento);
    const atraso = l.diasDeAtraso === 1 ? "1 dia" : `${l.diasDeAtraso} dias`;
    const linha = (rotulo: string, texto: string) => `
          <tr>
            <td style="padding:6px 0; font-size:12px; color:#7B81A0; font-family:Arial,Helvetica,sans-serif;">${rotulo}</td>
            <td align="right" style="padding:6px 0; font-size:14px; font-weight:700; color:#0B1F42; font-family:Arial,Helvetica,sans-serif;">${texto}</td>
          </tr>`;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light" /><title></title></head>
  <body bgcolor="#F4F5F8" style="margin:0; padding:0; background-color:#F4F5F8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F4F5F8" style="background-color:#F4F5F8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:520px; width:100%; border:1px solid #E4E8F2; border-radius:12px; background-color:#FFFFFF;">
            <tr>
              <td style="padding:24px 28px 8px; font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0; font-size:16px; font-weight:700; color:#0B1F42;">${escapeHtml(l.empresaNome)}</p>
                <p style="margin:4px 0 0; font-size:12px; color:#7B81A0;">Lembrete de pagamento</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px; font-family:Arial,Helvetica,sans-serif;">
                <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#171A2B;">
                  Olá, ${escapeHtml(l.sacadoNome)}. Consta em aberto, a favor de <strong>${escapeHtml(l.empresaNome)}</strong>, o título abaixo:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #EDF0F7; border-bottom:1px solid #EDF0F7;">
                  ${l.descricao ? linha("Referência", escapeHtml(l.descricao)) : ""}
                  ${linha("Valor", valor)}
                  ${linha("Vencimento", vencimento)}
                  ${linha("Em atraso há", atraso)}
                </table>
                <p style="margin:16px 0 0; font-size:13px; line-height:1.6; color:#171A2B;">
                  Se o pagamento já foi feito, por favor desconsidere esta mensagem. Para combinar o pagamento ou tirar dúvidas, responda a este e-mail ou fale diretamente com ${escapeHtml(l.empresaNome)}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    try {
      // Aspas e quebras no nome da empresa quebrariam o cabeçalho From.
      const remetente = l.empresaNome.replace(/[\r\n"\\]/g, " ").trim().slice(0, 120);
      await enviarComRegistro(transporter, "sendLembreteDeCobranca", {
        from: `"${remetente}" <${config.fromEmail}>`,
        to: l.para,
        subject: `Lembrete de pagamento — ${remetente}`,
        html,
      });
      return { ok: true };
    } catch (err) {
      console.error("[sendLembreteDeCobranca]", err);
      return { ok: false, error: err instanceof Error ? err.message.slice(0, 400) : "Falha ao enviar e-mail." };
    }
  };
}
