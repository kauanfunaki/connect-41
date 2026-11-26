// A capa colorida dos cartões, como no Trello (27/11/2026, funcionalidade-845).
//
// O Societário marca no Trello o tipo do processo pela capa do cartão (roxo =
// Constituição, vermelho = Baixa, verde-limão = Alteração e Filial, amarelo =
// Alvará e Licenças, rosa = o resto). Aqui a capa vale para qualquer cartão dos
// Quadros (`PipelineItem.coverColor`) e o tipo de processo tem a sua cor
// (`ProcessType.color`). As duas colunas guardam a **chave** da cor, nunca o
// hex: a paleta pode ser ajustada sem migrar dado, e cor solta não entra.
//
// Regra pura, sem banco: vale no servidor e no navegador.

export type DefinicaoDaCor = {
  /** O que fica gravado no banco. */
  chave: string;
  /** O nome que a tela escreve e o leitor de tela lê. */
  nome: string;
  /** A faixa. */
  fundo: string;
  /** O texto em cima da faixa — contraste AA (4,5:1) com o fundo, conferido no teste. */
  tinta: string;
};

/**
 * A paleta, na ordem do seletor. As cores são sólidas e iguais nos dois temas:
 * o contraste do texto com a faixa não depende do tema. As claras (verde-limão,
 * amarelo, rosa, laranja, ciano) levam texto escuro; as fechadas, branco.
 */
export const CORES_DA_CAPA = [
  { chave: "roxo", nome: "Roxo", fundo: "#6E5DC6", tinta: "#FFFFFF" },
  { chave: "vermelho", nome: "Vermelho", fundo: "#C9372C", tinta: "#FFFFFF" },
  { chave: "lima", nome: "Verde-limão", fundo: "#94C748", tinta: "#1C2B0A" },
  { chave: "amarelo", nome: "Amarelo", fundo: "#E2B203", tinta: "#2E2200" },
  { chave: "rosa", nome: "Rosa", fundo: "#E774BB", tinta: "#3D0A2A" },
  { chave: "azul", nome: "Azul", fundo: "#0C66E4", tinta: "#FFFFFF" },
  { chave: "verde", nome: "Verde", fundo: "#1F845A", tinta: "#FFFFFF" },
  { chave: "laranja", nome: "Laranja", fundo: "#F38A3F", tinta: "#3A1A00" },
  { chave: "cinza", nome: "Cinza", fundo: "#626F86", tinta: "#FFFFFF" },
  { chave: "ciano", nome: "Ciano", fundo: "#6CC3E0", tinta: "#0B2A36" },
] as const satisfies readonly DefinicaoDaCor[];

export type CorDaCapa = (typeof CORES_DA_CAPA)[number]["chave"];

const POR_CHAVE = new Map<string, DefinicaoDaCor>(CORES_DA_CAPA.map((c) => [c.chave, c]));

/** A chave é de uma cor da paleta? (O que vem da tela ou do banco passa por aqui.) */
export function ehCorDaCapa(valor: unknown): valor is CorDaCapa {
  return typeof valor === "string" && POR_CHAVE.has(valor);
}

/** A cor de uma chave gravada; chave vazia ou fora da paleta = sem cor. */
export function corDaCapa(chave: string | null | undefined): DefinicaoDaCor | null {
  return chave ? (POR_CHAVE.get(chave) ?? null) : null;
}

export type CapaDoCartao = {
  cor: DefinicaoDaCor;
  /** `cartao`: escolhida no próprio cartão; `tipo`: herdada do tipo de processo. */
  origem: "cartao" | "tipo";
};

/**
 * A capa que o cartão mostra: a escolhida no cartão vence; sem ela, vale a cor
 * do tipo do processo ligado ao cartão. Hoje o cartão do quadro ainda não tem
 * processo (o vínculo é a funcionalidade-844), então a capa vem só da
 * `coverColor`; quem ligar o processo passa `corDoTipo`.
 *
 * Chave fora da paleta conta como ausente: a do cartão inválida não esconde a
 * do tipo.
 */
export function capaDoCartao({
  coverColor,
  corDoTipo,
}: {
  coverColor: string | null | undefined;
  corDoTipo?: string | null;
}): CapaDoCartao | null {
  const doCartao = corDaCapa(coverColor);
  if (doCartao) return { cor: doCartao, origem: "cartao" };
  const doTipo = corDaCapa(corDoTipo);
  return doTipo ? { cor: doTipo, origem: "tipo" } : null;
}

/** A linha do histórico do cartão quando a capa muda. */
export function textoDaTrocaDeCapa(para: string | null): string {
  const cor = corDaCapa(para);
  return cor ? `Capa: ${cor.nome}` : "Capa removida";
}

/**
 * A troca de capa vai ao histórico do cartão como `TAG_CHANGE` (é marcação
 * visual, como a etiqueta), com esta marca no `metadata` — sem valor novo no
 * enum da atividade, que pediria mexer na coluna. O detalhe usa a marca para
 * escrever "Capa alterada" no lugar de "Etiqueta alterada".
 */
export const MARCA_DA_CAPA = "capa";

export function ehTrocaDeCapa(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null && (metadata as { campo?: unknown }).campo === MARCA_DA_CAPA;
}
