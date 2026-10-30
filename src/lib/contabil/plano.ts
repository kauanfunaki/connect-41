// A leitura do plano de contas exportado da Domínio (29/10/2026), para a carga
// pela tela — no SPED Generator era `ferramentas/carregar_plano_contas.py`,
// pelo terminal. As colunas são achadas pelo cabeçalho, não pela posição: a
// exportação da Domínio varia de arquivo para arquivo.
//
// O `.xls` que a Domínio exporta não abre em biblioteca nenhuma (os
// deslocamentos das abas não seguem o padrão); a tela pede para salvar como
// `.xlsx` ou `.csv` no Excel antes, que é o que o script de lá fazia por COM.

import { normalizeHeader } from "@/lib/csv";
import type { ContaDoPlano } from "./lancamentos";

export type ContaLida = ContaDoPlano & { analitica: boolean };
export type LeituraDoPlano = { ok: true; contas: ContaLida[]; ignoradas: number } | { ok: false; erro: string };

// "Classificação" (1.1.1.01.0001) e "Código" (o reduzido) são colunas diferentes;
// trocar as duas faria o de-para guardar o identificador interno da Domínio.
const SINONIMOS = {
  classificacao: ["classificacao"],
  reduzido: ["codigo", "codconta", "reduzido", "codigoreduzido"],
  nome: ["nome", "descricao", "titulo", "nomedaconta"],
  tipo: ["t", "tipo", "natureza"],
} as const;

function acharColuna(cabecalho: string[], nomes: readonly string[]): number {
  const normal = cabecalho.map(normalizeHeader);
  for (const n of nomes) {
    const i = normal.indexOf(n);
    if (i >= 0) return i;
  }
  return normal.findIndex((c) => c.length > 1 && nomes.some((n) => n.length > 1 && c.startsWith(n)));
}

/**
 * As contas das linhas da planilha. O cabeçalho é a primeira linha que tem
 * classificação e nome — a exportação traz título e data em cima. Linha sem
 * reduzido ou sem classificação é ignorada e contada.
 */
export function lerPlanoDeContas(linhas: string[][]): LeituraDoPlano {
  const inicio = linhas.findIndex((l) => acharColuna(l, SINONIMOS.classificacao) >= 0 && acharColuna(l, SINONIMOS.nome) >= 0);
  if (inicio < 0) return { ok: false, erro: "Não achei as colunas Classificação e Nome. Confira se é o plano de contas exportado da Domínio." };
  const cab = linhas[inicio];
  const col = {
    classificacao: acharColuna(cab, SINONIMOS.classificacao),
    reduzido: acharColuna(cab, SINONIMOS.reduzido),
    nome: acharColuna(cab, SINONIMOS.nome),
    tipo: acharColuna(cab, SINONIMOS.tipo),
  };
  if (col.reduzido < 0) return { ok: false, erro: "Não achei a coluna do código reduzido (Código). Ela é o que vai na planilha de importação." };
  const contas = new Map<string, ContaLida>();
  let ignoradas = 0;
  for (const l of linhas.slice(inicio + 1)) {
    const reduzido = (l[col.reduzido] ?? "").trim().replace(/\.0$/, "");
    const classificacao = (l[col.classificacao] ?? "").trim();
    const nome = (l[col.nome] ?? "").trim().replace(/\s+/g, " ");
    if (!/^\d{1,20}$/.test(reduzido) || !/^[\d.]{1,40}$/.test(classificacao) || !nome) {
      if (l.some((c) => c.trim())) ignoradas++;
      continue;
    }
    // Sintética é "S" na coluna de tipo; sem a coluna, toda conta conta como analítica.
    const tipo = col.tipo >= 0 ? (l[col.tipo] ?? "").trim().toUpperCase() : "";
    contas.set(reduzido, { reduzido, classificacao, nome: nome.slice(0, 200), analitica: tipo !== "S" });
  }
  if (!contas.size) return { ok: false, erro: "Nenhuma conta com código e classificação na planilha." };
  return { ok: true, contas: [...contas.values()], ignoradas };
}
