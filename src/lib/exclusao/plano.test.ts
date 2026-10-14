import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { estadoDoBanco, lerMigrations, relacoesComOBanco } from "./chavesDoBanco";
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
//
// A simulação roda três vezes: com o ON DELETE do schema, com o que as
// migrations gravaram no banco e com o banco de antes da última correção de
// chave (o estado de produção até o dono rodar o `migrate deploy`). O schema
// sozinho não basta: em 24/07/2026 as migrations criaram o link do teste com
// RESTRICT onde o schema diz SetNull, e a exclusão esbarrava (ver
// chavesDoBanco.ts).

const esquema = lerEsquema(readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8"));
const MIGRATIONS = path.join(process.cwd(), "prisma", "migrations");

/** A migration que pôs SET NULL no link do teste. O código tem de funcionar antes dela também. */
const ACERTO_DO_LINK_DO_TESTE = "20261014200000";

type Fonte = { nome: string; relacoes: RelacaoDoEsquema[] };
const SCHEMA: Fonte = { nome: "schema", relacoes: esquema.relacoes };
const BANCO: Fonte = { nome: "banco (migrations)", relacoes: relacoesComOBanco(esquema, estadoDoBanco(lerMigrations(MIGRATIONS))) };
const BANCO_ANTES: Fonte = {
  nome: `banco antes de ${ACERTO_DO_LINK_DO_TESTE}`,
  relacoes: relacoesComOBanco(esquema, estadoDoBanco(lerMigrations(MIGRATIONS, { antesDe: ACERTO_DO_LINK_DO_TESTE }))),
};
const FONTES = [SCHEMA, BANCO, BANCO_ANTES];

const PLANOS: { raiz: Entidade; plano: readonly Passo<never>[] }[] = [
  { raiz: "Company", plano: PLANO_DA_EMPRESA as readonly Passo<never>[] },
  { raiz: "Person", plano: PLANO_DA_PESSOA as readonly Passo<never>[] },
  { raiz: "User", plano: PLANO_DO_USUARIO as readonly Passo<never>[] },
];

/** O model e tudo que o banco apaga junto com ele (cascata, recursiva). */
function comCascata(relacoes: readonly RelacaoDoEsquema[], modelo: string): Set<string> {
  const vai = new Set([modelo]);
  const fila = [modelo];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const r of relacoes) {
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
function travasDoPlano(raiz: Entidade, plano: readonly Passo<never>[], fonte: Fonte = SCHEMA): string[] {
  const { relacoes } = fonte;
  const apagados = new Set<string>();
  const neutralizadas = new Set<string>(); // "Modelo.coluna"
  const travas: string[] = [];
  const neutra = (r: RelacaoDoEsquema) => r.fks.every((f) => neutralizadas.has(`${r.modelo}.${f}`));

  for (const passo of plano) {
    if (passo.acao !== "apagar") {
      neutralizadas.add(`${passo.modelo}.${passo.coluna}`);
      continue;
    }
    const levados = comCascata(relacoes, passo.modelo);
    for (const levado of levados) {
      for (const r of relacoes) {
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

      for (const fonte of FONTES) {
        it(`a ordem passa por todas as chaves estrangeiras — ${fonte.nome}`, () => {
          expect(travasDoPlano(raiz, plano, fonte)).toEqual([]);
        });
      }
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

describe("candidato com teste ligado à candidatura (link do teste × candidatura)", () => {
  const acao = (fonte: Fonte, campo: string) => fonte.relacoes.find((r) => r.modelo === "AssessmentLink" && r.campo === campo)!.onDelete;
  const semSoltarOTeste = (plano: readonly Passo<never>[]) =>
    plano.filter((p) => !(p.modelo === "AssessmentLink" && p.coluna === "candidaturaId"));
  const PESSOA = PLANO_DA_PESSOA as readonly Passo<never>[];
  const EMPRESA = PLANO_DA_EMPRESA as readonly Passo<never>[];

  it("antes da migration o banco tinha RESTRICT; depois dela, SET NULL como o schema", () => {
    expect([acao(BANCO_ANTES, "candidatura"), acao(BANCO_ANTES, "template")]).toEqual(["Restrict", "Restrict"]);
    expect([acao(BANCO, "candidatura"), acao(BANCO, "template")]).toEqual(["SetNull", "SetNull"]);
    expect([acao(SCHEMA, "candidatura"), acao(SCHEMA, "template")]).toEqual(["SetNull", "SetNull"]);
  });

  it("pessoa e empresa soltam o teste da candidatura antes de apagá-la", () => {
    for (const plano of [PESSOA, EMPRESA]) {
      const solta = plano.findIndex((p) => p.modelo === "AssessmentLink" && p.acao === "anular" && p.coluna === "candidaturaId");
      const apaga = plano.findIndex((p) => p.modelo === "Candidatura" && p.acao === "apagar");
      expect(solta).toBeGreaterThanOrEqual(0);
      expect(solta).toBeLessThan(apaga);
    }
  });

  it("sem soltar o teste, o banco de antes da migration travaria — o plano de hoje passa nos dois estados", () => {
    const esperado = "apagar Candidatura esbarra em AssessmentLink.candidatura → Candidatura (Restrict)";
    expect(travasDoPlano("Person", semSoltarOTeste(PESSOA), BANCO_ANTES)).toContain(esperado);
    expect(travasDoPlano("Company", semSoltarOTeste(EMPRESA), BANCO_ANTES)).toContain(esperado);
    // Com a migration, o banco solta sozinho: nem o passo seria preciso.
    expect(travasDoPlano("Person", semSoltarOTeste(PESSOA), BANCO)).toEqual([]);
    expect(travasDoPlano("Company", semSoltarOTeste(EMPRESA), BANCO)).toEqual([]);
  });

  it("modelo de teste: com a migration, sai mesmo com teste enviado (o teste fica, sem o modelo)", () => {
    const apagarModelo = [{ modelo: "AssessmentTemplate", acao: "apagar" }] as unknown as readonly Passo<never>[];
    // A raiz aqui só nomeia a simulação; o que conta é quem aponta para o modelo.
    expect(travasDoPlano("Company", apagarModelo, BANCO)).toEqual([]);
    expect(travasDoPlano("Company", apagarModelo, BANCO_ANTES)).toEqual([
      "apagar AssessmentTemplate esbarra em AssessmentLink.template → AssessmentTemplate (Restrict)",
    ]);
  });
});
