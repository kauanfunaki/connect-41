import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_SECAO,
  dadosDaSecao,
  dataCurta,
  ehSecaoDaFicha,
  enderecoEmUmaLinha,
  etapasDaCandidatura,
  idadeEm,
  listaNatural,
  resumoDosDocumentos,
  rotuloDaOrigem,
  validarSecao,
} from "./fichaDoCandidato";

const estados = (r: ReturnType<typeof etapasDaCandidatura>) => r.etapas.map((e) => e.estado);

describe("etapas da candidatura (cartão com etapas, 2A)", () => {
  it("em andamento: as anteriores feitas, a atual marcada, as outras por vir", () => {
    const r = etapasDaCandidatura("ENTREVISTA", "EM_ANDAMENTO");
    expect(r.etapas.map((e) => e.rotulo)).toEqual(["Triagem", "Entrevista", "Teste", "Proposta", "Contratado"]);
    expect(estados(r)).toEqual(["feita", "atual", "futura", "futura", "futura"]);
    expect(r).toMatchObject({ etapaAtual: "Entrevista", detalhe: "etapa 2 de 5", selo: null, descricao: "Entrevista, etapa 2 de 5" });
  });

  it("reprovado na triagem: a etapa onde parou leva o X, nada antes", () => {
    const r = etapasDaCandidatura("TRIAGEM", "REPROVADO");
    expect(estados(r)).toEqual(["parou", "futura", "futura", "futura", "futura"]);
    expect(r).toMatchObject({ etapaAtual: null, detalhe: "na Triagem", selo: { texto: "Reprovado", tom: "neutro" } });
    expect(r.descricao).toBe("Reprovado na Triagem");
  });

  it("desistiu ou encerrada no meio: as anteriores feitas, a etapa onde parou marcada", () => {
    expect(estados(etapasDaCandidatura("TESTE", "DESISTENTE"))).toEqual(["feita", "feita", "parou", "futura", "futura"]);
    expect(etapasDaCandidatura("TESTE", "DESISTENTE").descricao).toBe("Desistiu no Teste");
    expect(etapasDaCandidatura("PROPOSTA", "ENCERRADO")).toMatchObject({ selo: { texto: "Encerrado", tom: "neutro" }, detalhe: "na Proposta" });
  });

  it("aprovado: feitas até a etapa, selo verde", () => {
    const r = etapasDaCandidatura("PROPOSTA", "APROVADO");
    expect(estados(r)).toEqual(["feita", "feita", "feita", "feita", "futura"]);
    expect(r.selo).toEqual({ texto: "Aprovado", tom: "sucesso" });
  });

  it("contratado: as cinco feitas, sem complemento", () => {
    const r = etapasDaCandidatura("CONTRATADO", "CONTRATADO");
    expect(estados(r)).toEqual(["feita", "feita", "feita", "feita", "feita"]);
    expect(r).toMatchObject({ selo: { texto: "Contratado", tom: "sucesso" }, detalhe: null, etapaAtual: null });
  });

  it("etapa desconhecida cai na primeira, sem quebrar", () => {
    expect(estados(etapasDaCandidatura("QUALQUER", "EM_ANDAMENTO"))[0]).toBe("atual");
  });
});

describe("origem e data da inscrição", () => {
  it("PORTAL vira o nome do portal; o digitado fica como veio; vazio some", () => {
    expect(rotuloDaOrigem("PORTAL")).toBe("Portal de vagas");
    expect(rotuloDaOrigem(" Indicação ")).toBe("Indicação");
    expect(rotuloDaOrigem("")).toBeNull();
    expect(rotuloDaOrigem(null)).toBeNull();
  });

  it("dd/mm no ano corrente, com o ano em outro ano — no fuso de Brasília", () => {
    const agora = new Date("2026-10-14T15:00:00Z");
    expect(dataCurta(new Date("2026-10-04T13:00:00Z"), agora)).toBe("04/10");
    expect(dataCurta(new Date("2025-12-20T13:00:00Z"), agora)).toBe("20/12/2025");
    // 01/01 02:00 UTC ainda é 31/12 em Brasília.
    expect(dataCurta(new Date("2026-01-01T02:00:00Z"), agora)).toBe("31/12/2025");
  });
});

describe("resumo da linha dos documentos (recolhido com resumo, 4A)", () => {
  it("sem nada", () => {
    expect(resumoDosDocumentos([])).toBe("Nenhum arquivo");
  });

  it("quantos, de que tipo e quantos sensíveis", () => {
    expect(
      resumoDosDocumentos([
        { category: "CURRICULO", sensitive: false },
        { category: "ADMISSAO", sensitive: false },
        { category: "ADMISSAO", sensitive: true },
      ])
    ).toBe("3 arquivos · Currículo, Admissão · 1 sensível");
  });

  it("um arquivo, no singular, e vencidos à parte", () => {
    expect(resumoDosDocumentos([{ category: "ASO", sensitive: true, expired: true }])).toBe("1 arquivo · ASO · 1 sensível · 1 vencido");
  });

  it("mais de três tipos: os três primeiros e quantos faltam", () => {
    const docs = (["CURRICULO", "ADMISSAO", "ASO", "CONTRATO", "OUTRO"] as const).map((category) => ({ category, sensitive: false }));
    expect(resumoDosDocumentos(docs)).toBe("5 arquivos · Currículo, Admissão, ASO e mais 2");
  });
});

describe("dados pessoais", () => {
  it("idade completa no dia de Brasília", () => {
    const nascimento = new Date("1996-03-14T00:00:00Z");
    expect(idadeEm(nascimento, new Date("2026-03-13T15:00:00Z"))).toBe(29);
    expect(idadeEm(nascimento, new Date("2026-03-14T15:00:00Z"))).toBe(30);
    // 14/03 01:00 UTC ainda é 13/03 em Brasília: falta um dia.
    expect(idadeEm(nascimento, new Date("2026-03-14T01:00:00Z"))).toBe(29);
  });

  it("nascimento no futuro ou absurdo não vira idade", () => {
    expect(idadeEm(new Date("2030-01-01T00:00:00Z"), new Date("2026-10-14T12:00:00Z"))).toBeNull();
    expect(idadeEm(new Date("1800-01-01T00:00:00Z"), new Date("2026-10-14T12:00:00Z"))).toBeNull();
  });

  it("endereço numa linha, pulando o que falta", () => {
    const vazio = { addressStreet: null, addressNumber: null, addressComplement: null, neighborhood: null, city: null, stateCode: null, zipCode: null };
    expect(enderecoEmUmaLinha(vazio)).toBeNull();
    expect(
      enderecoEmUmaLinha({
        addressStreet: "Rua Mal. Floriano",
        addressNumber: "1820",
        addressComplement: "Apto 34",
        neighborhood: "Rebouças",
        city: "Curitiba",
        stateCode: "PR",
        zipCode: "80230110",
      })
    ).toBe("Rua Mal. Floriano, 1820, Apto 34 · Rebouças · Curitiba/PR · CEP 80230-110");
    expect(enderecoEmUmaLinha({ ...vazio, city: "Curitiba", stateCode: " " })).toBe("Curitiba");
  });

  it("os campos preenchidos pela IA numa frase", () => {
    expect(listaNatural([])).toBe("");
    expect(listaNatural(["Escolaridade"])).toBe("escolaridade");
    expect(listaNatural(["E-mail", "Cidade", "UF"])).toBe("e-mail, cidade e UF");
  });
});

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("edição no próprio bloco (5A): validação e campos de cada bloco", () => {
  it("só as três seções valem", () => {
    expect(ehSecaoDaFicha("contato")).toBe(true);
    expect(ehSecaoDaFicha("tudo")).toBe(false);
    expect(ehSecaoDaFicha(undefined)).toBe(false);
  });

  it("Identificação: Nome obrigatório, CPF e data válidos — as mesmas mensagens do formulário inteiro", () => {
    expect(validarSecao("identificacao", formulario({ name: " " }))).toBe("Nome é obrigatório.");
    expect(validarSecao("identificacao", formulario({ name: "Ana", cpf: "111.111.111-11" }))).toBe("CPF inválido.");
    expect(validarSecao("identificacao", formulario({ name: "Ana", birthDate: "não é data" }))).toBe("Data inválida.");
    expect(validarSecao("identificacao", formulario({ name: "Ana", cpf: "", birthDate: "1996-03-14" }))).toBeNull();
  });

  it("Contato: sem o Nome no formulário, e-mail validado", () => {
    expect(validarSecao("contato", formulario({ email: "ana@exemplo.test", phone: "(41) 99999-0000" }))).toBeNull();
    expect(validarSecao("contato", formulario({ email: "ana@" }))).toBe("E-mail inválido.");
  });

  it("Endereço: sem regra", () => {
    expect(validarSecao("endereco", formulario({ zipCode: "abc" }))).toBeNull();
  });

  it("o update leva só os campos do bloco — o que vier a mais é ignorado", () => {
    const form = formulario({ email: " ana@exemplo.test ", phone: "", name: "Outro nome", cpf: "52998224725", type: "COLABORADOR" });
    expect(dadosDaSecao("contato", form)).toEqual({ email: "ana@exemplo.test", phone: null });
  });

  it("Identificação monta como o formulário inteiro: nome aparado, data-calendário, vazio vira nulo", () => {
    const form = formulario({ name: " Ana Souza ", birthDate: "1996-03-14", cpf: "", rg: "10.234.567-8", education: " " });
    expect(dadosDaSecao("identificacao", form)).toEqual({
      name: "Ana Souza",
      birthDate: new Date("1996-03-14"),
      cpf: null,
      rg: "10.234.567-8",
      education: null,
    });
  });

  it("Endereço grava os sete campos, mesmo os apagados", () => {
    expect(Object.keys(dadosDaSecao("endereco", formulario({ city: "Curitiba" }))).sort()).toEqual([...CAMPOS_DA_SECAO.endereco].sort());
  });
});
