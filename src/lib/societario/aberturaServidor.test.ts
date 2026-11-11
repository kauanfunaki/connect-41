import { beforeEach, describe, expect, it, vi } from "vitest";

// A gravação da abertura de processo (09/11/2026), que a tela e a Ceci passaram
// a dividir: o que a tela fazia continua igual, e o que a Ceci confere a mais
// (roteiro da proposta, item de fora, empresa inativa) recusa antes de gravar.
// O banco é falso; nada aqui chama o modelo.

type Template = {
  id: string;
  type: { name: string; active: boolean };
  steps: { id: string; items: { id: string }[] }[];
};

const m = vi.hoisted(() => ({
  template: null as Template | null,
  empresa: null as Record<string, unknown> | null,
  tipo: null as Record<string, unknown> | null,
  emAndamento: 0,
  responsaveis: [] as { id: string; name: string }[],
  consultas: [] as { modelo: string; args: Record<string, unknown> }[],
  gravados: [] as { modelo: string; data: Record<string, unknown> }[],
  auditoria: [] as Record<string, unknown>[],
  mensagens: [] as Record<string, unknown>[],
  avisos: 0,
  ids: 0,
}));

vi.mock("@/lib/prisma", () => {
  const grava = (modelo: string) => async (args: { data: Record<string, unknown> }) => {
    m.gravados.push({ modelo, data: args.data });
    return { id: `${modelo}-${++m.ids}`, number: args.data.number };
  };
  const consulta = <T,>(modelo: string, valor: () => T) => async (args: Record<string, unknown>) => {
    m.consultas.push({ modelo, args });
    return valor();
  };
  const tx = {
    // O contador do endereço curto (10/11/2026): em 0, o processo é o nº 1.
    $queryRaw: async () => [{ ultimo: 0 }],
    $executeRaw: async () => 1,
    process: { create: grava("process") },
    processStep: { create: grava("processStep") },
    processChecklistItem: { create: grava("processChecklistItem") },
  };
  const prisma = {
    processTemplate: { findFirst: consulta("processTemplate", () => m.template) },
    company: { findFirst: consulta("company", () => m.empresa) },
    processType: { findFirst: consulta("processType", () => m.tipo) },
    process: { count: consulta("process.count", () => m.emAndamento) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { getPrisma: () => prisma };
});
vi.mock("@/lib/audit", () => ({ logAudit: async (x: Record<string, unknown>) => void m.auditoria.push(x) }));
vi.mock("@/lib/sectorUsers", () => ({ getSectorUsers: async () => m.responsaveis }));
vi.mock("@/lib/modules", () => ({ setoresDoModulo: async () => ["societario"] }));
vi.mock("./conversa", () => ({
  gravarMensagem: async (x: Record<string, unknown>) => void m.mensagens.push(x),
  processoNoEscopo: async () => ({ id: "p" }),
}));
vi.mock("./avisoAoCliente", () => ({ avisarClienteDoProcesso: async () => void m.avisos++ }));

const { abrirProcessoNoServidor, prepararAbertura } = await import("./aberturaServidor");
type Pedido = Parameters<typeof abrirProcessoNoServidor>[1];

const QUEM = { tenantId: "t1", userId: "u-quem-abre" };

const pedido = (over: Partial<Pedido> = {}): Pedido => ({
  empresaId: "empresa-1",
  tipoId: "tipo-1",
  campos: { titulo: "Sede nova", responsavelId: "u-ana", prioridade: "ALTA", prazoCombinado: "2026-11-20" },
  aceitarQuemAbre: false,
  jaTemos: ["i-contrato"],
  pedidoAoCliente: null,
  origem: { tipo: "tela" },
  ...over,
});

const gravados = (modelo: string) => m.gravados.filter((g) => g.modelo === modelo).map((g) => g.data);

beforeEach(() => {
  m.template = {
    id: "roteiro-v3",
    type: { name: "Alteração contratual", active: true },
    steps: [
      { id: "s1", items: [{ id: "i-contrato" }, { id: "i-endereco" }] },
      { id: "s2", items: [] },
    ],
  };
  m.empresa = { id: "empresa-1", status: "ACTIVE" };
  m.tipo = null;
  m.emAndamento = 0;
  m.responsaveis = [{ id: "u-ana", name: "Ana Exemplo" }];
  m.consultas = [];
  m.gravados = [];
  m.auditoria = [];
  m.mensagens = [];
  m.avisos = 0;
  m.ids = 0;
});

describe("a abertura pela tela continua igual", () => {
  it("cria o processo, as etapas e o checklist, com o que já temos marcado", async () => {
    expect(await abrirProcessoNoServidor(QUEM, pedido())).toEqual({ ok: true, processoId: "process-1", endereco: "/processos/processo-1" });
    expect(gravados("process")).toEqual([
      {
        tenantId: "t1",
        number: 1,
        companyId: "empresa-1",
        typeId: "tipo-1",
        templateId: "roteiro-v3",
        ownerUserId: "u-ana",
        title: "Sede nova",
        priority: "ALTA",
        dueAt: new Date(Date.UTC(2026, 10, 20, 12)),
      },
    ]);
    expect(gravados("processStep").map((s) => s.templateStepId)).toEqual(["s1", "s2"]);
    const itens = gravados("processChecklistItem");
    expect(itens.map((i) => [i.templateItemId, i.done ?? false])).toEqual([
      ["i-contrato", true],
      ["i-endereco", false],
    ]);
    expect(m.auditoria).toEqual([
      expect.objectContaining({
        action: "process.open",
        entityType: "Process",
        entityId: "process-1",
        metadata: { tipo: "Alteração contratual", companyId: "empresa-1", prioridade: "ALTA", jaTemos: 1, pedidoAoCliente: false },
      }),
    ]);
    expect(m.mensagens).toEqual([]);
  });

  it("o roteiro e a empresa são lidos no tenant de quem abre", async () => {
    await abrirProcessoNoServidor(QUEM, pedido());
    expect(m.consultas.find((c) => c.modelo === "processTemplate")!.args.where).toEqual({ tenantId: "t1", typeId: "tipo-1", published: true });
    expect(m.consultas.find((c) => c.modelo === "company")!.args.where).toEqual({ id: "empresa-1", tenantId: "t1" });
  });

  it("item de fora do roteiro é ignorado, e empresa inativa abre — como antes", async () => {
    m.empresa = { id: "empresa-1", status: "INACTIVE" };
    const r = await abrirProcessoNoServidor(QUEM, pedido({ jaTemos: ["i-contrato", "i-de-outro-roteiro"] }));
    expect(r.ok).toBe(true);
    expect(m.auditoria[0]!.metadata).toMatchObject({ jaTemos: 2 });
  });

  it("sem o campo de responsável, quem abre fica responsável mesmo fora da lista", async () => {
    const r = await abrirProcessoNoServidor(QUEM, pedido({ aceitarQuemAbre: true, campos: { responsavelId: "u-quem-abre" } }));
    expect(r.ok).toBe(true);
    expect(gravados("process")[0]!.ownerUserId).toBe("u-quem-abre");
  });

  it("manda o pedido ao cliente pela conversa do processo", async () => {
    await abrirProcessoNoServidor(QUEM, pedido({ pedidoAoCliente: "Olá! Precisamos do comprovante." }));
    expect(m.mensagens).toEqual([
      { tenantId: "t1", processId: "process-1", autor: { userId: "u-quem-abre" }, corpo: "Olá! Precisamos do comprovante.", anexos: [] },
    ]);
    expect(m.avisos).toBe(1);
    expect(m.auditoria[0]!.metadata).toMatchObject({ pedidoAoCliente: true });
  });

  it("recusa antes de gravar: sem empresa, sem tipo, responsável de fora, sem roteiro, empresa de outro escritório", async () => {
    expect(await abrirProcessoNoServidor(QUEM, pedido({ empresaId: "" }))).toEqual({ ok: false, erro: "Escolha a empresa." });
    expect(await abrirProcessoNoServidor(QUEM, pedido({ tipoId: "" }))).toEqual({ ok: false, erro: "Escolha o tipo de processo." });
    expect(await abrirProcessoNoServidor(QUEM, pedido({ campos: { responsavelId: "u-de-fora" } }))).toEqual({
      ok: false,
      erro: "O responsável precisa ser alguém do Societário.",
    });
    m.template = null;
    expect(await abrirProcessoNoServidor(QUEM, pedido())).toEqual({
      ok: false,
      erro: "Este tipo de processo não tem roteiro publicado. Configure antes de abrir.",
    });
    m.template = { id: "r", type: { name: "Baixa", active: true }, steps: [] };
    expect(await abrirProcessoNoServidor(QUEM, pedido())).toEqual({ ok: false, erro: "O roteiro publicado não tem etapas." });
    m.template = { id: "r", type: { name: "Baixa", active: true }, steps: [{ id: "s1", items: [] }] };
    m.empresa = null;
    expect(await abrirProcessoNoServidor(QUEM, pedido())).toEqual({ ok: false, erro: "Empresa não encontrada." });
    expect(m.gravados).toEqual([]);
    expect(m.auditoria).toEqual([]);
  });
});

describe("a abertura pela Ceci confere o que a tela garante na hora", () => {
  const pelaCeci = (roteiroId: string | null = "roteiro-v3") => ({ tipo: "ceci" as const, roteiroId });

  it("grava como a tela, com a auditoria dizendo que veio da proposta", async () => {
    const r = await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci(), pedidoAoCliente: "Olá!" }));
    expect(r).toEqual({ ok: true, processoId: "process-1", endereco: "/processos/processo-1" });
    expect(m.auditoria).toEqual([expect.objectContaining({ action: "process.open_ceci", entityId: "process-1", userId: "u-quem-abre" })]);
    expect(m.mensagens).toHaveLength(1);
  });

  it("roteiro publicado depois da proposta: recusa, o checklist pode ser outro", async () => {
    const r = await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci("roteiro-v2") }));
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/roteiro de Alteração contratual mudou/) });
    expect(m.gravados).toEqual([]);
  });

  it("item marcado que não é do roteiro: recusa em vez de ignorar", async () => {
    const r = await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci(null), jaTemos: ["i-de-outro-roteiro"] }));
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/não é do roteiro vigente/) });
    expect(m.gravados).toEqual([]);
  });

  it("tipo desativado ou empresa que deixou de estar ativa: recusa", async () => {
    m.template = { ...m.template!, type: { name: "Alteração contratual", active: false } };
    expect(await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci() }))).toEqual({ ok: false, erro: expect.stringMatching(/desativado/) });
    m.template = { ...m.template, type: { name: "Alteração contratual", active: true } };
    m.empresa = { id: "empresa-1", status: "CHURNED" };
    expect(await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci() }))).toEqual({ ok: false, erro: expect.stringMatching(/não está mais ativa/) });
    m.empresa = { id: "empresa-1", status: "PROSPECT" };
    expect((await abrirProcessoNoServidor(QUEM, pedido({ origem: pelaCeci() }))).ok).toBe(true);
  });
});

describe("preparar a proposta", () => {
  beforeEach(() => {
    m.tipo = {
      id: "tipo-1",
      name: "Alteração contratual",
      active: true,
      templates: [
        {
          id: "roteiro-v3",
          version: 3,
          steps: [
            {
              label: "Reunir documentação",
              optional: false,
              organ: null,
              items: [
                { id: "i-contrato", label: "Contrato social", required: true },
                { id: "i-endereco", label: "Comprovante de endereço", required: true },
              ],
            },
            { label: "Registro na Junta", optional: false, organ: { name: "Junta Comercial", acronym: "JUCEPAR" }, items: [] },
          ],
        },
      ],
    };
    m.empresa = { id: "empresa-1", name: "PADARIA MODELO LTDA", displayName: "Padaria Modelo", cnpj: "11222333000181", cpf: null, status: "ACTIVE" };
    m.emAndamento = 1;
  });

  const ARGS = {
    tipoId: "tipo-1",
    empresaId: "empresa-1",
    responsavelId: "u-ana",
    titulo: "",
    prioridade: "NORMAL",
    prazo: "2026-11-20",
    jaTemos: ["i-contrato"],
    pedidoAoCliente: "Olá!",
  };

  it("lê tudo no tenant e devolve os argumentos com o roteiro e o resumo do cartão", async () => {
    const r = await prepararAbertura(ARGS, "t1", new Date("2026-11-09T15:00:00Z"));
    expect(r).toEqual({
      argumentos: {
        ...ARGS,
        roteiroId: "roteiro-v3",
        resumo: {
          tipo: "Alteração contratual",
          versao: 3,
          etapas: 2,
          empresa: "Padaria Modelo",
          documento: "11.222.333/0001-81",
          responsavel: "Ana Exemplo",
          jaTemos: ["Contrato social"],
          aPedir: ["Comprovante de endereço"],
          emAndamento: 1,
        },
      },
    });
    expect(m.consultas.find((c) => c.modelo === "processType")!.args.where).toEqual({ id: "tipo-1", tenantId: "t1" });
    expect(m.consultas.find((c) => c.modelo === "company")!.args.where).toEqual({ id: "empresa-1", tenantId: "t1" });
    expect(m.consultas.find((c) => c.modelo === "process.count")!.args.where).toEqual({
      tenantId: "t1",
      companyId: "empresa-1",
      typeId: "tipo-1",
      status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] },
    });
    // Preparar só lê.
    expect(m.gravados).toEqual([]);
    expect(m.auditoria).toEqual([]);
  });

  it("argumento torto volta antes de consultar o banco", async () => {
    expect(await prepararAbertura({ ...ARGS, prioridade: "QUALQUER" }, "t1")).toEqual({ erro: expect.stringMatching(/prioridade/) });
    expect(m.consultas).toEqual([]);
  });

  it("tipo de outro escritório volta como erro para o modelo", async () => {
    m.tipo = null;
    expect(await prepararAbertura(ARGS, "t1")).toEqual({ erro: expect.stringMatching(/tipos_de_processo/) });
  });
});
