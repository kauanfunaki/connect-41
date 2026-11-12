// O corpo do e-mail diário de vencimentos do Societário (12/11/2026): uma
// tabela com Empresa, Documento, Vence e Situação, como a do Radar Societário.
// Puro: quem envia é avisoDeVencimentoServidor.ts, pela moldura do sendMail.

import type { ItemDoAviso } from "./avisoDeVencimento";

const COR: Record<ItemDoAviso["gravidade"], string> = {
  vencida: "#B42318",
  perto: "#B54708",
  atencao: "#475467",
};

function esc(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
export function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function assuntoDoAviso(itens: ItemDoAviso[], previa: boolean): string {
  const vencidas = itens.filter((i) => i.gravidade === "vencida").length;
  const base = itens.length === 1 ? "1 documento vencendo ou vencido" : `${itens.length} documentos vencendo ou vencidos`;
  const extra = vencidas > 0 ? ` (${vencidas} já ${vencidas === 1 ? "vencido ou positivo" : "vencidos ou positivos"})` : "";
  return `${previa ? "[Teste] " : ""}Societário: ${base}${extra}`;
}

/**
 * O miolo do e-mail (sem a moldura). `previa` é o "Enviar teste" da tela: leva
 * tudo o que está na janela hoje, e diz que não marca nada como avisado.
 */
export function corpoDoAviso(itens: ItemDoAviso[], opcoes: { hoje: string; linkDaTela: string; previa: boolean }): string {
  const th = (t: string) =>
    `<th align="left" style="padding:8px 10px; font-size:12px; font-weight:700; color:#475467; border-bottom:1px solid #D0D5DD; font-family:Arial,Helvetica,sans-serif;">${t}</th>`;
  const td = (conteudo: string, estilo = "") =>
    `<td valign="top" style="padding:8px 10px; font-size:13px; line-height:1.4; border-bottom:1px solid #EAECF0; font-family:Arial,Helvetica,sans-serif; ${estilo}">${conteudo}</td>`;
  const linhas = itens
    .map(
      (i) => `<tr>
        ${td(`<strong>${esc(i.empresa)}</strong>${i.cnpj ? `<br /><span style="color:#667085; font-size:12px;">${esc(i.cnpj)}</span>` : ""}`)}
        ${td(esc(i.documento))}
        ${td(dataBr(i.vence), "white-space:nowrap;")}
        ${td(esc(i.situacao), `color:${COR[i.gravidade]}; font-weight:700; white-space:nowrap;`)}
      </tr>`
    )
    .join("");
  const abertura = opcoes.previa
    ? `Este é um e-mail de teste, pedido na tela de Licenças. Ele mostra tudo o que está na janela de aviso hoje (${dataBr(opcoes.hoje)}) e não marca nada como avisado.`
    : `Licenças e certidões que pedem atenção hoje (${dataBr(opcoes.hoje)}). Cada documento entra uma vez por marco: a licença a 90, 60 e 30 dias e quando vence; a certidão quando sai positiva, quando faltam 15 dias e quando vence.`;
  return `
    <p class="email-text" style="font-size:14px; line-height:1.6; margin:0 0 16px; font-family:Arial,Helvetica,sans-serif;">${abertura}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0 0 20px;">
      <thead><tr>${th("Empresa")}${th("Documento")}${th("Vence")}${th("Situação")}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p class="email-text" style="font-size:13px; line-height:1.6; margin:0; font-family:Arial,Helvetica,sans-serif;">
      Para renovar ou atualizar, abra a <a href="${esc(opcoes.linkDaTela)}" style="color:#2563EB;">tela de Licenças</a> no Connect.
    </p>`;
}
