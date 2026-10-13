import { describe, expect, it } from "vitest";
import { criarCenario } from "./cenario";
import { buscarEmpresas, chaveDasEmpresasFavoritas, indexarEmpresas, lerEmpresasFavoritas } from "./empresasFavoritas";

describe("busca e favoritos de empresas fiscais", () => {
  it("busca sem acentos, com palavras fora de ordem e CNPJ formatado", () => {
    const empresas = criarCenario().empresas;
    const indice = indexarEmpresas(empresas);
    expect(buscarEmpresas(indice, "comercio aurora", []).empresas[0].nome).toContain("Aurora");
    const empresa = empresas[0];
    const cnpj = empresa.estabelecimentos[0].cnpj;
    expect(buscarEmpresas(indice, cnpj, []).empresas.map((e) => e.id)).toContain(empresa.id);
  });
  it("coloca favoritos no topo sem retirar os demais resultados", () => {
    const empresas = criarCenario().empresas;
    const indice = indexarEmpresas(empresas);
    const favorita = indice.at(-1)!.empresa.id;
    const resultado = buscarEmpresas(indice, "", [favorita]);
    expect(resultado.empresas[0].id).toBe(favorita);
    expect(resultado.total).toBe(empresas.length);
  });
  it("limita a lista visível mesmo com muitos cadastros e favorito no final", () => {
    const exemplo = criarCenario().empresas[0];
    const empresas = Array.from({ length: 2000 }, (_, i) => ({ ...exemplo, id: `empresa-${i}`, nome: `Empresa ${String(i).padStart(4, "0")}` }));
    const resultado = buscarEmpresas(indexarEmpresas(empresas), "", ["empresa-1999"]);
    expect(resultado.empresas).toHaveLength(50);
    expect(resultado.total).toBe(2000);
    expect(resultado.empresas[0].id).toBe("empresa-1999");
  });
  it("isola preferências por usuário e escritório e recupera valores inválidos", () => {
    expect(chaveDasEmpresasFavoritas("a", "usuario-1")).not.toBe(chaveDasEmpresasFavoritas("a", "usuario-2"));
    expect(chaveDasEmpresasFavoritas("a", "usuario-1")).not.toBe(chaveDasEmpresasFavoritas("b", "usuario-1"));
    expect(lerEmpresasFavoritas('["a","a",5,null,"b"]')).toEqual(["a", "b"]);
    expect(lerEmpresasFavoritas("invalido")).toEqual([]);
  });
});
