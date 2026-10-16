import { describe, expect, it } from "vitest";
import { LIMITE_DA_BUSCA, cortarBusca, modoDaTela, ondeDaBusca, termoDaBusca } from "./busca";
import { resolverEmpresaDaTela } from "@/lib/empresas/escolhaDaEmpresa";

describe("termoDaBusca", () => {
  it("vazio, espaços ou ausente é sem busca", () => {
    expect(termoDaBusca(undefined)).toBeNull();
    expect(termoDaBusca("")).toBeNull();
    expect(termoDaBusca("   ")).toBeNull();
  });

  it("limpa as pontas e, repetido na URL, fica com o primeiro", () => {
    expect(termoDaBusca("  ana  ")).toBe("ana");
    expect(termoDaBusca(["ana", "bia"])).toBe("ana");
  });
});

describe("ondeDaBusca — nome ou CPF", () => {
  it("texto procura só no nome", () => {
    expect(ondeDaBusca("Camila")).toEqual({ OR: [{ name: { contains: "Camila" } }] });
  });

  it("dois dígitos não viram busca de CPF", () => {
    expect(ondeDaBusca("12").OR).toHaveLength(1);
  });

  it("pedaço do CPF procura os dígitos e o que foi digitado", () => {
    expect(ondeDaBusca("318.420").OR).toEqual([
      { name: { contains: "318.420" } },
      { cpf: { contains: "318420" } },
      { cpf: { contains: "318.420" } },
    ]);
  });

  it("CPF inteiro procura com e sem a máscara — o cadastro guarda como foi digitado", () => {
    expect(ondeDaBusca("31842066507").OR).toEqual([
      { name: { contains: "31842066507" } },
      { cpf: { contains: "31842066507" } },
      { cpf: { contains: "318.420.665-07" } },
    ]);
  });
});

describe("cortarBusca — a busca em todas as empresas tem teto", () => {
  it("até o limite, tudo, sem 'tem mais'", () => {
    const linhas = Array.from({ length: LIMITE_DA_BUSCA }, (_, i) => i);
    expect(cortarBusca(linhas)).toEqual({ itens: linhas, temMais: false });
  });

  it("a linha a mais só diz que havia mais — nunca aparece", () => {
    const linhas = Array.from({ length: LIMITE_DA_BUSCA + 1 }, (_, i) => i);
    const r = cortarBusca(linhas);
    expect(r.itens).toHaveLength(LIMITE_DA_BUSCA);
    expect(r.temMais).toBe(true);
  });
});

describe("modoDaTela — o que Colaboradores de clientes mostra", () => {
  const EMPRESAS = ["alfa", "beta", "gama"];

  it("sem empresa na URL, abre na última empresa aberta", () => {
    const escolha = resolverEmpresaDaTela({ pedida: undefined, ultima: "beta", disponiveis: EMPRESAS });
    expect(escolha).toMatchObject({ tipo: "empresa", companyId: "beta", origem: "ultima" });
    expect(modoDaTela(null, escolha)).toBe("empresa");
  });

  it("sem empresa na URL e sem última, pede para escolher — não abre a primeira nem a lista de todos", () => {
    const escolha = resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: EMPRESAS });
    expect(modoDaTela(null, escolha)).toBe("escolher");
  });

  it("a última empresa que saiu da lista (inativa, excluída) também pede para escolher", () => {
    const escolha = resolverEmpresaDaTela({ pedida: undefined, ultima: "delta", disponiveis: EMPRESAS });
    expect(modoDaTela(null, escolha)).toBe("escolher");
  });

  it("com termo digitado, a busca em todas ganha da empresa — com ou sem empresa escolhida", () => {
    const comEmpresa = resolverEmpresaDaTela({ pedida: "alfa", ultima: null, disponiveis: EMPRESAS });
    const semEmpresa = resolverEmpresaDaTela({ pedida: undefined, ultima: null, disponiveis: EMPRESAS });
    expect(modoDaTela("camila", comEmpresa)).toBe("busca");
    expect(modoDaTela("camila", semEmpresa)).toBe("busca");
  });
});
