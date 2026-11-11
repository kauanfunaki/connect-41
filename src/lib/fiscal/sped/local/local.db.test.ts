import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { XML_FICTICIO } from "./fixture";
import { lerDocumentoXml, COLUNAS_APOIO } from "./importacao";
import { csvSeguro } from "./exportacao";
import type { AuthContext } from "@/lib/auth/context";
import type { PedidoDeGeracao } from "./geracaoPeloAgente";
import { proximoNumero } from "@/lib/enderecoCurtoNumeracao";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const m = vi.hoisted(() => ({ ctx: {} as AuthContext, companyId: "" }));
vi.mock("@/lib/auth/context", async importOriginal => { const real = await importOriginal<typeof import("@/lib/auth/context")>(); return { ...real, getAuthContext: async () => m.ctx }; });
// Desde 05/11/2026 (bbec9d0b) quem pode usar a faixa "Trabalhando em" escolhe a empresa só por
// ela, e a URL não conta. Estes testes passam a empresa pela URL: a pessoa fictícia é de um
// setor com a faixa desligada, que segue a regra de antes.
vi.mock("@/lib/empresas/focoServidor", async importOriginal => { const real = await importOriginal<typeof import("@/lib/empresas/focoServidor")>(); return { ...real, podeUsarOFoco: async () => false, lerEmpresaEmFoco: async () => null }; });
const url = process.env.SPED_FISCAL_TEST_DATABASE_URL;
const habilitado = !!url;
if (url) { const u = new URL(url); if (u.hostname !== "127.0.0.1" || u.port !== "33381" || u.pathname !== "/connect41") throw new Error("Testes SPED exigem o banco descartável na porta 33381."); process.env.DATABASE_URL = url; }
const { getPrisma } = await import("@/lib/prisma");
const { autorizar, carregarBase, escreverNaRaiz, gravarDocumento, json, prepararTelaLocal, registrarDecisao } = await import("./servidor");
const { enfileirarArquivo, processarImportacao } = await import("./fila");
const { POST } = await import("@/app/api/fiscal/sped/local/acao/route");
const dados = { tenantId: "", userId: "", companyId: "", filialId: "", outroTenantId: "", outraEmpresaId: "" };
// O perfil guardado no SPED tem só as obrigações e o ICMS a recolher; UF, regime, IE e a etapa
// "SPED fiscal" (município, perfil, atividade) vêm do cadastro da empresa (#432, 06/11/2026).
const PERFIL_DO_ARQUIVO = { obrigacoes: ["icms_ipi", "contribuicoes"], icmsCodReceita: "1015", icmsDiaVencimento: "12" };
const CADASTRO_DO_ARQUIVO = { stateRegistration: "9012345678", zipCode: "80000-000", codMunicipioIbge: "4106902", spedIndPerfil: "A", spedIndAtividade: "1" };
// O contabilista fica no padrão do escritório: a empresa sem o seu usa este.
const CONTABILISTA_DO_ESCRITORIO = { contabilistaNome: "CONTADOR FICTICIO", contabilistaCpf: "98765432100", contabilistaCrc: "PR-000000/O-0" };
const nome = "SPED Fiscal QA";
describe.skipIf(!habilitado)("SPED Fiscal com MySQL descartável real", () => {
  beforeAll(async () => {
    const db = getPrisma();
    const tenant = await db.tenant.upsert({ where: { slug: "sped-fiscal-qa" }, create: { name: nome, slug: "sped-fiscal-qa" }, update: {} });
    const outro = await db.tenant.upsert({ where: { slug: "sped-fiscal-qa-outro" }, create: { name: "Outro escritório fictício", slug: "sped-fiscal-qa-outro" }, update: {} });
    const user = await db.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: "fiscal.qa@example.invalid" } }, create: { tenantId: tenant.id, name: "Fiscal Fictícia", email: "fiscal.qa@example.invalid", passwordHash: await bcrypt.hash("SpedFiscalQA-Only-2026", 4), role: "ADMIN" }, update: {} });
    await db.sector.upsert({ where: { tenantId_code: { tenantId: tenant.id, code: "fiscal" } }, create: { tenantId: tenant.id, code: "fiscal", label: "Fiscal" }, update: {} });
    const criarEmpresa = async (tenantId: string, cnpj: string, name: string) => await db.company.findFirst({ where: { tenantId, cnpj } }) ?? await db.company.create({ data: { tenantId, number: await proximoNumero(db, "empresa", tenantId), cnpj, name } });
    const empresa = await criarEmpresa(tenant.id, "39952818000140", "EMPRESA FICTÍCIA — Matriz");
    const filial = await criarEmpresa(tenant.id, "39952818000220", "EMPRESA FICTÍCIA — Filial");
    await db.company.update({ where: { id: filial.id }, data: { parentCompanyId: empresa.id } });
    // UF e regime são do cadastro da empresa desde o #432: sem eles, o perfil fiscal aponta a falta.
    await db.company.updateMany({ where: { id: { in: [empresa.id, filial.id] } }, data: { stateCode: "PR", taxRegimeKind: "LUCRO_REAL" } });
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
  async function acao(acao: string, corpo: Record<string, unknown>, aba = "classificacao", versao?: number, competencia = "2026-09") { return POST(new Request("http://connect/api/fiscal/sped/local/acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: dados.companyId, competencia, revisao: versao ?? await revisao(), aba, acao, dados: corpo }) })); }
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
  // 06/11/2026: a geração vai para a fila do Connect e o agente do motor vem buscar.
  describe("geração pela fila, com o agente do motor", () => {
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    const chaveDaMaquina = `ops_${"a1".repeat(32)}`;
    const w = () => ({ tenantId: dados.tenantId, slug: "agente-sped-qa", tokenHash: sha(Buffer.from(chaveDaMaquina)), compartilhado: false });
    const pedidoNovo = async (tipo: "0" | "1" = "0") => ({ empresa: dados.companyId, competencia: "2026-09", revisao: await revisao(), dados: { obrigacao: "icms_ipi", tipo, chave: randomUUID() } });
    beforeAll(async () => {
      const db = getPrisma();
      await db.tenantModule.upsert({ where: { tenantId_moduleCode: { tenantId: dados.tenantId, moduleCode: "tech_ops_center" } }, create: { tenantId: dados.tenantId, moduleCode: "tech_ops_center", enabled: true }, update: { enabled: true } });
      await db.opsWatcher.upsert({ where: { tenantId_slug: { tenantId: dados.tenantId, slug: "agente-sped-qa" } }, create: { tenantId: dados.tenantId, slug: "agente-sped-qa", name: "Agente SPED fictício", isActive: true, tokenHash: w().tokenHash }, update: { isActive: true, tokenHash: w().tokenHash } });
      // Nenhuma geração aberta de uma rodada anterior do laboratório.
      await db.robotTask.updateMany({ where: { tenantId: dados.tenantId, kind: "gerar_sped", status: { in: ["PENDENTE", "EM_EXECUCAO"] } }, data: { status: "CANCELADA", openKey: null } });
      await acao("parametros", { saldoIcms: "0.00", saldoIpi: "0.00", saldoPis: "0.00", saldoCofins: "0.00", receitaBruta: "0.00" }, "apuracao");
      // O cadastro que o arquivo exige (bloco `escrituracao`). Sem a IE e o CEP da empresa, o motor
      // recusa (teste com o motor, sped_generator#59, 06/11/2026). O ICMS a recolher vai pelo
      // perfil fiscal, pelo mesmo caminho da tela.
      expect((await acao("perfil", { ...PERFIL_DO_ARQUIVO }, "classificacao")).status).toBe(200);
      await db.company.update({ where: { id: dados.companyId }, data: CADASTRO_DO_ARQUIVO });
      await db.tenantSpedConfig.upsert({ where: { tenantId: dados.tenantId }, create: { tenantId: dados.tenantId, ...CONTABILISTA_DO_ESCRITORIO }, update: CONTABILISTA_DO_ESCRITORIO });
      // A nota de 2026-09 entrou pelo `gravarDocumento` direto, sem arquivo. Aqui ela ganha o XML
      // guardado, com o endereço das duas partes, como sai de uma importação de verdade: sem ele, o
      // pedido nem vai para a fila (conferência de 06/11/2026).
      const relativo = `${dados.tenantId}/qa-nota-2026-09.xml`;
      await mkdir(`storage/sped-fiscal/${dados.tenantId}`, { recursive: true });
      await writeFile(`storage/sped-fiscal/${relativo}`, XML_FICTICIO
        .replace("<xNome>FORNECEDOR FICTICIO</xNome></emit>", "<xNome>FORNECEDOR FICTICIO</xNome><enderEmit><xLgr>RUA DO FORNECEDOR</xLgr><nro>10</nro><xBairro>VILA</xBairro><cMun>4113700</cMun></enderEmit><IE>1112223334</IE></emit>")
        .replace("<xNome>EMPRESA FICTICIA</xNome></dest>", "<xNome>EMPRESA FICTICIA</xNome><enderDest><xLgr>RUA DA EMPRESA FICTICIA</xLgr><nro>500</nro><xBairro>CENTRO</xBairro><cMun>4106902</cMun></enderDest></dest>"));
      await db.spedFiscalDocument.update({ where: { tenantId_identity: { tenantId: dados.tenantId, identity: lerDocumentoXml(XML_FICTICIO).identidade } }, data: { sourcePath: relativo } });
    });
    afterAll(async () => { if (habilitado) await rm(`storage/sped-fiscal/${dados.tenantId}/gerados`, { recursive: true, force: true }); });

    it("recusa antes da fila quando falta cadastro, e a tela do Gerar mostra o mesmo", async () => {
      const db = getPrisma();
      const { pedirGeracao } = await import("./geracao");
      const { faltasDoCadastroParaGerar } = await import("./escrituracao");
      await db.company.update({ where: { id: dados.companyId }, data: { zipCode: null } });
      try {
        await expect(pedirGeracao(m.ctx, await pedidoNovo())).rejects.toThrow("Antes de gerar o EFD ICMS/IPI, complete no cadastro da empresa, CEP.");
        expect(await db.robotTask.count({ where: { tenantId: dados.tenantId, kind: "gerar_sped", status: "PENDENTE" } })).toBe(0);
        const tela = await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-09", obrigacao: "icms_ipi" }, "gerar");
        expect(await faltasDoCadastroParaGerar(tela, await carregarBase(tela), dados.companyId, "39952818000140")).toEqual([{ onde: "cadastro", itens: ["CEP"] }]);
      } finally {
        await db.company.update({ where: { id: dados.companyId }, data: { zipCode: "80000-000" } });
      }
    });

    it("pede, a máquina pega, baixa o pacote, devolve em partes, e o arquivo fica para baixar com os mesmos bytes", async () => {
      const { pedirGeracao, geracoesDaTela } = await import("./geracao");
      const { pegarProxima, devolverTarefa } = await import("@/lib/robo/servidor");
      const { pacoteDaTarefa, receberParte } = await import("./geracaoPeloAgente");
      const pedido = await pedidoNovo();
      const r = await pedirGeracao(m.ctx, pedido);
      // A mesma intenção de novo devolve o mesmo pedido; outra intenção para o mesmo arquivo é recusada.
      expect((await pedirGeracao(m.ctx, pedido)).geracaoId).toBe(r.geracaoId);
      await expect(pedirGeracao(m.ctx, await pedidoNovo())).rejects.toMatchObject({ status: 409 });

      const { tarefa } = await pegarProxima(w(), ["gerar_sped"]);
      expect(tarefa?.tipo).toBe("gerar_sped");
      const d = tarefa!.dados as PedidoDeGeracao;
      expect(d).toMatchObject({ raiz: "39952818", cnpj: "39952818000140", competencia: "2026-09", obrigacao: "icms_ipi", tipo_sped: "0" });

      // O pacote pela rota, com a chave da máquina: os bytes canônicos do SHA-256 congelado.
      const { GET: baixarPacote } = await import("@/app/api/ops/watchers/[slug]/tarefas/[id]/pacote/route");
      const resposta = await baixarPacote(new Request(`http://connect/api/ops/watchers/agente-sped-qa/tarefas/${tarefa!.id}/pacote`, { headers: { authorization: `Bearer ${chaveDaMaquina}` } }), { params: Promise.resolve({ slug: "agente-sped-qa", id: tarefa!.id }) });
      expect(resposta.status).toBe(200);
      const pacote = new Uint8Array(await resposta.arrayBuffer());
      expect(sha(pacote)).toBe(d.sha256); expect(pacote.length).toBe(d.tamanho);
      expect(JSON.parse(Buffer.from(pacote).toString("utf8"))).toMatchObject({
        finalidade: "geracao_connect_v1", competencia: "2026-09", obrigacao: "icms_ipi",
        escrituracao: { estabelecimento: { razaoSocial: "EMPRESA FICTÍCIA — Matriz", codMun: "4106902", cep: "80000000", indPerfil: "A", contador: { nome: "CONTADOR FICTICIO", cpf: "98765432100" }, icms: { codReceita: "1015", diaVencimento: 12 } } },
      });
      await expect(pacoteDaTarefa({ ...w(), slug: "outra-maquina" }, tarefa!.id)).rejects.toMatchObject({ status: 409 });

      const txt = Buffer.from("|0000|ARQUIVO FICTÍCIO|\r\n|9999|2|\r\n", "latin1");
      // A primeira parte pela rota, como o agente manda; a segunda direto, repetida para provar que repetir é seguro.
      const { PUT: enviarParte } = await import("@/app/api/ops/watchers/[slug]/tarefas/[id]/partes/[n]/route");
      const primeira = new Uint8Array(txt.subarray(0, 10));
      const viaRota = await enviarParte(new Request(`http://connect/api/ops/watchers/agente-sped-qa/tarefas/${tarefa!.id}/partes/1`, { method: "PUT", headers: { authorization: `Bearer ${chaveDaMaquina}`, "content-type": "application/octet-stream", "content-length": String(primeira.length), "x-parte-sha256": sha(primeira) }, body: primeira }), { params: Promise.resolve({ slug: "agente-sped-qa", id: tarefa!.id, n: "1" }) });
      expect(viaRota.status).toBe(200);
      expect(await viaRota.json()).toMatchObject({ numero: 1, tamanho: 10, repetida: false });
      await receberParte(w(), tarefa!.id, 2, txt.subarray(10), sha(txt.subarray(10)));
      expect(await receberParte(w(), tarefa!.id, 2, txt.subarray(10), sha(txt.subarray(10)))).toMatchObject({ repetida: true });
      expect(await devolverTarefa(w(), tarefa!.id, { ok: true, resultado: { arquivo: { nome: "sped fictício.txt", tamanho: txt.length, sha256: sha(txt), partes: 2 } } }, null)).toEqual({ ok: true, status: "CONCLUIDA" });
      expect(await getPrisma().spedFiscalGeneration.findUnique({ where: { id: r.geracaoId } })).toMatchObject({ fileName: "sped_ficticio.txt", fileSha256: sha(txt), fileBytes: txt.length });

      const tela = await geracoesDaTela(dados.tenantId, { id: dados.companyId, cnpj: "39952818000140" }, "2026-09");
      expect(tela.geracoes[0]).toMatchObject({ id: r.geracaoId, estado: "CONCLUIDA", aberta: false, arquivo: { bytes: txt.length, sha256: sha(txt) } });
      expect(tela.agente).toMatchObject({ nome: "Agente SPED fictício", semSinal: false });

      const { GET: baixar } = await import("@/app/api/fiscal/sped/local/gerados/[id]/route");
      const arquivo = await baixar(new Request(`http://connect/api/fiscal/sped/local/gerados/${r.geracaoId}`), { params: Promise.resolve({ id: r.geracaoId }) });
      expect(arquivo.status).toBe(200);
      expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(new Uint8Array(txt));
      expect(await getPrisma().auditLog.count({ where: { tenantId: dados.tenantId, action: "fiscal.sped.geracao_concluida", entityId: r.geracaoId } })).toBe(1);
    });

    it("falha recuperável volta para a fila; na segunda tentativa vai para quem pediu", async () => {
      const { pedirGeracao } = await import("./geracao");
      const { pegarProxima, devolverTarefa } = await import("@/lib/robo/servidor");
      const r = await pedirGeracao(m.ctx, await pedidoNovo("1"));
      const primeira = await pegarProxima(w(), ["gerar_sped"]);
      expect(await devolverTarefa(w(), primeira.tarefa!.id, { ok: false, motivo: "A máquina fictícia caiu.", recuperavel: true }, null)).toEqual({ ok: true, status: "PENDENTE" });
      const segunda = await pegarProxima(w(), ["gerar_sped"]);
      expect(segunda.tarefa).toMatchObject({ id: primeira.tarefa!.id, tentativa: 2 });
      expect(await devolverTarefa(w(), segunda.tarefa!.id, { ok: false, motivo: "A máquina fictícia caiu de novo.", recuperavel: true }, null)).toEqual({ ok: true, status: "PRECISA_DE_GENTE" });
      expect(await getPrisma().notification.count({ where: { tenantId: dados.tenantId, type: "SPED_GERACAO_PARADA", entityId: primeira.tarefa!.id } })).toBe(1);
      expect((await getPrisma().spedFiscalGeneration.findUnique({ where: { id: r.geracaoId } }))?.fileSha256).toBeNull();
    });

    it("tira da fila o que a máquina não pegou, e o mesmo arquivo pode ser pedido de novo", async () => {
      const { pedirGeracao } = await import("./geracao");
      const r = await pedirGeracao(m.ctx, await pedidoNovo());
      expect((await acao("cancelar_geracao", { id: r.geracaoId }, "gerar")).status).toBe(200);
      expect((await acao("cancelar_geracao", { id: r.geracaoId }, "gerar")).status).toBe(409);
      const { pegarProxima } = await import("@/lib/robo/servidor");
      expect((await pegarProxima(w(), ["gerar_sped"])).tarefa).toBeNull();
      const outra = await pedirGeracao(m.ctx, await pedidoNovo());
      expect(outra.geracaoId).not.toBe(r.geracaoId);
      expect((await acao("cancelar_geracao", { id: outra.geracaoId }, "gerar")).status).toBe(200);
    });

    it("o bloco escrituracao relê o XML guardado: itens, participantes e o endereço que o cadastro não tem", async () => {
      // Competência própria: este documento não entra nas contas dos testes de 2026-09.
      const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe41260711222333000181550010000000771123456789"><ide><mod>55</mod><nNF>77</nNF><serie>1</serie><tpNF>1</tpNF><dhEmi>2026-07-15T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>FORNECEDOR FICTICIO &amp; CIA</xNome><enderEmit><xLgr>RUA DO FORNECEDOR</xLgr><nro>10</nro><xBairro>VILA</xBairro><cMun>4113700</cMun></enderEmit><IE>1112223334</IE></emit><dest><CNPJ>39952818000140</CNPJ><xNome>EMPRESA FICTICIA</xNome><enderDest><xLgr>RUA DA EMPRESA FICTICIA</xLgr><nro>500</nro><xBairro>CENTRO</xBairro><cMun>4106902</cMun></enderDest></dest><det nItem="1"><prod><cProd>E1</cProd><xProd>Insumo fictício</xProd><NCM>40112090</NCM><CFOP>5102</CFOP><uCom>CX</uCom><qCom>1</qCom><vProd>50.00</vProd></prod><imposto><ICMS><ICMS00><orig>1</orig><CST>00</CST><vBC>50.00</vBC><pICMS>12.00</pICMS><vICMS>6.00</vICMS></ICMS00></ICMS><IPI><cEnq>999</cEnq><IPITrib><CST>49</CST><vBC>0.00</vBC><pIPI>0.00</pIPI><vIPI>0.00</vIPI></IPITrib></IPI></imposto></det><total><ICMSTot><vNF>50.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
      const [importacao] = await enfileirarArquivo(m.ctx, { id: dados.companyId }, new File([xml], "nota-escrituracao.xml"));
      await processarImportacao(m.ctx, { id: dados.companyId, cnpj: "39952818000140" }, importacao);
      const tela = await prepararTelaLocal({ empresa: dados.companyId, competencia: "2026-07", obrigacao: "icms_ipi" }, "gerar");
      const base = await carregarBase(tela);
      const doc = base.documentos.find((d) => d.identidade === "41260711222333000181550010000000771123456789")!;
      const { montarEscrituracao } = await import("./escrituracao");
      const e = await montarEscrituracao(tela, base, dados.companyId);
      expect(e.documentos.find((d) => d.id === doc.id)).toMatchObject({ tpNF: "1", vDesc: "0.00", itens: [{ ordem: 1, unidade: "CX", origem: "1", vProd: "50.00" }] });
      expect(e.participantes.find((p) => p.documento === "11222333000181")).toMatchObject({ nome: "FORNECEDOR FICTICIO & CIA", ie: "1112223334", codMun: "4113700", endereco: "RUA DO FORNECEDOR" });
      // A empresa fictícia não tem endereço no cadastro: vem do XML em que ela é a destinatária.
      expect(e.estabelecimento).toMatchObject({ razaoSocial: "EMPRESA FICTÍCIA — Matriz", endereco: "RUA DA EMPRESA FICTICIA", numero: "500", codMun: "4106902", indAtiv: "1" });
      // Sem contabilista próprio vale o do escritório; com um, vale o da empresa, inteiro.
      expect(e.estabelecimento.contador).toEqual({ nome: "CONTADOR FICTICIO", cpf: "98765432100", crc: "PR-000000/O-0" });
      const db = getPrisma();
      await db.company.update({ where: { id: dados.companyId }, data: { contabilistaNome: "CONTABILISTA PROPRIO FICTICIO", contabilistaCpf: null, contabilistaCrc: "SC-000000/O-0" } });
      try {
        // O contabilista sai do perfil da base (`perfilDaEmpresa`): relê a base depois de mudar a empresa.
        expect((await montarEscrituracao(tela, await carregarBase(tela), dados.companyId)).estabelecimento.contador).toEqual({ nome: "CONTABILISTA PROPRIO FICTICIO", cpf: "", crc: "SC-000000/O-0" });
      } finally {
        await db.company.update({ where: { id: dados.companyId }, data: { contabilistaNome: null, contabilistaCpf: null, contabilistaCrc: null } });
      }
    });

    // O pacote de verdade para o teste junto com o motor (sped_generator#59): os
    // bytes congelados vão para .local/sped-fiscal, fora do git, e a tarefa sai da fila.
    it("congela o pacote de 2026-07 com o XML guardado, sem pendência, e grava os bytes para o motor", async () => {
      const julho = "2026-07";
      expect((await acao("classificar", { chaves: ["11222333000181|E1"], classificacao: { tipoItem: "01", definicao: "101", creditoPisCofins: "N", observacao: "Teste com o motor" } }, "classificacao", undefined, julho)).status).toBe(200);
      expect((await acao("parametros", { saldoIcms: "0.00", saldoIpi: "0.00", saldoPis: "0.00", saldoCofins: "0.00", receitaBruta: "0.00" }, "apuracao", undefined, julho)).status).toBe(200);
      const { pedirGeracao } = await import("./geracao");
      const { serializarPacote } = await import("./pacote");
      const r = await pedirGeracao(m.ctx, { empresa: dados.companyId, competencia: julho, revisao: await revisao(), dados: { obrigacao: "icms_ipi", tipo: "0", chave: randomUUID() } });
      const db = getPrisma();
      const congelada = await db.spedFiscalRevision.findUnique({ where: { id: r.revisaoId } });
      const { bytes, sha256 } = serializarPacote(congelada!.data);
      const pacote = JSON.parse(Buffer.from(bytes).toString("utf8"));
      expect(pacote.apuracao.pendencias).toEqual([]);
      expect(pacote.escrituracao.documentos).toHaveLength(1);
      expect(pacote.escrituracao.documentos[0].itens[0]).toMatchObject({ unidade: "CX", origem: "1", vProd: "50.00" });
      const geracao = await db.spedFiscalGeneration.findUnique({ where: { id: r.geracaoId } });
      const tarefa = await db.robotTask.findUnique({ where: { id: geracao!.robotTaskId } });
      expect(JSON.parse(tarefa!.payload)).toMatchObject({ sha256, tamanho: bytes.length, competencia: julho });
      await writeFile(".local/sped-fiscal/pacote-icms-2026-07.json", bytes);
      await writeFile(".local/sped-fiscal/pacote-icms-2026-07.dados.json", tarefa!.payload);
      expect((await acao("cancelar_geracao", { id: r.geracaoId }, "gerar", undefined, julho)).status).toBe(200);
    });

    it("a revisão congelada não muda quando os dados mudam depois do pedido", async () => {
      const { pedirGeracao } = await import("./geracao");
      const r = await pedirGeracao(m.ctx, await pedidoNovo());
      const congelada = await getPrisma().spedFiscalRevision.findUnique({ where: { id: r.revisaoId } });
      await escreverNaRaiz(m.ctx, "39952818", null, async () => undefined);
      expect((await getPrisma().spedFiscalRevision.findUnique({ where: { id: r.revisaoId } }))?.sha256).toBe(congelada?.sha256);
      expect(await revisao()).toBeGreaterThan(congelada!.revision);
      expect((await acao("cancelar_geracao", { id: r.geracaoId }, "gerar")).status).toBe(200);
    });
  });
});
