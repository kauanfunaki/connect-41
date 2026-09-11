// Leitura do export do Omie — o arquivo que o BPO já gera todo mês.
//
// ─── Por que o arquivo, e não a API ─────────────────────────────────────────
//
// A API do Omie existe e a integração já está declarada no catálogo, sem
// adaptador. Escrevê-lo exigiria adivinhar nomes de campo, porque ninguém aqui
// tem credencial para observar uma resposta real — e adaptador escrito contra
// contrato não observado é a coisa que este projeto decidiu não fazer, quando
// recusou escrever o robô do SIMA sem o texto das páginas.
//
// O export, por outro lado, **está observado**: 33 colunas, lido do arquivo
// `10-DRE Irriga_2025_010.xlsx` em 11/09/2026. E é o que o setor já produz
// todo mês, o que significa que o DRE do Connect funciona na segunda-feira sem
// esperar credencial nenhuma.
//
// ─── Coluna por nome, nunca por posição ─────────────────────────────────────
//
// No arquivo observado a categoria está em `L` e o valor em `AF`. Fixar isso
// seria fixar uma observação: basta o Omie acrescentar uma coluna para tudo
// deslocar, e o import passaria a somar a coluna errada **sem erro nenhum** —
// que é a pior forma de quebrar.

/** Uma célula como vem do leitor de planilha. */
export type Celula = string | number | Date | null | undefined;

export type LinhaDoExport = {
  /** Data de crédito ou débito no extrato — é ela que define o mês. */
  data: Date;
  categoria: string | null;
  /** Centavos. Já com o sinal do arquivo: negativo em pagamento. */
  valorCentavos: number;
  origem: "recebimento" | "pagamento";
};

export type LeituraDoExport = {
  linhas: LinhaDoExport[];
  origem: "recebimento" | "pagamento";
  /** Linhas puladas, com o motivo — a tela mostra antes de gravar. */
  ignoradas: { linha: number; motivo: string }[];
};

export class ExportIlegivel extends Error {
  constructor(motivo: string) {
    super(`Não consegui ler este arquivo: ${motivo}`);
    this.name = "ExportIlegivel";
  }
}

function texto(c: Celula): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return "";
  return String(c).trim();
}

/** Normaliza cabeçalho para comparar: sem acento, sem caixa, sem pontuação. */
function chaveDoCabecalho(c: Celula): string {
  return texto(c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COLUNA_DATA = "data de credito ou debito no extrato";
const COLUNA_CATEGORIA = "categoria";
const COLUNA_PAGO = "valor pago";
const COLUNA_RECEBIDO = "recebido";

/**
 * Acha a linha de cabeçalho.
 *
 * Procura em vez de assumir a primeira: o export pode vir com linha de título
 * ou de filtro acima, e somar a partir da linha errada produziria um mês
 * incompleto — que passa por mês ruim, não por import quebrado.
 */
function acharCabecalho(matriz: Celula[][]): { indice: number; colunas: Map<string, number> } {
  for (let i = 0; i < Math.min(matriz.length, 20); i++) {
    const linha = matriz[i] ?? [];
    const colunas = new Map<string, number>();
    linha.forEach((c, j) => {
      const k = chaveDoCabecalho(c);
      if (k && !colunas.has(k)) colunas.set(k, j);
    });
    const temValor = colunas.has(COLUNA_PAGO) || colunas.has(COLUNA_RECEBIDO);
    if (colunas.has(COLUNA_CATEGORIA) && temValor) return { indice: i, colunas };
  }
  throw new ExportIlegivel(
    "não achei as colunas Categoria e Valor Pago (ou Recebido). Exporte de Contas a Pagar ou a Receber, no Omie, sem tirar colunas."
  );
}

/**
 * Valor em centavos, a partir do que a planilha devolveu.
 *
 * Número vem do leitor como `number` e é multiplicado por 100 com
 * arredondamento — é o único ponto onde float toca dinheiro aqui, e é
 * inevitável: o arquivo guarda float. Texto é aceito no formato brasileiro,
 * porque um CSV exportado traz "1.234,56".
 */
export function centavosDaCelula(c: Celula): number | null {
  if (typeof c === "number") {
    if (!Number.isFinite(c)) return null;
    return Math.round(c * 100);
  }
  const t = texto(c);
  if (!t) return null;
  // "R$ -1.234,56" → "-1234.56"
  const limpo = t
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * A data de uma célula, **como dia de calendário**.
 *
 * ─── O bug que isto conserta ────────────────────────────────────────────────
 *
 * A planilha guarda data sem fuso: "06/10/2025" é o dia seis, e ponto. O leitor
 * devolve isso como `2025-10-06T00:00:00Z` — meia-noite **em UTC**. Tratar esse
 * instante como momento e convertê-lo para São Paulo joga a data para as 21h do
 * dia anterior, e **todo dia 1º vira o mês passado**.
 *
 * Pego rodando o parser contra o arquivo real de outubro: 20 das 473 linhas
 * caíram em setembro. Nenhum teste com data ao meio-dia teria pegado — foi o
 * arquivo de verdade que mostrou.
 *
 * A saída é ancorar sempre ao meio-dia do dia de calendário que o arquivo
 * escreveu, que é distante o bastante das duas bordas para nenhum fuso do
 * Brasil empurrar o dia.
 */
function dataDaCelula(c: Celula): Date | null {
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    return new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 12));
  }
  const t = texto(c);
  // dd/mm/aaaa — o formato do Omie quando o export vem como texto.
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
}

/**
 * Lê o export inteiro.
 *
 * **Zero não é ignorado.** O arquivo de outubro tem duas linhas com valor 0 —
 * devolução de venda — e elas são movimento real, com data e categoria.
 * Pular o que é zero hoje é o mesmo hábito que faz o relatório perder o que
 * não entendeu.
 */
export function lerExportDoOmie(matriz: Celula[][]): LeituraDoExport {
  const { indice, colunas } = acharCabecalho(matriz);

  const colPago = colunas.get(COLUNA_PAGO);
  const colRecebido = colunas.get(COLUNA_RECEBIDO);
  const origem: "recebimento" | "pagamento" = colPago !== undefined ? "pagamento" : "recebimento";
  const colValor = colPago ?? colRecebido!;

  const colData = colunas.get(COLUNA_DATA);
  if (colData === undefined) {
    throw new ExportIlegivel(
      'falta a coluna "Data de Crédito ou Débito (No Extrato)", que é a que define o mês do DRE de caixa.'
    );
  }
  const colCategoria = colunas.get(COLUNA_CATEGORIA)!;

  const linhas: LinhaDoExport[] = [];
  const ignoradas: { linha: number; motivo: string }[] = [];

  for (let i = indice + 1; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];
    const numeroNaPlanilha = i + 1;

    const vazia = linha.every((c) => c === null || c === undefined || texto(c) === "");
    if (vazia) continue;

    const valorCentavos = centavosDaCelula(linha[colValor]);
    if (valorCentavos === null) {
      ignoradas.push({ linha: numeroNaPlanilha, motivo: "sem valor" });
      continue;
    }

    const data = dataDaCelula(linha[colData]);
    if (!data) {
      // Sem data não dá para saber a que mês pertence, e chutar o mês do
      // arquivo colocaria dinheiro no período errado.
      ignoradas.push({ linha: numeroNaPlanilha, motivo: "sem data de crédito ou débito" });
      continue;
    }

    const categoria = texto(linha[colCategoria]) || null;
    linhas.push({ data, categoria, valorCentavos, origem });
  }

  return { linhas, origem, ignoradas };
}

/** O mês (em São Paulo) a que uma data pertence. */
export function mesDaData(d: Date): { ano: number; mes: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  return {
    ano: Number(p.find((x) => x.type === "year")!.value),
    mes: Number(p.find((x) => x.type === "month")!.value),
  };
}

/**
 * Os meses que o arquivo cobre, com quantas linhas em cada.
 *
 * O export costuma trazer um mês só, mas nada garante — e um arquivo com duas
 * competências dentro, importado como se fosse uma, é um DRE errado nos dois
 * meses. A tela mostra isto antes de gravar.
 */
export function mesesDoExport(linhas: LinhaDoExport[]): { ano: number; mes: number; linhas: number }[] {
  const contagem = new Map<string, { ano: number; mes: number; linhas: number }>();
  for (const l of linhas) {
    const { ano, mes } = mesDaData(l.data);
    const chave = `${ano}-${mes}`;
    const atual = contagem.get(chave);
    if (atual) atual.linhas++;
    else contagem.set(chave, { ano, mes, linhas: 1 });
  }
  return [...contagem.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}
