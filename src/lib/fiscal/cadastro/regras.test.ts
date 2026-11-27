import { describe, expect, it } from "vitest";
import {
  agregarDoAcervo,
  cClassTribEfetivo,
  ehItemDeVerdade,
  formatarNcm,
  lerEdicaoDoParticipante,
  lerEdicaoDoProduto,
  lerVinculoDoNcm,
  planejarSincronizacao,
  type DocumentoDoAcervo,
} from "./regras";

// O cadastro fiscal da empresa (funcionalidade-899, 27/11/2026). Dados inventados.

const EMPRESA = "11222333000181";
const FORNECEDOR = "22333444000192";
const CLIENTE = "33444555000103";

const doc = (sobre: Partial<DocumentoDoAcervo>): DocumentoDoAcervo => ({
  tipo: "NFE",
  sentido: "ENTRADA",
  emitente: FORNECEDOR,
  nomeEmitente: "FORNECEDOR EXEMPLO LTDA",
  destinatario: EMPRESA,
  nomeDestinatario: "EMPRESA EXEMPLO LTDA",
  emitidoEm: "2026-10-05T10:00:00-03:00",
  cancelado: false,
  itens: [{ codigo: "A1", descricao: "Parafuso", ncm: "73181500", tipoItem: "00" }],
  ...sobre,
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("agregar do acervo", () => {
  it("participante é o outro lado da nota; papel vira AMBOS; a própria empresa fica de fora", () => {
    const r = agregarDoAcervo(
      [
        doc({}),
        doc({ sentido: "SAIDA", emitente: EMPRESA, destinatario: FORNECEDOR, nomeDestinatario: "FORNECEDOR NOVO NOME", emitidoEm: "2026-11-01", itens: [] }),
        doc({ sentido: "SAIDA", emitente: EMPRESA, destinatario: CLIENTE, nomeDestinatario: "CLIENTE EXEMPLO", itens: [] }),
        doc({ sentido: "SAIDA", emitente: EMPRESA, destinatario: EMPRESA, itens: [] }),
        doc({ cancelado: true, emitente: "44555666000114" }),
      ],
      EMPRESA
    );
    const porDoc = Object.fromEntries(r.participantes.map((p) => [p.documento, p]));
    expect(Object.keys(porDoc).sort()).toEqual([FORNECEDOR, CLIENTE].sort());
    expect(porDoc[FORNECEDOR]).toMatchObject({ papel: "AMBOS", documentos: 2, nome: "FORNECEDOR NOVO NOME" });
    expect(porDoc[FORNECEDOR]!.primeiraNotaEm?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(porDoc[CLIENTE]).toMatchObject({ papel: "CLIENTE", documentos: 1 });
  });

  it("produto de entrada leva o CNPJ do fornecedor; de saída, vazio; descrição e NCM da nota mais recente", () => {
    const r = agregarDoAcervo(
      [
        doc({ emitidoEm: "2026-10-01", itens: [{ codigo: "A1", descricao: "Parafuso velho", ncm: "", tipoItem: "00" }] }),
        doc({ emitidoEm: "2026-11-01", itens: [{ codigo: "A1", descricao: "Parafuso M6", ncm: "7318.15.00", tipoItem: "00" }] }),
        doc({ emitidoEm: "2026-09-01", itens: [{ codigo: "A1", descricao: "Parafuso antigo", ncm: "73181600", tipoItem: "00" }] }),
        doc({ sentido: "SAIDA", emitente: EMPRESA, destinatario: CLIENTE, itens: [{ codigo: "P10", descricao: "Produto próprio", ncm: "84713012", tipoItem: "04" }] }),
        doc({ tipo: "CTE", itens: [{ codigo: "SERVICO_TRANSPORTE", descricao: "Serviço de transporte", ncm: "", tipoItem: "09" }] }),
      ],
      EMPRESA
    );
    const a1 = r.produtos.find((p) => p.codigo === "A1")!;
    expect(a1).toMatchObject({ participanteDocumento: FORNECEDOR, descricao: "Parafuso M6", ncm: "73181500", ocorrencias: 3, sentido: "ENTRADA" });
    expect(r.produtos.find((p) => p.codigo === "P10")).toMatchObject({ participanteDocumento: "", sentido: "SAIDA", tipoItem: "04" });
    expect(r.produtos).toHaveLength(2);
  });

  it("itens inventados pelo motor não são produto", () => {
    expect(ehItemDeVerdade("SERVICO")).toBe(false);
    expect(ehItemDeVerdade("ANALITICO:00:5102:18")).toBe(false);
    expect(ehItemDeVerdade(" ")).toBe(false);
    expect(ehItemDeVerdade("123")).toBe(true);
  });
});

describe("plano da sincronização", () => {
  const acervo = agregarDoAcervo([doc({ itens: [{ codigo: "A1", descricao: "Parafuso M6", ncm: "73181500", tipoItem: "00" }] })], EMPRESA);

  it("cria o que não existe", () => {
    const p = planejarSincronizacao(acervo, { produtos: [], participantes: [] });
    expect(p.produtosNovos).toHaveLength(1);
    expect(p.participantesNovos).toHaveLength(1);
  });

  it("produto editado à mão guarda descrição e NCM; os números seguem o acervo", () => {
    const p = planejarSincronizacao(acervo, {
      produtos: [{ id: "x", participanteDocumento: FORNECEDOR, codigo: "A1", descricao: "Parafuso (meu nome)", ncm: "73181600", ocorrencias: 5, ultimaNotaEm: null, editadoEm: new Date() }],
      participantes: [],
    });
    expect(p.produtosNovos).toHaveLength(0);
    expect(p.produtosMudados).toEqual([{ id: "x", dados: { ocorrencias: 1, ultimaNotaEm: new Date("2026-10-05T12:00:00Z") } }]);
  });

  it("sem edição, a descrição e o NCM acompanham; nada mudou, nada a fazer", () => {
    const ultima = new Date("2026-10-05T12:00:00Z");
    const semEdicao = planejarSincronizacao(acervo, {
      produtos: [{ id: "x", participanteDocumento: FORNECEDOR, codigo: "A1", descricao: "Parafuso", ncm: "", ocorrencias: 1, ultimaNotaEm: ultima, editadoEm: null }],
      participantes: [{ id: "f", documento: FORNECEDOR, nome: "FORNECEDOR EXEMPLO LTDA", papel: "FORNECEDOR", documentos: 1, ultimaNotaEm: ultima }],
    });
    expect(semEdicao.produtosMudados).toEqual([{ id: "x", dados: { descricao: "Parafuso M6", ncm: "73181500" } }]);
    expect(semEdicao.participantesMudados).toEqual([]);
  });

  it("participante que era cliente e aparece como fornecedor vira AMBOS", () => {
    const p = planejarSincronizacao(acervo, {
      produtos: [],
      participantes: [{ id: "f", documento: FORNECEDOR, nome: "FORNECEDOR EXEMPLO LTDA", papel: "CLIENTE", documentos: 1, ultimaNotaEm: new Date("2026-10-05T12:00:00Z") }],
    });
    expect(p.participantesMudados).toEqual([{ id: "f", dados: { papel: "AMBOS" } }]);
  });
});

describe("cClassTrib efetivo", () => {
  const vinculos = new Map([["73181500", { cClassTrib: "000001", cstIbsCbs: "000" }]]);
  it("o do produto vence o do NCM", () => {
    expect(cClassTribEfetivo({ ncm: "73181500", cClassTrib: "200028", cstIbsCbs: "200" }, vinculos)).toEqual({ cClassTrib: "200028", cst: "200", fonte: "PRODUTO" });
    expect(cClassTribEfetivo({ ncm: "73181500", cClassTrib: null, cstIbsCbs: null }, vinculos)).toEqual({ cClassTrib: "000001", cst: "000", fonte: "NCM" });
    expect(cClassTribEfetivo({ ncm: "", cClassTrib: null, cstIbsCbs: null }, vinculos)).toBeNull();
  });
});

describe("campos editáveis", () => {
  it("produto: limpa o vazio e confere os tamanhos", () => {
    expect(lerEdicaoDoProduto(form({ descricao: "Parafuso", ncm: "7318.15.00", cest: "", unidade: "un", cClassTrib: "200028", cstIbsCbs: "200", origem: "0", tipoItem: "00" }), false)).toEqual({
      ok: true,
      valor: { descricao: "Parafuso", ncm: "73181500", cest: null, unidade: "UN", cClassTrib: "200028", cstIbsCbs: "200", origem: "0", tipoItem: "00" },
    });
    expect(lerEdicaoDoProduto(form({ ncm: "123" }), false)).toMatchObject({ ok: false, erro: expect.stringContaining("NCM") });
    expect(lerEdicaoDoProduto(form({ cest: "12" }), false)).toMatchObject({ ok: false, erro: expect.stringContaining("CEST") });
    expect(lerEdicaoDoProduto(form({ origem: "9" }), false)).toMatchObject({ ok: false });
    expect(lerEdicaoDoProduto(form({ descricao: " " }), false)).toMatchObject({ ok: false });
  });
  it("em lote: vazio não mexe, — limpa, e não edita descrição nem NCM", () => {
    expect(lerEdicaoDoProduto(form({ cClassTrib: "200028", cest: "", unidade: "—", descricao: "x", ncm: "84713012" }), true)).toEqual({ ok: true, valor: { cClassTrib: "200028", unidade: null } });
    expect(lerEdicaoDoProduto(form({ cest: "" }), true)).toMatchObject({ ok: false, erro: expect.stringContaining("ao menos um") });
  });
  it("vínculo do NCM", () => {
    expect(lerVinculoDoNcm(form({ ncm: "7318.15.00", cClassTrib: "000001", cstIbsCbs: "" }))).toEqual({ ok: true, valor: { ncm: "73181500", cClassTrib: "000001", cstIbsCbs: null, observacao: null } });
    expect(lerVinculoDoNcm(form({ ncm: "7318", cClassTrib: "000001" }))).toMatchObject({ ok: false });
  });
  it("participante", () => {
    expect(lerEdicaoDoParticipante(form({ nome: "Fornecedor", uf: "pr", regime: "SIMPLES", contribuinteIcms: "1", inscricaoEstadual: "9012345678" }))).toEqual({
      ok: true,
      valor: { nome: "Fornecedor", uf: "PR", inscricaoEstadual: "9012345678", regime: "SIMPLES", contribuinteIcms: "1" },
    });
    expect(lerEdicaoDoParticipante(form({ nome: "X", uf: "Paraná" }))).toMatchObject({ ok: false });
  });
  it("NCM formatado", () => {
    expect(formatarNcm("84713012")).toBe("8471.30.12");
    expect(formatarNcm("")).toBe("");
  });
});
