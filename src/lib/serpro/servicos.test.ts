import { describe, expect, it } from "vitest";
import { lerResposta, resultadoDaConferencia } from "./regras";
import {
  autorizacaoPermite,
  chaveDoContribuinte,
  DAS_DO_MEI,
  DAS_DO_SIMPLES,
  DARF_DO_SICALC,
  GUIA_DA_DCTFWEB,
  lerCertificadoDoMei,
  lerDarfDoSicalc,
  lerDasDoMei,
  lerDasDoSimples,
  lerGuiaDaDctfweb,
  LEITORES,
  SERVICOS_DO_SERPRO,
  servicoDoCatalogo,
  type RegistroParaOPortao,
} from "./servicos";
import { DAS_DO_MEI as RESPOSTA_DO_MEI, DAS_DO_SIMPLES as RESPOSTA_DO_SIMPLES, DARF_DO_SICALC as RESPOSTA_DO_SICALC, FORA_DO_CENARIO, GUIA_DA_DCTFWEB as RESPOSTA_DA_DCTFWEB, PDF_FICTICIO, PROCURACOES, type RespostaDoTrial } from "./servicos.fixture";

// O catálogo de serviços e o leitor de cada um (20/10/2026). As respostas são
// as da demonstração do Serpro (servicos.fixture.ts), com dados fictícios.

const lida = (r: RespostaDoTrial) => lerResposta(r.status, r.corpo);

describe("o catálogo de serviços", () => {
  it("não repete serviço nem sequencial", () => {
    const ids = SERVICOS_DO_SERPRO.map((s) => `${s.idSistema}/${s.idServico}`);
    expect(new Set(ids).size).toBe(ids.length);
    const sequenciais = SERVICOS_DO_SERPRO.map((s) => s.sequencial);
    expect(new Set(sequenciais).size).toBe(sequenciais.length);
  });

  it("versões: Sitfis 2.0, Sicalc 2.9, Procurações 1, o resto 1.0", () => {
    for (const s of SERVICOS_DO_SERPRO) {
      const esperada = { SITFIS: "2.0", SICALC: "2.9", PROCURACOES: "1" }[s.idSistema] ?? "1.0";
      expect(s.versaoSistema, s.idServico).toBe(esperada);
    }
  });

  it("os códigos de autorização de Serviços x Procuração", () => {
    expect(DAS_DO_SIMPLES.autorizacao).toEqual(["00146"]);
    expect(GUIA_DA_DCTFWEB.autorizacao).toEqual(["00103"]);
    expect(servicoDoCatalogo("CAIXAPOSTAL", "MSGCONTRIBUINTE61")!.autorizacao).toEqual(["00006"]);
    expect(servicoDoCatalogo("PAGTOWEB", "PAGAMENTOS71")!.autorizacao).toEqual(["00004"]);
    expect(servicoDoCatalogo("SITFIS", "RELATORIOSITFIS92")!.autorizacao).toEqual(["00002"]);
    expect(servicoDoCatalogo("PARCSN", "GERARDAS161")!.autorizacao).toEqual(["00076", "00188"]);
    expect(servicoDoCatalogo("RELPMEI", "DETPAGTOPARC235")!).toMatchObject({ autorizacao: ["00209", "10035"], sequencial: 104, caminho: "Consultar" });
    // Não exigem: PGMEI, Sicalc, Procurações.
    for (const s of [DAS_DO_MEI, DARF_DO_SICALC, servicoDoCatalogo("PROCURACOES", "OBTERPROCURACAO41")!]) expect(s.autorizacao, s.idServico).toEqual([]);
  });

  it("assíncronos e o que dá ciência", () => {
    expect(SERVICOS_DO_SERPRO.filter((s) => s.daCiencia).map((s) => s.idServico)).toEqual(["MSGDETALHAMENTO62"]);
    expect(servicoDoCatalogo("SITFIS", "SOLICITARPROTOCOLO91")).toMatchObject({ assincrono: true, caminho: "Apoiar" });
    expect(servicoDoCatalogo("EVENTOSATUALIZACAO", "OBTEREVENTOSPJ134")).toMatchObject({ assincrono: true, caminho: "Monitorar" });
    expect(DAS_DO_SIMPLES.assincrono).toBe(false);
  });

  it("todo leitor é de um serviço do catálogo", () => {
    for (const id of Object.keys(LEITORES)) expect(SERVICOS_DO_SERPRO.some((s) => s.idServico === id), id).toBe(true);
  });
});

describe("os leitores, com as respostas da demonstração", () => {
  it("DAS do Simples: PDF, vencimento, valores e composição (vem em `detalhamentoDas`)", () => {
    const r = lerDasDoSimples(lida(RESPOSTA_DO_SIMPLES));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({
      pdf: PDF_FICTICIO,
      numeroDocumento: "07202221401801678",
      periodoApuracao: "201801",
      vencimento: "2018-02-20",
      dataLimite: "2022-08-31",
      valores: { principal: 4000, multa: 800, juros: 1015, total: 5815 },
      cnpj: "00000000000100",
      razaoSocial: null,
    });
    expect(r.dados.composicao).toHaveLength(6);
    expect(r.dados.composicao[5]).toEqual({ periodoApuracao: "201801", codigo: "1007", denominacao: "SP - 01/2018", valores: { principal: 1360, multa: 272, juros: 345, total: 1977 } });
    expect(r.dados.observacoes).toEqual(["Esta empresa NÃO É OPTANTE pelo Simples Nacional."]);
  });

  it("DAS do MEI: o mesmo, com o `detalhamento` em lista e a razão social", () => {
    const r = lerDasDoMei(lida(RESPOSTA_DO_MEI));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados).toMatchObject({ pdf: PDF_FICTICIO, vencimento: "2019-02-20", valores: { principal: 5590, multa: 1118, juros: 1071, total: 7779 }, razaoSocial: "EXEMPLO" });
    expect(r.dados.composicao.map((c) => c.codigo)).toEqual(["0151", "0083", "0125"]);
    expect(r.dados.composicao[0].periodoApuracao).toBe("201901");
  });

  it("certificado de MEI: `dados` em texto com `{ cnpj, pdf }`", () => {
    const r = lerResposta(200, JSON.stringify({ status: 200, dados: JSON.stringify({ cnpj: "00000000000000", pdf: PDF_FICTICIO }), mensagens: [{ codigo: "Sucesso-CCMEI", texto: "Requisição efetuada com sucesso." }] }));
    expect(lerCertificadoDoMei(r)).toEqual({ ok: true, dados: { pdf: PDF_FICTICIO } });
    expect(lerCertificadoDoMei(lerResposta(200, JSON.stringify({ status: 200, dados: "{}", mensagens: [] }))).ok).toBe(false);
  });

  it("guia da DCTFWeb: só o PDF", () => {
    expect(lerGuiaDaDctfweb(lida(RESPOSTA_DA_DCTFWEB))).toEqual({ ok: true, dados: { pdf: PDF_FICTICIO } });
  });

  it("DARF do Sicalc: PDF e consolidado; número e Pix quando vierem", () => {
    const r = lerDarfDoSicalc(lida(RESPOSTA_DO_SICALC));
    expect(r).toEqual({
      ok: true,
      dados: {
        pdf: PDF_FICTICIO,
        consolidado: {
          principal: 100000,
          multa: 20000,
          juros: 5840,
          total: 125840,
          percentualMulta: 20,
          percentualJuros: 5.84,
          termoInicialJuros: "2022-03-01",
          dataConsolidacao: "2022-08-08",
          validoAte: "2022-08-31",
        },
        // A demonstração não traz; a documentação de 15/10/2026, sim.
        numeroDocumento: null,
        qrCode: null,
      },
    });
    const comPix = lerDarfDoSicalc(
      lerResposta(200, JSON.stringify({ dados: JSON.stringify({ darf: PDF_FICTICIO, numeroDocumento: "22080812345678901234", qrCode: "00020101021226" }), mensagens: [] }))
    );
    expect(comPix).toMatchObject({ ok: true, dados: { numeroDocumento: "22080812345678901234", qrCode: "00020101021226", consolidado: null } });
  });

  it("procurações: a conferência lê a resposta da demonstração (as do exemplo já venceram)", () => {
    expect(resultadoDaConferencia(lida(PROCURACOES), "2026-10-20")).toEqual({ tipo: "sem_procuracao" });
    expect(resultadoDaConferencia(lida(PROCURACOES), "2022-12-01")).toEqual({ tipo: "ativa", expiraEm: "2023-04-14", sistemas: 5 });
  });

  it("o 200 com ERRO da demonstração: nenhum leitor toma por sucesso", () => {
    for (const ler of [lerDasDoSimples, lerGuiaDaDctfweb, lerDarfDoSicalc]) {
      expect(ler(lida(FORA_DO_CENARIO))).toEqual({ ok: false, erro: "O Serpro recusou o pedido: Dados inválidos. Utilize o json no menu Cenário da documentação." });
    }
    expect(resultadoDaConferencia(lida(FORA_DO_CENARIO), "2026-10-20")).toMatchObject({ tipo: "erro" });
  });

  it("sem o PDF, diz que faltou; status de erro, explica", () => {
    expect(lerDasDoSimples(lerResposta(200, JSON.stringify({ dados: "[{}]", mensagens: [] })))).toEqual({ ok: false, erro: "O Serpro não devolveu o PDF do DAS." });
    expect(lerGuiaDaDctfweb(lerResposta(504, ""))).toEqual({ ok: false, erro: "O Serpro demorou demais e cortou a chamada (não cobrada)." });
  });
});

describe("o portão da autorização", () => {
  const HOJE = "2026-10-20";
  const registro = (extra: Partial<RegistroParaOPortao> = {}): RegistroParaOPortao => ({
    status: "ACTIVE",
    requestedAt: null,
    receivedAt: null,
    validatedAt: "2026-09-01",
    expiresAt: "2030-12-31",
    allServices: true,
    services: null,
    ...extra,
  });

  it("passa: ativa, ou a renovar, com todos os serviços ou com o código", () => {
    expect(autorizacaoPermite(DAS_DO_SIMPLES, registro(), HOJE)).toEqual({ pode: true });
    expect(autorizacaoPermite(DAS_DO_SIMPLES, registro({ expiresAt: "2026-11-15" }), HOJE)).toEqual({ pode: true });
    expect(autorizacaoPermite(DAS_DO_SIMPLES, registro({ allServices: false, services: "00103, 00146" }), HOJE)).toEqual({ pode: true });
    // Parcelamento: qualquer um dos dois códigos.
    expect(autorizacaoPermite(servicoDoCatalogo("PARCSN", "GERARDAS161")!, registro({ allServices: false, services: "00188" }), HOJE)).toEqual({ pode: true });
  });

  it("barra: sem registro, vencida, pedida, cancelada, não se aplica, ou sem o código", () => {
    expect(autorizacaoPermite(DAS_DO_SIMPLES, null, HOJE)).toMatchObject({ pode: false, motivo: expect.stringMatching(/não deu Autorização de Acesso/) });
    expect(autorizacaoPermite(DAS_DO_SIMPLES, registro({ expiresAt: "2026-10-01" }), HOJE)).toMatchObject({ pode: false, motivo: expect.stringMatching(/“Vencida”/) });
    for (const status of ["REQUESTED", "PENDING_VALIDATION", "CANCELLED", "NOT_APPLICABLE"] as const) {
      expect(autorizacaoPermite(DAS_DO_SIMPLES, registro({ status, receivedAt: HOJE }), HOJE).pode, status).toBe(false);
    }
    expect(autorizacaoPermite(DAS_DO_SIMPLES, registro({ allServices: false, services: "00103" }), HOJE)).toMatchObject({
      pode: false,
      motivo: expect.stringMatching(/não inclui o serviço 00146/),
    });
  });

  it("o que não exige autorização passa até sem registro", () => {
    for (const s of [DAS_DO_MEI, DARF_DO_SICALC]) expect(autorizacaoPermite(s, null, HOJE)).toEqual({ pode: true });
  });

  it("a chave é a raiz do CNPJ (a matriz vale para as filiais) ou o CPF", () => {
    expect(chaveDoContribuinte("11.222.333/0002-62")).toBe("11222333");
    expect(chaveDoContribuinte("529.982.247-25")).toBe("52998224725");
  });
});
