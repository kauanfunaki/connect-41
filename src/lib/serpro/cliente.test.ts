import { randomUUID } from "node:crypto";
import { createSecureContext } from "node:tls";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { certificadoDeTeste } from "./pfx.fixture";
import { configDaSoftwareHouse, configDeProducao, corpoDoSerpro, ESCRITORIO, TENANT, transporteFalso, transportePorServico } from "./teste.fixture";
import { CONTRATANTE_DO_TERMO, TERMO_ASSINADO } from "./termo.fixture";
import { FORA_DO_CENARIO, PROCURACOES } from "./servicos.fixture";
import { CONFERIR_PROCURACAO, DAS_DO_MEI, DAS_DO_SIMPLES, EXEMPLO_DA_DEMONSTRACAO, pedidoDoServico, servicoDoCatalogo } from "./servicos";
import { pedidoDeProcuracao } from "./regras";

// O fluxo inteiro do `chamarSerpro` com transporte falso (20/10/2026): token,
// chamada, registro, teto, portão da autorização e o modo demonstração. É o
// que segura o 401, o 403, o 429, o 504, o 304 e o 204 — a demonstração do
// Serpro não simula nenhum deles.

const m = await vi.hoisted(async () => {
  const { bancoFalso } = await import("./teste.fixture");
  return { banco: bancoFalso() };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco.prisma }));
// A configuração vai em texto no banco falso: sem cifra no teste.
vi.mock("@/lib/integracoes/data", () => ({
  lerConfig: (enc: string) => (enc ? JSON.parse(enc) : {}),
  executar: async (_p: unknown, corpo: () => Promise<{ resultado: unknown }>) => (await corpo()).resultado,
}));

const { chamarSerpro, configuracaoDoSerpro, consumoDoMes, esquecerTokens, prontidaoDoSerpro, SO_EXEMPLOS_NA_DEMONSTRACAO, testarConexao, validarConfigDoSerpro } =
  await import("./cliente");

const CLIENTE = "33444555000101";
const ok = (dados: unknown = []) => ({ status: 200, corpo: corpoDoSerpro(dados) });
const ativa = (extra: Partial<{ allServices: boolean; services: string | null; status: string }> = {}) => ({
  status: "ACTIVE",
  requestedAt: null,
  receivedAt: null,
  validatedAt: new Date("2026-09-01T12:00:00Z"),
  expiresAt: new Date("2030-12-31T12:00:00Z"),
  allServices: true,
  services: null,
  ...extra,
});
const das = () => pedidoDoServico(DAS_DO_SIMPLES, CLIENTE, { periodoApuracao: "202609" });

beforeEach(() => {
  m.banco.zerar();
  esquecerTokens();
  vi.unstubAllEnvs();
});

describe("chamarSerpro na produção", () => {
  it("autentica, chama com Bearer, jwt_token e X-Request-Tag, e grava a linha", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });

    expect(r.ok).toBe(true);
    expect(t.autenticacoes()).toHaveLength(1);
    const [c] = t.chamadas();
    expect(c.url).toBe("https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Consultar");
    // Tipo e autor, tipo e contribuinte, e o sequencial 45 do OBTERPROCURACAO41.
    expect(c.cabecalhos).toMatchObject({ Authorization: "Bearer acesso-1", jwt_token: "jwt-1", "X-Request-Tag": `2${ESCRITORIO}2${CLIENTE}45` });
    expect(c.pfx).toBeInstanceOf(Buffer);
    expect(JSON.parse(c.corpo)).toMatchObject({ contratante: { numero: ESCRITORIO }, autorPedidoDados: { numero: ESCRITORIO }, contribuinte: { numero: CLIENTE } });
    expect(m.banco.estado.chamadas).toEqual([
      expect.objectContaining({ httpStatus: 200, cobrada: true, tipoDeCobranca: "CONSULTA", ambiente: "PRODUCAO", requestTag: `2${ESCRITORIO}2${CLIENTE}45` }),
    ]);
  });

  it("401: renova o token uma vez e repete", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso((_r, n) => (n === 0 ? { status: 401 } : ok()));
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r.ok).toBe(true);
    expect(t.autenticacoes()).toHaveLength(2);
    expect(t.chamadas().map((c) => c.cabecalhos.Authorization)).toEqual(["Bearer acesso-1", "Bearer acesso-2"]);
    expect(m.banco.estado.chamadas).toHaveLength(1);
  });

  it("401 de novo depois de renovar: para aí, sem terceira tentativa, e o 401 não é cobrado", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ({ status: 401 }));
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "falha", status: 401 });
    expect(t.autenticacoes()).toHaveLength(2);
    expect(t.chamadas()).toHaveLength(2);
    expect(m.banco.estado.chamadas[0]).toMatchObject({ httpStatus: 401, cobrada: false });
  });

  it("o token fica guardado entre chamadas", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(t.autenticacoes()).toHaveLength(1);
  });

  it("403 é cobrado e volta como falha, com o motivo", async () => {
    m.banco.conectar(configDeProducao());
    m.banco.estado.autorizacoes.set("33444555", ativa());
    const t = transporteFalso(() => ({
      status: 403,
      corpo: JSON.stringify({ mensagens: [{ codigo: "[AcessoNegado-ICGERENCIADOR-022]", texto: "Não tem procuração autorizada no Portal eCAC." }] }),
    }));
    const r = await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "falha", status: 403 });
    expect(!r.ok && r.erro).toMatch(/não tem autorização de acesso/);
    expect(m.banco.estado.chamadas[0]).toMatchObject({ httpStatus: 403, cobrada: true, tipoDeCobranca: "EMISSAO" });
  });

  it.each([429, 504])("%i não é cobrado", async (status) => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ({ status }));
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "falha", status });
    expect(m.banco.estado.chamadas[0]).toMatchObject({ httpStatus: status, cobrada: false });
  });

  it("teto atingido: nem autentica, nem chama, nem grava", async () => {
    // R$ 0,24 = uma consulta. A segunda já passa do teto.
    m.banco.conectar({ ...configDeProducao(), tetoMensal: "0,24" });
    const linha = { tenantId: TENANT, caminho: "Consultar", idSistema: "PROCURACOES", idServico: "OBTERPROCURACAO41", contribuinte: CLIENTE, httpStatus: 200, mensagens: null, requestTag: null, origem: "teste", createdAt: new Date() };
    m.banco.estado.chamadas.push({ ...linha, cobrada: true, tipoDeCobranca: "CONSULTA", ambiente: "PRODUCAO" });
    const t = transporteFalso(() => ok());
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "teto" });
    expect(t.autenticacoes()).toHaveLength(0);
    expect(t.chamadas()).toHaveLength(0);
    expect(m.banco.estado.chamadas).toHaveLength(1);
  });

  it("a demonstração não conta no teto nem no custo", async () => {
    m.banco.conectar({ ...configDeProducao(), tetoMensal: "0,24" });
    const linha = { tenantId: TENANT, caminho: "Consultar", idSistema: "PROCURACOES", idServico: "OBTERPROCURACAO41", contribuinte: CLIENTE, httpStatus: 200, mensagens: null, requestTag: null, origem: "teste", createdAt: new Date() };
    // Mesmo uma linha de demonstração marcada como cobrada (não deveria existir) fica de fora.
    for (let i = 0; i < 5; i++) m.banco.estado.chamadas.push({ ...linha, cobrada: true, tipoDeCobranca: "CONSULTA", ambiente: "DEMONSTRACAO" });
    expect((await consumoDoMes(TENANT)).custo.totalCentavos).toBe(0);
    const t = transporteFalso(() => ok());
    expect((await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
  });

  it("204: o novo tempo de espera vem do ETag; 304 é sucesso — nenhum dos dois é cobrado", async () => {
    m.banco.conectar(configDeProducao());
    m.banco.estado.autorizacoes.set("33444555", ativa());
    const relatorio = pedidoDoServico(servicoDoCatalogo("SITFIS", "RELATORIOSITFIS92")!, CLIENTE, { protocoloRelatorio: "abc" });
    const t = transporteFalso((_r, n) =>
      n === 0 ? { status: 204, cabecalhos: { etag: '"tempoEspera:4000"' } } : { status: 304, cabecalhos: { etag: '"protocoloRelatorio:abc"', "cache-control": "integra_sitfis_solicitar_relatorio" } }
    );
    const espera = await chamarSerpro(TENANT, relatorio, { origem: "teste", transporte: t.transporte });
    expect(espera).toMatchObject({ ok: true, tempoEsperaMs: 4000 });
    const cache = await chamarSerpro(TENANT, relatorio, { origem: "teste", transporte: t.transporte });
    expect(cache).toMatchObject({ ok: true, tempoEsperaMs: null, cabecalhos: { etag: '"protocoloRelatorio:abc"' } });
    expect(m.banco.estado.chamadas.map((c) => [c.httpStatus, c.cobrada])).toEqual([
      [204, false],
      [304, false],
    ]);
  });

  it("serviço fora do catálogo, ou no caminho errado, não é chamado", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    const inventado = { ...pedidoDeProcuracao(CLIENTE, ESCRITORIO), idServico: "INVENTADO99" };
    expect(await chamarSerpro(TENANT, inventado, { origem: "teste", transporte: t.transporte })).toMatchObject({ ok: false, motivo: "fora_do_catalogo" });
    expect(await chamarSerpro(TENANT, { ...das(), caminho: "Consultar" }, { origem: "teste", transporte: t.transporte })).toMatchObject({ ok: false, motivo: "fora_do_catalogo" });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("sem resposta do serviço: rede; autenticação recusada: autenticação — os dois ficam registrados", async () => {
    m.banco.conectar(configDeProducao());
    const semRede = transporteFalso(() => new Error("tempo esgotado"));
    expect(await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: semRede.transporte })).toMatchObject({ ok: false, motivo: "rede" });
    esquecerTokens();
    const recusada = transporteFalso(() => ok(), () => ({ status: 401 }));
    expect(await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: recusada.transporte })).toMatchObject({ ok: false, motivo: "autenticacao" });
    expect(recusada.chamadas()).toHaveLength(0);
    expect(m.banco.estado.chamadas.map((c) => [c.httpStatus, c.mensagens, c.cobrada])).toEqual([
      [null, "sem resposta", false],
      [null, "autenticacao", false],
    ]);
  });
});

describe("o portão antes da chamada paga", () => {
  it("sem Autorização de Acesso: não chama e diz o motivo", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    const r = await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "sem_autorizacao" });
    expect(!r.ok && r.erro).toMatch(/não deu Autorização de Acesso/);
    expect(t.autenticacoes()).toHaveLength(0);
    expect(m.banco.estado.chamadas).toHaveLength(0);
  });

  it("autorização só de outros serviços, ou ainda com o cliente: não chama", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    m.banco.estado.autorizacoes.set("33444555", ativa({ allServices: false, services: "00103, 00006" }));
    const r = await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte });
    expect(!r.ok && r.erro).toMatch(/não inclui o serviço 00146/);
    m.banco.estado.autorizacoes.set("33444555", ativa({ status: "REQUESTED" }));
    expect(await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte })).toMatchObject({ ok: false, motivo: "sem_autorizacao" });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("com o código marcado, ou com todos os serviços, chama", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok([{ pdf: "JVBERi0=" }]));
    m.banco.estado.autorizacoes.set("33444555", ativa({ allServices: false, services: "00146" }));
    expect((await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
    m.banco.estado.autorizacoes.set("33444555", ativa());
    expect((await chamarSerpro(TENANT, das(), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
    expect(t.chamadas()).toHaveLength(2);
  });

  it("o que não exige autorização passa direto: MEI e a própria conferência", async () => {
    m.banco.conectar(configDeProducao());
    const t = transporteFalso(() => ok());
    expect((await chamarSerpro(TENANT, pedidoDoServico(DAS_DO_MEI, CLIENTE, { periodoApuracao: "202609" }), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
    expect(CONFERIR_PROCURACAO.autorizacao).toEqual([]);
    expect((await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
  });
});

describe("o modo demonstração", () => {
  it("sem chave nem certificado, fica pronta com o token público; sem o token, diz o que falta", async () => {
    m.banco.conectar({ ambiente: "demonstracao" });
    const cfg = await configuracaoDoSerpro(TENANT);
    expect(cfg).toMatchObject({ ambiente: "demonstracao", faltando: [] });
    expect(prontidaoDoSerpro(cfg)).toMatchObject({ pronta: false, motivo: expect.stringMatching(/SERPRO_TRIAL_TOKEN/) });
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    expect(prontidaoDoSerpro(cfg)).toEqual({ pronta: true });
  });

  it("chama o trial com o Bearer público, sem autenticar e sem mTLS, e grava fora do custo", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const t = transporteFalso(() => PROCURACOES);
    const r = await chamarSerpro(TENANT, EXEMPLO_DA_DEMONSTRACAO, { origem: "teste", transporte: t.transporte });
    expect(r.ok).toBe(true);
    expect(t.autenticacoes()).toHaveLength(0);
    const [c] = t.chamadas();
    expect(c.url).toBe("https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Consultar");
    expect(c.cabecalhos.Authorization).toBe("Bearer token-de-teste");
    expect(c.cabecalhos.jwt_token).toBeUndefined();
    expect(c.pfx).toBeNull();
    // O trial confere contratante e autor: vão os do cenário.
    expect(JSON.parse(c.corpo)).toMatchObject({ contratante: { numero: "99999999999999" }, autorPedidoDados: { numero: "99999999999999" }, contribuinte: { numero: "99999999999", tipo: 1 } });
    expect(m.banco.estado.chamadas[0]).toMatchObject({ ambiente: "DEMONSTRACAO", cobrada: false, httpStatus: 200 });
  });

  it("o 200 com ERRO é falha", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const t = transporteFalso(() => FORA_DO_CENARIO);
    const r = await chamarSerpro(TENANT, EXEMPLO_DA_DEMONSTRACAO, { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "falha", status: 200 });
    expect(!r.ok && r.erro).toMatch(/Dados inválidos/);
  });

  it("o pedido com dados de um cliente não sai do Connect", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const t = transporteFalso(() => ok());
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toEqual({ ok: false, motivo: "nao_pronta", erro: SO_EXEMPLOS_NA_DEMONSTRACAO, status: null });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("testar conexão: na demonstração, a consulta de exemplo; na produção, só a autenticação", async () => {
    vi.stubEnv("SERPRO_TRIAL_TOKEN", "token-de-teste");
    m.banco.conectar({ ambiente: "demonstracao" });
    const demo = transporteFalso(() => PROCURACOES);
    expect(await testarConexao(TENANT, demo.transporte)).toMatchObject({ ok: true, texto: expect.stringMatching(/demonstração/) });
    expect(demo.chamadas()).toHaveLength(1);

    m.banco.conectar(configDeProducao());
    const prod = transporteFalso(() => ok());
    expect(await testarConexao(TENANT, prod.transporte)).toMatchObject({ ok: true });
    expect(prod.autenticacoes()).toHaveLength(1);
    expect(prod.chamadas()).toHaveLength(0);
  });
});

describe("o A1 antigo ao salvar e ao conectar", () => {
  const senha = randomUUID();
  const legado = certificadoDeTeste("ESCRITORIO FICTICIO LTDA", ESCRITORIO).legado(senha);

  it("ao salvar, a configuração volta com o certificado já convertido", () => {
    const r = validarConfigDoSerpro({ certificado: legado.toString("base64"), senhaDoCertificado: senha, tetoMensal: "400" });
    expect(r && typeof r === "object").toBe(true);
    const novo = Buffer.from((r as { config: Record<string, string> }).config.certificado, "base64");
    expect(novo.equals(legado)).toBe(false);
    expect(() => createSecureContext({ pfx: novo, passphrase: senha })).not.toThrow();
    // O moderno não muda nada.
    expect(validarConfigDoSerpro({ certificado: novo.toString("base64"), senhaDoCertificado: senha, tetoMensal: "400" })).toBeNull();
    expect(validarConfigDoSerpro({ certificado: legado.toString("base64"), senhaDoCertificado: "outra", tetoMensal: "400" })).toBe("A senha não abre o certificado.");
  });

  it("guardado antes da conversão, vai convertido na conexão", async () => {
    m.banco.conectar({ ...configDeProducao(), certificado: legado.toString("base64"), senhaDoCertificado: senha });
    const cfg = await configuracaoDoSerpro(TENANT);
    expect(prontidaoDoSerpro(cfg)).toEqual({ pronta: true });
    expect(cfg!.pfx!.equals(legado)).toBe(false);
    expect(() => createSecureContext({ pfx: cfg!.pfx!, passphrase: senha })).not.toThrow();
  });
});

describe("o modelo software house: o termo de autorização (Fase 3)", () => {
  const TOKEN_DO_TERMO = "token-do-termo-1";
  const termoAceito = () => ({ status: 200, corpo: corpoDoSerpro({ autenticar_procurador_token: TOKEN_DO_TERMO, data_hora_expiracao: "2099-01-01T00:00:01" }) });
  const guardarTermo = (extra: Record<string, unknown> = {}) =>
    m.banco.tabelas.serproTermo.create({
      data: {
        tenantId: TENANT,
        xml: TERMO_ASSINADO,
        contratante: CONTRATANTE_DO_TERMO,
        autor: ESCRITORIO,
        assinadoEm: "2026-10-27",
        vigencia: "2099-10-27",
        certificadoValidoAte: "2099-12-31",
        ...extra,
      },
    });
  const termos = () => m.banco.tabelas.serproTermo.linhas;

  it("sem termo: não está pronta e nada sai", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    const cfg = await configuracaoDoSerpro(TENANT);
    expect(prontidaoDoSerpro(cfg)).toEqual({ pronta: false, motivo: expect.stringContaining("Falta o termo de autorização") });
    const t = transporteFalso(() => ok());
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "nao_pronta" });
    expect(t.chamadas()).toHaveLength(0);
  });

  it("com termo: envia o termo uma vez (Apoiar), e as chamadas vão com o token, a software house contratante e o escritório autor", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo();
    const t = transportePorServico({ ENVIOXMLASSINADO81: () => termoAceito(), OBTERPROCURACAO41: () => ok() });

    expect((await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
    expect((await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte })).ok).toBe(true);

    const [envio] = t.doServico("ENVIOXMLASSINADO81");
    expect(t.doServico("ENVIOXMLASSINADO81")).toHaveLength(1);
    expect(envio.url).toMatch(/\/Apoiar$/);
    expect(envio.cabecalhos).not.toHaveProperty("autenticar_procurador_token");
    const corpo = JSON.parse(envio.corpo);
    expect(corpo).toMatchObject({ contratante: { numero: CONTRATANTE_DO_TERMO }, autorPedidoDados: { numero: ESCRITORIO }, contribuinte: { numero: ESCRITORIO } });
    expect(Buffer.from(JSON.parse(corpo.pedidoDados.dados).xml, "base64").toString("utf8")).toBe(TERMO_ASSINADO);

    for (const c of t.doServico("OBTERPROCURACAO41")) {
      expect(c.cabecalhos).toMatchObject({ autenticar_procurador_token: TOKEN_DO_TERMO, jwt_token: "jwt-1" });
      expect(JSON.parse(c.corpo)).toMatchObject({ contratante: { numero: CONTRATANTE_DO_TERMO }, autorPedidoDados: { numero: ESCRITORIO }, contribuinte: { numero: CLIENTE } });
    }
    expect(termos()[0]).toMatchObject({ aceitoEm: expect.any(Date), erro: null });
    // O envio do termo é grátis e fica no registro, com a origem "termo".
    expect(m.banco.estado.chamadas.find((c) => c.idServico === "ENVIOXMLASSINADO81")).toMatchObject({ cobrada: false, origem: "termo" });
  });

  it("304: o termo ainda está no cache do Serpro, e o token vem no ETag", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo();
    const t = transportePorServico({
      ENVIOXMLASSINADO81: () => ({ status: 304, cabecalhos: { etag: '"autenticar_procurador_token:do-cache"', expires: "Fri, 01 Jan 2099 03:00:01 GMT" } }),
      OBTERPROCURACAO41: () => ok(),
    });
    expect((await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte })).ok).toBe(true);
    expect(t.doServico("OBTERPROCURACAO41")[0].cabecalhos).toMatchObject({ autenticar_procurador_token: "do-cache" });
  });

  it("termo recusado: para antes da chamada paga, e a recusa fica no termo para a tela", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo();
    const t = transportePorServico({
      ENVIOXMLASSINADO81: () => ({
        status: 403,
        corpo: JSON.stringify({ status: 403, dados: "", mensagens: [{ codigo: "[AcessoNegado-AUTENTICAPROCURADOR-013]", texto: "O XML assinado é inválido." }] }),
      }),
    });
    const r = await chamarSerpro(TENANT, pedidoDeProcuracao(CLIENTE, ESCRITORIO), { origem: "teste", transporte: t.transporte });
    expect(r).toMatchObject({ ok: false, motivo: "termo", erro: expect.stringContaining("O Serpro recusou o termo de autorização") });
    expect(t.doServico("OBTERPROCURACAO41")).toHaveLength(0);
    expect(termos()[0].erro).toEqual(expect.stringContaining("O Serpro recusou o termo de autorização"));
  });

  it("termo de outro contratante ou vencido: não está pronta", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo({ contratante: "33444555000101" });
    expect(prontidaoDoSerpro(await configuracaoDoSerpro(TENANT))).toEqual({ pronta: false, motivo: expect.stringContaining("Gere e assine um termo novo") });

    m.banco.zerar();
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo({ certificadoValidoAte: "2026-01-01" });
    expect(prontidaoDoSerpro(await configuracaoDoSerpro(TENANT), "2026-10-27")).toEqual({
      pronta: false,
      motivo: "O termo de autorização perdeu a validade com o certificado de quem assinou, que venceu em 01/01/2026. Gere e assine um termo novo.",
    });
  });

  it("o certificado do próprio escritório segue sem termo, como antes", async () => {
    m.banco.conectar(configDeProducao());
    expect(prontidaoDoSerpro(await configuracaoDoSerpro(TENANT))).toEqual({ pronta: true });
  });

  it("testar a conexão autentica e envia o termo, de graça", async () => {
    m.banco.conectar(configDaSoftwareHouse());
    await guardarTermo();
    const t = transportePorServico({ ENVIOXMLASSINADO81: () => termoAceito() });
    expect(await testarConexao(TENANT, t.transporte)).toEqual({ ok: true, texto: "O Serpro aceitou a chave, o segredo, o certificado e o termo de autorização." });
    expect(t.autenticacoes()).toHaveLength(1);
    expect(t.doServico("ENVIOXMLASSINADO81")).toHaveLength(1);
  });
});
