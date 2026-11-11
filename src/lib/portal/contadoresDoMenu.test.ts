import { describe, expect, it } from "vitest";
import { TELAS_COM_CONTADOR, oQueOContadorDiz } from "./contadoresDoMenu";
import { TELAS_DO_PORTAL, TELAS_QUE_PEDEM_ACAO } from "./telas";

describe("os números do menu do portal (11/11/2026)", () => {
  it("o leitor de tela diz de quê é o número, tela por tela", () => {
    expect(oQueOContadorDiz("/portal/pendencias", 2)).toBe("2 esperando você");
    expect(oQueOContadorDiz("/portal/aprovacoes", 1)).toBe("1 para aprovar");
    expect(oQueOContadorDiz("/portal/solicitacoes", 3)).toBe("3 esperando sua resposta");
    expect(oQueOContadorDiz("/portal/comunicados", 1)).toBe("1 não lido");
    expect(oQueOContadorDiz("/portal/comunicados", 4)).toBe("4 não lidos");
  });

  it("toda tela com número é do catálogo, e toda tela que pede ação tem número", () => {
    const doCatalogo = new Set(TELAS_DO_PORTAL.map((t) => t.href));
    for (const href of TELAS_COM_CONTADOR) expect(doCatalogo.has(href), href).toBe(true);
    for (const href of TELAS_QUE_PEDEM_ACAO) expect((TELAS_COM_CONTADOR as readonly string[]).includes(href), href).toBe(true);
  });
});
