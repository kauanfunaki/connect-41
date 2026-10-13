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
