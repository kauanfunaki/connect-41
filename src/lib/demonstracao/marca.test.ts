import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { MARCA_DA_DEMONSTRACAO, SO_EMPRESA_DE_VERDADE, ehEmpresaDeDemonstracao } from "./marca";

describe("marca da demonstração", () => {
  it("empresa de demonstração é a que começa com [demo]", () => {
    expect(ehEmpresaDeDemonstracao("[demo] Padaria Pão de Ouro Ltda")).toBe(true);
    expect(ehEmpresaDeDemonstracao("PADARIA PÃO DE OURO LTDA")).toBe(false);
    expect(ehEmpresaDeDemonstracao("Padaria [demo]")).toBe(false);
  });

  it("o filtro do Prisma tira só as [demo]", () => {
    expect(SO_EMPRESA_DE_VERDADE).toEqual({ NOT: { name: { startsWith: MARCA_DA_DEMONSTRACAO } } });
  });
});

// Os avisos automáticos que olham dado de empresa precisam deixar a
// demonstração de fora: a conta fictícia que vence hoje viraria push para o
// setor de verdade. Este teste lê o código — se alguém reescrever um desses
// avisos sem o filtro, ele acusa.

const raiz = process.cwd();
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

/** O corpo de `async function <nome>(` até a próxima função do arquivo. */
function corpo(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`async function ${nome}(`);
  expect(inicio, nome).toBeGreaterThanOrEqual(0);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(/\n(export )?async function /);
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe("os avisos automáticos deixam a demonstração de fora", () => {
  const alertas = ler("src/lib/alerts.ts");

  for (const nome of ["checkContasAPagar", "checkPendenciasVencidas", "checkSolicitacoesNoPrazo", "checkOrcamentoEstourado"]) {
    it(`${nome} filtra as empresas [demo]`, () => {
      expect(corpo(alertas, nome)).toContain("company: SO_EMPRESA_DE_VERDADE");
    });
  }

  it("checkItensDaGestao pula card, pendência e solicitação das empresas [demo]", () => {
    expect(corpo(alertas, "checkItensDaGestao")).toContain("daDemonstracao.has(item.empresaId)");
  });

  it("o lembrete de pendência por e-mail filtra as empresas [demo]", () => {
    expect(corpo(ler("src/lib/financeiro/pendencias/executarLembretes.ts"), "buscarPagina")).toContain("company: SO_EMPRESA_DE_VERDADE");
  });
});
