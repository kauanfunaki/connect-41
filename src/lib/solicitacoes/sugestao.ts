// "Sugestão ou problema no portal" (21/10/2026, pedido da lista de 15/10 —
// "não tenho um meio direto com o cliente"): o botão no rodapé do menu do
// portal abre uma janela com a nota e o texto, e o que o cliente manda vira uma
// solicitação comum, no assunto abaixo, para o setor Tech. Assim ela entra na
// fila, no aviso de solicitação nova e no prazo, sem tela nova na equipe.
//
// O assunto nasce sozinho na primeira sugestão, se o escritório ainda não o
// criou. Desativado em Assuntos das solicitações, o botão some.

export const ASSUNTO_DA_SUGESTAO = {
  label: "Sugestão ou problema no portal",
  description: "Uma ideia para o portal, ou algo que não funcionou como devia.",
  sectorCode: "tech",
  responseDays: 2,
} as const;

export const NOTAS_DA_SUGESTAO = [
  { valor: 1, rotulo: "Muito ruim" },
  { valor: 2, rotulo: "Ruim" },
  { valor: 3, rotulo: "Regular" },
  { valor: 4, rotulo: "Bom" },
  { valor: 5, rotulo: "Muito bom" },
] as const;

const MAXIMO_DO_TEXTO = 4000;

/** A tela de onde veio: só o caminho do portal, sem o resto (nada de outro site). */
export function telaDaSugestao(valor: string): string | null {
  const caminho = valor.trim().split(/[?#]/)[0] ?? "";
  return /^\/portal(\/[\w\-/[\]]*)?$/.test(caminho) ? caminho.slice(0, 200) : null;
}

/**
 * Lê a sugestão e monta o texto da solicitação: a nota e a tela em cima, o
 * que o cliente escreveu embaixo. Pede a nota ou o texto — os dois vazios não
 * dizem nada.
 */
export function validarSugestao(campos: { nota: string; texto: string; tela: string }): { ok: true; descricao: string } | { ok: false; erro: string } {
  const nota = NOTAS_DA_SUGESTAO.find((n) => String(n.valor) === campos.nota.trim()) ?? null;
  const texto = campos.texto.trim();
  if (!nota && !texto) return { ok: false, erro: "Escolha uma nota ou escreva o que aconteceu." };
  if (texto.length > MAXIMO_DO_TEXTO) return { ok: false, erro: `Escreva até ${MAXIMO_DO_TEXTO} caracteres.` };
  const tela = telaDaSugestao(campos.tela);
  const linhas = [
    nota ? `Nota do portal: ${nota.valor} de 5 (${nota.rotulo})` : null,
    tela ? `Tela: ${tela}` : null,
    "",
    texto || "(sem comentário)",
  ].filter((l): l is string => l !== null);
  return { ok: true, descricao: linhas.join("\n") };
}
