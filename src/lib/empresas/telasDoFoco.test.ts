import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (21/10/2026): uma empresa por vez no BPO. Toda tela do
// foco escolhe a empresa com `comFoco` e passa o foco à fileira da empresa;
// toda action que grava dinheiro nelas passa pela trava (`recusaDoFoco`, ou
// `motivoForaDoFoco` com o foco lido antes da transação); e as exportações,
// pela leitura com foco. Tela ou action nova do BPO entra nas listas abaixo.

const raiz = path.resolve(__dirname, "../../..");
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

const TELAS = [
  "src/app/(app)/lancamentos/page.tsx",
  "src/components/financeiro/ContasPage.tsx",
  "src/app/(app)/conciliacao/page.tsx",
  "src/app/(app)/cadastros-financeiros/page.tsx",
  "src/app/(app)/cobranca/page.tsx",
  "src/app/(app)/emitir-nfse/page.tsx",
  "src/app/(app)/fluxo-de-caixa/page.tsx",
  "src/app/(app)/tabela-dinamica/page.tsx",
  "src/app/(app)/dre/page.tsx",
  "src/app/(app)/dre/economica/page.tsx",
  "src/app/(app)/dre/analises/page.tsx",
  "src/app/(app)/dre/orcamento/page.tsx",
];

const ACOES = [
  "src/lib/financeiro/acoes.ts",
  "src/lib/financeiro/edicaoServidor.ts",
  "src/lib/financeiro/edicaoEmLoteServidor.ts",
  "src/lib/financeiro/anexosServidor.ts",
  "src/lib/financeiro/adiantamentoAcoes.ts",
  "src/lib/financeiro/cartaoAcoes.ts",
  "src/lib/financeiro/leituraDoBoletoServidor.ts",
  "src/app/(app)/lancamentos/actions.ts",
  "src/app/(app)/cadastros-financeiros/actions.ts",
  "src/app/(app)/conciliacao/actions.ts",
  "src/app/(app)/cobranca/actions.ts",
  "src/app/(app)/emitir-nfse/actions.ts",
  "src/app/(app)/dre/actions.ts",
  "src/app/(app)/dre/import-actions.ts",
  "src/app/(app)/dre/orcamento/actions.ts",
  "src/app/(app)/admin/integracoes/omie-actions.ts",
];

const EXPORTACOES = [
  "src/lib/financeiro/exportacaoServidor.ts",
  "src/app/(app)/tabela-dinamica/exportar/route.ts",
  "src/app/(app)/dre/exportar/route.ts",
];

describe("telas do foco", () => {
  for (const tela of TELAS) {
    it(`${tela}: escolhe a empresa com o foco e o mostra na fileira`, () => {
      const fonte = ler(tela);
      expect(fonte).toContain("comFoco: true");
      expect(fonte).toContain("foco={foco}");
      // O seletor oferece só a base em foco.
      expect(fonte).toContain("noSeletor");
    });
  }
});

describe("actions que gravam nas telas do foco", () => {
  for (const arquivo of ACOES) {
    it(`${arquivo}: passa pela trava antes de gravar`, () => {
      expect(ler(arquivo)).toMatch(/recusaDoFoco\(|motivoForaDoFoco\(foco/);
    });
  }

  it("as ações de entrar e sair do foco existem e gravam o cookie", () => {
    const fonte = ler("src/app/(app)/foco-actions.ts");
    expect(fonte).toContain("export async function trabalharNaEmpresa");
    expect(fonte).toContain("export async function pararDeTrabalharNaEmpresa");
    expect(fonte).toContain("COOKIE_DO_FOCO");
  });
});

describe("exportações", () => {
  for (const arquivo of EXPORTACOES) {
    it(`${arquivo}: respeita o foco`, () => {
      expect(ler(arquivo)).toContain("leituraNoFoco(ctx,");
    });
  }
});

describe("casco e ficha", () => {
  it("o layout monta a faixa e o provedor do foco", () => {
    const fonte = ler("src/app/(app)/layout.tsx");
    expect(fonte).toContain("<FaixaDoFoco");
    expect(fonte).toContain("<ProvedorDoFoco");
  });

  it("a ficha da empresa oferece “Trabalhar nesta empresa”", () => {
    expect(ler("src/app/(app)/empresas/[id]/page.tsx")).toContain("<TrabalharNestaEmpresa");
  });
});
