import { describe, expect, it } from "vitest";
import { mudaAlgo, planejarComplemento, type ComplementoDoAditiva, type EmpresaNoConnect } from "./complementos";

const comp = (extra: Partial<ComplementoDoAditiva> = {}): ComplementoDoAditiva => ({
  company_id: "a1",
  nome_socio: "Fulano de Tal",
  cpf_socio: "529.982.247-25",
  endereco_empresa: "Rua das Flores",
  numero_empresa: "100",
  bairro_empresa: "Centro",
  cidade_empresa: "Curitiba",
  estado_empresa: "pr",
  cep_empresa: "80010-000",
  nacionalidade_socio: "brasileiro",
  estado_civil_socio: "casado",
  profissao_socio: "empresário",
  endereco_socio: null,
  numero_socio: null,
  bairro_socio: null,
  cidade_socio: null,
  estado_socio: null,
  cep_socio: null,
  contato_administrativo_nome: "Ana",
  contato_administrativo_telefone: "41999998888",
  contato_administrativo_email: "Ana@Exemplo.com.br",
  contato_financeiro_nome: null,
  contato_financeiro_telefone: null,
  contato_financeiro_email: null,
  ...extra,
});

const semEndereco = { zipCode: null, addressStreet: null, addressNumber: null, neighborhood: null, city: null, stateCode: null };
const socio = (extra: Partial<EmpresaNoConnect["socios"][number]> = {}): EmpresaNoConnect["socios"][number] => ({
  id: "s1",
  name: "FULANO DE TAL",
  document: null,
  documentMasked: null,
  administrator: false,
  nationality: null,
  maritalStatus: null,
  occupation: null,
  ...semEndereco,
  ...extra,
});
const empresa = (extra: Partial<EmpresaNoConnect> = {}): EmpresaNoConnect => ({ id: "c1", ...semEndereco, socios: [], contatos: [], ...extra });

describe("carga dos complementos do Aditiva: só preenche o vazio", () => {
  it("empresa sem endereço e sem sócio: entra tudo, e o sócio nasce administrador", () => {
    const p = planejarComplemento(comp(), empresa());
    expect(p.empresa).toEqual({ addressStreet: "Rua das Flores", addressNumber: "100", neighborhood: "Centro", city: "Curitiba", stateCode: "PR", zipCode: "80010000" });
    expect(p.socio).toEqual({
      acao: "criar",
      campos: { name: "Fulano de Tal", document: "52998224725", administrator: true, nationality: "brasileiro", maritalStatus: "casado", occupation: "empresário" },
    });
    expect(p.contatos).toEqual([{ papel: "ADMINISTRATIVO", nome: "Ana", telefone: "41999998888", email: "ana@exemplo.com.br" }]);
  });

  it("não sobrescreve o que o Connect já tem", () => {
    const p = planejarComplemento(
      comp(),
      empresa({
        addressStreet: "Av. Brasil",
        city: "Londrina",
        socios: [socio({ document: "52998224725", administrator: true, occupation: "contador" })],
        contatos: ["ADMINISTRATIVO"],
      })
    );
    expect(p.empresa).toEqual({ addressNumber: "100", neighborhood: "Centro", stateCode: "PR", zipCode: "80010000" });
    expect(p.socio).toEqual({ acao: "atualizar", id: "s1", campos: { nationality: "brasileiro", maritalStatus: "casado" } });
    expect(p.contatos).toEqual([]);
  });

  it("casa o sócio da Receita pelo nome e o meio do CPF, e completa o documento", () => {
    const p = planejarComplemento(comp(), empresa({ socios: [socio({ documentMasked: "***982247**" })] }));
    expect(p.socio).toMatchObject({ acao: "atualizar", id: "s1", campos: { document: "52998224725", administrator: true } });
  });

  it("homônimo com outro CPF não entra; CPF inválido no Aditiva também não", () => {
    const outro = planejarComplemento(comp(), empresa({ socios: [socio({ document: "11144477735" })] }));
    expect(outro.socio).toBeNull();
    expect(outro.avisos[0]).toContain("mesmo nome");
    expect(planejarComplemento(comp({ cpf_socio: "111.111.111-11" }), empresa()).socio).toBeNull();
  });

  it("não marca administrador quando a empresa já tem um", () => {
    const p = planejarComplemento(comp(), empresa({ socios: [socio({ id: "s0", name: "Outra Pessoa", administrator: true }), socio({ document: "52998224725" })] }));
    expect(p.socio).toEqual({ acao: "atualizar", id: "s1", campos: { nationality: "brasileiro", maritalStatus: "casado", occupation: "empresário" } });
  });

  it("nada a mudar quando o Connect já tem tudo", () => {
    const completo = planejarComplemento(
      comp({ contato_administrativo_nome: null }),
      empresa({
        addressStreet: "x",
        addressNumber: "1",
        neighborhood: "y",
        city: "z",
        stateCode: "PR",
        zipCode: "80000000",
        socios: [socio({ document: "52998224725", administrator: true, nationality: "a", maritalStatus: "b", occupation: "c" })],
      })
    );
    expect(mudaAlgo(completo)).toBe(false);
  });
});
