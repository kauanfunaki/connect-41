// Classes comuns das telas do Planejamento tributário (05/11/2026), para as
// tabelas e os painéis portados do Connect Tributário saírem iguais entre si e
// iguais ao resto do Connect (tokens de app/globals.css).

/** Painel/cartão de seção. */
export const PAINEL = "space-y-3 rounded-lg border border-border bg-surface p-4";
/** Título de seção dentro da tela. */
export const TITULO_DA_SECAO = "text-section font-semibold text-fg";
/** Título dentro de um painel. */
export const TITULO_DO_PAINEL = "text-card-title font-semibold text-fg";
/** Rótulo pequeno em caixa alta (o "eyebrow" do original). */
export const ROTULO = "c41-rotulo";
/** Texto de apoio. */
export const TEXTO_DE_APOIO = "text-helper text-fg-secondary";
/** Nota informativa (o `study-info` do original). */
export const NOTA = "rounded-md border border-border bg-surface-2 px-3 py-2 text-ui text-fg-secondary";

/** Envoltório com rolagem horizontal para tabelas largas no celular. */
export const ROLAGEM_DA_TABELA = "overflow-x-auto";
export const TABELA = "w-full border-collapse text-ui";
export const CABECALHO = "border-b border-border px-3 py-2 text-left text-micro font-semibold uppercase tracking-wide text-fg-muted";
export const CABECALHO_NUMERO = `${CABECALHO} text-right`;
export const CELULA = "border-b border-border px-3 py-2 align-top text-fg";
export const CELULA_NUMERO = `${CELULA} text-right tabular-nums whitespace-nowrap`;
/** Linha de total/destaque. */
export const LINHA_DE_TOTAL = "font-semibold bg-surface-2";
