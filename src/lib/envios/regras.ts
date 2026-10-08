// Os envios ao cliente (08/10/2026): o antigo "Documentos para cliente" da
// ficha da empresa mudou-se para a central de Solicitações, como a aba
// "Envios", e passou a aparecer também no portal — o cliente lê e dá o aceite
// lá, e quem não tem portal segue recebendo o link `/d/{token}` por e-mail.
//
// Funções puras: a situação de cada envio, qual linha de destinatário é a da
// pessoa do portal, a validação do aceite e as rotas. As consultas ficam em
// `consultas.ts`; a gravação da prova (visualização, download, aceite), em
// `lib/clientDocuments.ts`, a mesma da página pública.
//
// Não há tabela nova: a pessoa do portal vira uma linha de
// `ClientDocumentRecipient` (o mesmo destinatário do e-mail), e a prova dela
// mora na mesma trilha que a equipe já lê.

// ─── Situação (lado da equipe) ───────────────────────────────────────────────

/**
 * Onde o envio está, do ponto de vista da equipe. Uma só por envio, na ordem
 * em que acontece:
 * - `rascunho`: ainda não publicado — o cliente não vê;
 * - `enviado`: publicado (no portal e, se mandaram, por e-mail), e ninguém abriu;
 * - `aguardando-aceite`: pede aceite, alguém já abriu e ninguém aceitou;
 * - `visto`: não pede aceite, e alguém abriu;
 * - `aceito`: alguém deu o aceite.
 *
 * O aceite é do cliente, não de cada endereço: o documento é de uma empresa, e
 * basta um aceite dela — a mesma régua do comunicado, que conta como "lido" o
 * cliente em que alguém leu.
 */
export type SituacaoDoEnvio = "rascunho" | "enviado" | "aguardando-aceite" | "visto" | "aceito";

export const SITUACOES_DO_ENVIO: readonly { chave: SituacaoDoEnvio; rotulo: string }[] = [
  { chave: "rascunho", rotulo: "Rascunho" },
  { chave: "enviado", rotulo: "Enviado, não visto" },
  { chave: "aguardando-aceite", rotulo: "Aguardando aceite" },
  { chave: "visto", rotulo: "Visto" },
  { chave: "aceito", rotulo: "Aceito" },
];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoEnvio, string> = Object.fromEntries(
  SITUACOES_DO_ENVIO.map((s) => [s.chave, s.rotulo])
) as Record<SituacaoDoEnvio, string>;

export function ehSituacaoDoEnvio(valor: string | null | undefined): valor is SituacaoDoEnvio {
  return SITUACOES_DO_ENVIO.some((s) => s.chave === valor);
}

type LinhaComProva = { sentAt: Date | null; firstViewedAt: Date | null; signedAt: Date | null };

export function situacaoDoEnvio(envio: {
  status: "DRAFT" | "PUBLISHED";
  requiresSignature: boolean;
  recipients: readonly LinhaComProva[];
}): SituacaoDoEnvio {
  if (envio.status === "DRAFT") return "rascunho";
  if (envio.requiresSignature && envio.recipients.some((r) => r.signedAt)) return "aceito";
  if (envio.recipients.some((r) => r.firstViewedAt)) return envio.requiresSignature ? "aguardando-aceite" : "visto";
  return "enviado";
}

/** Os envios que esperam alguém: a equipe publicar, o cliente abrir, o cliente aceitar. */
export const SITUACOES_PARADAS: readonly SituacaoDoEnvio[] = ["rascunho", "enviado", "aguardando-aceite"];

// ─── A pessoa do portal como destinatário ────────────────────────────────────

/** O e-mail como é guardado e comparado: sem espaço e em minúsculas (o portal já guarda assim). */
export function emailDoDestinatario(email: string): string {
  return email.trim().toLowerCase();
}

type LinhaDeDestinatario = { email: string; createdAt: Date; signedAt: Date | null; firstViewedAt: Date | null };

/**
 * A linha de destinatário que é desta pessoa: a do mesmo e-mail (sem diferença
 * de maiúscula). Se a equipe já mandou o documento para o e-mail dela, é essa
 * linha — e a prova do portal soma à do link do e-mail. `null` = ela ainda não
 * é destinatária, e a primeira abertura no portal cria a linha.
 *
 * Duas linhas com o mesmo e-mail não deveriam existir, mas não há índice que
 * impeça (o envio por e-mail procura antes de criar, e o portal também). Se
 * houver, vale a que tem aceite, depois a que já foi aberta, depois a mais
 * antiga — sempre a mesma, para a tela não trocar de linha entre uma visita e
 * outra.
 */
export function linhaDaPessoa<T extends LinhaDeDestinatario>(linhas: readonly T[], email: string): T | null {
  const alvo = emailDoDestinatario(email);
  const dela = linhas.filter((l) => emailDoDestinatario(l.email) === alvo);
  if (dela.length === 0) return null;
  return [...dela].sort(
    (a, b) =>
      Number(!!b.signedAt) - Number(!!a.signedAt) ||
      Number(!!b.firstViewedAt) - Number(!!a.firstViewedAt) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  )[0]!;
}

// ─── Situação (lado do cliente) ──────────────────────────────────────────────

export type EnvioParaOCliente = {
  /** Esta pessoa ainda não abriu o documento. */
  novo: boolean;
  /** `null` = o documento não pede aceite. */
  aceite: "pendente" | "feito" | null;
};

export function situacaoParaOCliente(
  envio: { requiresSignature: boolean; recipients: readonly LinhaDeDestinatario[] },
  email: string
): EnvioParaOCliente {
  const minha = linhaDaPessoa(envio.recipients, email);
  return {
    novo: !minha?.firstViewedAt,
    aceite: envio.requiresSignature ? (envio.recipients.some((r) => r.signedAt) ? "feito" : "pendente") : null,
  };
}

// ─── Aceite ──────────────────────────────────────────────────────────────────

/**
 * O que a pessoa preenche para dar o aceite — a mesma regra na página pública
 * (`/d/{token}/assinar`) e no portal: o nome completo e a marca de que leu e
 * concorda. O nome vai cortado no tamanho da coluna.
 */
export function validarAceite(bruto: { nome: unknown; consentimento: unknown }): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = typeof bruto.nome === "string" ? bruto.nome.trim() : "";
  if (nome.length < 3) return { ok: false, erro: "Informe seu nome completo para assinar." };
  if (bruto.consentimento !== true && bruto.consentimento !== "true") return { ok: false, erro: "É preciso marcar o aceite para assinar." };
  return { ok: true, nome: nome.slice(0, 180) };
}

/**
 * Por que este aceite não pode ser gravado, ou `null` se pode:
 * - `indisponivel`: rascunho, ou documento que não pede aceite;
 * - `ja-aceito`: o aceite já foi dado — aceite não se repete nem se sobrescreve.
 */
export function recusaDoAceite(envio: { status: "DRAFT" | "PUBLISHED"; requiresSignature: boolean }, jaAceito: boolean): "indisponivel" | "ja-aceito" | null {
  if (envio.status !== "PUBLISHED" || !envio.requiresSignature) return "indisponivel";
  if (jaAceito) return "ja-aceito";
  return null;
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

function comEmpresa(caminho: string, empresaId?: string | null): string {
  return empresaId ? `${caminho}?empresa=${encodeURIComponent(empresaId)}` : caminho;
}

export const rotaDosEnvios = (empresaId?: string | null) => comEmpresa("/solicitacoes/envios", empresaId);
export const rotaDoNovoEnvio = (empresaId?: string | null) => comEmpresa("/solicitacoes/envios/novo", empresaId);
export const rotaDoEnvio = (id: string) => `/solicitacoes/envios/${encodeURIComponent(id)}`;
export const rotaDeEditarOEnvio = (id: string) => `${rotaDoEnvio(id)}/editar`;

/**
 * Para onde vai cada endereço antigo de `/empresas/{id}/documentos-cliente` —
 * favorito, link colado numa conversa. Os links que o cliente recebeu por
 * e-mail são `/d/{token}` e não mudam.
 */
export function destinoDaRotaAntiga(empresaId: string, resto: { docId?: string; tela?: "novo" | "editar" } = {}): string {
  if (resto.tela === "novo") return rotaDoNovoEnvio(empresaId);
  if (resto.docId) return resto.tela === "editar" ? rotaDeEditarOEnvio(resto.docId) : rotaDoEnvio(resto.docId);
  return rotaDosEnvios(empresaId);
}

/** No portal: a lista, o documento e o anexo. */
export const rotaDoEnvioNoPortal = (id: string) => `/portal/envios/${encodeURIComponent(id)}`;
export const rotaDoArquivoNoPortal = (id: string) => `${rotaDoEnvioNoPortal(id)}/arquivo`;
