import { describe, expect, it } from "vitest";
import type { ClienteDoOmie, ServicoDoOmie } from "@/lib/integracoes/omie/emissao";
import {
  assinaturaDoPedido,
  CAMPOS_VAZIOS,
  categoriaInicial,
  codigosSugeridos,
  documentoFormatado,
  fraseDoQueFalta,
  montarPrevia,
  origemDaCategoria,
  pendenciasDoPedido,
  resumoDosCodigos,
  servicoSemCodigoFiscal,
  type CamposDaNfse,
} from "./previaDaNfse";

// A prévia da "Nova NFS-e" (melhoria-855): a nota ao lado do formulário, a
// sugestão dos códigos da última OS e a caixa que desmarca quando a nota muda.
// Dados de exemplo, sem cliente de verdade.

function servico(p: Partial<ServicoDoOmie> = {}): ServicoDoOmie {
  return {
    codigo: "900",
    codigoInterno: "SRV-1",
    descricao: "Consultoria de exemplo",
    precoUnitario: 1500,
    categoria: null,
    codigoMunicipal: null,
    codigoLC116: null,
    naUltimaOS: null,
    ...p,
  };
}

const CLIENTE: ClienteDoOmie = { codigo: "77", nome: "Cliente Exemplo Ltda", documento: "11222333000181", cidade: "Cidade" };

function campos(p: Partial<CamposDaNfse> = {}): CamposDaNfse {
  return { ...CAMPOS_VAZIOS, ...p };
}

describe("códigos fiscais sugeridos", () => {
  it("serviço sem código no Omie traz os da OS mais recente já preenchidos", () => {
    const s = servico({ naUltimaOS: { codigoMunicipal: "06475", codigoLC116: "23.01", numeroOS: "1532" } });
    expect(servicoSemCodigoFiscal(s)).toBe(true);
    expect(codigosSugeridos(s)).toEqual({ codigoMunicipal: "06475", codigoLC116: "23.01" });
  });

  it("a OS com um código só sugere esse, e o outro fica em branco", () => {
    const s = servico({ naUltimaOS: { codigoMunicipal: null, codigoLC116: "1.07", numeroOS: "10" } });
    expect(codigosSugeridos(s)).toEqual({ codigoMunicipal: "", codigoLC116: "1.07" });
  });

  it("serviço com código no cadastro não leva código nesta nota, mesmo com OS", () => {
    const s = servico({ codigoLC116: "1.07", naUltimaOS: { codigoMunicipal: "06475", codigoLC116: "23.01", numeroOS: "1532" } });
    expect(servicoSemCodigoFiscal(s)).toBe(false);
    expect(codigosSugeridos(s)).toEqual({ codigoMunicipal: "", codigoLC116: "" });
  });

  it("sem OS anterior e sem serviço, nada é sugerido", () => {
    expect(codigosSugeridos(servico())).toEqual({ codigoMunicipal: "", codigoLC116: "" });
    expect(codigosSugeridos(null)).toEqual({ codigoMunicipal: "", codigoLC116: "" });
    expect(servicoSemCodigoFiscal(null)).toBe(false);
  });

  it("o resumo na linha do recolhível diz de onde vieram", () => {
    const s = servico({ naUltimaOS: { codigoMunicipal: "06475", codigoLC116: "23.01", numeroOS: "1532" } });
    expect(resumoDosCodigos(s, "06475", "23.01")).toBe("sugeridos os da OS 1532");
    expect(resumoDosCodigos(s, " 06475 ", "23.01")).toBe("sugeridos os da OS 1532");
    expect(resumoDosCodigos(s, "06475", "")).toBe("informados para esta nota");
    expect(resumoDosCodigos(s, "", "")).toBe("nenhum informado");
    expect(resumoDosCodigos(servico(), "123", "")).toBe("informados para esta nota");
  });
});

describe("categoria", () => {
  const sugerida = { codigo: "1.01.02", numeroOS: "1532" };

  it("a do cadastro do serviço vence a sugerida pelas OS", () => {
    expect(categoriaInicial(servico({ categoria: "1.01.03" }), sugerida)).toBe("1.01.03");
    expect(categoriaInicial(servico(), sugerida)).toBe("1.01.02");
    expect(categoriaInicial(servico(), null)).toBe("");
    expect(categoriaInicial(null, sugerida)).toBe("");
  });

  it("o selo 'sugerida' só vale enquanto o campo tem a da OS e o serviço não tem a sua", () => {
    expect(origemDaCategoria(servico(), sugerida, "1.01.02")).toBe("sugerida");
    expect(origemDaCategoria(servico(), sugerida, "1.01.09")).toBe("digitada");
    expect(origemDaCategoria(servico({ categoria: "1.01.02" }), sugerida, "1.01.02")).toBe("servico");
    expect(origemDaCategoria(servico(), sugerida, "  ")).toBe("vazia");
  });
});

describe("o que falta para emitir", () => {
  it("lista na ordem dos campos e some quando está tudo", () => {
    expect(pendenciasDoPedido({ cliente: null, servico: null, valor: "", categoria: "" })).toEqual(["tomador", "serviço", "valor", "categoria no Omie"]);
    expect(pendenciasDoPedido({ cliente: CLIENTE, servico: servico(), valor: "0,00", categoria: "1.01.02" })).toEqual(["valor"]);
    expect(pendenciasDoPedido({ cliente: CLIENTE, servico: servico(), valor: "1.500,00", categoria: "1.01.02" })).toEqual([]);
  });

  it("a frase junta com vírgula e 'e'", () => {
    expect(fraseDoQueFalta([])).toBeNull();
    expect(fraseDoQueFalta(["valor"])).toBe("Falta preencher: valor.");
    expect(fraseDoQueFalta(["tomador", "serviço", "valor"])).toBe("Falta preencher: tomador, serviço e valor.");
  });
});

describe("a caixa de confirmação vale para a nota marcada", () => {
  const base = campos({ tomador: "77", servico: "900", valor: "1.500,00", categoria: "1.01.02" });

  it("mudar o que vai na nota muda a assinatura — a caixa desmarca", () => {
    const antes = assinaturaDoPedido(base, "2026-11");
    expect(assinaturaDoPedido({ ...base, valor: "1.600,00" }, "2026-11")).not.toBe(antes);
    expect(assinaturaDoPedido({ ...base, descricao: "Outra" }, "2026-11")).not.toBe(antes);
    expect(assinaturaDoPedido({ ...base, codigoLC116: "1.07" }, "2026-11")).not.toBe(antes);
    expect(assinaturaDoPedido({ ...base, tomador: "78" }, "2026-11")).not.toBe(antes);
    expect(assinaturaDoPedido(base, "2026-12")).not.toBe(antes);
  });

  it("espaço nas pontas e o jeito de escrever o mesmo valor não desmarcam", () => {
    const antes = assinaturaDoPedido(base, "2026-11");
    expect(assinaturaDoPedido({ ...base, categoria: " 1.01.02 " }, "2026-11")).toBe(antes);
    expect(assinaturaDoPedido({ ...base, valor: "1500,00" }, "2026-11")).toBe(antes);
  });
});

describe("a prévia da nota", () => {
  const prestador = { nome: "Prestador Exemplo", cnpj: "11444777000161" };

  it("vazia: só o prestador e a competência", () => {
    const p = montarPrevia({ prestador, cliente: null, servico: null, campos: CAMPOS_VAZIOS, competencia: "2026-11" });
    expect(p.prestador).toEqual({ nome: "Prestador Exemplo", documento: "11.444.777/0001-61" });
    expect(p.tomador).toBeNull();
    expect(p.discriminacao).toBeNull();
    expect(p.codigos).toBeNull();
    expect(p.semCodigo).toBe(false);
    expect(p.valorCentavos).toBeNull();
    expect(p.competencia).toBe("11/2026");
  });

  it("serviço sem código: os informados para esta nota e a categoria", () => {
    const s = servico({ naUltimaOS: { codigoMunicipal: "06475", codigoLC116: "23.01", numeroOS: "1532" } });
    const p = montarPrevia({
      prestador,
      cliente: CLIENTE,
      servico: s,
      campos: campos({ tomador: "77", servico: "900", valor: "1.500,00", categoria: "1.01.02", codigoMunicipal: "06475", codigoLC116: "23.01" }),
      competencia: "2026-11",
    });
    expect(p.tomador).toEqual({ nome: "Cliente Exemplo Ltda", documento: "11.222.333/0001-81" });
    expect(p.discriminacao).toEqual({ texto: "Consultoria de exemplo", origem: "cadastro" });
    expect(p.codigos).toBe("Municipal 06475 · LC 116 23.01 · Categoria 1.01.02");
    expect(p.semCodigo).toBe(false);
    expect(p.valorCentavos).toBe(150000);
  });

  it("serviço com código no cadastro: vale o do cadastro, não o digitado", () => {
    const s = servico({ codigoMunicipal: "1234", codigoLC116: "1.07" });
    const p = montarPrevia({ prestador, cliente: CLIENTE, servico: s, campos: campos({ codigoMunicipal: "9999", categoria: "1.01.02" }), competencia: "2026-11" });
    expect(p.codigos).toBe("Municipal 1234 · LC 116 1.07 · Categoria 1.01.02");
  });

  it("sem código em lugar nenhum: a prévia avisa que a prefeitura pode recusar", () => {
    const p = montarPrevia({ prestador, cliente: CLIENTE, servico: servico(), campos: campos({ categoria: "1.01.02" }), competencia: "2026-11" });
    expect(p.semCodigo).toBe(true);
    expect(p.codigos).toBe("Categoria 1.01.02");
  });

  it("a descrição escrita vira a discriminação; CPF sai formatado; valor zero não conta", () => {
    const p = montarPrevia({
      prestador: { nome: "Prestador Exemplo", cnpj: null },
      cliente: { ...CLIENTE, documento: "52998224725" },
      servico: servico(),
      campos: campos({ descricao: "  Serviço do mês  ", valor: "0" }),
      competencia: "2026-11",
    });
    expect(p.prestador.documento).toBeNull();
    expect(p.tomador?.documento).toBe("529.982.247-25");
    expect(p.discriminacao).toEqual({ texto: "Serviço do mês", origem: "nota" });
    expect(p.valorCentavos).toBeNull();
  });

  it("documento ausente fica nulo", () => {
    expect(documentoFormatado(null)).toBeNull();
    expect(documentoFormatado("")).toBeNull();
  });
});
