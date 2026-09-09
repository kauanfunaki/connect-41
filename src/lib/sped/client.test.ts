import { describe, it, expect } from "vitest";
import { extrairErro } from "./client";

// Os três formatos que já circularam entre o contrato, este cliente e a API
// real. O caso que motivou o teste é o terceiro: o envelope padrão do FastAPI,
// que foi o que a integração de fato devolveu ao ser ligada em 2026-09-09.
describe("extrairErro", () => {
  it("lê o formato deste cliente: codigo no topo", () => {
    expect(extrairErro({ codigo: "sem_xml_armazenado" }).codigo).toBe("sem_xml_armazenado");
  });

  it("lê o formato do contrato: erro no topo", () => {
    expect(extrairErro({ erro: "documento_nao_encontrado" }).codigo).toBe("documento_nao_encontrado");
  });

  it("lê o formato real do FastAPI: detail.erro", () => {
    const corpo = {
      detail: { erro: "documento_nao_encontrado", tipo: "nfe", identificador: "2226" },
    };
    expect(extrairErro(corpo).codigo).toBe("documento_nao_encontrado");
  });

  it("detail como string vira mensagem, nunca código", () => {
    // `HTTPException(detail="algo deu errado")` é texto livre, não identificador
    // tipado — tratá-lo como código faria o `semXml` comparar frase com slug.
    const r = extrairErro({ detail: "algo deu errado" });
    expect(r.codigo).toBeNull();
    expect(r.mensagem).toBe("algo deu errado");
  });

  it("não devolve [object Object] como mensagem", () => {
    // Era o defeito real: `detail` objeto atribuído a um campo tipado como
    // string produzia "SPED 404: [object Object]" no log.
    const r = extrairErro({ detail: { erro: "x", tipo: "nfe" } });
    expect(r.mensagem).toBeNull();
  });

  it("corpo vazio ou sem os campos não inventa código", () => {
    expect(extrairErro({}).codigo).toBeNull();
    expect(extrairErro({ codigo: 42 }).codigo).toBeNull();
    expect(extrairErro({ detail: null }).codigo).toBeNull();
  });

  it("precedência: codigo ganha de erro, que ganha de detail.erro", () => {
    const corpo = { codigo: "a", erro: "b", detail: { erro: "c" } };
    expect(extrairErro(corpo).codigo).toBe("a");
    expect(extrairErro({ erro: "b", detail: { erro: "c" } }).codigo).toBe("b");
  });
});
