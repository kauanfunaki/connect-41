import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { criarBancoFalso, type Chamada } from "@/lib/exclusao/bancoFalso";
import { estadoDoBanco, lerMigrations, relacoesComOBanco } from "@/lib/exclusao/chavesDoBanco";
import { lerEsquema, trava, type RelacaoDoEsquema } from "@/lib/exclusao/lerEsquema";
import type { Passo } from "@/lib/exclusao/comum";
import { conferirAntesDeCriar, gravarDemonstracao } from "./gravar";
import { ehEmpresaDaDemo, ehPessoaDaDemo, limparRecrutamentoDaDemo, ondeAsPessoasDaDemo, PLANO_DA_LIMPEZA } from "./limpeza";
import { ETIQUETA_MARCADORA, FONTE_DA_DEMO, MARCA, SETOR, montarDemonstracao } from "./plano";

// O que se testa: que a limpeza só pega o que é da demonstração (pessoa de
// verdade nunca), que a ordem passa pelas chaves estrangeiras **do banco** e
// que a gravação não duplica nem escreve fora das tabelas da demonstração.

const tx = (banco: unknown) => banco as Prisma.TransactionClient;
const json = (c: Chamada) => JSON.stringify(c.args ?? {});

// ─── As chaves estrangeiras como o banco as tem ─────────────────────────────
//
// O schema não basta: a migration de 24/07/2026 criou o link do teste → a
// candidatura e → o modelo com ON DELETE RESTRICT, e o schema (sem `onDelete`)
// diz SetNull. A migration 20261014200000 acertou o banco (SET NULL), mas a
// limpeza pode rodar antes do `migrate deploy` — a ordem tem de passar nos dois
// estados. Aqui vale o que as migrations gravaram (ver chavesDoBanco.ts).

const raiz = process.cwd();
const esquemaDoPrisma = lerEsquema(readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8"));
const MIGRATIONS = path.join(raiz, "prisma", "migrations");
const ACERTO_DO_LINK_DO_TESTE = "20261014200000";

type Banco = { nome: string; relacoes: RelacaoDoEsquema[] };
const BANCO: Banco = { nome: "banco (migrations)", relacoes: relacoesComOBanco(esquemaDoPrisma, estadoDoBanco(lerMigrations(MIGRATIONS))) };
const BANCO_ANTES: Banco = {
  nome: `banco antes de ${ACERTO_DO_LINK_DO_TESTE}`,
  relacoes: relacoesComOBanco(esquemaDoPrisma, estadoDoBanco(lerMigrations(MIGRATIONS, { antesDe: ACERTO_DO_LINK_DO_TESTE }))),
};

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

/** Mesmo método do `plano.test.ts` da exclusão: model a model, ninguém apontando com RESTRICT para o que sai. */
function travas(plano: readonly Pick<Passo<never>, "modelo" | "acao" | "coluna">[], { relacoes }: Banco = BANCO_ANTES): string[] {
  const apagados = new Set<string>();
  const neutralizadas = new Set<string>();
  const saida: string[] = [];
  for (const passo of plano) {
    if (passo.acao !== "apagar") {
      neutralizadas.add(`${passo.modelo}.${passo.coluna}`);
      continue;
    }
    const levados = comCascata(relacoes, passo.modelo);
    for (const levado of levados) {
      for (const r of relacoes) {
        if (r.alvo !== levado || !trava(r)) continue;
        if (apagados.has(r.modelo) || levados.has(r.modelo) || r.fks.every((f) => neutralizadas.has(`${r.modelo}.${f}`))) continue;
        saida.push(`apagar ${passo.modelo} esbarra em ${r.modelo}.${r.campo} → ${levado} (${r.onDelete})`);
      }
    }
    levados.forEach((m) => apagados.add(m));
  }
  return saida;
}

/** O plano da limpeza e, depois dele, o passo do script que apaga as empresas "[demo]". */
const COM_A_EMPRESA = [...PLANO_DA_LIMPEZA, { modelo: "Company", acao: "apagar" as const }];

describe("ordem da limpeza × chaves do banco", () => {
  it("antes de 20261014200000 o banco tinha RESTRICT no link do teste (o schema diz SetNull); depois, SET NULL", () => {
    const acoes = ({ relacoes }: Banco) =>
      relacoes.filter((r) => r.modelo === "AssessmentLink" && (r.campo === "candidatura" || r.campo === "template")).map((r) => r.onDelete);
    expect(acoes(BANCO_ANTES)).toEqual(["Restrict", "Restrict"]);
    expect(acoes(BANCO)).toEqual(["SetNull", "SetNull"]);
  });

  for (const banco of [BANCO_ANTES, BANCO]) {
    it(`a ordem passa por todas as chaves, até a exclusão das empresas — ${banco.nome}`, () => {
      expect(travas(COM_A_EMPRESA, banco)).toEqual([]);
    });
  }

  it("todo passo aponta para model e coluna que existem", () => {
    for (const p of PLANO_DA_LIMPEZA) {
      const modelo = esquemaDoPrisma.modelos.get(p.modelo);
      expect(modelo, p.modelo).toBeDefined();
      if (p.acao !== "apagar") expect(modelo!.escalares.has(p.coluna!), `${p.modelo}.${p.coluna}`).toBe(true);
    }
  });

  it("sem tirar os testes antes, a candidatura travaria no banco de antes da migration (o próprio teste funciona)", () => {
    const semOsTestes = COM_A_EMPRESA.filter((p) => p.modelo !== "AssessmentLink");
    expect(travas(semOsTestes, BANCO_ANTES).join("\n")).toContain("AssessmentLink.candidatura → Candidatura (Restrict)");
  });
});

// ─── Quem é fictício ────────────────────────────────────────────────────────

const DEMO = { id: "p-demo", email: "ana.ribeiro@exemplo.invalido", tags: [{ tag: { name: ETIQUETA_MARCADORA } }] };
const REAL_COM_ETIQUETA = { id: "p-real", email: "maria.real@gmail.com", tags: [{ tag: { name: ETIQUETA_MARCADORA } }] };
const FICTICIO_SEM_ETIQUETA = { id: "p-teste", email: "teste@exemplo.invalido", tags: [] };

describe("quem a limpeza reconhece como fictício", () => {
  it("pessoa: e-mail @exemplo.invalido E a etiqueta marcadora — as duas", () => {
    expect(ehPessoaDaDemo({ email: "ana.ribeiro@exemplo.invalido", etiquetas: [ETIQUETA_MARCADORA] })).toBe(true);
    expect(ehPessoaDaDemo({ email: "  Ana.Ribeiro@Exemplo.Invalido ", etiquetas: [ETIQUETA_MARCADORA, "Excel"] })).toBe(true);
    expect(ehPessoaDaDemo({ email: "maria.real@gmail.com", etiquetas: [ETIQUETA_MARCADORA] })).toBe(false);
    expect(ehPessoaDaDemo({ email: "teste@exemplo.invalido", etiquetas: [] })).toBe(false);
    expect(ehPessoaDaDemo({ email: "teste@exemplo.invalido", etiquetas: [`${MARCA} Excel`] })).toBe(false);
    expect(ehPessoaDaDemo({ email: null, etiquetas: [ETIQUETA_MARCADORA] })).toBe(false);
    expect(ehPessoaDaDemo({ email: "x@exemplo.invalido.com.br", etiquetas: [ETIQUETA_MARCADORA] })).toBe(false);
  });

  it("o filtro do banco pede as duas coisas, no escritório", () => {
    expect(ondeAsPessoasDaDemo("t1")).toEqual({
      tenantId: "t1",
      email: { endsWith: "@exemplo.invalido" },
      tags: { some: { tag: { tenantId: "t1", sectorCode: SETOR, name: ETIQUETA_MARCADORA } } },
    });
  });

  it("empresa da demonstração: prefixo [demo] E a origem dela (a do BPO fica para o passo de sempre)", () => {
    expect(ehEmpresaDaDemo({ name: `${MARCA} PADARIA PÃO DOURADO LTDA`, source: FONTE_DA_DEMO })).toBe(true);
    expect(ehEmpresaDaDemo({ name: `${MARCA} TRANSPORTES MODELO LTDA`, source: null })).toBe(false);
    expect(ehEmpresaDaDemo({ name: "PADARIA PÃO DOURADO LTDA", source: FONTE_DA_DEMO })).toBe(false);
  });
});

// ─── A limpeza num banco de mentira ─────────────────────────────────────────

const MARIA = {
  origin: "PORTAL",
  createdAt: new Date("2026-10-14T18:00:00Z"),
  person: { name: "Maria Real", email: "maria.real@gmail.com", phone: "(41) 99876-5432" },
  vaga: { title: "Recepcionista", company: { name: `${MARCA} CLÍNICA VIDA PLENA LTDA` } },
};

/** Um escritório com a demonstração, a empresa [demo] do BPO e uma candidata de verdade numa vaga fictícia. */
function escritorio() {
  return criarBancoFalso({
    mexer: () => 1,
    achar: (delegado, metodo, args) => {
      const select = (args.select ?? {}) as Record<string, unknown>;
      if (delegado === "company" && metodo === "findMany") {
        return [
          { id: "e-demo", name: `${MARCA} CLÍNICA VIDA PLENA LTDA`, source: FONTE_DA_DEMO },
          { id: "e-bpo", name: `${MARCA} TRANSPORTES MODELO LTDA`, source: null },
        ];
      }
      // Um filtro frouxo de propósito: a segunda trava (ehPessoaDaDemo) tem de segurar.
      if (delegado === "person" && metodo === "findMany" && select.tags) return [DEMO, REAL_COM_ETIQUETA, FICTICIO_SEM_ETIQUETA];
      if (delegado === "person" && metodo === "findMany") return [];
      if (delegado === "assessmentTemplate") return [{ id: "m1" }];
      if (delegado === "tag") return [{ id: "t-marca" }, { id: "t-excel" }];
      if (delegado === "candidatura" && select.person) return [MARIA];
      if (delegado === "candidatura") return [{ id: "c-demo" }, { id: "c-maria" }];
      if (delegado === "vaga") return [{ id: "v1" }];
      if (delegado === "collectionAgreement") return [];
      return undefined;
    },
  });
}

describe("limparRecrutamentoDaDemo", () => {
  it("apaga só a pessoa fictícia; a de verdade fica, e aparece na lista para o escritório avisar", async () => {
    const b = escritorio();
    const r = await limparRecrutamentoDaDemo(tx(b.banco), "t1");

    const pessoasApagadas = b.chamadas.filter((c) => c.delegado === "person" && c.metodo === "deleteMany");
    expect(pessoasApagadas).toHaveLength(1);
    expect(pessoasApagadas[0]!.args).toEqual({ where: { tenantId: "t1", id: { in: ["p-demo"] } } });
    for (const c of b.escritas()) {
      expect(json(c)).not.toContain("p-real");
      expect(json(c)).not.toContain("p-teste");
    }

    expect(r.previa.candidaturasDeFora).toEqual([
      { pessoa: "Maria Real", email: "maria.real@gmail.com", telefone: "(41) 99876-5432", vaga: "Recepcionista", empresa: MARIA.vaga.company.name, origem: "PORTAL", criadaEm: MARIA.createdAt },
    ]);
    expect(r.feito.length).toBeGreaterThan(0);
  });

  it("os testes saem antes das candidaturas, as candidaturas antes das vagas, as vagas antes do modelo e das etiquetas", async () => {
    const b = escritorio();
    await limparRecrutamentoDaDemo(tx(b.banco), "t1");
    const w = b.escritas();
    const primeiro = (delegado: string, metodo = "deleteMany") => w.findIndex((c) => c.delegado === delegado && c.metodo === metodo);
    expect(primeiro("assessmentLink")).toBeGreaterThanOrEqual(0);
    expect(primeiro("assessmentLink", "updateMany")).toBeLessThan(primeiro("candidatura"));
    expect(primeiro("assessmentLink")).toBeLessThan(primeiro("candidatura"));
    expect(primeiro("candidatura")).toBeLessThan(primeiro("vaga"));
    expect(primeiro("vaga")).toBeLessThan(primeiro("assessmentTemplate"));
    expect(primeiro("vaga")).toBeLessThan(primeiro("tag"));
  });

  it("vagas e candidaturas de toda empresa [demo]; o plano completo de empresa só nas desta demonstração", async () => {
    const b = escritorio();
    await limparRecrutamentoDaDemo(tx(b.banco), "t1");
    const w = b.escritas();
    const vagas = w.filter((c) => c.delegado === "vaga");
    expect(vagas.some((c) => json(c).includes("e-demo") && json(c).includes("e-bpo"))).toBe(true);
    const lancamentos = w.filter((c) => c.delegado === "financeEntry" && c.metodo === "deleteMany");
    expect(lancamentos.length).toBeGreaterThan(0);
    for (const c of lancamentos) {
      expect(json(c)).toContain("e-demo");
      expect(json(c)).not.toContain("e-bpo");
    }
    // A empresa em si não sai aqui: é o passo de sempre do script.
    expect(w.some((c) => c.delegado === "company")).toBe(false);
  });

  it("teste de gente de verdade numa vaga fictícia fica, desligado da candidatura", async () => {
    const b = escritorio();
    await limparRecrutamentoDaDemo(tx(b.banco), "t1");
    const desliga = b.escritas().find((c) => c.delegado === "assessmentLink" && c.metodo === "updateMany");
    expect(desliga?.args).toEqual({ where: { tenantId: "t1", candidaturaId: { in: ["c-demo", "c-maria"] } }, data: { candidaturaId: null } });
  });

  it("sem nada da demonstração no escritório, não escreve nada", async () => {
    const b = criarBancoFalso({});
    const r = await limparRecrutamentoDaDemo(tx(b.banco), "t1");
    expect(b.escritas()).toEqual([]);
    expect(r.feito).toEqual([]);
    expect(r.previa.candidaturasDeFora).toEqual([]);
  });

  it("todo filtro de escrita tem o escritório", async () => {
    const b = escritorio();
    await limparRecrutamentoDaDemo(tx(b.banco), "t1");
    for (const c of b.escritas()) {
      // Os três do plano de empresa que não têm tenantId filtram pela empresa (via relação).
      if (["bankTransactionMatch", "clientDocumentView", "clientDocumentRecipient"].includes(c.delegado)) continue;
      expect(json(c), `${c.delegado}.${c.metodo}`).toMatch(/"tenantId":"t1"/);
    }
  });
});

// ─── Gravação: não duplica e não sai das tabelas da demonstração ────────────

const PLANO = montarDemonstracao(new Date("2026-10-14T15:00:00.000Z"));

describe("conferirAntesDeCriar", () => {
  it("escritório sem a demonstração: pode gravar", async () => {
    const b = criarBancoFalso({});
    expect(await conferirAntesDeCriar(tx(b.banco), "t1", PLANO)).toEqual({ jaExiste: [], conflitos: [] });
    expect(b.escritas()).toEqual([]);
  });

  it("rodar de novo não duplica: a demonstração já gravada é reconhecida", async () => {
    const b = criarBancoFalso({
      achar: (delegado) => {
        if (delegado === "tag") return [{ name: ETIQUETA_MARCADORA }];
        if (delegado === "company") return [{ name: PLANO.empresas[0]!.name, cnpj: PLANO.empresas[0]!.cnpj, source: FONTE_DA_DEMO }];
        if (delegado === "person") return [{ name: "Ana Paula Ribeiro", cpf: PLANO.pessoas[0]!.cpf, email: PLANO.pessoas[0]!.email }];
        return undefined;
      },
    });
    const r = await conferirAntesDeCriar(tx(b.banco), "t1", PLANO);
    expect(r.jaExiste.length).toBeGreaterThan(0);
    expect(r.conflitos).toEqual([]);
  });

  it("CPF ou CNPJ de cadastro de verdade: recusa", async () => {
    const b = criarBancoFalso({
      achar: (delegado, _m, args) => {
        const where = JSON.stringify(args.where ?? {});
        if (delegado === "company") return [{ name: "PADARIA DE VERDADE LTDA", cnpj: PLANO.empresas[0]!.cnpj, source: null }];
        if (delegado === "person" && where.includes('"cpf"')) return [{ name: "Fulano de Tal", cpf: PLANO.pessoas[3]!.cpf, email: "fulano@gmail.com" }];
        return undefined;
      },
    });
    const r = await conferirAntesDeCriar(tx(b.banco), "t1", PLANO);
    expect(r.conflitos).toHaveLength(2);
    expect(r.conflitos.join(" ")).toContain("Fulano de Tal");
  });
});

describe("gravarDemonstracao", () => {
  async function gravar(segundo: string | null) {
    const b = criarBancoFalso({});
    let n = 0;
    const r = await gravarDemonstracao(tx(b.banco), "t1", PLANO, { principal: "u-admin", segundo }, { id: () => `id-${++n}`, token: () => `tk-${++n}`.padEnd(64, "0") });
    const dados = (delegado: string) =>
      b.chamadas.filter((c) => c.delegado === delegado).flatMap((c) => {
        const d = (c.args as { data: unknown }).data;
        return (Array.isArray(d) ? d : [d]) as Record<string, unknown>[];
      });
    return { b, r, dados };
  }

  it("escreve só nas tabelas da demonstração — nada de aviso, e-mail, reunião, admissão ou auditoria", async () => {
    const { b } = await gravar("u-outro");
    const gravacoes = b.chamadas.filter((c) => !["findMany", "findFirst", "findUnique", "count"].includes(c.metodo));
    expect(gravacoes.every((c) => c.metodo === "createMany" || c.metodo === "create")).toBe(true);
    const tabelas = new Set(gravacoes.map((c) => c.delegado));
    expect([...tabelas].sort()).toEqual(
      [
        "assessmentLink",
        "assessmentTemplate",
        "assessmentTemplateQuestion",
        "candidatura",
        "candidaturaNota",
        "cargo",
        "company",
        "interviewScorecard",
        "person",
        "personTag",
        "tag",
        "vaga",
        "vagaRequisitos",
      ].sort()
    );
    // A etiqueta da pessoa é só o par (pessoa, etiqueta): o escritório vem delas.
    for (const c of gravacoes.filter((x) => x.delegado !== "personTag")) expect(json(c), c.delegado).toContain('"tenantId":"t1"');
  });

  it("toda pessoa sai com e-mail fictício e a etiqueta marcadora; toda empresa com [demo] e a origem", async () => {
    const { dados } = await gravar(null);
    const pessoas = dados("person");
    expect(pessoas).toHaveLength(PLANO.pessoas.length);
    for (const p of pessoas) expect(String(p.email).endsWith("@exemplo.invalido")).toBe(true);
    const etiquetas = new Map(dados("tag").map((t) => [t.id, t.name]));
    const marcadas = new Set(dados("personTag").filter((pt) => etiquetas.get(pt.tagId) === ETIQUETA_MARCADORA).map((pt) => pt.personId));
    for (const p of pessoas) expect(marcadas.has(p.id)).toBe(true);
    for (const e of dados("company")) {
      expect(String(e.name).startsWith(MARCA)).toBe(true);
      expect(e.source).toBe(FONTE_DA_DEMO);
      expect(e.status).toBe("ACTIVE");
    }
  });

  it("vagas do setor de Recrutamento, com o administrador como responsável", async () => {
    const { dados, r } = await gravar(null);
    for (const v of dados("vaga")) {
      expect(v.sectorCode).toBe("recrutamento");
      expect(v.responsibleUserId).toBe("u-admin");
    }
    expect(r.idsDasVagas.filter((v) => v.isPublic)).toHaveLength(7);
  });

  it("com um administrador só, a segunda avaliação de entrevista fica de fora (uma por avaliador)", async () => {
    const so = await gravar(null);
    const dois = await gravar("u-outro");
    const avaliacoesDe = (x: Awaited<ReturnType<typeof gravar>>) => x.dados("interviewScorecard");
    expect(avaliacoesDe(dois).length).toBe(PLANO.entrevistas.length);
    expect(avaliacoesDe(so).length).toBe(PLANO.entrevistas.filter((e) => e.avaliador === "principal").length);
    for (const a of avaliacoesDe(so)) expect(a.evaluatorUserId).toBe("u-admin");
  });

  it("testes: token próprio em cada link; o questionário respondido sai com a nota calculada sobre as perguntas gravadas", async () => {
    const { dados } = await gravar(null);
    const links = dados("assessmentLink");
    expect(new Set(links.map((l) => l.token)).size).toBe(links.length);
    const perguntas = new Set(dados("assessmentTemplateQuestion").map((q) => q.id));
    const respondidos = links.filter((l) => l.type === "MULTIPLA_ESCOLHA" && l.status === "RESPONDIDO");
    expect(respondidos.length).toBeGreaterThan(0);
    for (const l of respondidos) {
      const scores = l.scores as { total: number; correct: number; results: { questionId: string }[] };
      expect(scores.total).toBe(10);
      expect(scores.correct).toBeLessThan(10);
      for (const res of scores.results) expect(perguntas.has(res.questionId)).toBe(true);
    }
    for (const l of links.filter((x) => x.type === "DISC")) expect(l.templateId).toBeNull();
  });
});
