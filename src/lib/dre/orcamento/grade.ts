// A grade do orçamento: grupo da DRE × mês, em centavos. Função pura, sem banco.
//
// ─── Magnitude na grade, sinal na DRE ───────────────────────────────────────
//
// Quem orça escreve "aluguel 5.000", não "−5.000". A grade guarda **magnitude
// positiva** e o sinal sai da origem do grupo (`GRUPOS[].origem`) na hora de
// virar `porGrupo` — o formato que `montarLinhas` consome. A partir daí o
// orçado passa pelo **mesmo** motor de linhas da DRE realizada, e "margem de
// contribuição orçada" significa a mesma conta que a realizada.
//
// ─── Centavos inteiros, reajuste em BigInt ──────────────────────────────────
//
// Reajuste é percentual com até duas casas, aplicado célula a célula e
// arredondado para centavo **na célula** (meio centavo sobe). Arredondar só no
// total faria a soma da linha diferir da soma das células. A conta passa por
// BigInt porque centavos × fator em pontos-base passa de 2^53 bem antes do teto
// do `Decimal(14,2)`.

import { GRUPOS, NAO_CLASSIFICADO, TRANSFERENCIA } from "@/lib/dre/estrutura";
import { centavosDeTexto } from "@/lib/financeiro/manual";

export const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const ROTULOS_DOS_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Teto do `Decimal(14,2)`: doze dígitos inteiros. */
export const MAIOR_VALOR_ORCADO = 999_999_999_999_99;

/** groupCode → doze magnitudes em centavos; índice 0 é janeiro. */
export type Grade = Record<string, number[]>;

export type LinhaDaGrade = { groupCode: string; month: number; centavos: number };

const CODIGOS = new Set(GRUPOS.map((g) => g.code));
const ORIGEM = new Map(GRUPOS.map((g) => [g.code, g.origem]));

export function gradeVazia(): Grade {
  const g: Grade = {};
  for (const grupo of GRUPOS) g[grupo.code] = MESES.map(() => 0);
  return g;
}

/**
 * A grade a partir das linhas gravadas. Grupo que não existe mais na estrutura
 * é ignorado — a estrutura é da 41 e mora em código; linha órfã não tem onde
 * aparecer, e somá-la em outro grupo seria inventar.
 */
export function gradeDeLinhas(linhas: LinhaDaGrade[]): Grade {
  const g = gradeVazia();
  for (const l of linhas) {
    if (!CODIGOS.has(l.groupCode) || l.month < 1 || l.month > 12) continue;
    g[l.groupCode]![l.month - 1] = l.centavos;
  }
  return g;
}

/** As linhas a gravar: só as diferentes de zero — célula sem linha vale zero. */
export function linhasDaGrade(grade: Grade): LinhaDaGrade[] {
  const saida: LinhaDaGrade[] = [];
  for (const grupo of GRUPOS) {
    const valores = grade[grupo.code] ?? [];
    MESES.forEach((m, i) => {
      const c = valores[i] ?? 0;
      if (c !== 0) saida.push({ groupCode: grupo.code, month: m, centavos: c });
    });
  }
  return saida;
}

/** Nome do campo de uma célula no formulário da grade. */
export function campoDaCelula(groupCode: string, month: number): string {
  return `v:${groupCode}:${month}`;
}

/**
 * Lê a grade enviada pelo formulário.
 *
 * Célula vazia é zero. Valor ilegível, negativo, com três casas ou acima do
 * teto é recusa **com o grupo e o mês** — a grade tem 144 células, e "valor
 * inválido" sem dizer onde é procurar agulha. Campo de grupo ou mês que não
 * existe é recusa: a tela só manda o que a estrutura tem.
 */
export function lerGrade(campos: Iterable<[string, string]>): { ok: true; grade: Grade } | { ok: false; erro: string } {
  const grade = gradeVazia();
  for (const [chave, bruto] of campos) {
    if (!chave.startsWith("v:")) continue;
    const [, codigo, mesTexto] = chave.split(":");
    const mes = Number(mesTexto);
    const grupo = GRUPOS.find((g) => g.code === codigo);
    if (!grupo || !Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, erro: "A grade veio com uma célula que não existe — recarregue a tela." };
    const texto = String(bruto ?? "").trim();
    if (texto === "") continue;
    const onde = `${grupo.label}, ${ROTULOS_DOS_MESES[mes - 1]}`;
    if (texto.startsWith("-")) return { ok: false, erro: `${onde}: use valor positivo — o sinal vem do grupo (despesa já subtrai).` };
    const centavos = centavosDeTexto(texto);
    if (centavos === null) return { ok: false, erro: `${onde}: valor ilegível. Use, por exemplo, 1.234,56.` };
    if (centavos > MAIOR_VALOR_ORCADO) return { ok: false, erro: `${onde}: valor acima do limite.` };
    grade[grupo.code]![mes - 1] = centavos;
  }
  return { ok: true, grade };
}

/**
 * Os totais por grupo de um conjunto de meses, **com sinal** — recebimento
 * positivo, pagamento negativo —, no formato de `montarLinhas`. Os dois grupos
 * fora do resultado entram zerados para o formato ser o mesmo da DRE.
 */
export function porGrupoOrcado(grade: Grade, meses: readonly number[]): Record<string, number> {
  const saida: Record<string, number> = { [NAO_CLASSIFICADO]: 0, [TRANSFERENCIA]: 0 };
  for (const grupo of GRUPOS) {
    const valores = grade[grupo.code] ?? [];
    const soma = meses.reduce((n, m) => n + (valores[m - 1] ?? 0), 0);
    saida[grupo.code] = grupo.origem === "pagamento" ? -soma : soma;
  }
  return saida;
}

/** Total anual de um grupo, em magnitude. */
export function totalDoGrupo(grade: Grade, groupCode: string): number {
  return (grade[groupCode] ?? []).reduce((a, b) => a + b, 0);
}

/**
 * Lê o percentual de reajuste: "5", "5,5", "-3,25". Vazio é zero. Até duas
 * casas, acima de −100% (−100% zeraria tudo, e aí é criar versão vazia) e até
 * +1000%.
 */
export function lerReajuste(texto: string | null | undefined): { ok: true; pct: number } | { ok: false; erro: string } {
  const t = (texto ?? "").trim().replace("%", "").replace(",", ".");
  if (t === "") return { ok: true, pct: 0 };
  if (!/^-?\d{1,4}(\.\d{1,2})?$/.test(t)) return { ok: false, erro: "Reajuste inválido. Use um percentual como 5 ou 4,5." };
  const pct = Number(t);
  if (pct <= -100 || pct > 1000) return { ok: false, erro: "Reajuste deve ficar acima de −100% e até 1000%." };
  return { ok: true, pct };
}

/** Uma magnitude reajustada, arredondada para centavo (meio centavo sobe). */
export function reajustar(centavos: number, pct: number): number {
  if (pct === 0 || centavos === 0) return centavos;
  const pontosBase = BigInt(10_000 + Math.round(pct * 100));
  const negativo = centavos < 0;
  const base = BigInt(Math.abs(centavos));
  // round(base × fator / 10000) com meio para cima, em inteiros.
  const r = (base * pontosBase * BigInt(2) + BigInt(10_000)) / BigInt(20_000);
  const n = Number(r);
  return negativo ? -n : n;
}

/** A grade inteira reajustada, célula a célula. */
export function copiarComReajuste(grade: Grade, pct: number): Grade {
  const g = gradeVazia();
  for (const grupo of GRUPOS) g[grupo.code] = MESES.map((_, i) => Math.min(reajustar(grade[grupo.code]?.[i] ?? 0, pct), MAIOR_VALOR_ORCADO));
  return g;
}

/**
 * A grade a partir do realizado de um ano (DRE econômica mês a mês), reajustado.
 *
 * O realizado vem com sinal; a grade quer magnitude na direção da origem do
 * grupo. Um grupo que num mês andou **contra** a origem (despesa com estorno
 * maior que o gasto, receita com devolução maior que a venda) vira zero, e não
 * valor negativo: orçar "despesa negativa" não é algo que se digita, e a
 * pessoa ajusta a célula se quiser.
 *
 * `porMes[i]` é o `porGrupo` de janeiro (i = 0) a dezembro; `null` é mês sem DRE.
 */
export function gradeDoRealizado(porMes: (Record<string, number> | null)[], pct: number): Grade {
  const g = gradeVazia();
  for (const grupo of GRUPOS) {
    g[grupo.code] = MESES.map((_, i) => {
      const valor = porMes[i]?.[grupo.code] ?? 0;
      const magnitude = ORIGEM.get(grupo.code) === "pagamento" ? -valor : valor;
      return Math.min(reajustar(Math.max(0, magnitude), pct), MAIOR_VALOR_ORCADO);
    });
  }
  return g;
}

/** Centavos para o texto de uma célula ("1234,56"); zero vira vazio. */
export function textoDaCelula(centavos: number): string {
  if (centavos === 0) return "";
  const inteiro = Math.trunc(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `${inteiro},${resto}`;
}
