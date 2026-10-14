import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (13/10/2026): as telas de uma empresa por vez escolhem a
// empresa por `escolherEmpresaDaTela` — URL, última aberta, única da lista ou
// "escolha" — e nunca voltam a cair na primeira da lista em ordem alfabética,
// que era como se gravava na empresa errada.

const raiz = path.resolve(__dirname, "../../..");
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

const TELAS_DE_UMA_EMPRESA = [
  "src/app/(app)/lancamentos/page.tsx",
  "src/app/(app)/conciliacao/page.tsx",
  "src/app/(app)/cadastros-financeiros/page.tsx",
  "src/app/(app)/dre/page.tsx",
  "src/app/(app)/dre/economica/page.tsx",
  "src/app/(app)/dre/analises/page.tsx",
  "src/app/(app)/dre/orcamento/page.tsx",
  "src/app/(app)/emitir-nfse/page.tsx",
];

describe("telas de uma empresa por vez", () => {
  for (const tela of TELAS_DE_UMA_EMPRESA) {
    it(`${tela}: escolhe pela regra comum e não abre na primeira da lista`, () => {
      const fonte = ler(tela);
      expect(fonte).toContain("escolherEmpresaDaTela(");
      expect(fonte).not.toMatch(/empresas\[0\]/);
      // Pede a empresa quando não há escolha, em vez de inventar uma.
      expect(fonte).toContain("<EscolhaAEmpresa");
      // E diz, ao lado do botão de gravar, em que empresa o registro cai.
      expect(fonte).toContain("<EmpresaDaTela");
    });
  }
});

// As telas pesadas consultam com a empresa escolhida — o tenant inteiro só com
// "Todas as empresas" pedido, e só onde a lista tem teto. A regra do escopo
// está testada em `escopoDaEscolha.test.ts`; aqui, que as telas passam por ela.
describe("telas pesadas", () => {
  it("Contas a pagar e a receber: escolhem a empresa antes de consultar, com 'todas' explícito", () => {
    const fonte = ler("src/components/financeiro/ContasPage.tsx");
    expect(fonte).toContain("escolherEmpresaDaTela(");
    expect(fonte).toContain('escolha.tipo === "escolher"');
    // A empresa da consulta é a da escolha, não o parâmetro cru da URL.
    expect(fonte).not.toContain("empresaId: params.empresa");
    expect(fonte).toContain("empresaId: empresaId ?? undefined");
  });

  it("Fluxo de caixa: o realizado e a projeção só com uma empresa", () => {
    const fonte = ler("src/app/(app)/fluxo-de-caixa/page.tsx");
    expect(fonte).toContain("escopoFinanceiroDaEscolha(ctx.tenantId, escolha)");
    expect(fonte).not.toMatch(/companyIds: empresaId \? \[empresaId\] : null/);
  });

  it("Cobrança: fila e acordos pelo escopo da escolha", () => {
    const fonte = ler("src/app/(app)/cobranca/page.tsx");
    expect(fonte).toContain("escopoFinanceiroDaEscolha(");
    expect(fonte).toContain("listarAcordos(escopo,");
  });

  it("Documentos fiscais: o alcance é sempre a empresa escolhida, nunca o tenant", () => {
    const fonte = ler("src/app/(app)/documentos-fiscais/page.tsx");
    expect(fonte).toContain("alcanceFiscalDaEscolha(");
    expect(fonte).not.toContain("alcanceDaEquipe(");
  });
});
