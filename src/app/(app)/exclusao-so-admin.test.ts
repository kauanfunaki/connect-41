import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Regra de 13/10/2026: "Usuário, coordenador e gestor não pode excluir nada,
// só admin e super admin." Uma ação de exclusão de cada módulo, chamada com
// cada papel: o gestor do setor (SECTOR_ADMIN), o colaborador (SECTOR_USER) e
// o Somente leitura não chegam a apagar nada no banco; o administrador apaga.
//
// O banco é um Proxy que anota toda chamada e devolve um registro que passa
// nas conferências de escopo — assim o teste mede só a regra de papel.

type Chamada = { modelo: string; op: string; args: unknown };
const chamadas: Chamada[] = [];

const registro = () => ({
  id: "r1",
  tenantId: "t1",
  sectorCode: "setor",
  userId: "outra-pessoa",
  createdById: "outra-pessoa",
  evaluatorUserId: "outra-pessoa",
  personId: "p1",
  companyId: "c1",
  pipelineId: "pl1",
  spaceId: "s1",
  folderId: null,
  parentItemId: null,
  pipelineItemId: null,
  candidaturaId: null,
  title: "Registro",
  name: "Registro",
  status: "PENDENTE",
  source: "SITE",
  recipients: [],
  financeEntry: null,
  financeEntries: [],
  space: { sectorCode: "setor" },
  vaga: { id: "v1", sectorCode: "setor", restrictedToRecruiters: false },
  _count: { items: 0, folders: 0, pipelines: 0, recurringObligations: 0, modelosDeObrigacao: 0, links: 0 },
});

function modelo(nome: string): unknown {
  return new Proxy(
    {},
    {
      get: (_, op) => {
        if (op === "then" || typeof op !== "string") return undefined;
        return async (args: unknown) => {
          chamadas.push({ modelo: nome, op, args });
          if (op === "findFirst" || op === "findUnique") return registro();
          if (op === "findMany") return [];
          if (op === "count") return 0;
          if (op === "deleteMany" || op === "updateMany") return { count: 1 };
          return registro();
        };
      },
    },
  );
}

const prisma: unknown = new Proxy(
  {},
  {
    get: (_, nome) => {
      if (nome === "then" || typeof nome !== "string") return undefined;
      if (nome === "$transaction") {
        return async (x: unknown) => (typeof x === "function" ? x(prisma) : Promise.all(x as Promise<unknown>[]));
      }
      return modelo(nome);
    },
  },
);

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/modules", () => {
  const mod = {
  setorDoModulo: vi.fn(async () => "setor"),
  isModuleEnabled: vi.fn(async () => true),
};
  // Os setores da tela (21/10/2026): aqui, só o dono, como antes.
  const setoresDoModulo = async (t: string, c: string) => {
    const s = await (mod.setorDoModulo as (t: string, c: string) => Promise<string | null>)(t, c);
    return s == null ? null : [s];
  };
  return { ...mod, setoresDoModulo };
});
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: vi.fn(async () => true) }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_ADMIN" as UserRole,
  sectors: ["setor"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
  scopedSectors: () => null,
}));

const kanban = await import("./kanban/actions");
const espacos = await import("./kanban/spaces-actions");
const leads = await import("./leads/actions");
const vagas = await import("./vagas/actions");
const avaliacoes = await import("./avaliacoes/actions");
const treinamentos = await import("./treinamentos/actions");
const turmas = await import("./treinamentos/[id]/actions");
const participantes = await import("./treinamentos/[id]/turmas/[classId]/actions");
const ferias = await import("./pessoas/[id]/ferias/actions");
const afastamentos = await import("./pessoas/[id]/afastamentos/actions");
const cargos = await import("./empresas/[id]/cargos/actions");
const folha = await import("./empresas/[id]/folha/actions");
const lancamentosDaFolha = await import("./empresas/[id]/folha/[competencyId]/actions");
const socios = await import("./empresas/[id]/socios/actions");
const fiscal = await import("./documentos-fiscais/[id]/editar");
const senhas = await import("./bpo-senhas/actions");
const manual = await import("./bpo-manual/actions");
const modelosDeTeste = await import("./testes/templates/actions");
const testes = await import("./testes/actions");
const campos = await import("./admin/campos/actions");
const tags = await import("./admin/tags/actions");
const agenda = await import("./agenda/actions");
const entrevistas = await import("./vagas/[id]/candidaturas/[candidaturaId]/meeting-actions");
const pareceres = await import("./vagas/[id]/candidaturas/[candidaturaId]/actions");
const horasDoProcesso = await import("./processos/horas-actions");
const conversas = await import("./conversas/actions");

const acoes: [string, () => Promise<unknown>][] = [
  ["Kanban › card", () => kanban.excluirItem("pl1", "i1")],
  ["Kanban › subtarefa", () => kanban.excluirSubtarefa("i1", "sub1")],
  ["Kanban › comentário", () => kanban.excluirNota("pl1", "i1", "n1")],
  ["Kanban › item do checklist", () => kanban.excluirChecklistItem("i1", "ck1")],
  ["Kanban › apontamento de tempo", () => kanban.excluirLancamentoTempo("pl1", "i1", "te1")],
  ["Kanban › espaço", () => espacos.excluirEspaco("s1")],
  ["Kanban › pasta", () => espacos.excluirPasta("f1")],
  ["Kanban › lista", () => espacos.excluirLista("pl1")],
  ["Leads › lead", () => leads.excluirLead("l1")],
  ["Recrutamento › vaga", () => vagas.excluirVaga("v1")],
  ["Recrutamento › entrevista", () => entrevistas.excluirEntrevista("v1", "cand1", "m1")],
  ["Recrutamento › parecer", () => pareceres.excluirScorecard("v1", "cand1", "sc1")],
  ["Testes › modelo", () => modelosDeTeste.excluirTemplate("tp1")],
  ["Testes › teste enviado", () => testes.excluirLinkTeste("lk1")],
  ["DP › ciclo de avaliação", () => avaliacoes.excluirCiclo("ci1")],
  ["DP › treinamento", () => treinamentos.excluirTreinamento("tr1")],
  ["DP › turma", () => turmas.excluirTurma("tr1", "cl1")],
  ["DP › participante", () => participantes.removerParticipante("tr1", "cl1", "pa1")],
  ["DP › férias", () => ferias.excluirFerias("p1", "va1")],
  ["DP › afastamento", () => afastamentos.excluirAfastamento("p1", "ab1")],
  ["Empresa › cargo", () => cargos.excluirCargo("ca1", "c1")],
  ["Empresa › competência da folha", () => folha.excluirCompetencia("c1", "co1")],
  ["Empresa › lançamento da folha", () => lancamentosDaFolha.excluirLancamento("c1", "co1", "le1")],
  ["Empresa › sócio", () => socios.excluirSocio("so1", "c1")],
  ["Fiscal › documento", () => fiscal.excluirDocumento("d1")],
  ["BPO › senha do cofre", () => senhas.excluirCredencial("cr1")],
  ["BPO › página do manual", () => manual.excluirPaginaManual("pg1")],
  ["BPO › documento do manual", () => manual.excluirDocumentoManual("md1")],
  ["Configuração › campo personalizado", () => campos.excluirCampo("cf1")],
  ["Configuração › tag", () => tags.excluirTag("tg1")],
  ["Agenda › reunião avulsa", () => agenda.excluirReuniaoAvulsa("m1")],
  ["Societário › horas do processo", () => horasDoProcesso.apagarHorasDoProcesso("pr1", "te1")],
];

const apagou = () => chamadas.some((c) => c.op === "delete" || c.op === "deleteMany");

beforeEach(() => {
  chamadas.length = 0;
  ctx.subscriptionReadOnly = false;
});

describe("excluir é só do Administrador e do Super Admin", () => {
  for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"] as const) {
    it.each(acoes)(`${role} não exclui: %s`, async (_, chamar) => {
      ctx.role = role;
      await chamar();
      expect(apagou()).toBe(false);
    });
  }

  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    it.each(acoes)(`${role} exclui: %s`, async (_, chamar) => {
      ctx.role = role;
      await chamar();
      expect(apagou()).toBe(true);
    });
  }

  it("assinatura em somente leitura barra o administrador", async () => {
    ctx.role = "ADMIN";
    ctx.subscriptionReadOnly = true;
    for (const [, chamar] of acoes) await chamar();
    expect(apagou()).toBe(false);
  });
});

describe("exceções do dia a dia seguem com quem age no setor", () => {
  it("desmarcar tag, responsável e participante do card", async () => {
    ctx.role = "SECTOR_USER";
    await kanban.alternarTagItem("pl1", "i1", "tg1", false);
    await kanban.alternarResponsavelItem("pl1", "i1", "u2", false);
    await kanban.alternarObservadorItem("pl1", "i1", "u2", false);
    const apagados = chamadas.filter((c) => c.op === "delete").map((c) => c.modelo);
    expect(apagados).toEqual(["pipelineItemTag", "pipelineItemAssignee", "pipelineItemWatcher"]);
  });

  it("desfazer vínculo entre cards confere que o card é da lista", async () => {
    ctx.role = "SECTOR_USER";
    await kanban.removerLinkItem("pl1", "i1", "i2");
    const conferiu = chamadas.find((c) => c.modelo === "pipelineItem" && c.op === "findFirst");
    expect(conferiu?.args).toEqual({ where: { id: "i1", tenantId: "t1", pipelineId: "pl1" }, select: { id: true } });
    expect(chamadas.some((c) => c.modelo === "pipelineItemLink" && c.op === "deleteMany")).toBe(true);
  });

  it("marcar tag confere que a tag é do escritório", async () => {
    ctx.role = "SECTOR_USER";
    await kanban.alternarTagItem("pl1", "i1", "tg1", true);
    const conferiu = chamadas.find((c) => c.modelo === "tag" && c.op === "findFirst");
    expect(conferiu?.args).toEqual({ where: { id: "tg1", tenantId: "t1" }, select: { id: true } });
  });

  it("marcar responsável confere que a pessoa é do escritório", async () => {
    ctx.role = "SECTOR_USER";
    await kanban.alternarResponsavelItem("pl1", "i1", "u2", true);
    const conferiu = chamadas.find((c) => c.modelo === "user" && c.op === "findFirst");
    expect(conferiu?.args).toEqual({ where: { id: "u2", tenantId: "t1" }, select: { id: true } });
  });
});

describe("Conversas: desvincular contato do Chatwoot", () => {
  it("Somente leitura e gestor não desvinculam (antes o Somente leitura podia); o administrador desvincula", async () => {
    for (const role of ["READONLY", "SECTOR_ADMIN", "SECTOR_USER"] as const) {
      ctx.role = role;
      expect(await conversas.desvincularContatoChatwoot("ln1")).toEqual({ ok: false, error: "Sem permissão para desvincular contatos." });
      expect(await conversas.vincularContatoChatwoot("ln1", { personId: "p1" })).toEqual({ ok: false, error: "Sem permissão para vincular contatos." });
    }
    expect(chamadas.some((c) => c.modelo === "chatwootContactLink" && c.op === "update")).toBe(false);
    ctx.role = "ADMIN";
    expect(await conversas.desvincularContatoChatwoot("ln1")).toEqual({ ok: true });
  });
});

describe("Agenda: excluir reunião só alcança a avulsa", () => {
  it("o filtro leva pipelineItemId e candidaturaId nulos", async () => {
    ctx.role = "ADMIN";
    await agenda.excluirReuniaoAvulsa("m1");
    const busca = chamadas.find((c) => c.modelo === "meeting" && c.op === "findFirst");
    expect(busca?.args).toEqual({ where: { id: "m1", tenantId: "t1", pipelineItemId: null, candidaturaId: null } });
  });
});
