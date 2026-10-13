import { describe, expect, it } from "vitest";

import { estruturaDe, estruturaSemDados } from "./estrutura";

describe("estruturaDe", () => {
  it("resume objetos e listas pelo primeiro item, com o caminho de cada campo", () => {
    const e = estruturaDe({
      pagina: 1,
      nfCadastro: [
        { compl: { cChaveNFe: "4125" }, ide: { nNF: "123", dEmi: "01/09/2026" }, total: { ICMSTot: { vNF: 150.5 } } },
        { compl: { cChaveNFe: "outra" } },
      ],
      vazio: null,
    });
    expect(e).toEqual([
      { caminho: "pagina", tipo: "number", exemplo: "1" },
      { caminho: "nfCadastro", tipo: "lista[2]", exemplo: "" },
      { caminho: "nfCadastro[0].compl.cChaveNFe", tipo: "string", exemplo: "4125" },
      { caminho: "nfCadastro[0].ide.nNF", tipo: "string", exemplo: "123" },
      { caminho: "nfCadastro[0].ide.dEmi", tipo: "string", exemplo: "01/09/2026" },
      { caminho: "nfCadastro[0].total.ICMSTot.vNF", tipo: "number", exemplo: "150.5" },
      { caminho: "vazio", tipo: "null", exemplo: "" },
    ]);
  });

  it("corta texto longo e para em 200 linhas", () => {
    expect(estruturaDe({ x: "a".repeat(100) })[0].exemplo).toHaveLength(58);
    const grande = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`c${i}`, i]));
    expect(estruturaDe(grande)).toHaveLength(200);
  });
});

describe("estruturaSemDados", () => {
  it("mascara o que é dado do cliente e deixa aberto o que o código precisa reconhecer", () => {
    const e = estruturaSemDados({
      total_de_paginas: 7,
      clientes_cadastro: [{ razao_social: "TOMADOR UM LTDA", cnpj_cpf: "12.345.678/0001-90", email: "fin@tomador.com.br", inativo: "N" }],
      ListaRpsNfse: [{ cStatusRps: "004", nNfse: "456", cUrlNfse: "https://pref.exemplo/456", mensagens: [{ cSituacao: "ERRO", cDescricao: "Código de serviço inválido" }] }],
      dDtFat: "13/10/2026",
      nValorTot: 1530.45,
      lMsg: true,
    });
    const por = Object.fromEntries(e.map((l) => [l.caminho, l.exemplo]));
    expect(por).toMatchObject({
      total_de_paginas: "7",
      "clientes_cadastro[0].razao_social": "xxxxxxx xx xxxx",
      "clientes_cadastro[0].cnpj_cpf": "99.999.999/9999-99",
      "clientes_cadastro[0].email": "xxx@xxxxxxx.xxx.xx",
      "clientes_cadastro[0].inativo": "N",
      "ListaRpsNfse[0].cStatusRps": "004",
      "ListaRpsNfse[0].nNfse": "999",
      "ListaRpsNfse[0].mensagens[0].cSituacao": "ERRO",
      "ListaRpsNfse[0].mensagens[0].cDescricao": "xxxxxx xx xxxxxxx xxxxxxxx",
      dDtFat: "99/99/9999",
      nValorTot: "9999.99",
      lMsg: "true",
    });
    expect(JSON.stringify(e)).not.toMatch(/TOMADOR|tomador|12\.345|456|1530/);
  });
});
