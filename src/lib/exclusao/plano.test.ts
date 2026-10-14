import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { lerEsquema, trava, type RelacaoDoEsquema } from "./lerEsquema";
import { COLUNAS_SOLTAS, LIGACOES, type Entidade } from "./registro";
import type { Passo } from "./comum";
import { PLANO_DA_EMPRESA } from "./empresa";
import { PLANO_DA_PESSOA } from "./pessoa";
import { PLANO_DO_USUARIO } from "./usuario";

// O que se testa: os planos de exclusão sem banco nenhum, contra o schema.
//
// 1. Toda ligação que o registro manda apagar, reatribuir ou anular tem o seu
//    passo no plano.
// 2. A ordem passa pelas chaves estrangeiras: simulando o plano model a model,
//    nenhum passo apaga uma linha que ainda tenha alguém apontando com
//    RESTRICT — considerando o que o banco leva em cascata junto com cada
//    passo e as colunas que passos anteriores anularam ou reatribuíram.
//
// É a prova possível sem banco de que a exclusão não vai esbarrar num P2003
// no meio; a transação, de todo modo, desfaz tudo se esbarrar.

const esquema = lerEsquema(readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8"));

const PLANOS: { raiz: Entidade; plano: readonly Passo<never>[] }[] = [
  { raiz: "Company", plano: PLANO_DA_EMPRESA as readonly Passo<never>[] },
  { raiz: "Person", plano: PLANO_DA_PESSOA as readonly Passo<never>[] },
  { raiz: "User", plano: PLANO_DO_USUARIO as readonly Passo<never>[] },
];

/** O model e tudo que o banco apaga junto com ele (cascata, recursiva). */
function comCascata(modelo: string): Set<string> {
  const vai = new Set([modelo]);
  const fila = [modelo];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const r of esquema.relacoes) {
      if (r.alvo === atual && r.onDelete === "Cascade" && !vai.has(r.modelo)) {
        vai.add(r.modelo);
        fila.push(r.modelo);
      }
    }
  }
  return vai;
}

/**
 * As ligações que travariam o plano. Model a model: apagar M leva junto a
 * cascata de M; cada model levado precisa estar livre de quem aponta com
 * RESTRICT — quem aponta já foi apagado num passo anterior, vai no mesmo
 * comando (cascata), ou teve a coluna anulada/reatribuída antes.
 */
function travasDoPlano(raiz: Entidade, plano: readonly Passo<never>[]): string[] {
  const apagados = new Set<string>();
  const neutralizadas = new Set<string>(); // "Modelo.coluna"
  const travas: string[] = [];
  const neutra = (r: RelacaoDoEsquema) => r.fks.every((f) => neutralizadas.has(`${r.modelo}.${f}`));

  for (const passo of plano) {
    if (passo.acao !== "apagar") {
      neutralizadas.add(`${passo.modelo}.${passo.coluna}`);
      continue;
    }
    const levados = comCascata(passo.modelo);
    for (const levado of levados) {
      for (const r of esquema.relacoes) {
        if (r.alvo !== levado || !trava(r)) continue;
        if (apagados.has(r.modelo) || levados.has(r.modelo) || neutra(r)) continue;
        // Ligação para a raiz só importa quando a raiz é apagada (o último passo).
        if (levado === raiz && passo.modelo !== raiz) continue;
        travas.push(`apagar ${passo.modelo} esbarra em ${r.modelo}.${r.campo} → ${levado} (${r.onDelete})`);
      }
    }
    levados.forEach((m) => apagados.add(m));
  }
  return travas;
}

describe("planos de exclusão × schema", () => {
  for (const { raiz, plano } of PLANOS) {
    describe(raiz, () => {
      it("o último passo apaga o próprio cadastro, e só ele apaga a raiz", () => {
        expect(plano.at(-1)).toMatchObject({ modelo: raiz, acao: "apagar" });
        expect(plano.filter((p) => p.modelo === raiz && p.acao === "apagar")).toHaveLength(1);
      });

      it("todo passo aponta para model e coluna que existem", () => {
        const problemas: string[] = [];
        for (const p of plano) {
          const modelo = esquema.modelos.get(p.modelo);
          if (!modelo) problemas.push(`${p.modelo} não existe`);
          else if (p.acao !== "apagar" && (!p.coluna || !modelo.escalares.has(p.coluna))) problemas.push(`${p.modelo}.${p.coluna} não existe`);
        }
        expect(problemas).toEqual([]);
      });

      it("toda ligação do registro que pede ação tem o seu passo", () => {
        const faltando: string[] = [];
        for (const l of LIGACOES[raiz]) {
          if (l.tratamento === "apagar" && !plano.some((p) => p.modelo === l.modelo && p.acao === "apagar")) {
            faltando.push(`apagar ${l.modelo}`);
          }
          if (l.tratamento === "reatribuir" && !plano.some((p) => p.modelo === l.modelo && p.acao === "reatribuir" && p.coluna === l.fk)) {
            faltando.push(`reatribuir ${l.modelo}.${l.fk}`);
          }
        }
        for (const c of COLUNAS_SOLTAS[raiz]) {
          if (c.tratamento === "manter") continue;
          const acao = c.tratamento === "desligar" ? "anular" : c.tratamento === "reatribuir" ? "reatribuir" : "apagar";
          const achou = plano.some((p) => p.modelo === c.modelo && p.acao === acao && (acao === "apagar" || p.coluna === c.coluna));
          if (!achou) faltando.push(`${acao} ${c.modelo}.${c.coluna}`);
        }
        expect(faltando).toEqual([]);
      });

      it("a ordem passa por todas as chaves estrangeiras", () => {
        expect(travasDoPlano(raiz, plano)).toEqual([]);
      });
    });
  }

  it("a simulação acusa ordem errada (o próprio teste funciona)", () => {
    const fora = [...PLANO_DA_EMPRESA];
    const vaga = fora.findIndex((p) => p.modelo === "Vaga");
    const candidatura = fora.findIndex((p) => p.modelo === "Candidatura");
    [fora[vaga], fora[candidatura]] = [fora[candidatura], fora[vaga]];
    expect(travasDoPlano("Company", fora as readonly Passo<never>[])).toContain(
      "apagar Vaga esbarra em Candidatura.vaga → Vaga (Restrict)"
    );
    const semBeneficio = PLANO_DA_EMPRESA.filter((p) => p.modelo !== "BenefitAssignment");
    expect(travasDoPlano("Company", semBeneficio as readonly Passo<never>[]).join("\n")).toContain("BenefitAssignment.benefit → BenefitCatalog");
  });
});
