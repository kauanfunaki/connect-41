import { describe, expect, it } from "vitest";
import { ajusteDoMotor, arquivoDoMotor, corpoDeExecucao, empresaDoMotor, errosDaValidacao, execucaoDoMotor, linhasDosTotais, situacaoDoArquivo } from "./doMotor";
import { cenarioSchema } from "./cenario";
import { parametrosExecucaoSchema, parametrosIniciais } from "./execucao";
import type { ArquivoDoMotor, ExecucaoDoMotor } from "@/lib/sped/motor";

const EXECUCAO: ExecucaoDoMotor = {
  id: 812, acao: "sped", rotulo: "gerar EFD ICMS/IPI", empresa_id: 3, cnpj: "17122471001147", competencia: "2026-09",
  data_ini: "2026-09-01", data_fim: "2026-09-30",
  parametros: { saida: "saida_sped.txt", sem_entradas: false, forcar_com_erros: true, forcar_cobertura: false, retificadora: true },
  estado: "pendente", solicitado_por: "Kátia", solicitado_em: "2026-10-22T13:00:00+00:00", agente_host: null, pid: null,
  iniciado_em: null, concluido_em: null, batida_em: null, codigo_saida: null, mensagem: null,
  travada: false, pode_cancelar: true, pode_destravar: false, arquivo_ids: [301, 302],
};
const ARQUIVO: ArquivoDoMotor = {
  id: 301, obrigacao: "icms_ipi", cnpj: "17122471001147", empresa_id: 3, competencia: "2026-09", data_ini: "2026-09-01", data_fim: "2026-09-30",
  versao: 4, considerado: true, superado_por: null, gerado_em: "2026-10-22T13:20:00+00:00", qtd_linhas: 10, tamanho_bytes: 100, retificadora: false,
  qtd_cte: 1, qtd_nfe: 2, qtd_erros_cte: 0, nome_arquivo: "icms_ipi_17122471001147_2026-09_v4.txt", execucao_id: 812,
  validacao: { estado: "ok", id: 77, erros: 0, advertencias: 3, iniciado_em: null, concluido_em: null },
  entrega: { estado: "registrada", origem: "nosso", tipo: "original", recibo: "12.34", data_entrega: "2026-10-15" },
  decisao_ate: 10233, defasado: false, defasado_fonte: "registro", decisoes_posteriores: 0,
};

describe("execução do motor → prévia", () => {
  it("segue a tabela do §8.3 e cabe no esquema da prévia", () => {
    const e = execucaoDoMotor(EXECUCAO, "company-1");
    expect(e).toMatchObject({ id: "812", estado: "Na fila", contexto: { empresaId: "company-1", estabelecimentoId: "3", competencia: "2026-09" }, arquivoIds: ["301", "302"], log: [] });
    expect(e.parametros).toMatchObject({ modo: "sped", tipoSped: "1", saida: "saida_sped.txt", forcarErros: true, solicitante: "Kátia", instancias: 1, workers: 1, etapas: [] });
    expect(e).not.toHaveProperty("iniciadoEm");
    expect(e).not.toHaveProperty("tentativaDe");
    expect(e).not.toHaveProperty("documentos");
    expect(cenarioSchema.shape.execucoes.element.safeParse(e).success).toBe(true);
  });
  it("sem competência usa o mês do início; ação desconhecida não inventa parâmetros", () => {
    const e = execucaoDoMotor({ ...EXECUCAO, acao: "outra", competencia: null, data_ini: "2026-08-15" }, "c");
    expect(e.contexto.competencia).toBe("2026-08");
    expect(e.parametros).toBeUndefined();
  });
});

describe("arquivo do motor → prévia", () => {
  it("mapeia validação, entrega e tipo", () => {
    const a = arquivoDoMotor(ARQUIVO, "c");
    expect(a).toMatchObject({ id: "301", tipo: "ICMS/IPI", versao: 4, nome: ARQUIVO.nome_arquivo, revisao: "10233", validacao: "Aprovado", entregue: true, protocolo: "12.34", dominio: false, tipoSped: "0", execucaoId: "812" });
    expect(a).not.toHaveProperty("resumo");
    expect(cenarioSchema.shape.arquivos.element.safeParse(a).success).toBe(true);
    expect(arquivoDoMotor({ ...ARQUIVO, validacao: { ...ARQUIVO.validacao, erros: 2 } }, "c").validacao).toBe("Com pendências");
    expect(arquivoDoMotor({ ...ARQUIVO, validacao: { ...ARQUIVO.validacao, estado: "validando" } }, "c").validacao).toBe("Não validado");
    expect(arquivoDoMotor({ ...ARQUIVO, retificadora: null }, "c")).not.toHaveProperty("tipoSped");
  });
  it("defasado substitui o precisaRevisar, e o legado diz que é estimativa", () => {
    expect(situacaoDoArquivo({ ...ARQUIVO, defasado: true })).toBe("Revisão necessária");
    expect(situacaoDoArquivo({ ...ARQUIVO, defasado: true, defasado_fonte: "legado" })).toBe("Revisão necessária (estimativa)");
    expect(situacaoDoArquivo(ARQUIVO)).toBe("Entregue");
  });
  it("só os achados de erro, até 20, com o registro", () => {
    const achados = [
      { severidade: "erro", mensagem: "Campo obrigatório", registro: "C100", linha: 12 },
      { severidade: "advertencia", mensagem: "Aviso" },
      ...Array.from({ length: 30 }, (_, i) => ({ severidade: "ERRO", descricao: `e${i}` })),
    ];
    const erros = errosDaValidacao({ estado: "ok", achados, iniciado_em: null, concluido_em: null });
    expect(erros).toHaveLength(20);
    expect(erros[0]).toBe("C100 (linha 12): Campo obrigatório");
  });
  it("achata os totais com os nomes do motor", () => {
    expect(linhasDosTotais({ documentos: { cte: 3 }, e110: { VL_TOT_DEBITOS: "10.00" } })).toEqual([{ campo: "documentos · cte", valor: "3" }, { campo: "e110 · VL_TOT_DEBITOS", valor: "10.00" }]);
    expect(linhasDosTotais(null)).toEqual([]);
  });
});

describe("empresa e ajustes", () => {
  it("empresa vem da Company; regime sem fonte vira —", () => {
    const e = empresaDoMotor({ id: "c1", nome: "BLD", cnpj: "17122471000175", regime: null }, [{ id: 3, cnpj: "17122471001147", rotulo: "11 - BLD - SP", uf: "SP" } as never]);
    expect(e).toEqual({ id: "c1", nome: "BLD", regime: "—", estabelecimentos: [{ id: "3", nome: "11 - BLD - SP", uf: "SP", cnpj: "17122471001147" }] });
  });
  it("ajustes: natureza no ICMS, operação no Contribuições; valor só para exibir", () => {
    expect(ajusteDoMotor("ajuste_apuracao", { chave: { id: 9 }, valor: { codigo: "SP020", descricao: "x", valor: "12.50", competencia: "2026-09", cnpj_empresa: "1" }, natureza: "estorno", decidido_por: null, atualizado_em: null }, "c"))
      .toMatchObject({ id: "9", imposto: "ICMS/IPI", codigo: "SP020", valor: 12.5, efeito: "Crédito", obrigacao: "EFD ICMS/IPI" });
    expect(ajusteDoMotor("ajuste_contribuicoes", { chave: { id: 2 }, valor: { cod_aj: "01", operacao: "contribuicao", valor: "1.00" }, decidido_por: null, atualizado_em: null }, "c"))
      .toMatchObject({ codigo: "01", efeito: "Débito", obrigacao: "EFD Contribuições" });
  });
});

describe("prévia → corpo de POST /execucoes", () => {
  it("geração ICMS/IPI: mês fechado vira competência; só as chaves da ação; sem solicitante", () => {
    const p = parametrosExecucaoSchema.parse({ ...parametrosIniciais("2026-09", "sped"), tipoSped: "1", solicitante: "Fulano", forcarErros: true });
    expect(corpoDeExecucao(p, 3)).toEqual({ acao: "sped", empresa_id: 3, competencia: "2026-09", tipo_sped: "1", parametros: { saida: "saida_sped.txt", forcar_com_erros: true, forcar_cobertura: false }, confirmar_duplicado: false });
  });
  it("Contribuições não manda parâmetros; extração com período quebrado manda as datas", () => {
    const c = parametrosExecucaoSchema.parse({ ...parametrosIniciais("2026-09", "sped_contribuicoes"), tipoSped: "0" });
    expect(corpoDeExecucao(c, 1, true)).toMatchObject({ acao: "sped_contribuicoes", parametros: {}, confirmar_duplicado: true });
    const x = parametrosExecucaoSchema.parse({ ...parametrosIniciais("2026-09", "paralela"), dataIni: "2026-09-05" });
    const corpo = corpoDeExecucao(x, 3);
    expect(corpo).toMatchObject({ acao: "paralela", data_ini: "2026-09-05", data_fim: "2026-09-30", parametros: { instancias: 4, workers: 32, step_types: ["first_mile", "last_mile"], sem_entradas: false } });
    expect(corpo).not.toHaveProperty("competencia");
    expect(corpo).not.toHaveProperty("tipo_sped");
    expect(corpoDeExecucao(parametrosExecucaoSchema.parse(parametrosIniciais("2026-09", "simples")), 3).parametros).not.toHaveProperty("instancias");
  });
});
