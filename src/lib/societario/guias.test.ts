import { describe, it, expect } from "vitest";
import { caminhoDaGuia } from "./guias";

const UUID = "3f2b8c1e-9a4d-4e7f-8b21-0c5d6e7f8a9b";

describe("caminhoDaGuia", () => {
  it("aceita o formato que o armazenamento grava", () => {
    const c = caminhoDaGuia("t1", `t1/${UUID}.pdf`);
    expect(c).not.toBeNull();
    expect(c).toContain("societario-guias");
  });

  // A guia de outro cliente não pode ir anexada num e-mail deste.
  it("recusa valor de outro tenant", () => {
    expect(caminhoDaGuia("t1", `t2/${UUID}.pdf`)).toBeNull();
  });

  it("recusa o que não é deste armazenamento", () => {
    expect(caminhoDaGuia("t1", `t1/../t2/${UUID}.pdf`)).toBeNull();
    expect(caminhoDaGuia("t1", "t1/guia.pdf")).toBeNull();
    expect(caminhoDaGuia("t1", "https://sima.curitiba.pr.gov.br/dam/123")).toBeNull();
    expect(caminhoDaGuia("t1", `t1/${UUID}.exe`)).toBeNull();
  });
});
