// A marca do escritório nos e-mails ao cliente (22/10/2026).
//
// Os avisos do portal (pendência, solicitação, comunicado, mensagem, processo,
// arquivos, aprovação), o documento compartilhado, a guia de taxa e o link de
// senha do portal saem pelo SMTP do escritório, mas com o cabeçalho do
// Connect. Com a Aparência do portal ligada, o cabeçalho passa a ser o do
// escritório: o logo (se "Mostrar o logo" estiver ligado) com o nome ao lado, e
// a cor principal no filete do topo e no botão. Sem nada escolhido, o e-mail é
// exatamente o de antes — e "pelo Connect" segue no rodapé.
//
// O logo precisa de endereço absoluto e público: o leitor de e-mail o busca de
// fora, sem sessão. É o `APP_PUBLIC_URL` + a rota /api/workspace-logos, que já
// é pública (proxy.ts) e serve só a imagem do logo. Sem `APP_PUBLIC_URL`, vai
// só o nome — imagem quebrada é pior que nenhuma.
//
// Contraste: o botão usa o tom sólido de `tonsDaCor`, o mesmo do portal, que
// garante 4,5:1 com a letra branca (WCAG AA). O e-mail é sempre claro (ver o
// comentário do `emailShell`), então não há tom de tema escuro a escolher.

import { tonsDaCor } from "@/lib/aparencia/cores";
import { marcaPublicaDoEscritorio, type MarcaPublica } from "@/lib/aparencia/marcaPublica";

export type MarcaDoEmail = {
  nome: string;
  /** URL absoluta do logo, ou `null` (vai só o nome). */
  logo: string | null;
  /** O tom sólido da cor principal (letra branca em cima com 4,5:1), ou `null` = o azul do Connect. */
  cor: string | null;
};

/** O azul do botão do e-mail quando o escritório não escolheu cor. */
export const COR_DO_CONNECT_NO_EMAIL = "#1F5EEA";

const PREFIXO_DO_LOGO = "/api/workspace-logos/";

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** O endereço absoluto do logo — só o da rota pública dos logos. */
export function logoAbsoluto(logoUrl: string | null, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/$/, "");
  if (!logoUrl || !/^https?:\/\//.test(base)) return null;
  if (!logoUrl.startsWith(PREFIXO_DO_LOGO)) return null;
  return `${base}${logoUrl}`;
}

/** A marca do e-mail a partir da marca pública. `null` = a do Connect. */
export function marcaDoEmailDe(marca: MarcaPublica | null, baseUrl: string): MarcaDoEmail | null {
  if (!marca) return null;
  const logo = logoAbsoluto(marca.logoUrl, baseUrl);
  const cor = marca.corPrincipal ? (tonsDaCor(marca.corPrincipal)?.solida ?? null) : null;
  // Com o logo ligado mas sem endereço público, o nome ainda vale como cabeçalho.
  if (!logo && !cor && !marca.logoUrl) return null;
  return { nome: marca.nome.replace(/[\r\n]+/g, " ").trim() || "Escritório", logo, cor };
}

/** A marca do escritório para os e-mails ao cliente. Nunca lança. */
export async function marcaDoEmail(tenantId: string): Promise<MarcaDoEmail | null> {
  return marcaDoEmailDe(await marcaPublicaDoEscritorio(tenantId), process.env.APP_PUBLIC_URL ?? "");
}

/** A cor do botão: a do escritório ou o azul do Connect. */
export function corDoBotao(marca: MarcaDoEmail | null | undefined): string {
  return marca?.cor ?? COR_DO_CONNECT_NO_EMAIL;
}

/**
 * O topo do cartão do e-mail. Com marca: filete na cor do escritório, logo
 * (40 px, quadrado como no portal) e nome. Sem marca: o logo do Connect.
 */
export function cabecalhoDoEmail(marca: MarcaDoEmail | null | undefined, baseUrl: string, eyebrow: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const rotulo = `<p class="email-text-muted" style="margin:12px 0 0; font-size:13px; font-family:Arial,Helvetica,sans-serif;">${escapar(eyebrow)}</p>`;
  if (!marca) {
    return `<img src="${base}/brand/logo-horizontal-email.png" height="28" alt="Connect" style="display:block; border:0; outline:none; height:28px; width:auto;" />
                ${rotulo}`;
  }
  const nome = escapar(marca.nome);
  const logo = marca.logo
    ? `<td valign="middle" style="padding:0 10px 0 0;"><img src="${escapar(marca.logo)}" width="40" height="40" alt="" style="display:block; border:0; outline:none; width:40px; height:40px; border-radius:8px;" /></td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                  <tr>
                    ${logo}<td valign="middle" class="email-text-strong" style="font-size:17px; font-weight:700; color:#0B1F42; font-family:Arial,Helvetica,sans-serif;">${nome}</td>
                  </tr>
                </table>
                ${rotulo}`;
}

/** O filete de cor no topo do cartão, quando o escritório tem cor. */
export function fileteDoEmail(marca: MarcaDoEmail | null | undefined): string {
  if (!marca?.cor) return "";
  return `<tr><td height="4" bgcolor="${marca.cor}" style="height:4px; line-height:4px; font-size:0; background-color:${marca.cor};">&nbsp;</td></tr>`;
}

/** O rodapé: "pelo Connect" fica, com o nome do escritório quando há marca. */
export function rodapeDoEmail(marca: MarcaDoEmail | null | undefined, ano: number): string {
  if (!marca) return `Este e-mail foi enviado automaticamente pelo Connect.<br />\n                  © ${ano} Connect`;
  return `Este e-mail foi enviado automaticamente por ${escapar(marca.nome)} pelo Connect.`;
}
