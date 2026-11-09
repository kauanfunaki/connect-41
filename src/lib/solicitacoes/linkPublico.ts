// O link público de pedido (09/11/2026): o endereço que o escritório divulga
// para quem ainda não é cliente pedir algo sem login — e o pedido vira
// solicitação do assunto (decisão do Kauan em 09/11).
//
// Puro e sem banco, e sem o zod: a tela de Assuntos e o formulário público são
// componentes de cliente e importam daqui. A validação mora em
// `pedidoPublico.ts`, que só o servidor carrega.
//
// O link é `/pedido/[slug do escritório]/[id do assunto]`: o slug é o mesmo do
// portal de vagas, e o id do assunto é um uuid v4 — estável (desligar e ligar
// de novo não muda o link já divulgado) e não adivinhável (não dá para
// percorrer os assuntos de um escritório trocando o número).

/** Os campos do formulário, na ordem da tela — o erro aponta o primeiro com problema. */
export const CAMPOS_DO_PEDIDO = ["nome", "email", "telefone", "empresa", "documento", "mensagem", "aceite"] as const;
export type CampoDoPedido = (typeof CAMPOS_DO_PEDIDO)[number];

/** Tamanho máximo de cada campo, o mesmo no `maxLength` da tela e na validação do servidor. */
export const LIMITES_DO_PEDIDO = {
  nome: 120,
  email: 160,
  telefone: 25,
  empresa: 160,
  documento: 18,
  mensagem: 3000,
} as const;

/** Menos que isto não diz à equipe o que fazer. */
export const MINIMO_DA_MENSAGEM = 10;

/**
 * A resposta do envio. `numero` nulo é o "recebemos" dado a robô: nada foi
 * gravado, e dizer que foi recusado ensinaria o robô a ajustar.
 */
export type ResultadoDoPedido = { ok: true; numero: number | null } | { ok: false; erro: string; campo?: CampoDoPedido };

/** O caminho do formulário público de um assunto. */
export function caminhoDoPedido(slugDoEscritorio: string, assuntoId: string): string {
  return `/pedido/${encodeURIComponent(slugDoEscritorio)}/${encodeURIComponent(assuntoId)}`;
}

/**
 * O endereço que a equipe copia: absoluto em `APP_PUBLIC_URL`. Sem ela (ambiente
 * local), só o caminho — a tela completa com o endereço da janela ao copiar.
 */
export function enderecoDoPedido(slugDoEscritorio: string, assuntoId: string, appPublicUrl: string | null | undefined): string {
  const base = (appPublicUrl ?? "").trim().replace(/\/+$/, "");
  const caminho = caminhoDoPedido(slugDoEscritorio, assuntoId);
  return /^https?:\/\//i.test(base) ? `${base}${caminho}` : caminho;
}

/**
 * Por que um link ligado não recebe pedido agora, para a tela de Assuntos
 * dizer junto do link — ou `null` quando ele está no ar. O link de assunto
 * inativo ou com as Solicitações desligadas dá 404 (ver `destinoDoPedido`).
 */
export function avisoDoLinkPublico(s: { ativo: boolean; solicitacoesLigadas: boolean }): string | null {
  if (!s.solicitacoesLigadas) return "As Solicitações estão desligadas em Módulos: o link fica fora do ar até elas serem ligadas.";
  if (!s.ativo) return "Assunto inativo: o link fica fora do ar até o assunto ser reativado.";
  return null;
}

/** Para ler na tela: sem "https://" e com o id cortado — "app.exemplo.com.br/pedido/escritorio/2f9c4e1a…". */
export function enderecoCurtoDoPedido(endereco: string): string {
  const semProtocolo = endereco.replace(/^https?:\/\//i, "");
  const barra = semProtocolo.lastIndexOf("/");
  const id = semProtocolo.slice(barra + 1);
  return id.length > 8 ? `${semProtocolo.slice(0, barra + 1)}${id.slice(0, 8)}…` : semProtocolo;
}
