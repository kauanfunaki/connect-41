import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { XML_FICTICIO } from "./fixture";
import { lerDocumentoXml, COLUNAS_APOIO } from "./importacao";
import { csvSeguro } from "./exportacao";
import type { AuthContext } from "@/lib/auth/context";
import type { MotorDoEscritorio } from "@/lib/fiscal/motor/servidor";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const m = vi.hoisted(() => ({ ctx: {} as AuthContext, motor: null as MotorDoEscritorio | null, companyId: "" }));
vi.mock("@/lib/fiscal/motor/servidor", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/fiscal/motor/servidor")>();
  return { ...real, abrirMotor: async () => m.motor, atorDaSessao: async () => ({ id: m.ctx.userId, nome: "Fiscal Fictícia", email: "fiscal.qa@example.invalid", tenant: m.ctx.tenantId }), estabelecimentosDaRaiz: async () => ({ visiveis: [{ id: 3, companyId: m.companyId }] }) };
});
vi.mock("@/lib/auth/context", async importOriginal => { const real = await importOriginal<typeof import("@/lib/auth/context")>(); return { ...real, getAuthContext: async () => m.ctx }; });
const url = process.env.SPED_FISCAL_TEST_DATABASE_URL;
const habilitado = !!url;
if (url) { const u = new URL(url); if (u.hostname !== "127.0.0.1" || u.port !== "33381" || u.pathname !== "/connect41") throw new Error("Testes SPED exigem o banco descartável na porta 33381."); process.env.DATABASE_URL = url; }
const { getPrisma } = await import("@/lib/prisma");
const { autorizar, carregarBase, escreverNaRaiz, gravarDocumento, json, prepararTelaLocal, registrarDecisao } = await import("./servidor");
const { enfileirarArquivo, processarImportacao } = await import("./fila");
const { POST } = await import("@/app/api/fiscal/sped/local/acao/route");
const dados = { tenantId: "", userId: "", companyId: "", filialId: "", outroTenantId: "", outraEmpresaId: "" };
const nome = "SPED Fiscal QA";
describe.skipIf(!habilitado)("SPED Fiscal com MySQL descartável real", () => {
  beforeAll(async () => {
    const db = getPrisma();
    const tenant = await db.tenant.upsert({ where: { slug: "sped-fiscal-qa" }, create: { name: nome, slug: "sped-fiscal-qa" }, update: {} });
    const outro = await db.tenant.upsert({ where: { slug: "sped-fiscal-qa-outro" }, create: { name: "Outro escritório fictício", slug: "sped-fiscal-qa-outro" }, update: {} });
    const user = await db.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: "fiscal.qa@example.invalid" } }, create: { tenantId: tenant.id, name: "Fiscal Fictícia", email: "fiscal.qa@example.invalid", passwordHash: await bcrypt.hash("SpedFiscalQA-Only-2026", 4), role: "ADMIN" }, update: {} });
    await db.sector.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "fiscal" } }, create: { tenantId: tenant.id, code: "fiscal", label: "Fiscal" }, update: {} });
    const criarEmpresa = async (tenantId: string, cnpj: string, name: string) => await db.company.findFirst({ where: { tenantId, cnpj } }) ?? await db.company.create({ data: { tenantId, cnpj, name } });
    const empresa = await criarEmpresa(tenant.id, "39952818000140", "EMPRESA FICTÍCIA — Matriz");
    const filial = await criarEmpresa(tenant.id, "39952818000220", "EMPRESA FICTÍCIA — Filial");
    await db.company.update({ where: { id: filial.id }, data: { parentCompanyId: empresa.id } });
    const outraEmpresa = await criarEmpresa(outro.id, "39952818000140", "Empresa de outro escritório");
    Object.assign(dados, { tenantId: tenant.id, userId: user.id, companyId: empresa.id, filialId: filial.id, outroTenantId: outro.id, outraEmpresaId: outraEmpresa.id });
    m.companyId = empresa.id;
    m.ctx = { tenantId: tenant.id, userId: user.id, homeTenantId: tenant.id, role: "ADMIN", sectors: [], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null };
    for (const companyId of [empresa.id, filial.id]) await db.spedFiscalProfile.upsert({ where: { tenantId_companyId: { tenantId: tenant.id, companyId } }, create: { tenantId: tenant.id, companyId, data: { uf: "PR", regime: "real", obrigacoes: ["icms_ipi", "contribuicoes"], inscricaoEstadual: "" } }, update: {} });
    await db.tenantModule.upsert({ where: { tenantId_moduleCode: { tenantId: tenant.id, moduleCode: "fiscal_acervo" } }, create: { tenantId: tenant.id, moduleCode: "fiscal_acervo", enabled: true }, update: { enabled: true } });
    await mkdir(".local/sped-fiscal", { recursive: true });
    await writeFile(".local/sped-fiscal/qa.json", JSON.stringify(dados));
    await writeFile(".local/sped-fiscal/nota-ficticia.xml", XML_FICTICIO);
  }, 30000);
  afterAll(async () => { if (habilitado) await getPrisma().$disconnect(); });
  const revisao = async () => (await getPrisma().spedFiscalRoot.findUnique({ where: { tenantId_raiz: { tenantId: dados.tenantId, raiz: "39952818" } } }))?.revision ?? 0;
  async function acao(acao: string, corpo: Record<string, unknown>, aba = "classificacao", versao?: number) { return POST(new Request("http://connect/api/fiscal/sped/local/acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: dados.companyId, competencia: "2026-09", revisao: versao ?? await revisao(), aba, acao, dados: corpo }) })); }
  it("abre as três áreas sem nenhuma integração configurada", async () => { for (const aba of ["classificacao", "apuracao", "fechamento"] as const) { const t = await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-09" }, aba); expect(t.empresa?.id).toBe(dados.companyId); expect(t.abas).toHaveLength(4); } });
  it("inclui matriz e filial no pacote de Contribuições mesmo ao partir da filial", async () => {
    const t = await prepararTelaLocal({ empresa: dados.filialId, competencia: "2026-09", escopo: "raiz", obrigacao: "contribuicoes" }, "gerar");
    expect(t.contexto?.consolidado).toBe(true);
    expect(t.grupo.map(e => e.id).sort()).toEqual([dados.companyId, dados.filialId].sort());
    const individual = await prepararTelaLocal({ empresa: dados.filialId, competencia: "2026-09", obrigacao: "icms_ipi" }, "gerar");
    expect(individual.grupo.map(e => e.id)).toEqual([dados.filialId]);
    const icms = await prepararTelaLocal({ empresa: dados.filialId, competencia: "2026-09", obrigacao: "icms_ipi", escopo: "raiz" }, "apuracao");
    expect(icms.contexto?.consolidado).toBe(false);
    expect(icms.grupo.map(e => e.id)).toEqual([dados.filialId]);
  });
  it("mostra o acervo anterior como pendente de itens sem transformar valor ausente em zero", async () => {
    const db = getPrisma();
    await db.fiscalDocument.upsert({ where: { tenantId_dedupKey: { tenantId: dados.tenantId, dedupKey: "QA-acervo-sem-itens" } }, create: { tenantId: dados.tenantId, companyId: dados.companyId, dedupKey: "QA-acervo-sem-itens", type: "NFE", number: "901", issuerName: "Fornecedor fictício do acervo", issuerDocument: "17122471000175", recipientDocument: "39952818000140", amount: null, issuedAt: new Date("2026-08-01T00:00:00Z"), competence: "2026-08", origin: "UPLOAD", completude: "PARCIAL" }, update: {} });
    const b = await carregarBase(await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-08" }, "fechamento"));
    expect(b.acervo.find(d => d.dedupKey === "QA-acervo-sem-itens")?.amount).toBeNull();
    expect(b.icms.pendencias.some(p => p.includes("acervo do Connect"))).toBe(true);
  });
  it("importa, repete e vincula o acervo sem duplicar itens", async () => {
    const doc = lerDocumentoXml(XML_FICTICIO), sha = createHash("sha256").update(XML_FICTICIO).digest("hex");
    const importar = () => escreverNaRaiz(m.ctx, "39952818", null, tx => gravarDocumento(tx, m.ctx, doc, sha, "nota.xml", "", dados.companyId));
    await importar(); expect(await importar()).toBe("duplicado");
    const local = await getPrisma().spedFiscalDocument.findUnique({ where: { tenantId_identity: { tenantId: dados.tenantId, identity: doc.identidade } } });
    expect(await getPrisma().spedFiscalItem.count({ where: { tenantId: dados.tenantId, documentId: local!.id } })).toBe(1);
    expect(await getPrisma().fiscalDocument.count({ where: { tenantId: dados.tenantId, dedupKey: doc.identidade } })).toBe(1);
  });
  it("nega dados e decisões de outro escritório e perfil de consulta", async () => {
    await expect(autorizar(m.ctx, dados.outraEmpresaId, "classificacao", true)).rejects.toMatchObject({ status: 404 });
    await expect(autorizar({ ...m.ctx, role: "READONLY" }, dados.companyId, "classificacao", true)).rejects.toMatchObject({ status: 404 });
  });
  it("salva classificação auditada e recusa uma revisão concorrente", async () => {
    const versao = await revisao();
    const r = await acao("classificar", { chaves: ["17122471000175|A1"], classificacao: { tipoItem: "10", definicao: "126", creditoPisCofins: "N", observacao: "Teste fictício" }, credito: "5.00" }, "classificacao", versao);
    expect(r.status).toBe(200);
    const repetido = await acao("classificar", { chaves: ["17122471000175|A1"], classificacao: { tipoItem: "07", definicao: "556", creditoPisCofins: "N", observacao: "" } }, "classificacao", versao);
    expect(repetido.status).toBe(409);
    expect(await getPrisma().auditLog.count({ where: { tenantId: dados.tenantId, action: "fiscal.sped.local.classificacao" } })).toBeGreaterThan(0);
  });
  it("persiste cálculo e mantém originais separados das decisões", async () => {
    const t = await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-09" }, "apuracao"); const b = await carregarBase(t);
    expect(b.produtos[0].tipoItem).toBe("10"); expect(b.documentos[0].itens[0].icms.valor).toBe("17.10"); expect(b.icms.tributos[0].creditos).toBe("5.00");
    expect(await getPrisma().spedFiscalCalculation.count({ where: { tenantId: dados.tenantId, companyId: dados.companyId } })).toBeGreaterThan(0);
  });
  it("registra uma única revisão de cálculo com leituras simultâneas", async () => {
    await escreverNaRaiz(m.ctx, "39952818", null, async () => undefined);
    const t = await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-09" }, "apuracao");
    const bases = await Promise.all(Array.from({ length: 5 }, () => carregarBase(t)));
    expect(new Set(bases.map(b => b.revisao)).size).toBe(1);
    expect(await getPrisma().spedFiscalCalculation.count({ where: { tenantId: dados.tenantId, companyId: dados.companyId, period: "2026-09", scope: "empresa", revision: bases[0].revisao } })).toBe(1);
  });
  it("alteração parcial em lote preserva as outras decisões e permite restaurar o crédito original", async () => {
    const chaves = ["17122471000175|A1"];
    expect((await acao("classificar", { chaves, classificacao: { definicao: "556" } })).status).toBe(200);
    const d = await getPrisma().spedFiscalDecision.findUnique({ where: { tenantId_raiz_type_key: { tenantId: dados.tenantId, raiz: "39952818", type: "classificacao", key: chaves[0] } } });
    expect(d?.data).toMatchObject({ tipoItem: "10", creditoPisCofins: "N", observacao: "Teste fictício", definicao: "556" });
    expect((await acao("classificar", { chaves, classificacao: {}, restaurarCredito: true })).status).toBe(200);
    const b = await carregarBase(await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-09" }, "apuracao"));
    expect(b.icms.tributos[0].creditos).toBe("17.10");
    expect((await acao("classificar", { chaves, classificacao: { definicao: "126" }, credito: "5.00" })).status).toBe(200);
  });
  it("registra apoio, correção e rejeição com motivo", async () => {
    const apoio = { identidade: "QA-recibo", competencia: "2026-09", categoria: "recibo", documento: "01234567890", nome: "Pessoa fictícia", dataPagamento: "2026-09-15", bruto: "100.00", liquido: "90.00", credito: "N", natureza: "", decisao: "rejeitado", motivo: "", contratoInformado: false, anexoId: null };
    expect((await acao("apoio", apoio, "fechamento")).status).toBe(422);
    expect((await acao("apoio", { ...apoio, motivo: "Comprovante fictício duplicado" }, "fechamento")).status).toBe(200);
  });
  it("mantém 50 registros concluídos ao cancelar e retomar uma importação", async () => {
    const identidade = randomUUID();
    const csv = csvSeguro([...COLUNAS_APOIO], Array.from({ length: 55 }, (_, i) => [`${identidade}-${i}`, "2026-09", "recibo", "01234567890", "Pessoa fictícia", "2026-09-15", "10.00", "10.00"]));
    const [id] = await enfileirarArquivo(m.ctx, { id: dados.companyId }, new File([csv], "lote-ficticio.csv"));
    expect(await processarImportacao(m.ctx, { id: dados.companyId, cnpj: "39952818000140" }, id)).toMatchObject({ cursor: 50, total: 55, estado: "pendente" });
    await acao("cancelar_importacao", { id });
    expect(await processarImportacao(m.ctx, { id: dados.companyId, cnpj: "39952818000140" }, id)).toMatchObject({ estado: "cancelado" });
    await acao("retomar_importacao", { id });
    expect(await processarImportacao(m.ctx, { id: dados.companyId, cnpj: "39952818000140" }, id)).toMatchObject({ cursor: 55, estado: "concluido" });
    expect(await getPrisma().spedFiscalSupport.count({ where: { tenantId: dados.tenantId, companyId: dados.companyId, identity: { startsWith: identidade } } })).toBe(55);
  });
  it("lote de decisões é atômico quando uma gravação falha", async () => {
    const chave = `teste-${randomUUID()}`; const versao = await revisao();
    await expect(escreverNaRaiz(m.ctx, "39952818", versao, async tx => { await registrarDecisao(tx, m.ctx, "39952818", "teste", chave, json({ valor: "1.00" })); throw new Error("falha simulada"); })).rejects.toThrow("falha simulada");
    expect(await revisao()).toBe(versao); expect(await getPrisma().spedFiscalDecision.count({ where: { tenantId: dados.tenantId, key: chave } })).toBe(0);
  });
  it("gera com pacote imutável, reconcilia parte incerta e não repete a execução", async () => {
    await acao("parametros", { saldoIcms: "0.00", saldoIpi: "0.00", saldoPis: "0.00", saldoCofins: "0.00", receitaBruta: "0.00" }, "apuracao");
    const { gerarComPacote } = await import("./geracao");
    const recebidas: number[] = []; let hash = "", erro = true;
    const criarExecucao = vi.fn(async (_raiz: string, corpo: { pacote_id: string }) => ({ id: 781, pacote_id: corpo.pacote_id, sha256_connect: hash, revisao_connect: await revisao() }));
    const criarUploadDePacote = vi.fn(async (_raiz: string, corpo: { sha256: string }) => { hash = corpo.sha256; return { id: randomUUID(), tamanho_parte: 8388608, partes_recebidas: recebidas }; });
    const enviarParteDoUpload = vi.fn(async (_raiz: string, _id: string, n: number) => { recebidas.push(n); if (erro) { erro = false; throw new Error("Resposta perdida depois de receber a parte"); } });
    m.motor = { escrita: true, raizes: ["39952818"], cliente: { saude: async () => ({ capacidades: ["geracao_connect_v1"] }), criarUploadDePacote, obterUpload: async (raiz: string, id: string) => ({ id, tamanho_parte: 8388608, partes_recebidas: recebidas }), enviarParteDoUpload, concluirPacote: async () => ({ pacote_id: "pacote-ficticio", sha256: hash }), criarExecucao } } as unknown as MotorDoEscritorio;
    const pedido = { empresa: dados.companyId, competencia: "2026-09", revisao: await revisao(), dados: { obrigacao: "icms_ipi", tipo: "0", chave: randomUUID() } };
    await expect(gerarComPacote(m.ctx, pedido)).rejects.toThrow("Resposta perdida");
    const r = await gerarComPacote(m.ctx, pedido); expect(r.execucaoId).toBe(781);
    expect(criarUploadDePacote).toHaveBeenCalledTimes(1); expect(enviarParteDoUpload).toHaveBeenCalledTimes(1); expect(criarExecucao).toHaveBeenCalledTimes(1);
    const congelada = await getPrisma().spedFiscalRevision.findUnique({ where: { id: r.revisaoId } });
    await escreverNaRaiz(m.ctx, "39952818", null, async () => undefined);
    expect((await gerarComPacote(m.ctx, pedido)).execucaoId).toBe(781); expect(criarExecucao).toHaveBeenCalledTimes(1);
    expect((await getPrisma().spedFiscalRevision.findUnique({ where: { id: r.revisaoId } }))?.sha256).toBe(congelada?.sha256);
    expect(await revisao()).toBeGreaterThan(congelada!.revision);
    m.motor = null;
  });
});

