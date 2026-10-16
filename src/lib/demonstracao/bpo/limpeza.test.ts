import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { criarBancoFalso, type Chamada } from "@/lib/exclusao/bancoFalso";
import { estadoDoBanco, lerMigrations, relacoesComOBanco } from "@/lib/exclusao/chavesDoBanco";
import { lerEsquema, trava, type RelacaoDoEsquema } from "@/lib/exclusao/lerEsquema";
import type { Passo } from "@/lib/exclusao/comum";
import { FONTE_DA_DEMO as FONTE_DO_RECRUTAMENTO } from "@/lib/demonstracao/recrutamento/plano";
import { conferirAntesDeCriar, gravarDemonstracaoDoBpo, TEXTO_FICTICIO_DO_COFRE } from "./gravar";
import { PLANO_DA_LIMPEZA_DO_BPO, ehEmpresaDaLimpeza, ehPessoaDaEquipe, limparBpoDaDemo } from "./limpeza";
import { FONTE_DA_DEMO, MARCA, SETOR, montarDemonstracaoDoBpo } from "./plano";

// O que se testa: que a ordem da limpeza passa pelas chaves estrangeiras **do
// banco**, que tudo o que a gravação escreve sai na limpeza (direto ou em
// cascata), e que a gravação só escreve nas tabelas da demonstração, sem nada
// que avise alguém.

const tx = (banco: unknown) => banco as Prisma.TransactionClient;
const json = (c: Chamada) => JSON.stringify(c.args ?? {});

const raiz = process.cwd();
const esquemaDoPrisma = lerEsquema(readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8"));
const RELACOES = relacoesComOBanco(esquemaDoPrisma, estadoDoBanco(lerMigrations(path.join(raiz, "prisma", "migrations"))));

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

/** Mesmo método da limpeza do Recrutamento: model a model, ninguém apontando com RESTRICT para o que sai. */
function travas(plano: readonly Pick<Passo<never>, "modelo" | "acao" | "coluna">[]): string[] {
  const apagados = new Set<string>();
  const neutralizadas = new Set<string>();
  const saida: string[] = [];
  for (const passo of plano) {
    if (passo.acao !== "apagar") {
      neutralizadas.add(`${passo.modelo}.${passo.coluna}`);
      continue;
    }
    const levados = comCascata(RELACOES, passo.modelo);
    for (const levado of levados) {
      for (const r of RELACOES) {
        if (r.alvo !== levado || !trava(r)) continue;
        if (apagados.has(r.modelo) || levados.has(r.modelo) || r.fks.every((f) => neutralizadas.has(`${r.modelo}.${f}`))) continue;
        saida.push(`apagar ${passo.modelo} esbarra em ${r.modelo}.${r.campo} → ${levado} (${r.onDelete})`);
      }
    }
    levados.forEach((m) => apagados.add(m));
  }
  return saida;
}

/** O plano e, depois dele, os passos "[demo]" de sempre do script. */
const PASSOS_DO_SCRIPT = ["PortalUser", "Company", "ClientGroup", "FinanceCategory"].map((modelo) => ({ modelo, acao: "apagar" as const }));
const COMPLETO = [...PLANO_DA_LIMPEZA_DO_BPO, ...PASSOS_DO_SCRIPT];

describe("ordem da limpeza × chaves do banco", () => {
  it("passa por todas as chaves, até a exclusão das empresas", () => {
    expect(travas(COMPLETO)).toEqual([]);
  });

  it("todo passo aponta para model e coluna que existem", () => {
    for (const p of PLANO_DA_LIMPEZA_DO_BPO) {
      const modelo = esquemaDoPrisma.modelos.get(p.modelo);
      expect(modelo, p.modelo).toBeDefined();
      if (p.acao !== "apagar") expect(modelo!.escalares.has(p.coluna!), `${p.modelo}.${p.coluna}`).toBe(true);
    }
  });

  it("sem tirar os cards antes, o espaço travaria (o próprio teste funciona)", () => {
    const semOsCards = COMPLETO.filter((p) => p.modelo !== "PipelineItem");
    expect(travas(semOsCards).join("\n")).toContain("PipelineItem.pipeline → Pipeline");
  });
});

describe("equipe fictícia da limpeza", () => {
  it("nome [demo], e-mail fictício e conta inativa — as três juntas", () => {
    expect(ehPessoaDaEquipe({ name: `${MARCA} Ana Souza`, email: "ana.souza@exemplo.invalido", active: false })).toBe(true);
    expect(ehPessoaDaEquipe({ name: `${MARCA} Ana Souza`, email: "ana.souza@exemplo.invalido", active: true })).toBe(false);
    expect(ehPessoaDaEquipe({ name: `${MARCA} Ana Souza`, email: "ana@41contabil.com.br", active: false })).toBe(false);
    expect(ehPessoaDaEquipe({ name: "Ana Souza", email: "ana.souza@exemplo.invalido", active: false })).toBe(false);
  });
});

describe("empresas da limpeza", () => {
  it("as [demo], menos as do Recrutamento (a limpeza dele já tratou)", () => {
    expect(ehEmpresaDaLimpeza({ name: `${MARCA} Padaria Pão de Ouro Ltda`, source: FONTE_DA_DEMO })).toBe(true);
    expect(ehEmpresaDaLimpeza({ name: `${MARCA} TRANSPORTES MODELO LTDA`, source: null })).toBe(true);
    expect(ehEmpresaDaLimpeza({ name: `${MARCA} PADARIA PÃO DOURADO LTDA`, source: FONTE_DO_RECRUTAMENTO })).toBe(false);
    expect(ehEmpresaDaLimpeza({ name: "PADARIA PÃO DE OURO LTDA", source: FONTE_DA_DEMO })).toBe(false);
  });
});

// ─── Gravação ───────────────────────────────────────────────────────────────

const AGORA = new Date("2026-10-15T15:00:00.000Z");
const PLANO = montarDemonstracaoDoBpo(AGORA);
const LEITURAS = ["findMany", "findFirst", "findUnique", "count", "aggregate"];

async function gravar({ outro = "u-outro" as string | null, cifrar = true, assunto = true } = {}) {
  const b = criarBancoFalso({
    achar: (delegado) => (delegado === "serviceRequestSubject" && assunto ? { id: "assunto-bpo" } : undefined),
  });
  let n = 0;
  const r = await gravarDemonstracaoDoBpo(
    tx(b.banco),
    "t1",
    PLANO,
    { apresentador: "u-apresenta", outro },
    AGORA,
    cifrar ? (texto) => `cifrado(${texto})` : null,
    { id: () => `id-${++n}`, senhaDescartavel: () => "x".repeat(64) }
  );
  const escritas = b.chamadas.filter((c) => !LEITURAS.includes(c.metodo));
  const dados = (delegado: string) =>
    escritas
      .filter((c) => c.delegado === delegado)
      .flatMap((c) => {
        const d = (c.args as { data: unknown }).data;
        return (Array.isArray(d) ? d : [d]) as Record<string, unknown>[];
      });
  return { b, r, escritas, dados };
}

const MODELO_DO_DELEGADO = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

describe("gravarDemonstracaoDoBpo", () => {
  it("só cria (nada de update/delete) — e tudo o que cria sai na limpeza, direto ou em cascata", async () => {
    const { escritas } = await gravar({ assunto: false });
    expect(escritas.every((c) => c.metodo === "createMany" || c.metodo === "create")).toBe(true);
    const cobertos = new Set<string>();
    for (const p of COMPLETO) if (p.acao === "apagar") comCascata(RELACOES, p.modelo).forEach((m) => cobertos.add(m));
    const gravados = [...new Set(escritas.map((c) => MODELO_DO_DELEGADO(c.delegado)))];
    expect(gravados.filter((m) => !cobertos.has(m))).toEqual([]);
  });

  it("escreve só nas tabelas esperadas — nada de auditoria, push, conta de usuário ou alerta já disparado", async () => {
    const { escritas } = await gravar({ assunto: false });
    const tabelas = [...new Set(escritas.map((c) => c.delegado))].sort();
    expect(tabelas).toEqual(
      [
        "activity",
        "bankAccount",
        "bankStatementImport",
        "bankTransaction",
        "bankTransactionMatch",
        "bpoCredential",
        "budget",
        "budgetLine",
        "checklistItem",
        "clientAnnouncement",
        "clientAnnouncementCompany",
        "clientRequest",
        "clientRequestMessage",
        "collectionAgreement",
        "collectionContact",
        "collectionReminderOptOut",
        "company",
        "companyMessage",
        "costCenter",
        "driveFolder",
        "financeApprovalEvent",
        "financeCategory",
        "financeCounterparty",
        "financeEntry",
        "folder",
        "manualDocument",
        "manualPage",
        "meeting",
        "meetingAttendee",
        "notification",
        "omieEmissao",
        "pipeline",
        "pipelineItem",
        "pipelineItemAssignee",
        "pipelineItemTag",
        "pipelineStage",
        "portalApprovalLimit",
        "portalUser",
        "portalUserCompany",
        "serviceRequest",
        "serviceRequestMessage",
        "serviceRequestSubject",
        "space",
        "tag",
        "tenantIntegration",
        "timeEntry",
        "user",
      ].sort()
    );
  });

  it("todo registro com escritório é do escritório certo", async () => {
    const { escritas } = await gravar();
    const semTenant = new Set([
      "bankTransactionMatch",
      "budgetLine",
      "clientAnnouncementCompany",
      "clientRequestMessage",
      "financeApprovalEvent",
      "meetingAttendee",
      "pipelineItemAssignee",
      "pipelineItemTag",
      "pipelineStage",
      "serviceRequestMessage",
    ]);
    for (const c of escritas.filter((x) => !semTenant.has(x.delegado))) expect(json(c), c.delegado).toContain('"tenantId":"t1"');
  });

  it("empresas [demo] ativas com a origem da demonstração; filiais apontando para a matriz", async () => {
    const { dados, r } = await gravar();
    const empresas = dados("company");
    expect(empresas).toHaveLength(3);
    for (const e of empresas) {
      expect(String(e.name).startsWith(MARCA)).toBe(true);
      expect(e.source).toBe(FONTE_DA_DEMO);
      expect(e.status).toBe("ACTIVE");
      expect(e).not.toHaveProperty("clientGroupId");
    }
    expect(empresas.filter((e) => e.parentCompanyId === r.idDaMatriz)).toHaveLength(2);
  });

  it("nada que mande aviso: contraparte sem e-mail, acesso do portal fictício, reunião já vista, integração sem chave, comunicado já marcado como enviado", async () => {
    const { dados } = await gravar();
    for (const c of dados("financeCounterparty")) expect(c.email).toBeNull();
    const [acesso] = dados("portalUser");
    expect(String(acesso!.email).endsWith("@exemplo.invalido")).toBe(true);
    expect(String(acesso!.passwordHash)).not.toMatch(/^\$2/); // não é bcrypt: nenhuma senha entra
    for (const a of dados("meetingAttendee")) expect(a.acknowledgedAt).toEqual(AGORA);
    for (const m of dados("meeting")) expect(String(m.meetingUrl).startsWith("https://exemplo.invalido/")).toBe(true);
    for (const i of dados("tenantIntegration")) expect(i.configEnc).toBe("");
    for (const e of dados("omieEmissao")) {
      expect(["AUTORIZADA", "REJEITADA", "CANCELADA"]).toContain(e.estado);
      expect(e.omieCodigoOS).toBeNull();
    }
    for (const c of dados("clientAnnouncement")) expect(c.notifiedAt).toBeInstanceOf(Date);
    expect(dados("collectionReminderOptOut")).toHaveLength(3);
  });

  it("categorias da empresa (escopo = id da empresa), nenhuma no plano do escritório", async () => {
    const { dados } = await gravar();
    for (const c of dados("financeCategory")) {
      expect(c.companyId).toBeTruthy();
      expect(c.scope).toBe(c.companyId);
    }
  });

  it("o que a limpeza procura pelo nome leva a marca", async () => {
    const { dados } = await gravar({ assunto: false });
    for (const [delegado, campo] of [
      ["space", "name"],
      ["tag", "name"],
      ["manualDocument", "title"],
      ["clientAnnouncement", "title"],
      ["notification", "message"],
      ["portalUser", "name"],
      ["serviceRequestSubject", "label"],
    ] as const) {
      for (const d of dados(delegado)) expect(String(d[campo]).startsWith(MARCA), `${delegado}.${campo}`).toBe(true);
    }
    for (const p of dados("driveFolder").filter((x) => x.companyId === null && x.parentId === null)) expect(String(p.name).startsWith(MARCA)).toBe(true);
    for (const s of dados("serviceRequestSubject")) expect(s.active).toBe(false);
  });

  it("cards do setor do BPO, todos de uma empresa da demonstração (os alertas da gestão pulam card de empresa [demo])", async () => {
    const { dados } = await gravar();
    const empresas = new Set(dados("company").map((e) => e.id));
    for (const c of dados("pipelineItem")) {
      expect(c.entityType).toBe("COMPANY");
      expect(empresas.has(c.entityId as string)).toBe(true);
    }
    for (const l of dados("pipeline")) expect(l.sectorCode).toBe(SETOR);
  });

  it("subtarefa e resposta só depois do card e do comentário a que apontam", async () => {
    const { escritas } = await gravar();
    const vistos = new Set<string>();
    for (const c of escritas.filter((x) => x.delegado === "pipelineItem" || x.delegado === "activity")) {
      const linhas = (c.args as { data: Record<string, unknown>[] }).data;
      for (const l of linhas) {
        const pai = (l.parentItemId ?? l.parentActivityId) as string | null;
        if (pai) expect(vistos.has(pai), `${c.delegado} ${l.id}`).toBe(true);
      }
      for (const l of linhas) vistos.add(l.id as string);
    }
  });

  it("equipe fictícia: contas inativas, sem senha que entre, sem setor; os cards dela apontam para essas contas", async () => {
    const { dados } = await gravar();
    const contas = dados("user");
    expect(contas).toHaveLength(PLANO.equipe.length);
    for (const u of contas) {
      expect(u.active).toBe(false);
      expect(String(u.name).startsWith(MARCA)).toBe(true);
      expect(String(u.email).endsWith("@exemplo.invalido")).toBe(true);
      expect(String(u.passwordHash)).not.toMatch(/^\$2/);
    }
    const ids = new Set(contas.map((u) => u.id));
    const daEquipe = dados("pipelineItemAssignee").filter((a) => ids.has(a.userId as string));
    expect(new Set(daEquipe.map((a) => a.userId)).size).toBe(contas.length);
    expect(dados("userSector")).toEqual([]);
  });

  it("sem segundo administrador, tudo cai em quem apresenta", async () => {
    const { dados } = await gravar({ outro: null });
    for (const l of dados("financeEntry")) expect(l.createdById).toBe("u-apresenta");
    const equipe = new Set(dados("user").map((u) => u.id));
    for (const a of dados("pipelineItemAssignee").filter((x) => !equipe.has(x.userId as string))) expect(a.userId).toBe("u-apresenta");
  });

  it("cofre: o texto fictício, cifrado; sem a chave de cifra, o cofre fica de fora", async () => {
    const com = await gravar();
    for (const s of com.dados("bpoCredential")) expect(s.passwordEnc).toBe(`cifrado(${TEXTO_FICTICIO_DO_COFRE})`);
    expect(com.r.senhasGravadas).toBe(PLANO.senhas.length);
    const sem = await gravar({ cifrar: false });
    expect(sem.dados("bpoCredential")).toEqual([]);
    expect(sem.r.senhasGravadas).toBe(0);
  });

  it("solicitações no assunto do BPO que já existe; sem nenhum, um [demo] inativo", async () => {
    const com = await gravar();
    expect(com.dados("serviceRequestSubject")).toEqual([]);
    for (const s of com.dados("serviceRequest")) expect(s.subjectId).toBe("assunto-bpo");
    const sem = await gravar({ assunto: false });
    expect(sem.r.assuntoCriado).toBe(true);
    expect(sem.dados("serviceRequestSubject")).toHaveLength(1);
  });

  it("cada transação conciliada tem o seu par gravado, pelo valor do lançamento", async () => {
    const { dados } = await gravar();
    const conciliadas = dados("bankTransaction").filter((t) => t.status === "CONCILIADA");
    expect(dados("bankTransactionMatch")).toHaveLength(conciliadas.length);
  });
});

describe("conferirAntesDeCriar", () => {
  it("escritório sem a demonstração: pode gravar", async () => {
    const b = criarBancoFalso({});
    expect(await conferirAntesDeCriar(tx(b.banco), "t1", PLANO)).toEqual({ jaExiste: [], conflitos: [] });
    expect(b.chamadas.filter((c) => !LEITURAS.includes(c.metodo))).toEqual([]);
  });

  it("rodar de novo não duplica: a demonstração já gravada é reconhecida", async () => {
    const b = criarBancoFalso({
      achar: (delegado) => (delegado === "company" ? [{ name: PLANO.empresas[0]!.name, cnpj: PLANO.empresas[0]!.cnpj, source: FONTE_DA_DEMO }] : undefined),
    });
    const r = await conferirAntesDeCriar(tx(b.banco), "t1", PLANO);
    expect(r.jaExiste.length).toBeGreaterThan(0);
    expect(r.conflitos).toEqual([]);
  });

  it("CNPJ de cadastro de verdade: recusa", async () => {
    const b = criarBancoFalso({
      achar: (delegado) => (delegado === "company" ? [{ name: "PADARIA DE VERDADE LTDA", cnpj: PLANO.empresas[0]!.cnpj, source: null }] : undefined),
    });
    const r = await conferirAntesDeCriar(tx(b.banco), "t1", PLANO);
    expect(r.conflitos).toHaveLength(1);
  });
});

// ─── Limpeza num banco de mentira ───────────────────────────────────────────

function escritorio() {
  return criarBancoFalso({
    mexer: () => 1,
    achar: (delegado, metodo) => {
      if (delegado === "company" && metodo === "findMany") {
        return [
          { id: "e-bpo", name: `${MARCA} Padaria Pão de Ouro Ltda`, source: FONTE_DA_DEMO },
          { id: "e-rec", name: `${MARCA} PADARIA PÃO DOURADO LTDA`, source: FONTE_DO_RECRUTAMENTO },
        ];
      }
      if (delegado === "space") return [{ id: "s1" }];
      if (delegado === "tag") return [{ id: "t-demo" }];
      if (delegado === "manualDocument") return [{ id: "m1" }];
      if (delegado === "clientAnnouncement") return [{ id: "a1" }];
      if (delegado === "driveFolder") return [{ id: "p1" }];
      if (delegado === "serviceRequestSubject") return [];
      if (delegado === "collectionAgreement") return [];
      // Um filtro frouxo de propósito: a segunda trava (ehPessoaDaEquipe) tem de segurar a conta ativa.
      if (delegado === "user" && metodo === "findMany") {
        return [
          { id: "u-ana", name: `${MARCA} Ana Souza`, email: "ana.souza@exemplo.invalido", active: false },
          { id: "u-real", name: `${MARCA} Conta de teste`, email: "teste@exemplo.invalido", active: true },
        ];
      }
      if (delegado === "user" && metodo === "findFirst") return { id: "u-admin" };
      return undefined;
    },
  });
}

describe("limparBpoDaDemo", () => {
  it("o plano de empresa só nas [demo] que não são do Recrutamento; a empresa em si fica para o script", async () => {
    const b = escritorio();
    const r = await limparBpoDaDemo(tx(b.banco), "t1");
    const w = b.chamadas.filter((c) => !LEITURAS.includes(c.metodo));
    const lancamentos = w.filter((c) => c.delegado === "financeEntry" && c.metodo === "deleteMany");
    expect(lancamentos.length).toBeGreaterThan(0);
    for (const c of lancamentos) {
      expect(json(c)).toContain("e-bpo");
      expect(json(c)).not.toContain("e-rec");
    }
    // A empresa em si não sai aqui (só o "responsável" dela pode passar ao administrador, pelo plano de usuário).
    expect(w.some((c) => c.delegado === "company" && c.metodo === "deleteMany")).toBe(false);
    expect(r.previa.empresas).toEqual([`${MARCA} Padaria Pão de Ouro Ltda`]);
    expect(r.feito.length).toBeGreaterThan(0);
  });

  it("subtarefas antes dos cards, cards antes das listas, listas antes do espaço; reuniões antes do plano de empresa", async () => {
    const b = escritorio();
    await limparBpoDaDemo(tx(b.banco), "t1");
    const w = b.chamadas.filter((c) => c.metodo === "deleteMany");
    const primeiro = (delegado: string) => w.findIndex((c) => c.delegado === delegado);
    const subtarefas = w.findIndex((c) => c.delegado === "pipelineItem" && json(c).includes("parentItemId"));
    expect(subtarefas).toBeGreaterThanOrEqual(0);
    expect(subtarefas).toBeLessThan(w.findIndex((c) => c.delegado === "pipelineItem" && !json(c).includes("parentItemId")));
    expect(primeiro("pipelineItem")).toBeLessThan(primeiro("pipeline"));
    expect(primeiro("pipeline")).toBeLessThan(primeiro("space"));
    expect(primeiro("meeting")).toBeLessThan(primeiro("financeEntry"));
  });

  it("a equipe fictícia sai pelo plano de usuário, passando o que sobrar para o administrador; conta ativa nunca", async () => {
    const b = escritorio();
    await limparBpoDaDemo(tx(b.banco), "t1");
    const w = b.chamadas.filter((c) => !LEITURAS.includes(c.metodo));
    const contas = w.filter((c) => c.delegado === "user" && c.metodo === "deleteMany");
    expect(contas.map((c) => c.args)).toEqual([{ where: { tenantId: "t1", id: "u-ana" } }]);
    for (const c of w) expect(json(c), `${c.delegado}.${c.metodo}`).not.toContain("u-real");
    // O que a conta tivesse feito fora da demonstração passa para o administrador.
    expect(w.some((c) => c.metodo === "updateMany" && json(c).includes("u-admin"))).toBe(true);
    // A equipe sai depois dos cards, que levam os comentários e as horas dela.
    expect(w.findIndex((c) => c.delegado === "pipelineItem")).toBeLessThan(w.findIndex((c) => c.delegado === "user"));
  });

  it("todo filtro de escrita tem o escritório", async () => {
    const b = escritorio();
    await limparBpoDaDemo(tx(b.banco), "t1");
    for (const c of b.chamadas.filter((x) => !LEITURAS.includes(x.metodo))) {
      // Os três do plano de empresa que não têm tenantId filtram pela empresa (via relação).
      if (["bankTransactionMatch", "clientDocumentView", "clientDocumentRecipient"].includes(c.delegado)) continue;
      // O plano de usuário filtra pelo id da conta fictícia (sessões, preferências), que já é do escritório.
      if (json(c).includes("u-ana")) continue;
      expect(json(c), `${c.delegado}.${c.metodo}`).toMatch(/"tenantId":"t1"/);
    }
  });

  it("sem nada da demonstração, só a varredura das notificações [demo]", async () => {
    const b = criarBancoFalso({});
    const r = await limparBpoDaDemo(tx(b.banco), "t1");
    const w = b.chamadas.filter((c) => !LEITURAS.includes(c.metodo));
    expect(w.map((c) => c.delegado)).toEqual(["notification"]);
    expect(r.feito).toEqual([]);
  });
});
