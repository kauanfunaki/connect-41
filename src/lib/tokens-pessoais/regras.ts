import { z } from "zod";

// Token pessoal de acesso (05/11/2026, decisão D2 da página de opções): a
// pessoa cria nas Configurações e usa na IA dela (Claude Code, Codex, Cursor)
// ou num script para agir no Connect em nome dela. Este arquivo é a regra sem
// banco — o proxy importa daqui, e o proxy não pode carregar o Prisma.

/** O começo de todo token pessoal: reconhecível num vazamento e no cabeçalho. */
export const PREFIXO_DO_TOKEN = "c41_";
export const FORMATO_DO_TOKEN = /^c41_[a-f0-9]{64}$/;

/**
 * O que um token pode fazer. A pessoa escolhe ao criar; o token nunca passa do
 * que a própria pessoa pode no Connect — o escopo só restringe.
 */
export const ESCOPOS = {
  "controle-interno:ler": "Ler itens do Controle interno",
  "controle-interno:escrever": "Criar e atualizar itens, comentar e anexar no Controle interno",
  // A Academia (10/11/2026): o fluxo do n8n que posta o ranking do mês no Slack.
  "academia:ler": "Ler o ranking da Academia",
} as const;
export type Escopo = keyof typeof ESCOPOS;
export const LISTA_DE_ESCOPOS = Object.keys(ESCOPOS) as Escopo[];

/** Validade em dias. Todo token vence: um token esquecido não vale para sempre. */
export const VALIDADES = [30, 90, 180, 365] as const;
export const VALIDADE_PADRAO = 90;
/** Teto de tokens ativos por pessoa: um por ferramenta basta. */
export const MAXIMO_DE_TOKENS_ATIVOS = 20;

export const novoTokenSchema = z.object({
  name: z.string({ error: "Informe um nome para o token." }).trim().min(1, "Informe um nome para o token.").max(120, "Use até 120 caracteres."),
  scopes: z.array(z.enum(LISTA_DE_ESCOPOS as [Escopo, ...Escopo[]], { error: "Escopo inválido." }), { error: "Escolha o que o token pode fazer." })
    .min(1, "Escolha o que o token pode fazer.")
    .transform(lista => LISTA_DE_ESCOPOS.filter(e => lista.includes(e))),
  days: z.coerce.number({ error: "Escolha a validade." }).refine(d => (VALIDADES as readonly number[]).includes(d), "Escolha a validade."),
});
export type NovoToken = z.infer<typeof novoTokenSchema>;

/** Escrever pressupõe ler: quem cria um item precisa conseguir conferi-lo. */
export function escoposEfetivos(escopos: readonly string[]): Escopo[] {
  const validos = LISTA_DE_ESCOPOS.filter(e => escopos.includes(e));
  return validos.includes("controle-interno:escrever") && !validos.includes("controle-interno:ler")
    ? ["controle-interno:ler", ...validos] : validos;
}
export const lerEscopos = (gravado: string) => escoposEfetivos(gravado.split(",").map(s => s.trim()));
export const gravarEscopos = (escopos: readonly Escopo[]) => escoposEfetivos(escopos).join(",");

/** O começo e o fim do token, para a pessoa reconhecer qual é sem ver o token. */
export const pistaDoToken = (token: string) => `${token.slice(0, 8)}…${token.slice(-4)}`;

/** O token que chegou no cabeçalho `Authorization: Bearer …`, se tem o formato. */
export function tokenDoCabecalho(authorization: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "");
  return m && FORMATO_DO_TOKEN.test(m[1]) ? m[1] : null;
}

/**
 * As rotas que se autenticam pelo token pessoal, no próprio handler. O proxy
 * deixa passar só estas sem a sessão da equipe (e sem cabeçalho de identidade).
 */
export function ehRotaDeTokenPessoal(pathname: string) {
  return (
    pathname === "/api/mcp" ||
    pathname === "/api/v1/controle-interno" ||
    pathname.startsWith("/api/v1/controle-interno/") ||
    // O ranking da Academia (10/11/2026), para o post do Slack pelo n8n.
    pathname.startsWith("/api/v1/academia/")
  );
}

export type SituacaoDoToken = "ativo" | "vencido" | "revogado";
export function situacaoDoToken(t: { expiresAt: Date; revokedAt: Date | null }, agora = new Date()): SituacaoDoToken {
  if (t.revokedAt) return "revogado";
  return t.expiresAt.getTime() <= agora.getTime() ? "vencido" : "ativo";
}

/**
 * O endereço do Connect para o comando da IA (05/11/2026). Era o host da página
 * aberta: quem criava o token em `societario.` levava o endereço do Societário,
 * e os links dos itens criados pela IA abriam com o Societário como setor. Com
 * o domínio configurado, vale o endereço neutro (`app.`); sem ele (local), o
 * da página.
 */
export function origemDoComando(paginaAberta: string, hostNeutro: string | null): string {
  if (!hostNeutro) return paginaAberta;
  const proto = paginaAberta.startsWith("http://") ? "http" : "https";
  return `${proto}://${hostNeutro}`;
}

/**
 * O comando do Claude Code. `--scope user` vale para todas as pastas: sem ele, o
 * servidor fica só na pasta onde o terminal estava (o Kauan rodou em
 * `C:\WINDOWS\system32`, e o Claude Code aberto no projeto não o enxergava).
 */
export function comandoDoClaudeCode(origem: string, token: string): string {
  return `claude mcp add --scope user --transport http connect ${origem}/api/mcp --header "Authorization: Bearer ${token}"`;
}
