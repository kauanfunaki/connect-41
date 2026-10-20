import { describe, expect, it } from "vitest";
import { agruparModulos, getModuleDef, MODULE_ROUTES } from "@/lib/module-catalog";
import { alcancaModulo } from "@/lib/auth/modulo";
import { criarCenario, executarAcao, documentosDoContexto, chaveDoCenario, lerCenario, precisaRevisar, totaisDoContexto, PAGINAS_FISCAIS, type AcaoFiscal, type Cenario } from "./cenario";

function agir(s: Cenario, acao: AcaoFiscal, id = `acao-${s.atividades.length}-${s.arquivos.length}`) {
  return executarAcao(s, acao, s.contexto, "2026-10-13T12:00:00.000Z", id);
}
function preparar(s: Cenario) {
  for (const d of documentosDoContexto(s).filter((d) => d.estado === "Rejeitado")) s = agir(s, { tipo: "recuperar", id: d.id }).cenario;
  s = agir(s, { tipo: "classificar", ids: documentosDoContexto(s).map((d) => d.id), destino: "Revenda", credito: true, cst: "00" }).cenario;
  s = agir(s, { tipo: "apurar" }).cenario;
  return agir(s, { tipo: "fechar" }).cenario;
}

describe("cenário fiscal exclusivamente local", () => {
  it("concentra parâmetros na configuração e começa contribuições no fechamento", () => {
    expect(PAGINAS_FISCAIS.filter((p) => p.abas.some(([aba]) => aba === "parametros")).map((p) => p.pagina)).toEqual(["configuracoes"]);
    expect(PAGINAS_FISCAIS.find((p) => p.pagina === "contribuicoes")?.abas[0][0]).toBe("fechamento");
  });
  it("fornece três empresas, filiais, duas competências e cenários independentes", () => {
    const s = criarCenario();
    expect(s.empresas).toHaveLength(3);
    expect(new Set(s.documentos.map((d) => d.competencia)).size).toBe(2);
    expect(documentosDoContexto(s)).toHaveLength(10);
    expect(totaisDoContexto(s)).toMatchObject({ pendentes: 3, rejeitados: 1 });
    expect(lerCenario(JSON.stringify(s))).toEqual(s);
  });
  it("percorre importação, recuperação, classificação, apuração, geração, validação e entrega", () => {
    let s = agir(criarCenario(), { tipo: "importar", origem: "Lote XML" }).cenario;
    expect(documentosDoContexto(s)).toHaveLength(15);
    expect(s.importacoes[0]).toMatchObject({ aceitos: 4, rejeitados: 1 });
    s = preparar(s);
    expect(totaisDoContexto(s)).toMatchObject({ pendentes: 0, rejeitados: 0 });
    s = agir(s, { tipo: "gerar", imposto: "Contribuições" }).cenario;
    const id = s.arquivos[0].id;
    s = agir(s, { tipo: "validar", id }).cenario;
    expect(s.arquivos[0].validacao).toBe("Aprovado");
    s = agir(s, { tipo: "entregar", id }, "recibo-teste").cenario;
    expect(s.arquivos[0]).toMatchObject({ entregue: true, protocolo: "TESTE-RECIBO-T" });
    expect(s.execucoes[0].estado).toBe("Concluída");
    expect(lerCenario(JSON.stringify(s))).toEqual(s);
  });
  it("preserva outros estabelecimentos e competências ao importar e decidir", () => {
    const inicial = criarCenario();
    const outros = inicial.documentos.filter((d) => d.estabelecimentoId !== inicial.contexto.estabelecimentoId || d.competencia !== inicial.contexto.competencia);
    let s = agir(inicial, { tipo: "importar", origem: "Lote de contratos e recibos" }).cenario;
    expect(s.documentos.filter((d) => d.id.includes("acao-")).every((d) => ["Contrato", "Recibo", "RPA", "Fatura"].includes(d.tipo))).toBe(true);
    s = agir(s, { tipo: "classificar", ids: [outros[0].id], destino: "Insumo", credito: false, cst: "90" }).cenario;
    expect(s.documentos.filter((d) => outros.some((o) => o.id === d.id))).toEqual(outros);
    expect(inicial.documentos).toHaveLength(100);
  });
  it("sinaliza arquivos afetados para revisão e mantém o histórico da entrega", () => {
    let s = preparar(criarCenario());
    s = agir(s, { tipo: "gerar", imposto: "ICMS/IPI" }).cenario;
    const arquivo = s.arquivos[0];
    s = agir(s, { tipo: "validar", id: arquivo.id }).cenario;
    s = agir(s, { tipo: "entregar", id: arquivo.id }).cenario;
    const historicoDeOutroMes = s.arquivos.find((a) => a.contexto.competencia === "2026-09")!;
    s = agir(s, { tipo: "classificar", ids: [documentosDoContexto(s)[0].id], destino: "Uso e consumo", credito: false, cst: "90" }).cenario;
    expect(precisaRevisar(s, arquivo)).toBe(true);
    expect(precisaRevisar(s, historicoDeOutroMes)).toBe(false);
    expect(s.arquivos.find((a) => a.id === arquivo.id)?.entregue).toBe(true);
    expect(agir(s, { tipo: "validar", id: arquivo.id }).erro).toBe(true);
    s = agir(s, { tipo: "gerar", imposto: "ICMS/IPI" }).cenario;
    expect(s.arquivos[0].versao).toBe(3);
    expect(precisaRevisar(s, s.arquivos[0])).toBe(false);
  });
  it("bloqueia fechamento e entrega incompletos e detalha falhas de validação", () => {
    let s = criarCenario();
    expect(agir(s, { tipo: "apurar" }).erro).toBe(true);
    expect(agir(s, { tipo: "fechar" }).erro).toBe(true);
    expect(agir(s, { tipo: "entregar", id: s.arquivos[0].id }).erro).toBe(true);
    s = agir(s, { tipo: "validar", id: s.arquivos[0].id }).cenario;
    expect(s.arquivos[0].validacao).toBe("Com pendências");
    expect(s.arquivos[0].erros.length).toBeGreaterThan(0);
    s = agir(s, { tipo: "contexto", contexto: { ...s.contexto, competencia: "2026-09" } }).cenario;
    expect(agir(s, { tipo: "validar", id: s.arquivos.find((a) => a.contexto.competencia === "2026-10")!.id }).erro).toBe(true);
  });
  it("processa fila, cancela e recupera erro com artefato rastreável", () => {
    let s = agir(criarCenario(), { tipo: "enfileirar", imposto: "Contribuições", falhar: true }, "fila").cenario;
    expect(s.execucoes[0].estado).toBe("Na fila");
    s = agir(s, { tipo: "processar", id: "fila" }).cenario;
    expect(s.execucoes[0].estado).toBe("Erro");
    s = agir(s, { tipo: "reprocessar", id: "fila" }).cenario;
    expect(s.execucoes[0].estado).toBe("Na fila");
    expect(s.execucoes.find((e) => e.id === "fila")?.estado).toBe("Erro");
    s = agir(s, { tipo: "processar", id: s.execucoes[0].id }).cenario;
    expect(s.execucoes[0].estado).toBe("Concluída");
    expect(s.arquivos[0].tipo).toBe("Contribuições");
    s = agir(s, { tipo: "enfileirar", imposto: "ICMS/IPI", falhar: false }, "cancelar").cenario;
    s = agir(s, { tipo: "cancelar", id: "cancelar" }).cenario;
    expect(s.execucoes[0].estado).toBe("Cancelada");
    expect(agir(s, { tipo: "processar", id: "cancelar" }).erro).toBe(true);
  });
  it("mantém parâmetros por empresa, ajustes por filial e regras compartilhadas", () => {
    let s = criarCenario();
    s = agir(s, { tipo: "parametros", parametros: { icms: 10, ipi: 0, pis: 1, cofins: 2 } }).cenario;
    expect(s.parametros.aurora.icms).toBe(10);
    expect(s.parametros.rota.icms).toBe(18);
    s = agir(s, { tipo: "ajuste", imposto: "ICMS/IPI", codigo: "TESTE", descricao: "Crédito fictício", valor: 100, efeito: "Crédito", obrigacao: "E111" }).cenario;
    expect(s.ajustes).toHaveLength(1);
    expect(totaisDoContexto(s).icms).toBeCloseTo((28500 - 14230) * 0.1 - 100);
    expect(agir(s, { tipo: "ajuste", imposto: "ICMS/IPI", codigo: "", descricao: "", valor: -1, efeito: "Crédito", obrigacao: "E111" }).erro).toBe(true);
    s = agir(s, { tipo: "regra", regra: { ...s.regras[0], fonte: "Fonte de teste atualizada" } }).cenario;
    expect(s.periodos.every((p) => !p.apurado && !p.fechado)).toBe(true);
  });
  it("concilia somente pagamentos do escopo e restaura confrontos sem duplicar", () => {
    let s = agir(criarCenario(), { tipo: "confrontar" }).cenario;
    expect(s.confrontos).toHaveLength(4);
    s = agir(s, { tipo: "conciliar", id: s.confrontos[0].id }).cenario;
    expect(s.confrontos[0].estado).toBe("Conciliado");
    s = agir(s, { tipo: "confrontar" }).cenario;
    expect(s.confrontos).toHaveLength(4);
  });
  it("isola a chave por usuário/escritório e rejeita armazenamento inválido", () => {
    expect(chaveDoCenario("a", "u1")).not.toBe(chaveDoCenario("a", "u2"));
    expect(chaveDoCenario("a", "u1")).not.toBe(chaveDoCenario("b", "u1"));
    expect(lerCenario("{quebrado")).toBeNull();
    expect(lerCenario(JSON.stringify({ ...criarCenario(), versao: 2 }))).toBeNull();
    expect(lerCenario(JSON.stringify({ ...criarCenario(), parametros: {} }))).toBeNull();
    expect(lerCenario(JSON.stringify({ ...criarCenario(), periodos: [] }))).toBeNull();
    expect(lerCenario(JSON.stringify({ ...criarCenario(), contexto: { empresaId: "desconhecido", estabelecimentoId: "", competencia: "2026-10" } }))).toBeNull();
    expect(criarCenario()).toEqual(criarCenario());
  });
});

describe("acessos da prévia fiscal", () => {
  it("registra as nove páginas em cinco grupos e preserva o acervo integrado", () => {
    const modulos = PAGINAS_FISCAIS.map((p) => getModuleDef(p.modulo)!);
    expect(modulos.every((m) => m.sectorCode === "fiscal" && m.defaultEnabled)).toBe(true);
    expect(agruparModulos(modulos).map((g) => g.grupo)).toEqual(["Operação", "Documentos", "Apuração", "Conferência", "Cadastros"]);
    PAGINAS_FISCAIS.forEach((p) => expect(MODULE_ROUTES[p.modulo]).toBe(p.caminho));
    expect(MODULE_ROUTES.fiscal_documentos).toBe("/documentos-fiscais");
    expect(getModuleDef("fiscal_documentos")?.defaultEnabled).toBe(false);
  });
  it("respeita o módulo desligado e o setor permitido", () => {
    const ctx: Parameters<typeof alcancaModulo>[0] = { tenantId: "teste", homeTenantId: "teste", userId: "teste", role: "SECTOR_USER", sectors: ["fiscal"], subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null };
    expect(alcancaModulo(ctx, "fiscal", false, "ver")).toBe(false);
    expect(alcancaModulo(ctx, "fiscal", true, "ver")).toBe(true);
    expect(alcancaModulo(ctx, "bpo", true, "ver")).toBe(false);
  });
});
