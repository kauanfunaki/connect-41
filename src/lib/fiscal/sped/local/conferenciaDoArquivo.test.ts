import { describe, expect, it } from "vitest";
import { faltasDoEstabelecimento, faltasDosDocumentos, mensagemDasFaltas } from "./conferenciaDoArquivo";
import type { Escrituracao } from "./escrituracaoXml";

// O que o agente do motor recusaria por falta de dado, conferido no Connect
// antes do pedido (06/11/2026) — o mesmo que `gerador_connect_icms.py` exige.

const completo: Escrituracao["estabelecimento"] = {
  razaoSocial: "EMPRESA FICTICIA LTDA", nomeFantasia: "", codMun: "4106902", cep: "80000000", endereco: "RUA DE TESTE", numero: "100",
  complemento: "", bairro: "CENTRO", telefone: "", email: "", indPerfil: "A", indAtiv: "1",
  contador: { nome: "CONTADOR FICTICIO", cpf: "98765432100", crc: "PR-000000/O-0" }, icms: { codReceita: "", diaVencimento: null }, codCta: "", codInf: "",
};

describe("faltasDoEstabelecimento", () => {
  it("cadastro completo não tem falta; telefone, e-mail e ICMS não são exigidos", () => {
    expect(faltasDoEstabelecimento(completo, "9012345678")).toEqual([]);
  });

  it("separa o que se resolve no perfil fiscal do que se resolve no cadastro da empresa", () => {
    const faltas = faltasDoEstabelecimento({ ...completo, cep: "", codMun: "41069", contador: { ...completo.contador, crc: "" } }, "");
    expect(faltas).toEqual([
      { onde: "perfil", itens: ["inscrição estadual", "código do município (IBGE)", "CRC do contador"] },
      { onde: "cadastro", itens: ["CEP"] },
    ]);
  });

  it("inscrição estadual sem nenhum dígito (ISENTO) conta como falta, como no motor", () => {
    expect(faltasDoEstabelecimento(completo, "ISENTO")[0]?.itens).toEqual(["inscrição estadual"]);
    expect(faltasDoEstabelecimento(completo, "P-0123456")).toEqual([]);
  });
});

describe("faltasDosDocumentos", () => {
  const participante = { documento: "11222333000181", nome: "FORNECEDOR", ie: "", codMun: "4113700", endereco: "RUA", numero: "1", complemento: "", bairro: "" };
  const esc = (documentos: string[], p = participante): Escrituracao => ({ estabelecimento: completo, participantes: [p], documentos: documentos.map((id) => ({ id })) });
  const doc = (id: string, numero: string) => ({ id, numero, emitente: "11222333000181", destinatario: "39952818000140", cnpjEmpresa: "39952818000140" });

  it("nota sem o XML guardado e nota com a outra parte sem endereço, com os números", () => {
    const docs = [doc("a", "12"), doc("b", "7"), doc("c", "15"), doc("d", "3"), doc("e", "40")];
    expect(faltasDosDocumentos(docs, esc(["e"]))).toEqual([{ onde: "importacao", itens: ["o XML de 4 notas 3, 7, 12 e mais 1"] }]);
    expect(faltasDosDocumentos([doc("e", "40")], esc(["e"], { ...participante, endereco: "" }))).toEqual([{ onde: "importacao", itens: ["o endereço ou o município da outra parte da nota 40"] }]);
    expect(faltasDosDocumentos([doc("e", "40")], esc(["e"]))).toEqual([]);
  });
});

describe("mensagemDasFaltas", () => {
  it("diz o que falta e onde, numa frase só", () => {
    expect(mensagemDasFaltas([{ onde: "perfil", itens: ["inscrição estadual"] }, { onde: "cadastro", itens: ["CEP", "endereço"] }]))
      .toBe("Antes de gerar o EFD ICMS/IPI, complete no perfil fiscal, inscrição estadual; no cadastro da empresa, CEP, endereço.");
  });
});
