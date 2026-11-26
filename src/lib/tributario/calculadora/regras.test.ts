import { describe, expect, it } from "vitest";
import classificacoes from "./gabarito/classificacoes-cbs-ibs.json";
import ufs from "./gabarito/ufs.json";
import municipiosRs from "./gabarito/municipios-rs.json";
import aliquotaUniao2026 from "./gabarito/aliquota-uniao-2026.json";
import aliquotaUf2026 from "./gabarito/aliquota-uf-2026.json";
import aliquotaMunicipio2026 from "./gabarito/aliquota-municipio-2026.json";
import aliquotaUniao2027 from "./gabarito/aliquota-uniao-2027-404.json";
import ncm from "./gabarito/ncm-10063021.json";
import nbs from "./gabarito/nbs-122011200.json";
import pedido2026 from "./gabarito/pedido-2026.json";
import resposta2026 from "./gabarito/resposta-2026.json";
import pedido2027 from "./gabarito/pedido-2027.json";
import resposta2027 from "./gabarito/resposta-2027.json";
import {
  MENSAGEM_DA_FALHA_NO_PORTAL,
  baseDaCalculadora,
  classificacoesPorCst,
  oQueFazerNoPortal,
  resumoDaClassificacao,
  campoDoPonteiro,
  classificacoesDoCodigo,
  classificacoesDoTipo,
  cstDaClassificacao,
  lerPergunta,
  tipoDoCodigo,
  descricaoDaNomenclatura,
  exigeAliquotasNominais,
  itemVazio,
  lerAliquotaDeReferencia,
  lerResposta,
  memoriaFormatada,
  montarPedido,
  percentual,
  resumirClassificacoes,
  resumirMunicipios,
  resumirUfs,
  traduzirErro,
  type EntradaDaCalculadora,
  type ItemDigitado,
} from "./regras";

// Os gabaritos são respostas reais da calculadora oficial (regime geral 1.6.1,
// base V0059), tiradas do container de infra/calculadora-rtc em 19/11/2026.
// O município é Porto Alegre (4314902), o do exemplo da própria Receita.

const item = (parcial: Partial<ItemDigitado>, id = "a"): ItemDigitado => ({ ...itemVazio(id), ...parcial });
const entrada = (parcial: Partial<EntradaDaCalculadora>): EntradaDaCalculadora => ({
  data: "2026-11-19",
  uf: "RS",
  municipio: "4314902",
  itens: [item({ codigo: "8471.30.12", cClassTrib: "000001", base: "5.000,00" })],
  aliquotas: null,
  ...parcial,
});

describe("dados abertos", () => {
  it("as classificações vêm com o CST dos três primeiros dígitos e a redução", () => {
    const lista = resumirClassificacoes(classificacoes);
    expect(lista.map((c) => c.codigo)).toEqual(["000001", "200003", "200028", "200035", "410001", "550001", "620001"]);
    const educacao = lista.find((c) => c.codigo === "200028")!;
    expect(educacao).toMatchObject({ cst: "200", nomenclatura: "NBS", tratamento: "Alíquota reduzida em 60%" });
    expect(educacao.reducao).toEqual({ cbs: 60, ibsUf: 60, ibsMun: 60 });
    expect(cstDaClassificacao("550001")).toBe("550");
    expect(resumoDaClassificacao(educacao)).toBe("CST 200 — Alíquota reduzida em 60%");
  });

  it("a lista agrupa por CST, com o nome do CST no grupo", () => {
    const grupos = classificacoesPorCst(resumirClassificacoes(classificacoes));
    expect(grupos.map((g) => g.rotulo)).toEqual([
      "CST 000 — Tributação integral",
      "CST 200 — Alíquota reduzida",
      "CST 410 — Imunidade e não incidência",
      "CST 550 — Suspensão",
      "CST 620 — Tributação monofásica",
    ]);
    expect(grupos[1].itens.map((c) => c.codigo)).toEqual(["200003", "200028", "200035"]);
  });

  it("o item de NCM só oferece classificações de NCM, e o de NBS as de NBS", () => {
    const lista = resumirClassificacoes(classificacoes);
    const deNcm = classificacoesDoTipo(lista, "ncm").map((c) => c.codigo);
    const deNbs = classificacoesDoTipo(lista, "nbs").map((c) => c.codigo);
    expect(deNcm).toContain("200003");
    expect(deNcm).not.toContain("200028");
    expect(deNbs).toContain("200028");
    expect(deNbs).not.toContain("200003");
    // "NBS ou NCM" serve aos dois.
    expect(deNcm).toContain("000001");
    expect(deNbs).toContain("000001");
    // O tamanho do código diz o tipo; enquanto não fecha, todas.
    expect(tipoDoCodigo("1006.30.21")).toBe("ncm");
    expect(tipoDoCodigo("1.2201.12.00")).toBe("nbs");
    expect(tipoDoCodigo("1006")).toBeNull();
    expect(classificacoesDoCodigo(lista, "122011200").map((c) => c.codigo)).toEqual(deNbs);
    expect(classificacoesDoCodigo(lista, "")).toHaveLength(lista.length);
  });

  it("UF e municípios em ordem, sem lixo e sem o Exterior", () => {
    const lista = resumirUfs(ufs);
    expect(lista).toHaveLength(27);
    expect(lista.some((u) => u.sigla === "EX")).toBe(false);
    expect(lista[0].sigla).toBe("AC");
    expect(lista.find((u) => u.sigla === "RS")?.codigo).toBe(43);
    const municipios = resumirMunicipios(municipiosRs);
    expect(municipios.find((m) => m.codigo === 4314902)?.nome).toBe("Porto Alegre");
    expect(resumirMunicipios([{ codigo: 12, nome: "x" }, null, "a"])).toEqual([]);
  });

  it("as alíquotas de referência de 2026, e nada em 2027 (a Receita responde 404)", () => {
    expect(lerAliquotaDeReferencia(aliquotaUniao2026)).toBe(0.9);
    expect(lerAliquotaDeReferencia(aliquotaUf2026)).toBe(0.1);
    expect(lerAliquotaDeReferencia(aliquotaMunicipio2026)).toBe(0);
    expect(lerAliquotaDeReferencia(aliquotaUniao2027)).toBeNull();
  });

  it("a descrição do NCM e da NBS fica com as duas partes mais específicas", () => {
    expect(descricaoDaNomenclatura(ncm)).toEqual({ descricao: "Não parboilizado › Polido ou brunido", impostoSeletivo: false });
    expect(descricaoDaNomenclatura(nbs)?.descricao).toBe("Serviços de educação infantil › Serviços de pré-escola");
    expect(descricaoDaNomenclatura({})).toBeNull();
  });
});

describe("montarPedido", () => {
  it("2026: sem alíquotas nominais, código só com dígitos, CST da classificação", () => {
    const r = montarPedido(entrada({ aliquotas: { cbs: "8,8", ibsUf: "0,05", ibsMun: "0,05" } }), "p1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido).toEqual({
      id: "p1",
      versao: "1.0.0",
      dhFatoGerador: "2026-11-19T12:00:00-03:00",
      municipio: 4314902,
      uf: "RS",
      itens: [{ numero: 1, ncm: "84713012", cst: "000", cClassTrib: "000001", baseCalculo: 5000 }],
    });
  });

  it("monta o mesmo pedido do gabarito de 2026", () => {
    const r = montarPedido(
      entrada({
        itens: [
          item({ codigo: "10063021", cClassTrib: "200003", base: "100", quantidade: "20", unidade: "kg" }, "1"),
          item({ codigo: "1.2201.12.00", cClassTrib: "200028", base: "1.200,00" }, "2"),
          item({ codigo: "02013000", cClassTrib: "200035", base: "80" }, "3"),
          item({ codigo: "84713012", cClassTrib: "000001", base: "5000" }, "4"),
        ],
      }),
      "teste-2026"
    );
    expect(r.ok && { ...r.pedido, dhFatoGerador: pedido2026.dhFatoGerador }).toEqual(pedido2026);
  });

  it("2027: as alíquotas vão em todos os itens", () => {
    const r = montarPedido(entrada({ data: "2027-03-10", aliquotas: { cbs: "8,8", ibsUf: "0,05", ibsMun: "0,05" } }), "p");
    expect(r.ok && r.pedido.itens[0].aliquotasNominais).toEqual(pedido2027.itens[0].aliquotasNominais);
  });

  it("2027 sem alíquotas: aponta cada uma", () => {
    const r = montarPedido(entrada({ data: "2027-01-01", aliquotas: { cbs: "", ibsUf: "0,05", ibsMun: "150" } }), "p");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemas.map((p) => p.campo)).toEqual(["aliquotaCbs", "aliquotaIbsMun"]);
  });

  it("aponta o campo e o item do que faltou", () => {
    const r = montarPedido(
      entrada({
        uf: "",
        municipio: "123",
        itens: [item({ codigo: "1234", cClassTrib: "", base: "0" }, "1"), item({ cClassTrib: "000001", base: "10", quantidade: "-1", unidade: "PACOTES" }, "2")],
      }),
      "p"
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problemas.map((p) => `${p.item ?? "op"}:${p.campo}`)).toEqual([
      "op:uf",
      "op:municipio",
      "1:codigo",
      "1:cClassTrib",
      "1:base",
      "2:quantidade",
      "2:unidade",
    ]);
  });

  it("data inválida, nenhum item e mais de 50", () => {
    const sem = montarPedido(entrada({ data: "2026-02-30", itens: [] }), "p");
    expect(!sem.ok && sem.problemas.map((p) => p.campo)).toEqual(["data", "itens"]);
    const muitos = montarPedido(entrada({ itens: Array.from({ length: 51 }, (_, i) => item({ cClassTrib: "000001", base: "1" }, String(i))) }), "p");
    expect(!muitos.ok && muitos.problemas[0].mensagem).toBe("Calcule até 50 itens por vez.");
  });

  it("a virada para as alíquotas nominais é 01/01/2027", () => {
    expect(exigeAliquotasNominais("2026-12-31")).toBe(false);
    expect(exigeAliquotasNominais("2027-01-01")).toBe(true);
    expect(exigeAliquotasNominais("")).toBe(false);
  });
});

describe("lerResposta", () => {
  it("2026: calculado com as alíquotas da Receita, redução e efetiva por esfera", () => {
    const r = lerResposta(resposta2026);
    expect(r.simulado).toBe(false);
    expect(r.calculados).toBe(3);
    expect(r.comProblema).toBe(1);
    const educacao = r.itens[1];
    expect(educacao).toMatchObject({ numero: 2, estado: "CALCULADO", cst: "200", cClassTrib: "200028", base: 1200, ibs: 0.48, total: 4.8 });
    expect(educacao.cbs).toMatchObject({ aliquota: 0.9, reducao: 60, aliquotaEfetiva: 0.36, valor: 4.32 });
    expect(educacao.ibsUf).toMatchObject({ aliquota: 0.1, reducao: 60, aliquotaEfetiva: 0.04, valor: 0.48 });
    expect(educacao.cbs?.memoria).toContain("Art. 129");
    // Sem redução, a efetiva é a nominal.
    expect(r.itens[3].cbs).toMatchObject({ aliquota: 0.9, reducao: null, aliquotaEfetiva: 0.9, valor: 45 });
  });

  it("os totais são os da Receita, que somam só os calculados", () => {
    const r = lerResposta(resposta2026);
    expect(r.totais).toEqual({ base: 6300, cbs: 49.32, ibsUf: 5.48, ibsMun: 0, ibs: 5.48, impostoSeletivo: 0, total: 54.8 });
    const calculados = r.itens.filter((i) => i.total !== null);
    expect(calculados.reduce((s, i) => s + (i.cbs?.valor ?? 0), 0)).toBeCloseTo(r.totais.cbs, 2);
  });

  it("2027: simulado, com Imposto Seletivo, e o erro de cada item traduzido", () => {
    const r = lerResposta(resposta2027);
    expect(r.simulado).toBe(true);
    expect(r.itens.map((i) => i.estado)).toEqual(["CALCULO_SIMULADO", "CALCULO_SIMULADO", "CALCULO_SIMULADO", "INCONSISTENCIA_ENTRADA", "INCONSISTENCIA_ENTRADA"]);
    expect(r.itens[1].impostoSeletivo).toMatchObject({ base: 150, aliquota: 10, valor: 15 });
    expect(r.totais).toMatchObject({ base: 1465, cbs: 56.76, ibs: 0.64, impostoSeletivo: 15, total: 72.4 });
    const [ncmForaDaLista] = r.itens[3].erros;
    expect(ncmForaDaLista).toMatchObject({ codigo: "REG-011", titulo: "NCM fora desta classificação", campo: "NCM" });
    expect(ncmForaDaLista.detalhe).toContain("02013000");
    expect(r.itens[4].erros[0]).toMatchObject({ codigo: "REG-037", titulo: "Faltam as alíquotas", campo: "Alíquotas" });
  });

  it("imunidade calcula sem grupo de CBS/IBS: total zero e sem tributo", () => {
    const r = lerResposta({ objetos: [{ nObj: 1, estadoItem: "CALCULADO", tribCalc: { IBSCBS: { CST: "410", cClassTrib: "410001" } } }] });
    expect(r.itens[0]).toMatchObject({ semTributo: true, total: 0, cbs: null });
    expect(r.totais.total).toBe(0);
  });

  it("422 da operação inteira: nenhum item, e o erro traduzido", () => {
    const r = lerResposta({
      status: 422,
      errors: [{ code: "REG-018", pointer: "#/itens/-1", detail: "Município de código 3550308 não pertence à UF de sigla RS" }],
    });
    expect(r.itens).toEqual([]);
    expect(r.errosDaOperacao[0]).toMatchObject({ codigo: "REG-018", titulo: "Município de outra UF", campo: null });
  });

  it("estado desconhecido vira falha técnica, e código desconhecido usa o título da Receita", () => {
    const r = lerResposta({ objetos: [{ nObj: 1, estadoItem: "OUTRO", erros: [{ code: "REG-999", title: "Algo novo" }] }] });
    expect(r.itens[0].estado).toBe("FALHA_TECNICA");
    expect(r.itens[0].erros[0]).toMatchObject({ titulo: "Algo novo", oQueFazer: "Confira os dados do item." });
    expect(traduzirErro({ code: "VAL-003", pointer: "#/itens" }).titulo).toBe("Campo fora do formato");
  });

  it("no portal, o cliente não é mandado à Tech nem ao Swagger", () => {
    const tecnico = traduzirErro({ code: "CAL-999" });
    expect(tecnico.oQueFazer).toContain("Tech");
    expect(oQueFazerNoPortal(tecnico)).toBe("Esta conta precisa da equipe do escritório: abra uma solicitação com o item.");
    expect(oQueFazerNoPortal(traduzirErro({ code: "REG-009" }))).not.toContain("Swagger");
    expect(oQueFazerNoPortal(traduzirErro({ code: "REG-025" }))).toBe("Informe a base de cálculo do item.");
    for (const m of Object.values(MENSAGEM_DA_FALHA_NO_PORTAL)) expect(m).not.toMatch(/Tech|CALCULADORA_RTC_URL/);
  });

  it("o ponteiro diz o campo, e o da operação não diz nenhum", () => {
    expect(campoDoPonteiro("#/itens/3/ncm")).toBe("NCM");
    expect(campoDoPonteiro("#/itens/0/aliquotasNominais")).toBe("Alíquotas");
    expect(campoDoPonteiro("#/itens/-1")).toBeNull();
    expect(campoDoPonteiro(undefined)).toBeNull();
  });
});

describe("lerPergunta", () => {
  it("aceita só o formato esperado de cada pergunta", () => {
    expect(lerPergunta({ tipo: "classificacoes", data: "2026-11-19" })).toEqual({ tipo: "classificacoes", data: "2026-11-19" });
    expect(lerPergunta({ tipo: "classificacoes", data: "19/11/2026" })).toBeNull();
    expect(lerPergunta({ tipo: "municipios", uf: "rs" })).toEqual({ tipo: "municipios", uf: "RS" });
    expect(lerPergunta({ tipo: "municipios", uf: "RS&x=1" })).toBeNull();
    expect(lerPergunta({ tipo: "codigo", codigo: "1006.30.21", data: "2026-11-19" })).toEqual({ tipo: "codigo", codigo: "10063021", data: "2026-11-19" });
    expect(lerPergunta({ tipo: "codigo", codigo: "1006", data: "2026-11-19" })).toBeNull();
    expect(lerPergunta({ tipo: "apagar" })).toBeNull();
    expect(lerPergunta("x")).toBeNull();
  });

  it("o cálculo chega com tudo em texto, mesmo se vier número ou lixo", () => {
    const p = lerPergunta({
      tipo: "calcular",
      entrada: { data: "2026-11-19", uf: "RS", municipio: 4314902, itens: [{ codigo: 10063021, base: 100, cClassTrib: {} }], aliquotas: null },
    });
    expect(p).toEqual({
      tipo: "calcular",
      entrada: {
        data: "2026-11-19",
        uf: "RS",
        municipio: "",
        itens: [{ id: "1", codigo: "10063021", cClassTrib: "", base: "100", quantidade: "", unidade: "" }],
        aliquotas: null,
      },
    });
  });
});

describe("serviço e exibição", () => {
  it("o endereço vale com ou sem /api, e só http/https", () => {
    expect(baseDaCalculadora("http://calculadora-rtc:8080/")).toBe("http://calculadora-rtc:8080");
    expect(baseDaCalculadora(" http://calculadora-rtc:8080/api ")).toBe("http://calculadora-rtc:8080");
    expect(baseDaCalculadora("")).toBeNull();
    expect(baseDaCalculadora(undefined)).toBeNull();
    expect(baseDaCalculadora("calculadora-rtc:8080")).toBeNull();
    expect(baseDaCalculadora("ftp://x")).toBeNull();
  });

  it("percentual em pt-BR, sem zeros à toa", () => {
    expect(percentual(8.8)).toBe("8,8%");
    expect(percentual(0.05)).toBe("0,05%");
    expect(percentual(60)).toBe("60%");
    expect(percentual(null)).toBe("—");
  });

  it("percentual com duas casas no mínimo, para a memória de cálculo", () => {
    expect(percentual(0.9, "duasCasas")).toBe("0,90%");
    expect(percentual(26.5, "duasCasas")).toBe("26,50%");
    expect(percentual(0.0125, "duasCasas")).toBe("0,0125%");
    expect(percentual(60, "duasCasas")).toBe("60,00%");
  });

  // melhoria-808 (26/11/2026): a memória vinha com os números da API crus.
  describe("memória de cálculo no padrão brasileiro", () => {
    // O Intl separa o "R$" do número com espaço sem quebra.
    const legivel = (s: string) => memoriaFormatada(s).replace(/ /g, " ");

    it("reais com milhar e duas casas, alíquota com vírgula", () => {
      expect(
        legivel(
          "Operação de consumo com enquadramento legal em LC 214/2025, tributada conforme Tributação integral. A base de cálculo utilizada é de R$ 1000.00000000, com alíquota de 0.900000%.",
        ),
      ).toBe(
        "Operação de consumo com enquadramento legal em LC 214/2025, tributada conforme Tributação integral. A base de cálculo utilizada é de R$ 1.000,00, com alíquota de 0,90%.",
      );
      expect(legivel("A base de cálculo utilizada é de R$ 12345.6, com alíquota de 0.012500%.")).toBe(
        "A base de cálculo utilizada é de R$ 12.345,60, com alíquota de 0,0125%.",
      );
    });

    it("redução e Imposto Seletivo; o nome da classificação fica como veio", () => {
      expect(
        legivel(
          "Operação de consumo com enquadramento legal em Art. 129, tributada conforme Alíquota reduzida em 60%. A base de cálculo utilizada é de R$ 1200.00000000, com alíquota de 0.100000%, sendo que esse regime define uma redução de 60.000000% na alíquota.",
        ),
      ).toBe(
        "Operação de consumo com enquadramento legal em Art. 129, tributada conforme Alíquota reduzida em 60%. A base de cálculo utilizada é de R$ 1.200,00, com alíquota de 0,10%, sendo que esse regime define uma redução de 60,00% na alíquota.",
      );
      expect(legivel("A base de cálculo utilizada é de R$ 150.00, com alíquota ad valorem de 10.000000%. A alíquota ad rem é de .")).toBe(
        "A base de cálculo utilizada é de R$ 150,00, com alíquota ad valorem de 10,00%. A alíquota ad rem é de .",
      );
    });

    it("texto já no padrão, ou sem número, não muda", () => {
      const pronto = "A base de cálculo utilizada é de R$ 1.000,00, com alíquota de 0,90%.";
      expect(legivel(pronto)).toBe(pronto);
      expect(legivel(legivel("Base de R$ 1000.00000000 e alíquota de 26.500000%."))).toBe("Base de R$ 1.000,00 e alíquota de 26,50%.");
      const semNumero = "Operação de consumo com enquadramento legal em Art. 125, tributada conforme Alíquota zero. A base de cálculo utilizada é de R$ 100.00000000, com alíquota de zero.";
      expect(legivel(semNumero)).toBe(semNumero.replace("R$ 100.00000000", "R$ 100,00"));
    });
  });
});
