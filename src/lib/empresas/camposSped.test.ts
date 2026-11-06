import { describe, expect, it } from "vitest";
import {
  DICAS_SPED,
  atividadePeloCnae,
  camposDoMotorPeloCadastro,
  dadosSpedDoFormulario,
  erroDosDadosSped,
  formatarCnae,
} from "./camposSped";

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("camposSped", () => {
  it("versão do leiaute por ano", () => {
  });

  it("atividade pelo CNAE: indústria é 0, o resto é 1", () => {
    expect(atividadePeloCnae(1011201)).toBe("0");
    expect(atividadePeloCnae("3329-5/01")).toBe("0");
    expect(atividadePeloCnae("4930-2/02")).toBe("1");
    expect(atividadePeloCnae("0111301")).toBe("1");
    expect(atividadePeloCnae("")).toBeNull();
  });

  it("formata o CNAE da BrasilAPI", () => {
    expect(formatarCnae(4930202)).toBe("4930-2/02");
  });

  it("tudo vazio é válido", () => {
    const d = dadosSpedDoFormulario(form({}));
    expect(Object.values(d).every((v) => v === null)).toBe(true);
    expect(erroDosDadosSped(d)).toBeNull();
  });

  it("normaliza e confere o que veio preenchido", () => {
    const d = dadosSpedDoFormulario(
      form({ spedIndPerfil: "b", contabilistaCpf: "017.504.269-19", contabilistaCrc: "078680 o1pr", codMunicipioIbge: "4106902" })
    );
    expect(d.spedIndPerfil).toBe("B");
    expect(d.contabilistaCpf).toBe("01750426919");
    expect(d.contabilistaCrc).toBe("078680O1PR");
    expect(erroDosDadosSped(d)).toBeNull();
    expect(erroDosDadosSped({ ...d, spedIndPerfil: "D" })).toMatch(/A, B ou C/);
    expect(erroDosDadosSped({ ...d, codMunicipioIbge: "123" })).toMatch(/7 dígitos/);
    expect(erroDosDadosSped({ ...d, contabilistaCpf: "11111111111" })).toMatch(/CPF/);
  });

  it("leva ao motor só o que o cadastro tem, no formato dele", () => {
    const vazio = Object.fromEntries(
      ["name", "tradeName", "stateRegistration", "zipCode", "addressStreet", "addressNumber", "addressComplement", "neighborhood", "phone", "email",
        "codMunicipioIbge", "spedIndPerfil", "spedIndAtividade", "contabilistaNome", "contabilistaCpf", "contabilistaCrc",
        "spedContaContabilPadrao", "spedCodObservacaoPadrao"].map((k) => [k, null])
    ) as unknown as Parameters<typeof camposDoMotorPeloCadastro>[0];
    expect(camposDoMotorPeloCadastro(vazio)).toEqual({});
    expect(camposDoMotorPeloCadastro({ ...vazio, zipCode: "81170-660", phone: "(41) 3779-0065", spedIndPerfil: "A", email: " " }))
      .toEqual({ cep: "81170660", telefone: "4137790065", ind_perfil: "A" });
  });

  it("as dicas não citam o SPED gerado, o motor nem um escritório", () => {
    for (const dica of Object.values(DICAS_SPED)) {
      expect(dica).not.toMatch(/motor|generator|41|arquivo do sped|último sped|dom[ií]nio/i);
    }
  });
});
