import { describe, expect, it } from "vitest";
import { itensDasCertidoes, itensDasLicencas, lerEmails, marcoDaLicenca, ordenar, type CertidaoParaAviso, type LicencaParaAviso } from "./avisoDeVencimento";

const HOJE = "2026-11-12";
const lic = (id: string, venceEm: string, extra: Partial<LicencaParaAviso> = {}): LicencaParaAviso => ({
  id,
  empresa: `Empresa ${id}`,
  cnpj: "11.222.333/0001-81",
  tipo: "Alvará de funcionamento",
  numero: null,
  venceEm,
  ...extra,
});
const cert = (id: string, extra: Partial<CertidaoParaAviso>): CertidaoParaAviso => ({
  id,
  empresa: `Empresa ${id}`,
  cnpj: null,
  tipo: "FEDERAL",
  situacao: "NEGATIVA",
  validaAte: "2027-05-01",
  vista: false,
  ...extra,
});

describe("licenças: marcos de 90, 60 e 30 dias e vencida (os do Radar)", () => {
  it("cai no menor marco que cobre os dias que faltam", () => {
    expect(marcoDaLicenca("2027-02-09", HOJE)).toBe(90); // 89 dias
    expect(marcoDaLicenca("2027-01-11", HOJE)).toBe(60); // 60 dias
    expect(marcoDaLicenca("2026-12-12", HOJE)).toBe(30); // 30 dias
    expect(marcoDaLicenca("2026-11-12", HOJE)).toBe(30); // vence hoje
    expect(marcoDaLicenca("2027-03-01", HOJE)).toBeNull(); // mais de 90
  });

  it("vencida entra até 30 dias depois; mais antiga fica de fora", () => {
    expect(marcoDaLicenca("2026-11-01", HOJE)).toBe("vencida");
    expect(marcoDaLicenca("2026-10-13", HOJE)).toBe("vencida"); // 30 dias
    expect(marcoDaLicenca("2026-10-12", HOJE)).toBeNull(); // 31 dias
  });

  it("a chave muda por marco e por validade: o mesmo marco não sai duas vezes, e renovar volta a avisar", () => {
    const [a] = itensDasLicencas([lic("1", "2027-01-11")], HOJE);
    const [b] = itensDasLicencas([lic("1", "2027-01-11")], "2026-11-20");
    const [renovada] = itensDasLicencas([lic("1", "2027-12-01")], "2027-10-01");
    expect(a!.chave).toBe(b!.chave);
    expect(a!.chave).not.toBe(renovada!.chave);
    expect(a!.situacao).toBe("vence em 60 dias");
  });

  it("documento com número e situação em palavras", () => {
    const [i] = itensDasLicencas([lic("1", "2026-11-09", { numero: "123/2025" })], HOJE);
    expect(i).toMatchObject({ documento: "Alvará de funcionamento nº 123/2025", situacao: "venceu há 3 dias", gravidade: "vencida" });
  });
});

describe("certidões: a regra da tela de Certidões", () => {
  it("positiva ainda não vista entra uma vez; vista não entra", () => {
    expect(itensDasCertidoes([cert("1", { situacao: "POSITIVA" })], HOJE)).toMatchObject([{ chave: "VENC_EMAIL:CERT:1:positiva", situacao: "saiu positiva" }]);
    expect(itensDasCertidoes([cert("1", { situacao: "POSITIVA", vista: true })], HOJE)).toEqual([]);
  });

  it("regular: entra quando vence em até 15 dias e quando venceu (até 30 dias)", () => {
    expect(itensDasCertidoes([cert("1", { validaAte: "2026-11-27" })], HOJE)[0]).toMatchObject({ situacao: "vence em 15 dias", gravidade: "perto" });
    expect(itensDasCertidoes([cert("1", { validaAte: "2026-11-28" })], HOJE)).toEqual([]);
    expect(itensDasCertidoes([cert("1", { validaAte: "2026-11-10" })], HOJE)[0]).toMatchObject({ chave: "VENC_EMAIL:CERT:1:vencida" });
    expect(itensDasCertidoes([cert("1", { validaAte: "2026-09-01" })], HOJE)).toEqual([]);
  });

  it("positiva com efeito de negativa conta como regular; a que não saiu não entra", () => {
    expect(itensDasCertidoes([cert("1", { situacao: "POSITIVA_COM_EFEITO", validaAte: "2026-11-20" })], HOJE)[0]!.documento).toBe("Certidão Federal");
    expect(itensDasCertidoes([cert("1", { situacao: "NAO_SAIU" })], HOJE)).toEqual([]);
  });
});

describe("o e-mail", () => {
  it("ordena do mais urgente para o menos", () => {
    const itens = ordenar([...itensDasLicencas([lic("a", "2027-02-01"), lic("b", "2026-11-05"), lic("c", "2026-12-01")], HOJE)]);
    expect(itens.map((i) => i.empresa)).toEqual(["Empresa b", "Empresa c", "Empresa a"]);
  });

  it("lê a lista de e-mails em linhas, vírgulas ou ponto e vírgula, sem repetir", () => {
    expect(lerEmails("Ana@41.com.br\nbia@41.com.br; ana@41.com.br , x")).toEqual({ validos: ["ana@41.com.br", "bia@41.com.br"], invalidos: ["x"] });
  });
});
