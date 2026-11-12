import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { Contexto } from "./contexto";

const url = process.env.HELPDESK_TEST_DATABASE_URL;
if (url) { const u = new URL(url); if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.port !== "33379" || u.pathname !== "/connect41") throw new Error("Teste de integração recusou banco não isolado."); }
const destino = url ? new URL(url) : null;
const db = destino ? new PrismaClient({ adapter: new PrismaMariaDb({ host: destino.hostname, port: Number(destino.port), user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password), database: "connect41", allowPublicKeyRetrieval: true }) }) : null;
const mocks = vi.hoisted(() => ({ gerar: vi.fn(), classificacao: vi.fn(), push: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { if (!db) throw new Error("Banco de teste não configurado."); return db; } }));
// A IA falsa (10/11/2026): a classificação devolve o que o teste pede; a busca
// no Orquestrador lê o catálogo que chegou no texto e aponta o item cuja
// descrição cobre as palavras do pedido.
vi.mock("@/lib/ai", async original => ({ ...await original<typeof import("@/lib/ai")>(), gerarEstruturado: mocks.gerar }));
vi.mock("@/lib/rateLimit", () => ({ hit: () => ({ allowed: true }) }));
vi.mock("@/lib/webPush", () => ({ sendWebPushToUser: mocks.push }));
vi.mock("@/lib/auth/context", async original => ({ ...await original<typeof import("@/lib/auth/context")>(), getAuthContext: mocks.auth }));

import { criarRascunho, salvarRascunho, enviarRascunho, alterar, comentar, abrirPelaCeci } from "./comandos";
import { triarChamado, retomarTriagens } from "./triagem-servidor";
import { detalhe, lista, indicadores } from "./consultas";
import { salvarCategoria } from "./configuracao";
import { configDoHelpdesk } from "./contexto";
import { enviarAnexo } from "./anexos";
import { despacharEventos } from "./notificacoes";
import { verificarSla } from "./alertas";
import { anexosDoChamado } from "./armazenamento";
import { tituloDaDescricao } from "./regras";
import { GET as baixar } from "@/app/api/chamados/anexos/[id]/route";

const radicais = (s: string) => new Set(s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(p => p.length >= 4).map(p => p.slice(0, 5)));
function orquestradorFalso(texto: string) {
  const { pedido, jaExiste } = JSON.parse(texto) as { pedido: { descricao: string }; jaExiste: { ref: string; nome: string; descricao: string | null }[] };
  const pedidas = [...radicais(pedido.descricao)];
  const notas = jaExiste.map(i => { const deles = radicais(`${i.nome} ${i.descricao ?? ""}`); return { ref: i.ref, nota: pedidas.filter(p => deles.has(p)).length / Math.max(1, pedidas.length) }; }).sort((a, b) => b.nota - a.nota);
  return { existing: notas[0] && notas[0].nota >= 0.6 ? { ref: notas[0].ref, match: "same", reason: "Faz a mesma conversão." } : null };
}
const PEDIDO_DO_CONVERSOR = "Conversor de planilhas de lançamentos em arquivos TXT no layout que o sistema Domínio importa.";

describe.skipIf(!url)("helpdesk com MySQL descartável e notificações simuladas", () => {
  let tenantId: string, outroTenant: string, categoriaId: string, solicitante: string, colega: string, gestor: string, operador: string, chefe: string;
  let c: Contexto, equipe: Contexto, gestao: Contexto;
  const artefatos: { fileUrl: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
  const contextoUsuario = (userId: string, role: Contexto["ctx"]["role"], sectors: string[]): Contexto => ({ ctx: { userId, role, sectors, tenantId, homeTenantId: tenantId, activeSector: null, subscriptionReadOnly: false, canSelfRegularizeSubscription: false }, config: { enabled: true, sectorCode: "tech", sectorCodes: ["tech"] } });
  const payload = () => ({ title: "Acesso ao sistema de testes", description: "Preciso de acesso ao ambiente fictício de atendimento para registrar solicitações.", categoryId: categoriaId, requesterSectorCode: "fiscal", priority: "MEDIA", requestData: {}, tags: ["teste"] });
  const novo = async (dados: Record<string, unknown> = {}) => { const d = await criarRascunho(c); const v = await salvarRascunho(c, d.id, d.version, { ...payload(), title: "", ...dados }); return { ...d, version: v.version }; };
  /** A abertura da tela: o chamado nasce em triagem. */
  const enviar = async (dados: Record<string, unknown> = {}) => { const d = await novo(dados); return (await enviarRascunho(c, d.id, d.version)).ticketId; };
  /** Abertura com a categoria confirmada (o caminho da Ceci), para os testes de atendimento: versão 0, já Aberto. */
  const abrir = async () => (await abrirPelaCeci(c, payload())).ticketId;
  const classificarComo = (categoryId: string | null) => mocks.classificacao.mockReturnValue({ categoryId, reason: "Classificação fictícia", title: categoryId ? "Acesso ao ambiente de testes" : "Conversor de planilhas", tags: ["acesso"] });
  const triagemDo = async (ticketId: string) => (await db!.helpdeskEvent.findFirstOrThrow({ where: { ticketId, type: "triagem" } })).data as Record<string, unknown>;
  beforeAll(async () => {
    const t = await db!.tenant.create({ data: { name: "Escritório fictício de testes", slug: `helpdesk-test-${randomUUID()}` } }); tenantId = t.id;
    outroTenant = (await db!.tenant.create({ data: { name: "Outro escritório fictício", slug: `helpdesk-test-${randomUUID()}` } })).id;
    await db!.sector.createMany({ data: ["tech", "fiscal", "controladoria"].map(code => ({ tenantId, code, label: code })) });
    const usuario = async (name: string, role: Contexto["ctx"]["role"], setor: string) => (await db!.user.create({ data: { tenantId, name, email: `${randomUUID()}@example.test`, passwordHash: "sem-login-de-teste", role, sectors: { create: { sectorCode: setor } } } })).id;
    solicitante = await usuario("Solicitante fictício", "SECTOR_USER", "fiscal"); colega = await usuario("Colega fictício", "SECTOR_USER", "fiscal"); gestor = await usuario("Gestor fiscal fictício", "SECTOR_ADMIN", "fiscal"); operador = await usuario("Atendente fictício", "SECTOR_USER", "tech"); chefe = await usuario("Gestor de atendimento fictício", "SECTOR_ADMIN", "tech");
    c = contextoUsuario(solicitante, "SECTOR_USER", ["fiscal"]); equipe = contextoUsuario(operador, "SECTOR_USER", ["tech"]); gestao = contextoUsuario(chefe, "SECTOR_ADMIN", ["tech"]);
    await db!.tenantModule.create({ data: { tenantId, moduleCode: "helpdesk", enabled: true, sectorCode: "tech" } });
    await db!.tenantModule.create({ data: { tenantId, moduleCode: "tech_ops_center", enabled: true, sectorCode: "tech" } });
    await db!.helpdeskRequesterSector.create({ data: { tenantId, sectorCode: "fiscal" } });
    await salvarCategoria(gestao, { name: "Acesso fictício", checklistTemplate: [{ key: "verificar", label: "Conferir o acesso" }] });
    categoriaId = (await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId } })).id;
    await db!.opsWatcher.create({ data: { tenantId, slug: "conferencia-rendimentos", name: "Conferência de rendimentos", description: "Monta a planilha de rendimentos para a conferência.", ownerId: operador } });
    await db!.opsWatcher.create({ data: { tenantId, slug: "dominio-xls-txt", name: "Domínio XLS para TXT", description: "Converte planilhas de lançamentos (XLS ou XLSX, nos modelos padrão) em arquivos TXT no layout de largura fixa que o sistema Domínio importa.", ownerId: operador } });
  });
  beforeEach(() => {
    mocks.gerar.mockReset().mockImplementation(async (p: { nome: string; texto: string }) => ({ valor: p.nome === "orquestrador_chamado" ? orquestradorFalso(p.texto) : mocks.classificacao(), runId: "run" }));
    classificarComo(categoriaId); mocks.push.mockReset().mockResolvedValue(undefined); mocks.auth.mockReturnValue(c.ctx);
  });
  afterAll(async () => { if (artefatos.length) await anexosDoChamado.apagarAnexosGravados(artefatos); await db!.$disconnect(); });

  it("salva e retoma rascunho sem gerar fila, SLA ou notificações, e sem categoria vinda do navegador", async () => {
    const d = await novo(); const salvo = await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(salvo.payload).toMatchObject({ ...payload(), title: "", categoryId: "", tags: [] }); expect(await db!.helpdeskTicket.count({ where: { draftId: d.id } })).toBe(0);
    expect(await db!.helpdeskSlaCycle.count({ where: { tenantId } })).toBe(0);
  });
  it("abre na hora em Aguardando triagem, sem chamar a IA no envio, uma vez só com dois envios", async () => {
    const d = await novo();
    const [a, b] = await Promise.all([enviarRascunho(c, d.id, d.version), enviarRascunho(c, d.id, d.version)]);
    expect(a.ticketId).toBe(b.ticketId); expect(mocks.gerar).not.toHaveBeenCalled();
    const t = await db!.helpdeskTicket.findUniqueOrThrow({ where: { id: a.ticketId }, include: { category: true } });
    expect(t).toMatchObject({ status: "AGUARDANDO_TRIAGEM", title: tituloDaDescricao(payload().description), approvalStatus: "NOT_REQUIRED", tags: [] });
    expect(t.category.name).toBe("A classificar");
    expect(await db!.helpdeskEvent.count({ where: { ticketId: a.ticketId, type: "created" } })).toBe(1);
    expect(await db!.helpdeskChecklistItem.count({ where: { ticketId: a.ticketId } })).toBe(0);
  });
  it("a triagem classifica e abre; repetida ou concorrente, grava e avisa uma vez só", async () => {
    const id = await enviar();
    const fins = await Promise.all([triarChamado(tenantId, id), triarChamado(tenantId, id)]);
    expect(fins.filter(f => f === "concluida")).toHaveLength(1);
    expect(await triarChamado(tenantId, id)).toBe("nada_a_fazer");
    const t = await db!.helpdeskTicket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: "ABERTO", categoryId: categoriaId, title: "Acesso ao ambiente de testes", tags: ["acesso"], version: 1 });
    expect(await db!.helpdeskEvent.count({ where: { ticketId: id, type: "triagem" } })).toBe(1);
    expect(await db!.helpdeskChecklistItem.count({ where: { ticketId: id } })).toBe(1);
    expect(await triagemDo(id)).toMatchObject({ categoria: "Acesso fictício", existente: null, semCategoria: null });
    const avisos = await db!.notification.findMany({ where: { tenantId, entityId: id, type: "CHAMADO_TRIADO" } });
    expect(avisos.map(n => [n.userId, n.message])).toEqual([[solicitante, "Triagem concluída, chamado classificado em Acesso fictício: Acesso ao ambiente de testes"]]);
    expect((await db!.helpdeskDraft.findFirstOrThrow({ where: { ticket: { id } } })).analysisToken).toBeNull();
  });
  it("o pedido parecido com uma automação cadastrada termina em \"Já existe no Orquestrador\", mesmo sem categoria", async () => {
    // O caso de 10/11/2026: a classificação não achou a categoria, e a busca no Orquestrador nem rodava.
    classificarComo(null);
    const id = await enviar({ description: PEDIDO_DO_CONVERSOR });
    expect(await triarChamado(tenantId, id)).toBe("concluida");
    expect(mocks.gerar.mock.calls.map(([p]) => p.nome).sort()).toEqual(["classificacao_chamado", "orquestrador_chamado"]);
    const t = await detalhe(c, id);
    expect(t.status).toBe("ABERTO"); expect(t.category.name).toBe("A classificar");
    expect(await triagemDo(id)).toMatchObject({ existente: { ref: "robo:dominio-xls-txt", nome: "Domínio XLS para TXT", tipo: "robo", match: "same", responsavel: "Atendente fictício" }, categoria: null, semCategoria: "incerto" });
    const avisos = await db!.notification.findMany({ where: { tenantId, entityId: id, type: "CHAMADO_TRIADO" } });
    expect(avisos).toHaveLength(1); expect(avisos[0].userId).toBe(solicitante);
    expect(avisos[0].message).toBe("Já existe no Orquestrador: o robô Domínio XLS para TXT. Chamado: Conversor de planilhas");
    // A equipe recebeu o "Chamado aberto" no envio; a triagem não manda outro aviso a ela.
    expect(await db!.notification.count({ where: { tenantId, entityId: id, userId: operador, type: { not: "CHAMADO_ATUALIZADO" } } })).toBe(0);
  });
  it("falha da IA não segura o chamado: vai para A classificar pela equipe, como falha", async () => {
    mocks.gerar.mockRejectedValue(new Error("OpenAI indisponível (HTTP 429)."));
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await enviar();
    expect(await triarChamado(tenantId, id)).toBe("concluida");
    expect((await detalhe(c, id)).status).toBe("ABERTO");
    expect(await triagemDo(id)).toMatchObject({ categoria: null, semCategoria: "falha", existente: null });
    expect(erros.mock.calls.map(a => String(a[0])).some(l => l.includes(id) && l.includes("OpenAI indisponível (HTTP 429)."))).toBe(true);
    expect((await db!.notification.findFirstOrThrow({ where: { tenantId, entityId: id, type: "CHAMADO_TRIADO" } })).message).toContain("A triagem automática falhou");
    erros.mockRestore();
  });
  it("durante a triagem a equipe não muda situação nem dados, mas assume e escreve", async () => {
    const id = await enviar();
    await expect(alterar(equipe, id, 0, "status", "EM_ANDAMENTO")).rejects.toThrow("triagem automática ainda está analisando");
    await expect(alterar(equipe, id, 0, "dados", payload())).rejects.toThrow("triagem automática ainda está analisando");
    await alterar(equipe, id, 0, "assumir", null);
    const t = await detalhe(equipe, id); await comentar(equipe, id, t.version, { requestId: randomUUID(), body: "Já estou olhando.", internal: false });
    expect(await triarChamado(tenantId, id)).toBe("concluida");
    const depois = await detalhe(equipe, id); expect(depois.status).toBe("ABERTO"); expect(depois.assignees.map(a => a.userId)).toEqual([operador]);
    await expect(alterar(equipe, id, depois.version, "status", "AGUARDANDO_TRIAGEM")).rejects.toThrow("Só a triagem automática");
  });
  it("a categoria com campo que o pedido não tem fica para a equipe classificar", async () => {
    await salvarCategoria(gestao, { name: "Campos da classificação fictícia", formSchema: [{ key: "sistema", label: "Sistema", type: "text", required: true }] });
    const cat = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Campos da classificação fictícia" } } });
    classificarComo(cat.id); const id = await enviar(); await triarChamado(tenantId, id);
    expect((await detalhe(c, id)).category.name).toBe("A classificar"); expect(await triagemDo(id)).toMatchObject({ semCategoria: "formulario" });
  });
  it("categoria com aprovação: sem aprovador fica para a equipe; com aprovador, aguarda e avisa quem aprova", async () => {
    await salvarCategoria(gestao, { name: "Restrito fictício", requiresApproval: true, approvalMode: "SPECIFIC_USERS", approvalUserIds: [solicitante] });
    const restrito = await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: "Restrito fictício" } });
    classificarComo(restrito.id); const sem = await enviar(); await triarChamado(tenantId, sem);
    expect(await triagemDo(sem)).toMatchObject({ semCategoria: "aprovador" }); expect(await db!.helpdeskApproval.count({ where: { ticketId: sem } })).toBe(0);
    await salvarCategoria(gestao, { name: "Compra fictícia", requiresApproval: true });
    const compra = await db!.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: "Compra fictícia" } });
    classificarComo(compra.id); const id = await enviar(); await triarChamado(tenantId, id);
    let t = await detalhe(equipe, id); expect(t.status).toBe("AGUARDANDO_APROVACAO"); expect(t.approvals).toHaveLength(1);
    expect(await db!.notification.count({ where: { tenantId, entityId: id, userId: gestor, message: { startsWith: "Chamado aguardando a sua aprovação" } } })).toBe(1);
    await expect(alterar(equipe, id, t.version, "status", "EM_ANDAMENTO")).rejects.toThrow("aguarda aprovação");
    await alterar(contextoUsuario(gestor, "SECTOR_ADMIN", ["fiscal"]), id, t.version, "aprovar", { aprovado: true, motivo: "Compra fictícia autorizada." });
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "EM_ANDAMENTO");
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "RESOLVIDO");
    t = await detalhe(c, id); await alterar(c, id, t.version, "pedir_reabertura", "O problema fictício voltou a ocorrer.");
    t = await detalhe(gestao, id); await alterar(gestao, id, t.version, "decidir_reabertura", { aprovado: true, motivo: "Reabrir para conferir." });
    t = await detalhe(equipe, id); await alterar(equipe, id, t.version, "status", "EM_ANDAMENTO"); expect((await detalhe(equipe, id)).cycles).toHaveLength(2);
  });
  it("a retomada triagem o chamado preso: recente com a IA, antigo direto para a equipe; a vez reservada é respeitada", async () => {
    const recente = await enviar(), antigo = await enviar({ description: "Pedido fictício antigo que ficou na triagem." }), ocupado = await enviar({ description: "Pedido fictício com a triagem rodando agora." });
    const agora = Date.now();
    await db!.helpdeskTicket.update({ where: { id: recente }, data: { createdAt: new Date(agora - 5 * 60_000) } });
    await db!.helpdeskTicket.update({ where: { id: antigo }, data: { createdAt: new Date(agora - 3 * 60 * 60_000) } });
    await db!.helpdeskTicket.update({ where: { id: ocupado }, data: { createdAt: new Date(agora - 5 * 60_000) } });
    const rascunhoOcupado = (await db!.helpdeskTicket.findUniqueOrThrow({ where: { id: ocupado } })).draftId;
    await db!.helpdeskDraft.update({ where: { id: rascunhoOcupado }, data: { analysisToken: "outra-execucao", analysisStartedAt: new Date() } });
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await retomarTriagens(tenantId)).toBeGreaterThanOrEqual(2);
    erros.mockRestore();
    expect((await detalhe(c, recente)).status).toBe("ABERTO"); expect(await triagemDo(recente)).toMatchObject({ categoria: "Acesso fictício" });
    expect(await triagemDo(antigo)).toMatchObject({ categoria: null, semCategoria: "falha" });
    expect((await db!.helpdeskTicket.findUniqueOrThrow({ where: { id: ocupado } })).status).toBe("AGUARDANDO_TRIAGEM");
    expect(mocks.gerar.mock.calls.every(([p]) => !p.texto.includes("Pedido fictício antigo"))).toBe(true);
  });
  it("desligar o módulo para a triagem; religado, a triagem conclui", async () => {
    const id = await enviar();
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: false } });
    expect(await triarChamado(tenantId, id)).toBe("nada_a_fazer");
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: true } });
    expect(await triarChamado(tenantId, id)).toBe("concluida");
  });
  it("isola colegas, participantes, gestores e escritórios em detalhe, lista e indicadores", async () => {
    const id = await abrir(), outro = contextoUsuario(colega, "SECTOR_USER", ["fiscal"]);
    await expect(detalhe(outro, id)).rejects.toThrow("não encontrado"); expect((await lista(outro, {})).rows.some(t => t.id === id)).toBe(false);
    expect((await indicadores(outro)).total).toBe(0); expect((await detalhe(contextoUsuario(gestor, "SECTOR_ADMIN", ["fiscal"]), id)).id).toBe(id);
    const t = await detalhe(gestao, id); await alterar(gestao, id, t.version, "participantes", [colega]); await expect(detalhe(outro, id)).rejects.toThrow("não encontrado");
    await expect(detalhe({ ...gestao, ctx: { ...gestao.ctx, tenantId: outroTenant } }, id)).rejects.toThrow("não encontrado");
  });
  it("prepara o catálogo uma vez e mostra chamados ao filtrar seu grupo", async () => {
    await novo();
    const grupo = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Infraestrutura" } } });
    const cat = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Acesso | Senhas" } } });
    expect(cat.parentId).toBe(grupo.id);
    const total = await db!.helpdeskCategory.count({ where: { tenantId } });
    await db!.helpdeskCategory.update({ where: { id: cat.id }, data: { descriptionTemplate: "Preservar configuração" } });
    classificarComo(cat.id); const id = await enviar(); expect(await db!.helpdeskCategory.count({ where: { tenantId } })).toBe(total);
    expect((await db!.helpdeskCategory.findUniqueOrThrow({ where: { id: cat.id } })).descriptionTemplate).toBe("Preservar configuração");
    await triarChamado(tenantId, id);
    expect((await lista(c, { categoria: grupo.id })).rows.some(t => t.id === id)).toBe(true);
    expect((await detalhe(c, id)).categoryId).toBe(cat.id);
    expect(await triagemDo(id)).toMatchObject({ categoria: "Infraestrutura › Acesso | Senhas" });
  });
  it("abre pela Ceci com a categoria confirmada, sem triagem nem apagar o rascunho aberto na tela", async () => {
    const aberto = await novo();
    const { ticketId } = await abrirPelaCeci(c, { ...payload(), title: "Pedido feito na conversa com a Ceci" });
    expect(await db!.helpdeskTicket.findUniqueOrThrow({ where: { id: ticketId } })).toMatchObject({ categoryId: categoriaId, title: "Pedido feito na conversa com a Ceci", createdById: solicitante, requesterSectorCode: "fiscal", status: "ABERTO" });
    expect(mocks.gerar).not.toHaveBeenCalled();
    expect(await db!.helpdeskDraft.findUniqueOrThrow({ where: { id: aberto.id } })).toMatchObject({ submittedAt: null });
    expect(await db!.helpdeskEvent.findFirstOrThrow({ where: { ticketId, type: "created" } })).toMatchObject({ data: { revisadoPelaPessoa: true, classificacao: { origem: "ceci" } } });
  });
  it("pela Ceci, recusa grupo, setor de fora, campo obrigatório vazio e quem não abre — sem deixar rascunho", async () => {
    const antes = await db!.helpdeskDraft.count({ where: { tenantId } });
    const grupo = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Suporte" } } });
    await expect(abrirPelaCeci(c, { ...payload(), categoryId: grupo.id })).rejects.toThrow("não um grupo");
    await expect(abrirPelaCeci(c, { ...payload(), requesterSectorCode: "controladoria" })).rejects.toThrow("Setor solicitante não autorizado");
    await salvarCategoria(gestao, { name: "Campo obrigatório pela Ceci", formSchema: [{ key: "sistema", label: "Sistema", type: "text", required: true }] });
    const comCampo = await db!.helpdeskCategory.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: "Campo obrigatório pela Ceci" } } });
    await expect(abrirPelaCeci(c, { ...payload(), categoryId: comCampo.id })).rejects.toThrow("Preencha Sistema");
    // Todos os setores abrem chamado desde 05/11/2026: quem não abre é o somente leitura.
    await expect(abrirPelaCeci({ ...c, ctx: { ...c.ctx, role: "READONLY" } }, payload())).rejects.toThrow("não está autorizado a abrir");
    expect(await db!.helpdeskDraft.count({ where: { tenantId } })).toBe(antes);
  });
  it("envia rascunho antigo sem catálogo nem categoria de contingência", async () => {
    const t = await db!.tenant.create({ data: { name: "Escritório fictício com rascunho legado", slug: `helpdesk-legado-${randomUUID()}` } });
    await db!.sector.createMany({ data: ["tech", "fiscal"].map(code => ({ tenantId: t.id, code, label: code })) });
    await db!.tenantModule.create({ data: { tenantId: t.id, moduleCode: "helpdesk", enabled: true, sectorCode: "tech" } });
    const user = await db!.user.create({ data: { tenantId: t.id, name: "Pessoa fictícia", email: `${randomUUID()}@example.test`, passwordHash: "sem-login", role: "ADMIN" } });
    const legado = { ...c, ctx: { ...c.ctx, tenantId: t.id, userId: user.id, role: "ADMIN" as const } };
    const d = await db!.helpdeskDraft.create({ data: { tenantId: t.id, createdById: user.id, payload: payload() } });
    const { ticketId } = await enviarRascunho(legado, d.id, d.version);
    expect(await db!.helpdeskCategory.count({ where: { tenantId: t.id } })).toBe(28);
    expect((await db!.helpdeskTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { category: true } })).category.name).toBe("A classificar");
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
  it("liga os arquivos à mensagem enviada junto, sem aviso próprio do arquivo", async () => {
    const id = await abrir(), t = await detalhe(equipe, id), form = new FormData();
    form.set("id", randomUUID()); form.set("draftId", t.draftId); form.set("ticketId", id); form.set("version", String(t.version)); form.set("mensagem", "1"); form.set("file", new File(["Print fictício"], "print.txt", { type: "text/plain" }));
    const a = await enviarAnexo(equipe, form); artefatos.push(await db!.helpdeskAttachment.findUniqueOrThrow({ where: { id: a.id } }));
    await expect(comentar(equipe, id, a.version, { requestId: randomUUID(), body: "", internal: true, attachmentIds: [a.id] })).rejects.toThrow("não puderam ser ligados");
    await comentar(equipe, id, a.version, { requestId: randomUUID(), body: "", attachmentIds: [a.id] });
    const depois = await detalhe(equipe, id); expect(depois.attachments.find(x => x.id === a.id)?.commentId).toBe(depois.comments[0].id);
    expect(depois.events.some(e => e.type === "attachment")).toBe(false);
  });
  it("trocar o setor responsável esconde a fila; desligar módulo bloqueia as rotas", async () => {
    const id = await abrir();
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { sectorCode: "controladoria" } });
    const transferido = await configDoHelpdesk(tenantId); await expect(alterar({ ...equipe, config: transferido }, id, 0, "assumir", null)).rejects.toThrow("não encontrado");
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: false } });
    const off = await configDoHelpdesk(tenantId); await expect(detalhe({ ...c, config: off }, id)).rejects.toThrow("não encontrado");
    await db!.tenantModule.updateMany({ where: { tenantId, moduleCode: "helpdesk" }, data: { enabled: true, sectorCode: "tech" } });
  });
});
