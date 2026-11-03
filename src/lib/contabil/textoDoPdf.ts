// O texto de cada página de um PDF (03/11/2026), no formato que os leitores
// dos pagamentos sem nota esperam: o do `extract_text()` do pdfplumber, que é
// o que o SPED Generator usava. Quem lê é o pdf.js (pacote `unpdf`), que
// entrega pedaços soltos com a posição; aqui eles viram linhas.
//
// Como o pdfplumber faz, e por isso igual:
// - a linha junta o que está na mesma altura, com 3 pontos de tolerância;
// - dentro da linha, da esquerda para a direita, e um espaço só entre palavras
//   (o espaço do PDF não conta, conta a distância);
// - a página sem camada de texto volta "" — é imagem, e o Connect não faz OCR:
//   quem envia preenche os valores à mão.

import { extractTextItems, type StructuredTextItem } from "unpdf";

const TOLERANCIA_Y = 3;
const TOLERANCIA_X = 3;

type Pedaco = Pick<StructuredTextItem, "str" | "x" | "y" | "width">;

/** As linhas de uma página a partir dos pedaços do pdf.js. */
export function textoDaPagina(pedacos: readonly Pedaco[]): string {
  const visiveis = pedacos.filter((p) => p.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: Pedaco[][] = [];
  let ultimaY = Number.NaN;
  for (const p of visiveis) {
    // Encadeado como o `cluster_list` do pdfplumber: cada um perto do anterior.
    if (linhas.length && ultimaY - p.y <= TOLERANCIA_Y) linhas[linhas.length - 1].push(p);
    else linhas.push([p]);
    ultimaY = p.y;
  }
  return linhas
    .map((linha) => {
      let texto = "";
      let fim = Number.NEGATIVE_INFINITY;
      for (const p of [...linha].sort((a, b) => a.x - b.x)) {
        const separa = texto && (p.x - fim > TOLERANCIA_X || /\s$/.test(texto) || /^\s/.test(p.str));
        texto += (separa ? " " : "") + p.str;
        fim = Math.max(fim, p.x + p.width);
      }
      return texto.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** O texto de cada página, na ordem; "" na página sem texto. Lança se o arquivo não for um PDF legível. */
export async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  // O pdf.js toma posse do buffer: uma cópia, para quem chamou continuar com o dele.
  const { items } = await extractTextItems(new Uint8Array(bytes));
  return items.map(textoDaPagina);
}
