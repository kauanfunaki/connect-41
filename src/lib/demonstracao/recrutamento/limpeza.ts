// A limpeza dos dados fictícios do Recrutamento (ver `plano.ts`) — roda dentro
// da transação de `scripts/dados-de-demonstracao.ts --limpar`, antes de as
// empresas "[demo]" saírem: a vaga trava a exclusão da empresa.
//
// O que sai, e como cada coisa é reconhecida:
// - as vagas de toda empresa "[demo]", com as candidaturas delas — inclusive a
//   de alguém de verdade que se inscreveu pelo 41 Carreiras numa vaga
//   fictícia. **A pessoa de verdade fica**: sai só a candidatura, e a
//   simulação lista quem é, para o escritório avisar;
// - as pessoas fictícias: e-mail @exemplo.invalido **e** a etiqueta
//   ETIQUETA_MARCADORA, as duas coisas juntas. Candidato de verdade nunca tem
//   as duas;
// - o modelo de questionário e as etiquetas com o prefixo "[demo]";
// - nas empresas desta demonstração (prefixo "[demo]" **e** a origem
//   FONTE_DA_DEMO), tudo o que estiver ligado — o mesmo plano da exclusão de
//   empresa do Connect, para nada que alguém tenha criado nelas ao testar
//   travar a limpeza.
//
// Quem apaga a empresa em si continua sendo o script (o passo das empresas
// "[demo]" de sempre), depois disto.

import type { Prisma } from "@/generated/prisma/client";
import { executarPlano, juntos, n, type Passo } from "@/lib/exclusao/comum";
import { PLANO_DA_EMPRESA } from "@/lib/exclusao/empresa";
import { PLANO_DA_PESSOA } from "@/lib/exclusao/pessoa";
import { DOMINIO_FICTICIO } from "./documentos";
import { ETIQUETA_MARCADORA, FONTE_DA_DEMO, MARCA, SETOR } from "./plano";

type Tx = Prisma.TransactionClient;

export type AlvoDaLimpeza = {
  tenantId: string;
  /** Toda empresa "[demo]" do escritório (a do BPO também): as vagas delas saem. */
  empresasComMarca: string[];
  /** As empresas desta demonstração: saem com tudo o que estiver ligado. */
  empresasDaDemo: string[];
  /** Candidatos e colaboradores fictícios. */
  pessoas: string[];
  /** O questionário "[demo]". */
  modelos: string[];
  /** As etiquetas "[demo]" do Recrutamento. */
  etiquetas: string[];
};

// ─── Quem é fictício ────────────────────────────────────────────────────────

/** O filtro das pessoas fictícias: e-mail @exemplo.invalido E a etiqueta marcadora. */
export function ondeAsPessoasDaDemo(tenantId: string) {
  return {
    tenantId,
    email: { endsWith: DOMINIO_FICTICIO },
    tags: { some: { tag: { tenantId, sectorCode: SETOR, name: ETIQUETA_MARCADORA } } },
  };
}

/**
 * A mesma regra, conferida de novo em cada linha lida — se um dia o filtro
 * acima for mexido e ficar largo demais, esta segunda trava segura.
 */
export function ehPessoaDaDemo(p: { email: string | null; etiquetas: string[] }): boolean {
  return !!p.email && p.email.trim().toLowerCase().endsWith(DOMINIO_FICTICIO) && p.etiquetas.includes(ETIQUETA_MARCADORA);
}

/** As empresas desta demonstração entre as "[demo]": as que têm a origem dela. */
export function ehEmpresaDaDemo(e: { name: string; source: string | null }): boolean {
  return e.name.startsWith(MARCA) && e.source === FONTE_DA_DEMO;
}

export async function alvoDaLimpeza(db: Tx, tenantId: string): Promise<AlvoDaLimpeza & { nomesDasEmpresas: string[] }> {
  const [empresas, pessoas, modelos, etiquetas] = await juntos(db, [
    () => db.company.findMany({ where: { tenantId, name: { startsWith: MARCA } }, select: { id: true, name: true, source: true } }),
    () =>
      db.person.findMany({
        where: ondeAsPessoasDaDemo(tenantId),
        select: { id: true, email: true, tags: { select: { tag: { select: { name: true } } } } },
      }),
    () => db.assessmentTemplate.findMany({ where: { tenantId, sectorCode: SETOR, name: { startsWith: MARCA } }, select: { id: true } }),
    () => db.tag.findMany({ where: { tenantId, sectorCode: SETOR, name: { startsWith: MARCA } }, select: { id: true } }),
  ]);
  const daDemo = empresas.filter(ehEmpresaDaDemo);
  return {
    tenantId,
    empresasComMarca: empresas.map((e) => e.id),
    empresasDaDemo: daDemo.map((e) => e.id),
    nomesDasEmpresas: daDemo.map((e) => e.name),
    pessoas: pessoas.filter((p) => ehPessoaDaDemo({ email: p.email, etiquetas: p.tags.map((t) => t.tag.name) })).map((p) => p.id),
    modelos: modelos.map((m) => m.id),
    etiquetas: etiquetas.map((t) => t.id),
  };
}

// ─── O plano ────────────────────────────────────────────────────────────────

const dasVagasComMarca = (a: AlvoDaLimpeza) => ({ tenantId: a.tenantId, vaga: { companyId: { in: a.empresasComMarca } } });

async function candidaturasDasVagas(tx: Tx, a: AlvoDaLimpeza): Promise<string[]> {
  if (a.empresasComMarca.length === 0) return [];
  return (await tx.candidatura.findMany({ where: dasVagasComMarca(a), select: { id: true } })).map((c) => c.id);
}

async function vagasComMarca(tx: Tx, a: AlvoDaLimpeza): Promise<string[]> {
  if (a.empresasComMarca.length === 0) return [];
  return (await tx.vaga.findMany({ where: { tenantId: a.tenantId, companyId: { in: a.empresasComMarca } }, select: { id: true } })).map((v) => v.id);
}

/**
 * A ordem importa (o `limpeza.test.ts` confere contra as chaves do banco).
 *
 * Os testes saem primeiro: no banco, o link do teste aponta para a candidatura
 * e para o modelo com RESTRICT (a migration de 24/07/2026 gravou assim, embora
 * o schema não diga) — apagar a candidatura antes travaria tudo.
 */
export const PLANO_DA_LIMPEZA: readonly Passo<AlvoDaLimpeza>[] = [
  {
    modelo: "AssessmentLink",
    acao: "apagar",
    executar: async (tx, a) =>
      a.pessoas.length === 0 ? 0 : n(tx.assessmentLink.deleteMany({ where: { tenantId: a.tenantId, personId: { in: a.pessoas } } })),
  },
  // Teste do questionário fictício mandado a alguém de verdade: sai junto com o modelo.
  {
    modelo: "AssessmentLink",
    acao: "apagar",
    executar: async (tx, a) =>
      a.modelos.length === 0 ? 0 : n(tx.assessmentLink.deleteMany({ where: { tenantId: a.tenantId, templateId: { in: a.modelos } } })),
  },
  // Teste DISC de alguém de verdade numa vaga fictícia: fica na ficha da pessoa, sem a candidatura.
  {
    modelo: "AssessmentLink",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDasVagas(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.assessmentLink.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },

  // As pessoas fictícias, pelo plano da exclusão de pessoa do Connect: as
  // candidaturas delas, o histórico do DP, os documentos e a pessoa.
  ...PLANO_DA_PESSOA.map<Passo<AlvoDaLimpeza>>((p) => ({
    ...p,
    executar: async (tx, a) => (a.pessoas.length === 0 ? 0 : p.executar(tx, { tenantId: a.tenantId, ids: a.pessoas })),
  })),

  // As vagas "[demo]" com o que sobrou nelas — as candidaturas de gente de
  // verdade (a pessoa fica) — e os anexos da vaga.
  {
    modelo: "WhatsappThread",
    acao: "anular",
    coluna: "candidaturaId",
    executar: async (tx, a) => {
      const ids = await candidaturasDasVagas(tx, a);
      if (ids.length === 0) return 0;
      return n(tx.whatsappThread.updateMany({ where: { tenantId: a.tenantId, candidaturaId: { in: ids } }, data: { candidaturaId: null } }));
    },
  },
  // Notas da triagem, avaliações de entrevista e reuniões vão junto (cascata).
  {
    modelo: "Candidatura",
    acao: "apagar",
    executar: async (tx, a) => (a.empresasComMarca.length === 0 ? 0 : n(tx.candidatura.deleteMany({ where: dasVagasComMarca(a) }))),
  },
  {
    modelo: "Document",
    acao: "apagar",
    executar: async (tx, a) => {
      const vagas = await vagasComMarca(tx, a);
      if (vagas.length === 0) return 0;
      return n(tx.document.deleteMany({ where: { tenantId: a.tenantId, entityType: "VAGA", entityId: { in: vagas } } }));
    },
  },
  // Versões dos requisitos e recrutadores da vaga vão junto (cascata).
  {
    modelo: "Vaga",
    acao: "apagar",
    executar: async (tx, a) =>
      a.empresasComMarca.length === 0 ? 0 : n(tx.vaga.deleteMany({ where: { tenantId: a.tenantId, companyId: { in: a.empresasComMarca } } })),
  },

  // As perguntas vão junto (cascata).
  {
    modelo: "AssessmentTemplate",
    acao: "apagar",
    executar: async (tx, a) =>
      a.modelos.length === 0 ? 0 : n(tx.assessmentTemplate.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.modelos } } })),
  },
  // As etiquetas das pessoas e dos cartões vão junto (cascata).
  {
    modelo: "Tag",
    acao: "apagar",
    executar: async (tx, a) =>
      a.etiquetas.length === 0 ? 0 : n(tx.tag.deleteMany({ where: { tenantId: a.tenantId, id: { in: a.etiquetas } } })),
  },

  // As empresas desta demonstração: tudo o que alguém tenha ligado a elas ao
  // testar, pelo plano da exclusão de empresa do Connect — menos o passo da
  // empresa, que é do script.
  ...PLANO_DA_EMPRESA.filter((p) => p.modelo !== "Company").map<Passo<AlvoDaLimpeza>>((p) => ({
    ...p,
    executar: async (tx, a) => {
      let total = 0;
      for (const id of a.empresasDaDemo) total += await p.executar(tx, { tenantId: a.tenantId, id });
      return total;
    },
  })),
];

// ─── A prévia (simulação) ───────────────────────────────────────────────────

export type CandidaturaDeFora = {
  pessoa: string;
  email: string | null;
  telefone: string | null;
  vaga: string;
  empresa: string;
  origem: string | null;
  criadaEm: Date;
};

export type PreviaDaLimpeza = {
  empresas: string[];
  contagens: { rotulo: string; quantidade: number }[];
  /** Gente de verdade que se candidatou a uma vaga fictícia: a candidatura sai, a pessoa fica. */
  candidaturasDeFora: CandidaturaDeFora[];
  /** Testes de gente de verdade com o questionário fictício: saem com ele. */
  testesDeForaApagados: number;
  /** Testes de gente de verdade ligados a uma vaga fictícia: ficam, sem a candidatura. */
  testesDeForaDesligados: number;
  /** Quem não é fictício e está cadastrado numa empresa da demonstração: fica, sem empresa. */
  pessoasDeForaNasEmpresas: string[];
};

export async function previaDaLimpeza(db: Tx, a: AlvoDaLimpeza & { nomesDasEmpresas?: string[] }): Promise<PreviaDaLimpeza> {
  const t = a.tenantId;
  const dasCandidaturas = { tenantId: t, OR: [{ vaga: { companyId: { in: a.empresasComMarca } } }, { personId: { in: a.pessoas } }] };
  const deFora = a.pessoas.length > 0 ? { personId: { notIn: a.pessoas } } : {};
  const [
    vagas,
    versoes,
    candidaturas,
    notas,
    avaliacoes,
    reunioes,
    testes,
    perguntas,
    candidatos,
    colaboradores,
    cargos,
    lista,
    testesApagados,
    testesDesligados,
    semEmpresa,
  ] = await juntos(db, [
    () => db.vaga.count({ where: { tenantId: t, companyId: { in: a.empresasComMarca } } }),
    () => db.vagaRequisitos.count({ where: { tenantId: t, vaga: { companyId: { in: a.empresasComMarca } } } }),
    () => db.candidatura.count({ where: dasCandidaturas }),
    () => db.candidaturaNota.count({ where: { tenantId: t, candidatura: dasCandidaturas } }),
    () => db.interviewScorecard.count({ where: { tenantId: t, candidatura: dasCandidaturas } }),
    () => db.meeting.count({ where: { tenantId: t, candidatura: dasCandidaturas } }),
    () => db.assessmentLink.count({ where: { tenantId: t, OR: [{ personId: { in: a.pessoas } }, { templateId: { in: a.modelos } }] } }),
    () => db.assessmentTemplateQuestion.count({ where: { tenantId: t, templateId: { in: a.modelos } } }),
    () => db.person.count({ where: { tenantId: t, id: { in: a.pessoas }, type: "CANDIDATO" } }),
    () => db.person.count({ where: { tenantId: t, id: { in: a.pessoas }, type: "COLABORADOR" } }),
    () => db.cargo.count({ where: { tenantId: t, companyId: { in: a.empresasDaDemo } } }),
    () =>
      db.candidatura.findMany({
        where: { tenantId: t, vaga: { companyId: { in: a.empresasComMarca } }, ...deFora },
        select: {
          origin: true,
          createdAt: true,
          person: { select: { name: true, email: true, phone: true } },
          vaga: { select: { title: true, company: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
    () => db.assessmentLink.count({ where: { tenantId: t, templateId: { in: a.modelos }, ...deFora } }),
    () => db.assessmentLink.count({ where: { tenantId: t, candidatura: { vaga: { companyId: { in: a.empresasComMarca } } }, ...deFora } }),
    () =>
      db.person.findMany({
        where: { tenantId: t, currentCompanyId: { in: a.empresasDaDemo }, ...(a.pessoas.length > 0 ? { id: { notIn: a.pessoas } } : {}) },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
  ]);

  return {
    empresas: a.nomesDasEmpresas ?? [],
    contagens: [
      { rotulo: "vagas", quantidade: vagas },
      { rotulo: "versões de requisitos", quantidade: versoes },
      { rotulo: "candidaturas", quantidade: candidaturas },
      { rotulo: "notas da triagem", quantidade: notas },
      { rotulo: "avaliações de entrevista", quantidade: avaliacoes },
      { rotulo: "reuniões de entrevista", quantidade: reunioes },
      { rotulo: "testes (DISC e questionário)", quantidade: testes },
      { rotulo: "modelos de questionário [demo]", quantidade: a.modelos.length },
      { rotulo: "perguntas do questionário", quantidade: perguntas },
      { rotulo: "candidatos fictícios", quantidade: candidatos },
      { rotulo: "colaboradores fictícios", quantidade: colaboradores },
      { rotulo: "etiquetas [demo]", quantidade: a.etiquetas.length },
      { rotulo: "cargos das empresas da demonstração", quantidade: cargos },
    ],
    candidaturasDeFora: lista.map((c) => ({
      pessoa: c.person.name,
      email: c.person.email,
      telefone: c.person.phone,
      vaga: c.vaga.title,
      empresa: c.vaga.company.name,
      origem: c.origin,
      criadaEm: c.createdAt,
    })),
    testesDeForaApagados: testesApagados,
    testesDeForaDesligados: testesDesligados,
    pessoasDeForaNasEmpresas: semEmpresa.map((p) => p.name),
  };
}

// ─── Execução ───────────────────────────────────────────────────────────────

const ROTULO_DO_MODELO: Record<string, string> = {
  AssessmentLink: "testes",
  "AssessmentLink.candidaturaId:anular": "testes de gente de verdade desligados da vaga fictícia",
  Candidatura: "candidaturas",
  Vaga: "vagas",
  Person: "pessoas fictícias",
  AssessmentTemplate: "modelos de questionário",
  Tag: "etiquetas",
  Document: "documentos",
};

/** "34 candidaturas", na ordem em que saíram. */
export function frasesDoQueSaiu(mexido: Record<string, number>): string[] {
  return Object.entries(mexido)
    .filter(([, q]) => q > 0)
    .map(([chave, q]) => `${q} ${ROTULO_DO_MODELO[chave] ?? chave}`);
}

/**
 * Apaga a demonstração do Recrutamento. Chamar DENTRO da transação da
 * limpeza: se algo travar, nada sai. Devolve o que saiu e a prévia tirada
 * antes de apagar — é ela que diz quem de verdade se candidatou.
 */
export async function limparRecrutamentoDaDemo(tx: Tx, tenantId: string): Promise<{ feito: string[]; previa: PreviaDaLimpeza }> {
  const alvo = await alvoDaLimpeza(tx, tenantId);
  const previa = await previaDaLimpeza(tx, alvo);
  const mexido = await executarPlano(tx, PLANO_DA_LIMPEZA, alvo);
  return { feito: frasesDoQueSaiu(mexido), previa };
}
