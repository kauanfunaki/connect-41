// A origem da candidatura — por onde o candidato chegou à vaga.
//
// O campo continua texto livre (`Candidatura.origin`, até 80 caracteres). O que
// muda (escolha "Vaga · 5 A" do Kauan, 14/10/2026) é a tela: no painel de
// adicionar candidato, a origem vira opções prontas, com "Outra…" para
// escrever. O "Portal" grava o mesmo código que a inscrição pelo portal grava
// (`PORTAL`, em /api/carreiras/apply), para as duas entradas contarem juntas.

export type ChaveDaOrigem = "INDICACAO" | "PORTAL" | "WHATSAPP" | "LINKEDIN" | "OUTRA";

export const ORIGENS: { chave: ChaveDaOrigem; rotulo: string }[] = [
  { chave: "INDICACAO", rotulo: "Indicação" },
  { chave: "PORTAL", rotulo: "Portal" },
  { chave: "WHATSAPP", rotulo: "WhatsApp" },
  { chave: "LINKEDIN", rotulo: "LinkedIn" },
  { chave: "OUTRA", rotulo: "Outra…" },
];

/** O que fica gravado para cada opção pronta. */
const VALOR_GRAVADO: Record<Exclude<ChaveDaOrigem, "OUTRA">, string> = {
  INDICACAO: "Indicação",
  PORTAL: "PORTAL",
  WHATSAPP: "WhatsApp",
  LINKEDIN: "LinkedIn",
};

export const MAX_ORIGEM = 80;

/** A origem escolhida no painel, como vai para o banco; null sem escolha (a origem é opcional). */
export function origemParaGravar(chave: ChaveDaOrigem | null, outra: string): string | null {
  if (!chave) return null;
  if (chave !== "OUTRA") return VALOR_GRAVADO[chave];
  const texto = outra.trim().replace(/\s+/g, " ").slice(0, MAX_ORIGEM);
  return texto || null;
}

/**
 * Normaliza a origem que chega a uma action — vem do navegador, então é
 * entrada de formulário: texto aparado, no tamanho da coluna, vazio vira null.
 */
export function limparOrigem(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/\s+/g, " ").slice(0, MAX_ORIGEM);
  return texto || null;
}

/** Como a origem aparece no cartão ("via Portal de vagas"): o código do portal ganha nome. */
export function rotuloDaOrigem(origem: string): string {
  if (origem === "PORTAL") return "Portal de vagas";
  if (origem === "WHATSAPP") return "WhatsApp";
  return origem;
}
