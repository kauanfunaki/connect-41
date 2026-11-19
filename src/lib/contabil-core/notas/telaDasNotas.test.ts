import { describe, expect, it } from "vitest";
import {
  acaoDaLinha,
  avisoDaImportacao,
  consultaDaLista,
  diaDaEmissao,
  emissaoDigitada,
  FILTROS_VAZIOS,
  filtrosAtivos,
  numeroComSerie,
  podeCancelar,
  seloDaProcedencia,
  separarArquivos,
  somarImportacoes,
  textoDoCancelamento,
  valorDigitado,
} from "./telaDasNotas";
import { emissaoDaNota } from "./servico";

// A lógica pura da aba "Notas" (porte do `Notas.tsx` do Contábil Core, 18/11/2026).

describe("procedência", () => {
  it("XML assinado não tem selo; OCR e assinatura não conferida têm, com o motivo", () => {
    expect(seloDaProcedencia({ origem: "xml_assinado", assinaturaMotivo: null })).toBeNull();
    expect(seloDaProcedencia({ origem: "ocr", assinaturaMotivo: null })?.texto).toBe("OCR");
    const comMotivo = seloDaProcedencia({ origem: "xml_nao_verificado", assinaturaMotivo: "o digest não confere" });
    expect(comMotivo?.texto).toBe("assinatura não conferida");
    expect(comMotivo?.explicacao).toContain("não pôde ser conferida: o digest não confere.");
    expect(seloDaProcedencia({ origem: "xml_nao_verificado", assinaturaMotivo: null })?.explicacao).toContain("não pôde ser conferida. Costuma");
  });
});

describe("linha", () => {
  it("associa a pendente, remove a associação da associada e não oferece nada à cancelada", () => {
    expect(acaoDaLinha({ transacaoId: null, status: "pendente" })).toBe("associar");
    expect(acaoDaLinha({ transacaoId: "t", status: "associada" })).toBe("desassociar");
    expect(acaoDaLinha({ transacaoId: null, status: "cancelada" })).toBeNull();
    expect(podeCancelar({ status: "associada" })).toBe(true);
    expect(podeCancelar({ status: "cancelada" })).toBe(false);
    expect(numeroComSerie({ numero: "000123", serie: "1" })).toBe("000123-1");
    expect(numeroComSerie({ numero: "9", serie: null })).toBe("9");
  });

  it("o cancelamento avisa que a associação sai junto", () => {
    expect(textoDoCancelamento({ transacaoId: "t" })).toContain("associação com a transação também é desfeita");
    expect(textoDoCancelamento({ transacaoId: null })).not.toContain("associação");
  });
});

describe("filtros", () => {
  it("só o que está preenchido vai na consulta, aparado, com a página", () => {
    const q = consultaDaLista("e1", { ...FILTROS_VAZIOS, numero: " 12 ", tipo: "nfe", de: "2026-03-01" }, 3);
    expect(Object.fromEntries(q)).toEqual({ empresa: "e1", pagina: "3", porPagina: "20", numero: "12", tipo: "nfe", de: "2026-03-01" });
    expect(filtrosAtivos(FILTROS_VAZIOS)).toBe(false);
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, cnpj: "1" })).toBe(true);
  });
});

describe("importação", () => {
  it("aceita pela extensão, como o original", () => {
    const r = separarArquivos([{ name: "a.XML" }, { name: "b.zip" }, { name: "c.jpeg" }, { name: "d.Png" }, { name: "e.pdf" }, { name: "f.txt" }, { name: "g" }]);
    expect(r.validos.map((a) => a.name)).toEqual(["a.XML", "b.zip", "c.jpeg", "d.Png", "e.pdf"]);
    expect(r.ignorados).toBe(2);
  });

  it("soma os arquivos e põe a falha do envio como erro daquele arquivo", () => {
    const soma = somarImportacoes([
      { nome: "a.xml", ok: true, valor: { importadas: 1, duplicadas: 0, erros: [], mensagem: "" } },
      { nome: "b.zip", ok: true, valor: { importadas: 2, duplicadas: 1, erros: ["x.xml: XML malformado."], mensagem: "" } },
      { nome: "c.pdf", ok: false, erro: "O arquivo passa de 25 MB." },
    ]);
    expect(soma).toEqual({ importadas: 3, duplicadas: 1, erros: ["x.xml: XML malformado.", "c.pdf: O arquivo passa de 25 MB."] });
  });

  it("o aviso: sucesso, atenção com erro e erro sem nada importado", () => {
    expect(avisoDaImportacao({ importadas: 2, duplicadas: 1, erros: [] })).toEqual({
      titulo: "Importação concluída",
      texto: "2 nota(s) importada(s), 1 duplicada(s) ignorada(s).",
      tom: "sucesso",
    });
    expect(avisoDaImportacao({ importadas: 1, duplicadas: 0, erros: ["x"] }).tom).toBe("atencao");
    const nada = avisoDaImportacao({ importadas: 0, duplicadas: 0, erros: ["x", "y"] });
    expect(nada).toEqual({ titulo: "Nenhuma nota importada", texto: "0 nota(s) importada(s), 0 duplicada(s) ignorada(s). 2 erro(s) — veja os detalhes abaixo.", tom: "erro" });
  });
});

describe("cadastro à mão", () => {
  it("valor com vírgula ou com ponto", () => {
    expect(valorDigitado("1.234,56")).toBe("1234.56");
    expect(valorDigitado(" 1234,5 ")).toBe("1234.5");
    expect(valorDigitado("1234.56")).toBe("1234.56");
    expect(valorDigitado("1 234,00")).toBe("1234.00");
  });

  it("a data vai como meia-noite UTC (como o original) e aparece no mesmo dia", () => {
    const iso = emissaoNaTela("2026-03-05");
    expect(iso).toBe("2026-03-05T00:00:00.000Z");
    expect(diaDaEmissao(iso).fuso).toBe("UTC");
    // Uma NF-e com hora vem do XML com o fuso: aparece no dia de Brasília.
    expect(diaDaEmissao("2026-03-06T01:30:00.000Z").fuso).toBe("America/Sao_Paulo");
  });
});

function emissaoNaTela(dia: string): string {
  return emissaoDaNota(emissaoDigitada(dia))!.utc.toISOString();
}
