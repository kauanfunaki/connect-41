import { describe, expect, it } from "vitest";
import {
  contatoAproveitavel,
  displayNameDaLinha,
  planejarImportacao,
  type LinhaAcessorias,
} from "./importAcessorias";

const linha = (over: Partial<LinhaAcessorias> & { cnpj: string; name: string }): LinhaAcessorias => ({
  externalId: "1",
  tradeName: null,
  taxRegime: null,
  foundationDate: null,
  zipCode: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  neighborhood: null,
  city: null,
  stateCode: null,
  stateRegistration: null,
  municipalRegistration: null,
  nire: null,
  phone: null,
  website: null,
  contatoNome: null,
  contatoEmail: null,
  contatoTelefone: null,
  ...over,
});

describe("contatoAproveitavel", () => {
  it("aceita pessoa de fora com nome e sobrenome", () => {
    expect(contatoAproveitavel("Gabriel Henrique Badan", "gabriel@bldlogistica.com.br")).toBe(true);
  });

  it("recusa quem tem e-mail da casa — é colega, não contato do cliente", () => {
    expect(contatoAproveitavel("Renata Suenari", "financeiro@41contabil.com.br")).toBe(false);
    expect(contatoAproveitavel("Debora Leite", "debora@41bpo.com.br")).toBe(false);
  });

  it("recusa rótulo de papel em vez de nome", () => {
    expect(contatoAproveitavel("Cliente", "alguem@empresa.com.br")).toBe(false);
    expect(contatoAproveitavel("BPO", "alguem@empresa.com.br")).toBe(false);
    expect(contatoAproveitavel("Geral", null)).toBe(false);
  });

  it("recusa primeiro nome solto — a mesma 'Tatiane' aparece em centenas de empresas", () => {
    expect(contatoAproveitavel("Tatiane", "tatiane@cliente.com.br")).toBe(false);
  });

  it("recusa vazio", () => {
    expect(contatoAproveitavel(null, "x@y.com")).toBe(false);
    expect(contatoAproveitavel("   ", "x@y.com")).toBe(false);
  });

  it("aceita sem e-mail, desde que o nome sirva", () => {
    expect(contatoAproveitavel("Ana Clara Martins", null)).toBe(true);
  });
});

describe("displayNameDaLinha", () => {
  it("filial guarda o nome com sufixo, que é como o time chama", () => {
    expect(displayNameDaLinha("BLD LOGISTICA LTDA - Filial 02", "17122471000256")).toBe(
      "BLD LOGISTICA LTDA - Filial 02"
    );
  });

  it("matriz fica sem apelido — a razão social já é o nome", () => {
    expect(displayNameDaLinha("BLD LOGISTICA LTDA", "17122471000175")).toBeNull();
  });
});

describe("planejarImportacao", () => {
  const matriz = linha({ cnpj: "17122471000175", name: "BLD LOGISTICA LTDA" });
  const filial = linha({ cnpj: "17122471000256", name: "BLD LOGISTICA LTDA - Filial 02" });
  const outra = linha({ cnpj: "46997704000181", name: "EASY SUSHI LTDA" });

  it("desduplica a empresa que o arquivo repete por contato", () => {
    const p = planejarImportacao(
      [
        { ...matriz, contatoNome: "Ana Clara Martins", contatoEmail: "ana@bld.com.br" },
        { ...matriz, contatoNome: "Joao Pedro Silva", contatoEmail: "joao@bld.com.br" },
      ],
      [],
      []
    );
    expect(p.empresas).toHaveLength(1);
    expect(p.contatos).toHaveLength(2);
  });

  it("pendura a filial na matriz pelo estabelecimento 0001", () => {
    const p = planejarImportacao([matriz, filial], [], []);
    expect(p.filiais).toEqual([{ cnpjFilial: "17122471000256", cnpjMatriz: "17122471000175" }]);
    expect(p.filiaisSemMatriz).toEqual([]);
  });

  it("filial sem a matriz no arquivo entra solta, e é reportada", () => {
    const p = planejarImportacao([filial], [], []);
    expect(p.filiais).toEqual([]);
    expect(p.filiaisSemMatriz).toEqual([{ cnpj: "17122471000256", name: "BLD LOGISTICA LTDA - Filial 02" }]);
  });

  it("pendura na matriz que já estava no Connect, fora do arquivo", () => {
    const p = planejarImportacao(
      [filial],
      [{ id: "c1", cnpj: "17122471000175", name: "BLD LOGISTICA LTDA" }],
      []
    );
    expect(p.filiais).toEqual([{ cnpjFilial: "17122471000256", cnpjMatriz: "17122471000175" }]);
  });

  it("não recria empresa que já existe, e casa por CNPJ mesmo com máscara na base", () => {
    const p = planejarImportacao(
      [matriz, outra],
      [{ id: "c1", cnpj: "17.122.471/0001-75", name: "BLD LOGISTICA LTDA" }],
      []
    );
    expect(p.novas.map((e) => e.cnpj)).toEqual(["46997704000181"]);
    expect(p.jaExistem).toEqual([{ cnpj: "17122471000175", id: "c1" }]);
  });

  it("nome divergente vira substituição: apaga a antiga e recria do arquivo", () => {
    const p = planejarImportacao(
      [linha({ cnpj: "38116926000110", name: "GENETICA SOLUCOES LTDA" })],
      [{ id: "c1", cnpj: "38116926000110", name: "41Contabil" }],
      []
    );
    expect(p.divergenciasDeNome).toEqual([
      { cnpj: "38116926000110", nomeAtual: "41Contabil", nomeNovo: "GENETICA SOLUCOES LTDA" },
    ]);
    expect(p.substituicoes).toEqual([
      { id: "c1", cnpj: "38116926000110", nomeAtual: "41Contabil" },
    ]);
    // Entra como nova: depois de apagada é isso que ela é, e o agrupamento por
    // raiz precisa enxergá-la para dar cliente à empresa recriada.
    expect(p.novas.map((e) => e.cnpj)).toEqual(["38116926000110"]);
    expect(p.jaExistem).toEqual([]);
  });

  it("mesmo nome não vira substituição — só divergência apaga", () => {
    const p = planejarImportacao(
      [matriz],
      [{ id: "c1", cnpj: "17122471000175", name: "BLD LOGISTICA LTDA" }],
      []
    );
    expect(p.substituicoes).toEqual([]);
    expect(p.novas).toEqual([]);
    expect(p.jaExistem).toEqual([{ cnpj: "17122471000175", id: "c1" }]);
  });

  it("agrupa por raiz: matriz e filial num cliente só", () => {
    const p = planejarImportacao([matriz, filial, outra], [], []);
    const bld = p.clientesNovos.find((c) => c.cnpjRoot === "17122471");
    expect(bld?.empresas).toHaveLength(2);
    expect(p.clientesNovos).toHaveLength(2);
  });

  it("reaproveita cliente que já existe para a mesma raiz", () => {
    const p = planejarImportacao([filial], [], [{ id: "g1", name: "BLD", cnpjRoot: "17122471" }]);
    expect(p.clientesExistentes).toEqual([{ id: "g1", cnpjRoot: "17122471" }]);
    expect(p.clientesNovos).toEqual([]);
  });

  it("não repete o mesmo contato na mesma empresa", () => {
    const c = { contatoNome: "Ana Clara Martins", contatoEmail: "ana@bld.com.br" };
    const p = planejarImportacao([{ ...matriz, ...c }, { ...matriz, ...c }], [], []);
    expect(p.contatos).toHaveLength(1);
  });

  it("peneira os contatos internos e genéricos", () => {
    const p = planejarImportacao(
      [
        { ...matriz, contatoNome: "Renata Suenari", contatoEmail: "financeiro@41contabil.com.br" },
        { ...matriz, contatoNome: "Cliente", contatoEmail: "x@bld.com.br" },
        { ...matriz, contatoNome: "Ana Clara Martins", contatoEmail: "ana@bld.com.br" },
      ],
      [],
      []
    );
    expect(p.contatos.map((c) => c.name)).toEqual(["Ana Clara Martins"]);
    expect(p.totalContatos).toBe(3);
  });

  it("arquivo vazio não gera plano nenhum", () => {
    const p = planejarImportacao([], [], []);
    expect(p.empresas).toEqual([]);
    expect(p.clientesNovos).toEqual([]);
    expect(p.contatos).toEqual([]);
  });
});
