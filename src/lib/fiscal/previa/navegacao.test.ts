import { describe, expect, it } from "vitest";
import { PAGINAS_FISCAIS } from "./cenario";

describe("limites das telas fiscais", () => {
  it("mantém apenas conferência de documentos e pagamentos, sem abas contábeis", () => {
    const page = PAGINAS_FISCAIS.find(p => p.pagina === "conferencia")!;
    expect(page.abas.map(([key]) => key)).toEqual(["previa", "confronto"]);
    expect(page.titulo).toBe("Conferência fiscal");
  });
  it("mantém no Connect apenas arquivos, validação e entrega", () => {
    expect(PAGINAS_FISCAIS.find(p => p.pagina === "entregas")!.abas.map(([key]) => key))
      .toEqual(["arquivos", "validacao", "entregas"]);
  });
  it("abre configurações nos parâmetros, sem duplicar cadastro de empresas", () => {
    expect(PAGINAS_FISCAIS.find(p => p.pagina === "configuracoes")!.abas.map(([key]) => key))
      .toEqual(["parametros", "depara", "regras"]);
    expect(PAGINAS_FISCAIS.find(p => p.pagina === "configuracoes")!.abas[2])
      .toEqual(["regras", "Regras fiscais"]);
  });
});
