import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  chaveDaLicenca,
  conferirLinhas,
  dataDaCelula,
  documentoDaCelula,
  gerarModeloDeLicencas,
  lerPlanilhaDeLicencas,
  PlanilhaInvalida,
  type LinhaDaPlanilha,
} from "./importacaoDeLicencas";

// Importar licenças de planilha (lote B dos ajustes de 03/11/2026).

const EMPRESAS = [
  { id: "e1", nome: "Empresa Um", documento: "01.234.567/0001-89" },
  { id: "e2", nome: "Empresa Dois", documento: "98765432000110" },
];
const ORGAOS = [{ id: "o1", nome: "Prefeitura de Curitiba" }];

const linha = (p: Partial<LinhaDaPlanilha>): LinhaDaPlanilha => ({
  linha: 2,
  cnpj: "01234567000189",
  tipo: "Alvará de Funcionamento",
  orgao: "",
  numero: "",
  emissao: "",
  validade: "2027-03-10",
  observacoes: "",
  ...p,
});

describe("as células da planilha", () => {
  it("o CNPJ que o Excel guardou como número volta com o zero da frente", () => {
    expect(documentoDaCelula("1234567000189")).toBe("01234567000189");
    expect(documentoDaCelula("01.234.567/0001-89")).toBe("01234567000189");
    expect(documentoDaCelula("123.456.789-01")).toBe("12345678901");
  });

  it("datas: Date do Excel, dd/mm/aaaa e ISO; texto que não é data passa como está", () => {
    expect(dataDaCelula(new Date(Date.UTC(2027, 2, 10)))).toBe("2027-03-10");
    expect(dataDaCelula("10/3/2027")).toBe("2027-03-10");
    expect(dataDaCelula("2027-03-10T00:00:00.000Z")).toBe("2027-03-10");
    expect(dataDaCelula("março")).toBe("março");
    expect(dataDaCelula("")).toBe("");
  });
});

describe("conferir as linhas", () => {
  it("acha a empresa pelo CNPJ e o órgão pelo nome, sem acento nem caixa", () => {
    const [l] = conferirLinhas([linha({ orgao: "PREFEITURA DE CURITIBA", numero: "123" })], { empresas: EMPRESAS, orgaos: ORGAOS, existentes: new Set() });
    expect(l.situacao).toBe("nova");
    expect(l.empresa).toBe("Empresa Um");
    expect(l.dados).toMatchObject({ companyId: "e1", organId: "o1", number: "123", kind: "Alvará de Funcionamento" });
    expect(l.aviso).toBeUndefined();
  });

  it("órgão fora do cadastro não barra: entra sem órgão, com aviso", () => {
    const [l] = conferirLinhas([linha({ orgao: "Bombeiros" })], { empresas: EMPRESAS, orgaos: ORGAOS, existentes: new Set() });
    expect(l.situacao).toBe("nova");
    expect(l.dados?.organId).toBeNull();
    expect(l.aviso).toContain("Bombeiros");
  });

  it("erros: sem CNPJ, empresa desconhecida, sem tipo, data que não é data, validade antes da emissão", () => {
    const r = conferirLinhas(
      [
        linha({ cnpj: "" }),
        linha({ cnpj: "11111111000111" }),
        linha({ tipo: "" }),
        linha({ validade: "março" }),
        linha({ emissao: "2027-05-01", validade: "2027-03-10" }),
      ],
      { empresas: EMPRESAS, orgaos: ORGAOS, existentes: new Set() }
    );
    expect(r.map((x) => x.situacao)).toEqual(["erro", "erro", "erro", "erro", "erro"]);
    expect(r[1].motivo).toContain("Nenhuma empresa");
    expect(r[3].motivo).toBe("Validade não é uma data (use dd/mm/aaaa).");
    expect(r[4].motivo).toContain("antes da emissão");
  });

  it("repetidas: a que já está no Connect e a que aparece duas vezes na planilha", () => {
    const existente = chaveDaLicenca("e2", "alvará de funcionamento", null, new Date(Date.UTC(2027, 2, 10, 12)));
    const r = conferirLinhas(
      [linha({ cnpj: "98765432000110" }), linha({ linha: 3 }), linha({ linha: 4 })],
      { empresas: EMPRESAS, orgaos: ORGAOS, existentes: new Set([existente]) }
    );
    expect(r.map((x) => x.situacao)).toEqual(["repetida", "nova", "repetida"]);
    expect(r[0].motivo).toContain("Já cadastrada");
    expect(r[2].motivo).toContain("própria planilha");
  });
});

describe("o modelo e a leitura", () => {
  it("o modelo do Connect, preenchido, volta lido — com CNPJ numérico e datas do Excel", async () => {
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load((await gerarModeloDeLicencas()) as unknown as ArrayBuffer);
    const aba = livro.getWorksheet("Licenças")!;
    aba.addRow(["1234567000189", "Licença Sanitária", "Prefeitura de Curitiba", "S-9", new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2027, 0, 5)), "veio do cliente"]);
    aba.addRow([]);
    aba.addRow(["98765432000110", "Alvará", "", "", "", "31/12/2026", ""]);
    const bytes = new Uint8Array(await livro.xlsx.writeBuffer());

    const linhas = await lerPlanilhaDeLicencas(bytes);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ cnpj: "1234567000189", tipo: "Licença Sanitária", numero: "S-9", emissao: "2026-01-05", validade: "2027-01-05" });
    expect(linhas[1]).toMatchObject({ validade: "2026-12-31", linha: 4 });
    expect(livro.getWorksheet("Como preencher")).toBeTruthy();
  });

  it("arquivo que não é planilha e planilha sem a coluna de CNPJ são recusados com a razão", async () => {
    await expect(lerPlanilhaDeLicencas(new TextEncoder().encode("não é xlsx"))).rejects.toBeInstanceOf(PlanilhaInvalida);
    const livro = new ExcelJS.Workbook();
    livro.addWorksheet("Qualquer").addRow(["Empresa", "Tipo"]);
    const bytes = new Uint8Array(await livro.xlsx.writeBuffer());
    await expect(lerPlanilhaDeLicencas(bytes)).rejects.toThrow(/CNPJ da empresa/);
  });
});
