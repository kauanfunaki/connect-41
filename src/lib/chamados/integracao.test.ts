import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { Contexto } from "./contexto";

const url = process.env.HELPDESK_TEST_DATABASE_URL;
if (url) { const u = new URL(url); if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "33379" || u.pathname !== "/connect41") throw new Error("Teste de integração recusou banco não isolado."); }
const destino = url ? new URL(url) : null;
const db = destino ? new PrismaClient({ adapter: new PrismaMariaDb({ host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true }) }) : null;
const mocks = vi.hoisted(() => ({ analisar: vi.fn(), classificar: vi.fn(), push: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco de teste não configurado."); return db; } }));
vi.mock("./triagem", () => ({ analisar: mocks.analisar }));
vi.mock("./classificacao", () => ({ classificar: mocks.classificar }));
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: true }) }));
vi.mock("@/lib/webPush", () => ({ sendWebPushToUser: mocks.push }));
vi.mock("@/lib/auth/context", async original => ({ ...await original<typeof import("@/lib/auth/context")>(), getAuthContext: mocks.auth }));

import { criarRascunho, salvarRascunho, avaliarRascunho, finalizarRascunho, alterar, comentar } from "./comandos";
import { detalhe, lista, indicadores } from "./consultas";
import { configurarSetores, salvarCategoria } from "./configuracao";
import { configDoHelpdesk } from "./contexto";
import { enviarAnexo } from "./anexos";
import { despacharEventos } from "./notificacoes";
import { verificarSla } from "./alertas";
import { anexosDoChamado } from "./armazenamento";
import { GET as baixar } from "@/app/api/chamados/anexos/[id]/route";

describe.skipIf(!url)("helpdesk com MySQL descartável e notificações simuladas", () => {
  let tenantId: string, outroTenant: string, categoriaId: string, solicitante: string, colega: string, gestor: string, operador: string, chefe: string;
  let c: Contexto, equipe: Contexto, gestao: Contexto;
  const artefatos: { fileUrl: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
  const contextoUsuario = (userId: string, role: Contexto["ctx"]["role"], sectors: string[]): Contexto => ({ ctx: { userId, role, sectors, tenantId, homeTenantId: tenantId, activeSector: null, subscriptionReadOnly: false, canSelfRegularizeSubscription: false }, config: { enabled: true, sectorCode: "tech", requesterSectors: ["fiscal"] } });
  const payload = () => ({ title: "Acesso ao sistema de testes", description: "Preciso de acesso ao ambiente fictício de atendimento para registrar solicitações.", categoryId: categoriaId, requesterSectorCode: "fiscal", priority: "MEDIA", requestData: {}, tags: ["teste"] });
  const novo = async () => { const d = await criarRascunho(c); const v = await salvarRascunho(c, d.id, d.version, payload()); return { ...d, version: v.version }; };
  const abrir = async () => { const d = await novo(); return (await finalizarRascunho(c, d.id, d.version, true)).ticketId; };
  beforeAll(async () => {
    const t = await db!.tenant.create({ data: { name: "Escritório fictício de testes", slug: `helpdesk-test-${randomUUID()}` } }); tenantId = t.id;
    outroTenant = (await db!.tenant.create({ data: { name: "Outro escritório fictício", slug: `helpdesk-test-${randomUUID()}` } })).id;
    await db!.sector.createMany({ data: ["tech", "fiscal", "controladoria"].map(code => ({ tenantId, code, label: code })) });
    const usuario = async (name: string, role: Contexto["ctx"]["role"], setor: string) => (await db!.user.create({ data: { tenantId, name, email: `${randomUUID()}@example.test`, passwordHash: "sem-login-de-teste", role, sectors: { create: { sectorCode: setor } } } })).id;
    solicitante = await usuario("Solicitante fictício", "SECTOR_USER", "fiscal"); colega = await usuario("Colega fictício", "SECTOR_USER", "fiscal"); gestor = await usuario("Gestor fiscal fictício", "SECTOR_ADMIN", "fiscal"); operador = await usuario("Atendente fictício", "SECTOR_USER", "tech"); chefe = await usuario("Gestor de atendimento fictício", "SECTOR_ADMIN", "tech");
    c = contextoUsuario(solicitante, "SECTOR_USER", ["fiscal"]); equipe = contextoUsuario(operador, "SECTOR_USER", ["tech"]); gestao = contextoUsuario(chefe, "SECTOR_ADMIN", ["tech"]);
    await db!.tenantModule.create({ data: { tenantId, moduleCode: "helpdesk", enabled: true, sectorCode: "tech" } });
    await db!.helpdeskRequesterSector.create({ data: { tenantId, sectorCode: "fiscal" } });
    await salvarCategoria(gestao, { name: "Acesso fictício", checklistTemplate: [{ key: "verificar", label: "Conferir o acesso" }] });
    categoriaId = (await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId } })).id;
  });
  beforeEach(() => { mocks.analisar.mockReset(); mocks.classificar.mockReset().mockResolvedValue({ categoryId: categoriaId, reason: "Classificação fictícia", origem: "principal" }); mocks.push.mockReset().mockResolvedValue(undefined); mocks.auth.mockReturnValue(c.ctx); });
  afterAll(async () => { if (artefatos.length) await anexosDoChamado.apagarAnexosGravados(artefatos); await db!.$disconnect(); });

  it("salva e retoma rascunho sem gerar fila, SLA ou notificações", async () => {
    const d = await novo(); const salvo = await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(salvo.payload).toMatchObject({ ...payload(), categoryId: "" }); expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(0);
    expect(await db!.helpdeskSlaCycle.count({ where: { tenantId } })).toBe(0);
  });
  it("finaliza uma única vez mesmo com duas submissões concorrentes", async () => {
    const d = await novo(); mocks.analisar.mockResolvedValue({ status: "unavailable", summary: "Teste", questions: [], attachments: [] });
    const avaliado = await avaliarRascunho(c, d.id, d.version);
    const [a, b] = await Promise.all([finalizarRascunho(c, d.id, avaliado.version, true), finalizarRascunho(c, d.id, avaliado.version, true)]);
    expect(a.ticketId).toBe(b.ticketId); expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(1);
    expect(await db!.helpdeskEvent.count({ where: { ticketId: a.ticketId, type: "created" } })).toBe(1);
    expect(await db!.helpdeskChecklistItem.count({ where: { ticketId: a.ticketId } })).toBe(1);
  });
  it("isola colegas, participantes, gestores e escritórios em detalhe, lista e indicadores", async () => {
    const id = await abrir(), outro = contextoUsuario(colega, "SECTOR_USER", ["fiscal"]);
    await expect(detalhe(outro, id)).rejects.toThrow("não encontrado"); expect((await lista(outro, {})).rows.some(t => t.id === id)).toBe(false);
    expect((await indicadores(outro)).total).toBe(0); expect((await detalhe(contextoUsuario(gestor, "SECTOR_ADMIN", ["fiscal"]), id)).id).toBe(id);
    const t = await detalhe(gestao, id); await alterar(gestao, id, t.version, "participantes", [colega]); await expect(detalhe(outro, id)).rejects.toThrow("não encontrado");
    await expect(detalhe({ ...gestao, ctx: { ...gestao.ctx, tenantId: outroTenant } }, id)).rejects.toThrow("não encontrado");
  });
  it("mantém conversação e abre automaticamente quando fica suficiente", async () => {
    const d = await novo(); mocks.analisar.mockResolvedValueOnce({ status: "needs_information", summary: "Falta identificar o sistema.", questions: ["Qual sistema?"], attachments: [] });
    const a = await avaliarRascunho(c, d.id, d.version); expect(a.parecer?.status).toBe("needs_information");
    mocks.analisar.mockResolvedValueOnce({ status: "sufficient", summary: "Contexto suficiente.", questions: [], attachments: [] });
    const b = await avaliarRascunho(c, d.id, a.version, "Sistema fictício 41"); expect(b.ticketId).toBeTruthy();
    expect(await db!.helpdeskTriageMessage.count({ where: { draftId: d.id } })).toBe(3);
  });
  it("descarta resposta atrasada quando o usuário altera o rascunho", async () => {
    const d = await novo(); let liberar!: (v: unknown) => void; let avisar!: () => void;
    const iniciou = new Promise<void>(resolve => { avisar = resolve; }); mocks.analisar.mockImplementation(() => { avisar(); return new Promise(resolve => { liberar = resolve; }); });
    const analise = avaliarRascunho(c, d.id, d.version); await iniciou;
    const atual = await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } });
    await salvarRascunho(c, d.id, atual.version, { ...payload(), description: "O contexto mudou durante a análise." });
    liberar({ status: "sufficient", summary: "Completo", questions: [], attachments: [] }); await expect(analise).rejects.toThrow("mudou");
    expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(0);
  });
  it("permite enviar sem análise em falha do provedor", async () => {
    const d = await novo(); mocks.analisar.mockResolvedValue({ status: "unavailable", summary: "API indisponível", questions: [], attachments: [] });
    const r = await avaliarRascunho(c, d.id, d.version); expect(r.parecer?.status).toBe("unavailable");
    expect((await finalizarRascunho(c, d.id, r.version, true)).ticketId).toBeTruthy();
  });
  it("prepara o catálogo uma vez e mostra chamados ao filtrar seu grupo", async () => {
    await novo();
    const grupo = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Infraestrutura" } } });
    const cat = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Acesso | Senhas" } } });
    expect(cat.parentId).toBe(grupo.id);
    const total = await db!.helpdeskCategory.count({ where: { tenantId } });
    await db!.helpdeskCategory.update({ where: { id: cat.id }, data: { descriptionTemplate: "Preservar configuração" } });
    const d = await novo(); expect(await db!.helpdeskCategory.count({ where: { tenantId } })).toBe(total);
    expect((await db!.helpdeskCategory.findUniqueOrThrow({ where: { id: cat.id } })).descriptionTemplate).toBe("Preservar configuração");
    mocks.classificar.mockResolvedValue({ categoryId: cat.id, reason: "Senha", origem: "groq" });
    mocks.analisar.mockResolvedValue({ status: "sufficient", summary: "Completo", questions: [], attachments: [] });
    const r = await avaliarRascunho(c, d.id, d.version);
    expect(r.ticketId).toBeTruthy(); expect((await lista(c, { categoria: grupo.id })).rows.some(t => t.id === r.ticketId)).toBe(true);
    expect((await detalhe(c, r.ticketId!)).categoryId).toBe(cat.id);
  });
  it("abre como A classificar quando nenhum provedor consegue categorizar", async () => {
    const d = await novo(); mocks.classificar.mockResolvedValue({ categoryId: null, reason: "Indisponível", origem: null });
    const r = await avaliarRascunho(c, d.id, d.version); expect(r.parecer?.status).toBe("unavailable"); expect(mocks.analisar).not.toHaveBeenCalled();
    const aberto = await finalizarRascunho(c, d.id, r.version, true);
    expect((await detalhe(c, aberto.ticketId)).category.name).toBe("A classificar");
    expect(mocks.classificar).toHaveBeenCalledTimes(1);
  });
  it("retoma rascunho antigo sem catálogo nem categoria de contingência", async () => {
    const t = await db!.tenant.create({ data: { name: "Escritório fictício com rascunho legado", slug: `helpdesk-legado-${randomUUID()}` } });
    await db!.sector.createMany({ data: ["tech", "fiscal"].map(code => ({ tenantId: t.id, code, label: code })) });
    await db!.tenantModule.create({ data: { tenantId: t.id, moduleCode: "helpdesk", enabled: true, sectorCode: "tech" } });
    const user = await db!.user.create({ data: { tenantId: t.id, name: "Pessoa fictícia", email: `${randomUUID()}@example.test`, passwordHash: "sem-login", role: "ADMIN" } });
    const legado = { ...c, ctx: { ...c.ctx, tenantId: t.id, userId: user.id, role: "ADMIN" as const } };
    const d = await db!.helpdeskDraft.create({ data: { tenantId: t.id, createdById: user.id, payload: payload() } });
    mocks.classificar.mockResolvedValue({ categoryId: null, reason: "Indisponível", origem: null });
    const r = await avaliarRascunho(legado, d.id, d.version); expect(r.parecer?.status).toBe("unavailable");
    expect(await db!.helpdeskCategory.count({ where: { tenantId: t.id } })).toBe(28);
    expect((await finalizarRascunho(legado, d.id, r.version, true)).ticketId).toBeTruthy();
  });
  it("devolve campos exigidos pela classificação e preserva a categoria ao completá-los", async () => {
    await salvarCategoria(gestao, { name: "Campos da classificação fictícia", formSchema: [{ key: "sistema", label: "Sistema", type: "text", required: true }] });
    const cat = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Campos da classificação fictícia" } } });
    const d = await novo(); mocks.classificar.mockResolvedValue({ categoryId: cat.id, reason: "Teste", origem: "principal" });
    const r = await avaliarRascunho(c, d.id, d.version); expect(r.parecer?.status).toBe("needs_information"); expect(r.dados?.categoryId).toBe(cat.id);
    await expect(finalizarRascunho(c, d.id, r.version, true)).rejects.toThrow("Preencha Sistema");
    const v = await salvarRascunho(c, d.id, r.version, { ...payload(), categoryId: "id-forjado", requestData: { sistema: "Fictício" }, _classificacao: { categoryId: "id-forjado" } });
    const t = await finalizarRascunho(c, d.id, v.version, true); expect((await detalhe(c, t.ticketId)).categoryId).toBe(cat.id);
    expect(mocks.classificar).toHaveBeenCalledTimes(1);
  });
  it("descarta classificação atrasada sem substituir a edição salva", async () => {
    const d = await novo(); let liberar!: (v: unknown) => void; let avisar!: () => void;
    const iniciou = new Promise<void>(resolve => { avisar = resolve; });
    mocks.classificar.mockImplementation(() => { avisar(); return new Promise(resolve => { liberar = resolve; }); });
    const analise = avaliarRascunho(c, d.id, d.version); await iniciou;
    await salvarRascunho(c, d.id, d.version, { ...payload(), description: "Novo pedido salvo enquanto a IA respondia." });
    liberar({ categoryId: categoriaId, reason: "Teste", origem: "principal" }); await expect(analise).rejects.toThrow("mudou");
    const atual = await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(atual.payload).toMatchObject({ categoryId: "", description: "Novo pedido salvo enquanto a IA respondia." });
    expect(atual.analysisToken).toBeNull(); expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(0);
  });
  it("não contorna campos obrigatórios e reverte a transação quando não há aprovador", async () => {
    await salvarCategoria(gestao, { name: "Restrito fictício", requiresApproval: true, approvalMode: "SPECIFIC_USERS", approvalUserIds: [solicitante] });
    const cat = await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: "Restrito fictício" } });
    mocks.classificar.mockResolvedValue({ categoryId: cat.id, reason: "Teste", origem: "principal" });
    const d = await criarRascunho(c), v = await salvarRascunho(c, d.id, 0, { ...payload(), categoryId: cat.id });
    await expect(finalizarRascunho(c, d.id, v.version, true)).rejects.toThrow("aprovador ativo");
    expect((await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } })).submittedAt).toBeNull();
    await salvarCategoria(gestao, { ...cat, formSchema: [{ key: "sistema", label: "Sistema", type: "text", required: true }] });
    const atual = await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } });
    await expect(finalizarRascunho(c, d.id, atual.version, true)).rejects.toThrow("Preencha Sistema");
  });
  it("inicia e pausa SLA, protege versões e não expõe notas internas", async () => {
    const id = await abrir(); await alterar(equipe, id, 0, "status", "EM_ANDAMENTO");
    let t = await detalhe(gestao, id); expect(t.cycles).toHaveLength(1); expect(t.cycles[0].firstResponseAt).toBeTruthy();
    await expect(alterar(equipe, id, 0, "status", "RESOLVIDO")).rejects.toThrow("mudou");
    await comentar(equipe, id, t.version, { requestId: randomUUID(), body: "Nota interna fictícia", internal: true });
    expect((await detalhe(c, id)).comments).toHaveLength(0); expect((await detalhe(equipe, id)).comments).toHaveLength(1);
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "AGUARDANDO_USUARIO");
    t = await detalhe(equipe, id); expect(t.cycles[0].pausedAt).toBeTruthy();
    const requestId = randomUUID(); await comentar(c, id, t.version, { requestId, body: "Segue o complemento solicitado.", internal: false }); await comentar(c, id, t.version, { requestId, body: "Segue o complemento solicitado.", internal: false });
    t = await detalhe(equipe, id); expect(t.status).toBe("EM_ANDAMENTO"); expect(t.cycles[0].pausedAt).toBeNull(); expect(t.comments.filter(m => m.requestId === requestId)).toHaveLength(1);
  });
  it("aplica aprovação, reabertura e um novo ciclo sem reiniciar o anterior", async () => {
    await salvarCategoria(gestao, { name: "Compra fictícia", requiresApproval: true });
    const cat = await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: "Compra fictícia" } });
    mocks.classificar.mockResolvedValue({ categoryId: cat.id, reason: "Teste", origem: "principal" });
    const d = await criarRascunho(c); await salvarRascunho(c, d.id, 0, { ...payload(), categoryId: cat.id });
    const { ticketId: id } = await finalizarRascunho(c, d.id, 1, true);
    await expect(alterar(equipe, id, 0, "status", "EM_ANDAMENTO")).rejects.toThrow("aguarda aprovação");
    await alterar(contextoUsuario(gestor, "SECTOR_ADMIN", ["fiscal"]), id, 0, "aprovar", { aprovado: true, motivo: "Compra fictícia autorizada." });
    let t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "EM_ANDAMENTO");
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "RESOLVIDO");
    t = await detalhe(c, id); await alterar(c, id, t.version, "pedir_reabertura", "O problema fictício voltou a ocorrer.");
    t = await detalhe(gestao, id); await alterar(gestao, id, t.version, "decidir_reabertura", { aprovado: true, motivo: "Reabrir para conferir." });
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "EM_ANDAMENTO"); expect((await detalhe(equipe, id)).cycles).toHaveLength(2);
  });
  it("ordena a fila e rejeita usuários de outro escritório", async () => {
    const a = await abrir(), b = await abrir(); await alterar(equipe, a, 0, "status", "NA_FILA"); await alterar(equipe, b, 0, "status", "NA_FILA");
    await alterar(gestao, b, 1, "fila", 1); expect((await detalhe(gestao, b)).queueOrder).toBe(1);
    const alheio = await db!.user.create({ data: { tenantId: outroTenant, name: "Usuário de outro tenant", email: `${randomUUID()}@example.test`, passwordHash: "sem-login" } });
    const t = await detalhe(gestao, a); await expect(alterar(gestao, a, t.version, "participantes", [alheio.id])).rejects.toThrow("Usuário inválido");
  });
  it("mudar para categoria sujeita a aprovação pausa o SLA e exige nova decisão", async () => {
    await salvarCategoria(gestao, { name: "Mudança com aprovação fictícia", requiresApproval: true });
    const cat = await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: "Mudança com aprovação fictícia" } });
    const id = await abrir(); await alterar(equipe, id, 0, "status", "EM_ANDAMENTO");
    await alterar(equipe, id, 1, "dados", { ...payload(), categoryId: cat.id });
    let t = await detalhe(equipe, id); expect(t.status).toBe("AGUARDANDO_APROVACAO"); expect(t.cycles[0].pausedAt).toBeTruthy();
    await expect(alterar(equipe, id, t.version, "dados", payload())).rejects.toThrow("aprovação pendente");
    await alterar(contextoUsuario(gestor, "SECTOR_ADMIN", ["fiscal"]), id, t.version, "aprovar", { aprovado: true, motivo: "Mudança fictícia aprovada." });
    t = await detalhe(equipe, id); expect(t.status).toBe("ABERTO"); expect(t.cycles[0].pausedAt).toBeNull();
  });
  it("encerrar durante espera termina a pausa e mantém o ciclo registrado", async () => {
    const id = await abrir(); await alterar(equipe, id, 0, "status", "EM_ANDAMENTO"); await alterar(equipe, id, 1, "status", "AGUARDANDO_USUARIO");
    await alterar(equipe, id, 2, "status", "RESOLVIDO"); const t = await detalhe(equipe, id); expect(t.cycles[0].resolvedAt).toBeTruthy(); expect(t.cycles[0].pausedAt).toBeNull();
  });
  it("somente leitura e assinatura travada não modificam o chamado", async () => {
    const id = await abrir();
    for (const contexto of [{ ...gestao, ctx: { ...gestao.ctx, role: "READONLY" as const } }, { ...gestao, ctx: { ...gestao.ctx, subscriptionReadOnly: true } }]) {
      await expect(alterar(contexto, id, 0, "status", "EM_ANDAMENTO")).rejects.toThrow("somente leitura");
    }
    expect((await detalhe(equipe, id)).version).toBe(0);
  });
  it("desligar o módulo durante a triagem impede a abertura automática", async () => {
    const d = await novo(); let liberar!: (v: unknown) => void; let avisar!: () => void;
    const iniciou = new Promise<void>(r => { avisar = r; }); mocks.analisar.mockImplementation(() => { avisar(); return new Promise(r => { liberar = r; }); });
    const analise = avaliarRascunho(c, d.id, d.version); await iniciou;
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: false } });
    liberar({ status: "sufficient", summary: "Completo", questions: [], attachments: [] }); await expect(analise).rejects.toThrow("não está disponível");
    expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(0);
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: true } });
  });
  it("entrega notificações uma vez mesmo após reprocessar o evento", async () => {
    const id = await abrir(), e = await db!.helpdeskEvent.findFirstOrThrow({ where: { ticketId: id, type: "created" } });
    const antes = await db!.notification.count({ where: { tenantId, entityId: id } }); expect(antes).toBeGreaterThan(0);
    await db!.helpdeskEvent.update({ where: { id: e.id }, data: { dispatchedAt: null } });
    await Promise.all([despacharEventos(tenantId, id), despacharEventos(tenantId, id)]);
    expect(await db!.notification.count({ where: { tenantId, entityId: id } })).toBe(antes);
  });
  it("gera um único alerta por ciclo de SLA vencido", async () => {
    const id = await abrir(); await alterar(equipe, id, 0, "status", "EM_ANDAMENTO");
    await db!.helpdeskSlaCycle.updateMany({ where: { ticketId: id }, data: { resolutionDueAt: new Date("2026-01-01T12:00:00Z") } });
    await verificarSla(tenantId, new Date()); await verificarSla(tenantId, new Date());
    expect(await db!.helpdeskEvent.count({ where: { ticketId: id, type: "sla" } })).toBe(1);
  });
  it("valida, grava e protege download de anexo por tenant e visibilidade", async () => {
    const id = await abrir(), t = await detalhe(equipe, id), form = new FormData();
    form.set("id", randomUUID()); form.set("draftId", t.draftId); form.set("ticketId", id); form.set("version", String(t.version)); form.set("internal", "1"); form.set("file", new File(["Evidência fictícia"], "evidencia.txt", { type: "text/plain" }));
    const a = await enviarAnexo(equipe, form), gravado = await db!.helpdeskAttachment.findUniqueOrThrow({ where: { id: a.id } }); artefatos.push(gravado);
    expect((await detalhe(c, id)).attachments).toHaveLength(0); expect((await detalhe(equipe, id)).attachments).toHaveLength(1);
    mocks.auth.mockReturnValue(c.ctx); expect((await baixar(new Request("http://localhost/arquivo"), { params: Promise.resolve({ id: a.id }) })).status).toBe(404);
    mocks.auth.mockReturnValue(equipe.ctx); expect((await baixar(new Request("http://localhost/arquivo"), { params: Promise.resolve({ id: a.id }) })).status).toBe(200);
  });
  it("retirar setor preserva chamados antigos; desligar módulo bloqueia as rotas", async () => {
    const id = await abrir(); mocks.auth.mockReturnValue({ ...gestao.ctx, role: "ADMIN" }); await configurarSetores([]);
    const config = await configDoHelpdesk(tenantId); expect(config.requesterSectors).toEqual([]); await expect(criarRascunho({ ...c, config })).rejects.toThrow("não está autorizado"); expect((await detalhe({ ...c, config }, id)).id).toBe(id);
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { sectorCode: "controladoria" } });
    const transferido = await configDoHelpdesk(tenantId); await expect(alterar({ ...equipe, config: transferido }, id, 0, "assumir", null)).rejects.toThrow("não encontrado");
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: false } });
    const off = await configDoHelpdesk(tenantId); await expect(detalhe({ ...c, config: off }, id)).rejects.toThrow("não encontrado");
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: true, sectorCode: "tech" } }); await db!.helpdeskRequesterSector.create({ data: { tenantId, sectorCode: "fiscal" } });
  });
});
