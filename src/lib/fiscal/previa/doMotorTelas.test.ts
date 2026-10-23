import { describe, expect, it } from "vitest";
import * as F from "@/lib/sped/telasDoMotor.fixtures";
import { importacaoSchema, itemDoConfrontoSchema } from "@/lib/sped/telasDoMotor";
import { cenarioSchema } from "./cenario";
import { aliquotasDaPrevia, colunasPresentes, confrontoDoMotor, documentoDoAcervo, importacaoDoMotor, importacaoNaCompetencia, numeroDoMotor, seloDoConfronto, tomDoSemaforo } from "./doMotor";

describe("adaptadores de §11 para o modelo da prévia", () => {
  it("números: string decimal vira número só para exibir; null continua null", () => {
    expect(numeroDoMotor("-12.34")).toBe(-12.34);
    expect(numeroDoMotor(null)).toBeNull();
    expect(numeroDoMotor("")).toBeNull();
    expect(numeroDoMotor("abc")).toBeNull();
  });

  it("importação (§11.1.1): aceitos = CT-e + NF-e gravados, da raiz, na competência quando por_competencia tem a chave", () => {
    const i = importacaoSchema.parse({ ...F.IMPORTACAO, gravados_cte: 5 });
    const p = importacaoDoMotor(i, "company-1", "2026-09");
    expect(p).toEqual({ id: "812", contexto: { empresaId: "company-1", estabelecimentoId: "", competencia: "2026-09" }, criadoEm: F.IMPORTACAO.iniciado_em, aceitos: 835, rejeitados: 58, origem: "pasta_fiscal" });
    expect(cenarioSchema.shape.importacoes.element.safeParse(p).success).toBe(true);
    expect(importacaoNaCompetencia(i, "2026-09")).toBe(true);
    expect(importacaoNaCompetencia(i, "2026-08")).toBe(false);
  });

  it("confronto (§11.4.4): sem_nota → Sem nota, achado/com_nota → Conciliado, possível duplicidade sem equivalente e com selo próprio", () => {
    const [sem, dup] = F.CONFRONTO.itens.map((c) => itemDoConfrontoSchema.parse(c));
    const p = confrontoDoMotor(sem, "company-1");
    expect(p).toEqual({ id: "1", contexto: { empresaId: "company-1", estabelecimentoId: "", competencia: "2026-09" }, documentoId: "", estado: "Sem nota", valor: 500 });
    expect(cenarioSchema.shape.confrontos.element.safeParse(p).success).toBe(true);
    expect(confrontoDoMotor({ ...sem, situacao: "achado" }, "c")?.estado).toBe("Conciliado");
    expect(confrontoDoMotor({ ...sem, situacao: "com_nota" }, "c")?.estado).toBe("Conciliado");
    expect(confrontoDoMotor(dup, "c")).toBeNull();
    expect(seloDoConfronto("possivel_duplicidade")).toEqual({ rotulo: "Possível duplicidade", tom: "perigo" });
    expect(seloDoConfronto("sem_nota", { sem_nota: "Pagamento sem nota" })).toEqual({ rotulo: "Pagamento sem nota", tom: "atencao" });
  });

  it("acervo (§11.1): sentido pelo CNPJ do estabelecimento, participante do outro lado, valor nulo continua nulo", () => {
    const base = { id: "d", type: "NFCE" as const, number: "9", issuerName: "Loja", issuerDocument: "17122471001147", recipientName: null, recipientDocument: null, amount: null, renderizavel: false, issuedAt: new Date() };
    const saida = documentoDoAcervo(base, "17.122.471/0011-47");
    expect([saida.tipo, saida.sentido, saida.participante, saida.valor, saida.xml]).toEqual(["NFC-e", "Saída", "—", null, false]);
    const entrada = documentoDoAcervo({ ...base, issuerDocument: "1", recipientDocument: "17122471001147", amount: { toString: () => "10.50" } }, "17122471001147");
    expect([entrada.sentido, entrada.participante, entrada.valor]).toEqual(["Entrada", "Loja", 10.5]);
    // As duas pontas (transferência) ou nenhuma: indefinido.
    expect(documentoDoAcervo({ ...base, recipientDocument: "17122471001147" }, "17122471001147").sentido).toBeNull();
    expect(documentoDoAcervo({ ...base, issuerDocument: "2" }, "17122471001147").sentido).toBeNull();
    // As colunas sem fonte por documento não existem no objeto.
    expect(Object.keys(saida)).not.toEqual(expect.arrayContaining(["cfop"]));
  });

  it("alíquotas da prévia: só PIS+COFINS combinados", () => {
    expect(aliquotasDaPrevia({ aliquotas: { cheia: "9.2500", presumida: null } })).toEqual({ pisCofinsCheia: 9.25, pisCofinsPresumida: null });
  });

  it("semáforo e colunas sem forma fixa", () => {
    expect([tomDoSemaforo("verde"), tomDoSemaforo("amarelo"), tomDoSemaforo("vermelho"), tomDoSemaforo(null)]).toEqual(["sucesso", "atencao", "perigo", "neutro"]);
    expect(colunasPresentes([{ b: 1, a: 2 }, { c: 3 }], ["c", "x", "a"])).toEqual(["c", "a", "b"]);
  });
});
