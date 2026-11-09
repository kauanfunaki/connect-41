import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de regressão (21/10/2026): uma empresa por vez no BPO. Toda tela do
// foco escolhe a empresa com `comFoco` e passa o foco à fileira da empresa;
// toda action que grava dinheiro nelas passa pela trava (`recusaDoFoco`, ou
// `motivoForaDoFoco` com o foco lido antes da transação); e as exportações,
// pela leitura com foco. Tela ou action nova do BPO entra nas listas abaixo.
//
// Desde 05/11/2026 a empresa se escolhe só na faixa "Trabalhando em" (pedido
// do Victor): nenhuma tela tem seletor de empresa próprio, a faixa aparece
// mesmo sem empresa, e o topo e a janela de troca não escolhem empresa.

const raiz = path.resolve(__dirname, "../../..");
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

const TELAS = [
  "src/app/(app)/lancamentos/page.tsx",
  "src/app/(app)/lancamentos/dominio/page.tsx",
  "src/components/financeiro/ContasPage.tsx",
  "src/app/(app)/conciliacao/page.tsx",
  "src/app/(app)/conciliacao/regras/page.tsx",
  "src/app/(app)/fornecedores-e-sacados/page.tsx",
  "src/app/(app)/cobranca/page.tsx",
  "src/app/(app)/emitir-nfse/page.tsx",
  "src/app/(app)/fluxo-de-caixa/page.tsx",
  "src/app/(app)/tabela-dinamica/page.tsx",
  "src/app/(app)/dre/page.tsx",
  "src/app/(app)/dre/economica/page.tsx",
  "src/app/(app)/dre/analises/page.tsx",
  "src/app/(app)/dre/orcamento/page.tsx",
  "src/app/(app)/aprovacoes/page.tsx",
  "src/app/(app)/sped-contabil/page.tsx",
  "src/app/(app)/documentos-fiscais/page.tsx",
  "src/app/(app)/colaboradores-clientes/page.tsx",
];

const ACOES = [
  "src/lib/financeiro/acoes.ts",
  "src/lib/financeiro/edicaoServidor.ts",
  "src/lib/financeiro/edicaoEmLoteServidor.ts",
  "src/lib/financeiro/mudancaDaSerieServidor.ts",
  "src/lib/financeiro/anexosServidor.ts",
  "src/lib/financeiro/adiantamentoAcoes.ts",
  "src/lib/financeiro/cartaoAcoes.ts",
  "src/lib/financeiro/leituraDoBoletoServidor.ts",
  "src/app/(app)/lancamentos/actions.ts",
  "src/app/(app)/lancamentos/dominio/actions.ts",
  "src/app/(app)/fornecedores-e-sacados/actions.ts",
  "src/app/(app)/conciliacao/actions.ts",
  "src/app/(app)/conciliacao/regras/actions.ts",
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
  "src/app/(app)/lancamentos/dominio/exportar/route.ts",
  "src/app/(app)/dre/exportar/route.ts",
];

describe("telas do foco", () => {
  for (const tela of TELAS) {
    it(`${tela}: a empresa vem da faixa, sem seletor na tela`, () => {
      const fonte = ler(tela);
      expect(fonte).toContain("comFoco: true");
      expect(fonte).toContain("foco={foco}");
      expect(fonte).not.toMatch(/SeletorDeEmpresa|navegaSozinho/);
    });
  }

  it("o SPED Fiscal escolhe a empresa com o foco, e a fileira recebe o foco da tela", () => {
    expect(ler("src/lib/fiscal/sped/local/servidor.ts")).toContain("comFoco: true");
    expect(ler("src/components/fiscal/sped/AreaLocalSped.tsx")).toContain("foco={tela.foco}");
  });

  it("a Conversa com o cliente segue o foco", () => {
    const fonte = ler("src/app/(app)/comunicacao/page.tsx");
    expect(fonte).toContain("lerEmpresaEmFoco(ctx)");
    expect(fonte).not.toContain("navegaSozinho");
  });

  it("a fileira não tem mais seletor de empresa", () => {
    const fonte = ler("src/components/empresas/FiltroDaEmpresa.tsx");
    expect(fonte).not.toMatch(/SearchableSelect|SeletorDeEmpresa/);
    expect(fonte).toContain("<BotaoEscolherEmpresa");
  });
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
  it("o layout monta a faixa (também sem empresa) e o provedor do foco em volta do casco", () => {
    const fonte = ler("src/app/(app)/layout.tsx");
    expect(fonte).toContain("<FaixaDoFoco");
    expect(fonte).toMatch(/podeFocar \? \(\s*<FaixaDoFoco escritorio=\{tenantId\} foco=\{foco \?/);
    expect(fonte.indexOf("<ProvedorDoFoco")).toBeLessThan(fonte.indexOf("<AppShell"));
  });

  it("a janela de troca e o topo não escolhem mais a empresa", () => {
    expect(ler("src/components/shell/TrocaDeContexto.tsx")).not.toMatch(/EscolherEmpresaDoFoco|EmpresaDoFoco/);
    expect(ler("src/components/shell/AppShell.tsx")).not.toMatch(/foco\??\.atual/);
  });

  // 09/11/2026: a ficha não repete a faixa — a empresa só se escolhe nela.
  it("a ficha da empresa não tem mais “Trabalhar nesta empresa” nem “Sair”", () => {
    expect(ler("src/app/(app)/empresas/[id]/page.tsx")).not.toContain("TrabalharNestaEmpresa");
    expect(ler("src/components/empresas/CompanyHeader.tsx")).not.toMatch(/\bfoco\b/);
    expect(ler("src/components/empresas/BotoesDoFoco.tsx")).not.toContain("Trabalhar nesta empresa");
  });
});
