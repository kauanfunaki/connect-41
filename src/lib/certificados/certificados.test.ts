import { describe, expect, it } from "vitest";

import {
  atuaisPorDocumento,
  chaveDoCertificado,
  extrairDoRelatorio,
  faixaDeAviso,
  lerData,
  situacaoDoCertificado,
  validarLinha,
} from "./certificados";

// Meio-dia UTC = 9h em São Paulo: o dia civil é o mesmo nos dois.
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const HOJE = dia("2026-09-23");
const CNPJ = "31052957000105"; // válido

describe("faixaDeAviso", () => {
  it("é a menor faixa que cobre os dias que faltam", () => {
    expect(faixaDeAviso(dia("2026-11-22"), HOJE)).toBe(60); // 60 dias
    expect(faixaDeAviso(dia("2026-10-23"), HOJE)).toBe(30);
    expect(faixaDeAviso(dia("2026-10-03"), HOJE)).toBe(15); // 10 dias: não manda 60 e 30 atrasados
    expect(faixaDeAviso(dia("2026-09-30"), HOJE)).toBe(7);
    expect(faixaDeAviso(dia("2026-09-23"), HOJE)).toBe(7); // vence hoje ainda dá para agir
  });
  it("longe de vencer não avisa; vencido é faixa própria", () => {
    expect(faixaDeAviso(dia("2026-11-23"), HOJE)).toBeNull(); // 61 dias
    expect(faixaDeAviso(dia("2026-09-22"), HOJE)).toBe("vencido");
  });
});

describe("situação", () => {
  it("o certificado antigo de quem renovou é substituído, não vencido", () => {
    const antigo = { documento: CNPJ, expiresAt: dia("2026-08-01") };
    const novo = { documento: CNPJ, expiresAt: dia("2027-08-01") };
    const atual = atuaisPorDocumento([antigo, novo]).get(CNPJ);
    expect(atual).toBe(novo);
    expect(situacaoDoCertificado(antigo, atual, HOJE)).toBe("substituido");
    expect(situacaoDoCertificado(novo, atual, HOJE)).toBe("vigente");
  });
  it("vencido, a renovar e vigente pelo marco de 60 dias", () => {
    const s = (iso: string) => {
      const c = { documento: CNPJ, expiresAt: dia(iso) };
      return situacaoDoCertificado(c, c, HOJE);
    };
    expect(s("2026-09-20")).toBe("vencido");
    expect(s("2026-11-22")).toBe("a_renovar");
    expect(s("2026-11-23")).toBe("vigente");
  });
});

describe("importação do relatório", () => {
  const headers = ["Arquivo", "Titular", "Tipo", "Documento", "Vencimento", "Dias para vencer", "Situação", "Entrada do cofre", "Conferir", "Vencimento no cofre"];

  it("descarta a coluna Arquivo — o nome do arquivo carrega a senha", () => {
    const { linhas } = extrairDoRelatorio(headers, [
      ["EMPRESA (s3nh@) 08.06.2027.pfx", "EMPRESA LTDA", "CNPJ", CNPJ, "09/06/2027", "259", "OK", "EMPRESA LTDA", "", "08/06/2027"],
    ]);
    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas)).not.toContain("s3nh@");
    expect(linhas[0]).toEqual({ documento: CNPJ, titular: "EMPRESA LTDA", vencimento: "09/06/2027", entradaDoCofre: "EMPRESA LTDA", conferir: "" });
  });

  it("pula o certificado que o script não abriu e acusa coluna que falta", () => {
    expect(extrairDoRelatorio(headers, [["x.pfx", "", "", "", "", "", "SENHA NÃO ENCONTRADA", "", "", ""]]).linhas).toHaveLength(0);
    expect(extrairDoRelatorio(["Titular", "Vencimento"], []).faltando).toEqual(["documento"]);
  });

  it("valida documento, data e titular no servidor", () => {
    const ok = validarLinha({ documento: CNPJ, titular: "EMPRESA", vencimento: "09/06/2027", entradaDoCofre: "", conferir: "senha repetida em 2 entradas" });
    expect(ok?.tipo).toBe("CNPJ");
    expect(ok?.cofreEntrada).toBeNull();
    expect(ok?.conferir).toBe("senha repetida em 2 entradas");
    expect(validarLinha({ documento: "11111111111111", titular: "X", vencimento: "09/06/2027" })).toBeNull();
    expect(validarLinha({ documento: CNPJ, titular: "X", vencimento: "31/02/2027" })).toBeNull();
    expect(validarLinha({ documento: CNPJ, titular: "", vencimento: "09/06/2027" })).toBeNull();
  });

  it("lê a data no dia civil certo e junta cópias do mesmo certificado", () => {
    expect(lerData("09/06/2027")?.toISOString().slice(0, 10)).toBe("2027-06-09");
    const a = validarLinha({ documento: CNPJ, titular: "A", vencimento: "09/06/2027" })!;
    const b = validarLinha({ documento: CNPJ, titular: "A", vencimento: "09/06/2027", entradaDoCofre: "outra pasta" })!;
    expect(chaveDoCertificado(a)).toBe(chaveDoCertificado(b));
  });
});
