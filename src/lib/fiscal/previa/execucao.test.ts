import { describe, expect, it } from "vitest";
import { criarCenario, documentosDoContexto, executarAcao, lerCenario, precisaRevisar, textoDoArquivoTeste, type AcaoFiscal, type Cenario } from "./cenario";
import { parametrosExecucaoSchema, parametrosIniciais, type ParametrosExecucao } from "./execucao";

function agir(s: Cenario, acao: AcaoFiscal, id = "acao", hora = "2026-10-20T12:00:00Z") {
  return executarAcao(s, acao, s.contexto, hora, id);
}
function solicitar(p: ParametrosExecucao, s = criarCenario()) {
  const resposta = agir(s, { tipo: "solicitar-execucao", parametros: p }, "pedido");
  expect(resposta.erro).toBeUndefined();
  return resposta.cenario;
}
function concluir(s: Cenario, id = "pedido") {
  s = agir(s, { tipo: "iniciar-execucao", id }, "inicio").cenario;
  return agir(s, { tipo: "concluir-execucao", id }, "fim", "2026-10-20T12:01:00Z").cenario;
}

describe("formulários e transições de execução simulada", () => {
  it.each([
    { dataIni: "2026-10-32" }, { dataIni: "2026-10-20", dataFim: "2026-10-10" },
    { workers: 65 }, { instancias: 17 }, { etapas: [] }, { saida: "../saida.txt" },
  ])("rejeita parâmetros inválidos: %j", (invalido) => {
    expect(parametrosExecucaoSchema.safeParse({ ...parametrosIniciais("2026-10"), ...invalido }).success).toBe(false);
  });
  it("exige escolha do tipo e mês inteiro na geração", () => {
    const p = parametrosIniciais("2026-10", "sped");
    expect(parametrosExecucaoSchema.safeParse(p).success).toBe(false);
    expect(parametrosExecucaoSchema.safeParse({ ...p, tipoSped: "0", dataFim: "2026-10-20" }).success).toBe(false);
    expect(parametrosExecucaoSchema.safeParse({ ...p, tipoSped: "0" }).success).toBe(true);
    expect(parametrosExecucaoSchema.safeParse({ ...p, tipoSped: "1", modo: "sped_contribuicoes", saida: "", forcarErros: true }).success).toBe(false);
  });
  it("registra parâmetros, espera início e importa somente ao concluir", () => {
    let s = solicitar(parametrosIniciais("2026-10"));
    const antes = s.documentos.length;
    expect(agir(s, { tipo: "concluir-execucao", id: "pedido" }).erro).toBe(true);
    expect(agir(s, { tipo: "processar", id: "pedido" }).erro).toBe(true);
    expect(agir(s, { tipo: "solicitar-execucao", parametros: parametrosIniciais("2026-10") }).erro).toBe(true);
    s = concluir(s);
    expect(s.documentos.length).toBeGreaterThan(antes);
    expect(s.execucoes[0]).toMatchObject({ estado: "Concluída", iniciadoEm: "2026-10-20T12:00:00Z", concluidoEm: "2026-10-20T12:01:00Z" });
    expect(s.arquivos).toHaveLength(3);
    expect(agir(s, { tipo: "concluir-execucao", id: "pedido" }).erro).toBe(true);
    expect(lerCenario(JSON.stringify(s))).toEqual(s);
  });
  it("preserva erro e cria uma única nova tentativa pendente", () => {
    let s = solicitar(parametrosIniciais("2026-10"));
    s = agir(s, { tipo: "iniciar-execucao", id: "pedido" }).cenario;
    s = agir(s, { tipo: "falhar-execucao", id: "pedido" }).cenario;
    const falha = structuredClone(s.execucoes[0]);
    s = agir(s, { tipo: "reprocessar", id: "pedido" }, "tentativa").cenario;
    expect(s.execucoes.find((e) => e.id === "pedido")).toEqual(falha);
    expect(s.execucoes[0]).toMatchObject({ id: "tentativa", tentativaDe: "pedido", estado: "Na fila" });
    expect(agir(s, { tipo: "reprocessar", id: "pedido" }, "duplicada").erro).toBe(true);
    s = concluir(s, "tentativa");
    expect(s.execucoes[0].estado).toBe("Concluída");
    expect(lerCenario(JSON.stringify(s))).toEqual(s);
  });
  it("cancelar preserva documentos e impede início ou conclusão posteriores", () => {
    let s = solicitar(parametrosIniciais("2026-10"));
    const docs = structuredClone(s.documentos);
    s = agir(s, { tipo: "cancelar", id: "pedido" }).cenario;
    expect(s.documentos).toEqual(docs);
    expect(agir(s, { tipo: "iniciar-execucao", id: "pedido" }).erro).toBe(true);
  });
  it("retentar erros recupera somente a quarentena no escopo", () => {
    const s = concluir(solicitar(parametrosIniciais("2026-10", "erros")));
    expect(documentosDoContexto(s).some((d) => d.estado === "Rejeitado")).toBe(false);
    expect(s.documentos.some((d) => d.estabelecimentoId !== s.contexto.estabelecimentoId && d.estado === "Rejeitado")).toBe(true);
  });
  it("pular entradas não adiciona documentos de entrada", () => {
    const inicial = criarCenario();
    const ids = new Set(inicial.documentos.map((d) => d.id));
    const s = concluir(solicitar({ ...parametrosIniciais("2026-10"), semEntradas: true }, inicial));
    expect(s.documentos.filter((d) => !ids.has(d.id)).every((d) => d.sentido !== "Entrada")).toBe(true);
  });
  it("gera por filial e por raiz, preservando versões e o resumo histórico", () => {
    let s = criarCenario();
    s.contexto.estabelecimentoId = "";
    for (const d of documentosDoContexto(s)) { d.estado = "Classificado"; d.motivo = ""; }
    for (const p of s.periodos) if (p.competencia === "2026-10") { p.apurado = true; p.fechado = true; }
    s = concluir(solicitar({ ...parametrosIniciais("2026-10", "sped"), tipoSped: "0" }, s));
    expect(s.execucoes[0].arquivoIds).toHaveLength(2);
    const gerado = s.arquivos[0];
    expect(gerado.resumo).toBeDefined();
    const resumo = structuredClone(gerado.resumo);
    s = agir(s, { tipo: "classificar", ids: [documentosDoContexto(s, gerado.contexto)[0].id], destino: "Uso", credito: false, cst: "90" }).cenario;
    expect(s.arquivos.find((a) => a.id === gerado.id)?.resumo).toEqual(resumo);
    expect(precisaRevisar(s, gerado)).toBe(true);
    s.contexto.estabelecimentoId = "aurora-pr";
    s = agir(s, { tipo: "solicitar-execucao", parametros: { ...parametrosIniciais("2026-10", "sped_contribuicoes"), tipoSped: "1" } }, "raiz").cenario;
    s = concluir(s, "raiz");
    expect(s.execucoes[0].arquivoIds).toHaveLength(1);
    expect(s.arquivos[0]).toMatchObject({ tipo: "Contribuições", contexto: { estabelecimentoId: "" }, tipoSped: "1", execucaoId: "raiz" });
    expect(textoDoArquivoTeste(s.arquivos[0])).toContain("SEM VALIDADE FISCAL");
    expect(lerCenario(JSON.stringify(s))).toEqual(s);
  });
  it("bloqueia geração com quarentena, sem publicar um artefato", () => {
    const s = concluir(solicitar({ ...parametrosIniciais("2026-10", "sped"), tipoSped: "0" }));
    expect(s.execucoes[0].estado).toBe("Erro");
    expect(s.execucoes[0].arquivoIds).toBeUndefined();
    expect(s.arquivos).toHaveLength(3);
  });
  it("recusa IDs fora da empresa e conserva registros legados sem metadados", () => {
    let s = solicitar(parametrosIniciais("2026-10"));
    s = agir(s, { tipo: "contexto", contexto: { empresaId: "rota", estabelecimentoId: "rota-rs", competencia: "2026-10" } }).cenario;
    expect(agir(s, { tipo: "iniciar-execucao", id: "pedido" }).erro).toBe(true);
    const legado = criarCenario();
    expect(lerCenario(JSON.stringify(legado))).toEqual(legado);
    expect(legado.arquivos[0].resumo).toBeUndefined();
  });
});
