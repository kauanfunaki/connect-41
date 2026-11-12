import { describe, expect, it } from "vitest";
import { lerFormularioDoContratante } from "./formulario";

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ companyId: "c1", socioId: "s1", socioNome: "Fulano de Tal", socioCpf: "529.982.247-25", ...campos })) f.set(k, v);
  return f;
};

describe("o formulário da tela do termo", () => {
  it("lê o mínimo: sócio com CPF válido, o resto vazio", () => {
    const r = lerFormularioDoContratante(form({}));
    expect(r).toMatchObject({
      ok: true,
      entrada: {
        companyId: "c1",
        socioId: "s1",
        socio: { nome: "Fulano de Tal", cpf: "52998224725", nacionalidade: null },
        endereco: { logradouro: null, cep: null },
        contatos: { ADMINISTRATIVO: { nome: null, telefone: null, email: null } },
      },
    });
  });

  it("sem sócio escolhido cadastra um novo", () => {
    const f = form({});
    f.delete("socioId");
    expect(lerFormularioDoContratante(f)).toMatchObject({ ok: true, entrada: { socioId: "novo" } });
  });

  it("recusa CPF inválido, UF e CEP fora do formato", () => {
    expect(lerFormularioDoContratante(form({ socioCpf: "111.111.111-11" }))).toEqual({ ok: false, erro: "CPF do sócio inválido." });
    expect(lerFormularioDoContratante(form({ empresa_uf: "Paraná" }))).toMatchObject({ ok: false });
    expect(lerFormularioDoContratante(form({ socio_cep: "800" }))).toEqual({ ok: false, erro: "Endereço do sócio: CEP deve ter 8 números." });
  });

  it("contato: e-mail conferido e nome obrigatório quando há telefone ou e-mail", () => {
    expect(lerFormularioDoContratante(form({ financeiro_nome: "Bia", financeiro_email: "bia@" }))).toEqual({ ok: false, erro: "E-mail do contato financeiro inválido." });
    expect(lerFormularioDoContratante(form({ administrativo_telefone: "41999998888" }))).toMatchObject({ ok: false, erro: expect.stringContaining("administrativo") });
    expect(lerFormularioDoContratante(form({ financeiro_nome: "Bia", financeiro_email: "Bia@Exemplo.com.br", empresa_uf: "pr", empresa_cep: "80010-000" }))).toMatchObject({
      ok: true,
      entrada: { contatos: { FINANCEIRO: { nome: "Bia", email: "bia@exemplo.com.br" } }, endereco: { uf: "PR", cep: "80010000" } },
    });
  });
});
