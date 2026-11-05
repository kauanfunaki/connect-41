import { describe, expect, it } from "vitest";
import {
  lerCusto,
  mensagemDoAviso,
  mesDeBrasilia,
  noRecorte,
  rotuloDoUso,
  semUsoHa90Dias,
  seVencerPara,
  seVencerParaCurto,
  statusDaRenovacao,
  totaisPorRisco,
  ultimoUso,
  usoDaTarefa,
  usosQueContam,
  validarRenovacao,
  validarUsosDeclarados,
  type LinhaParaTotais,
  type UsoDoDocumento,
} from "./usos";

// Onde o certificado é usado e o que para se vencer (05/11/2026).

const AGORA = new Date("2026-11-05T15:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);
const diasAFrente = (n: number) => new Date(Date.UTC(2026, 10, 5 + n, 12));
const registrado = (uso: string, dias: number): UsoDoDocumento => ({ uso, descricao: null, declarado: false, ultimoUsoAt: diasAtras(dias) });
const declarado = (uso: string, descricao: string | null = null): UsoDoDocumento => ({ uso, descricao, declarado: true, ultimoUsoAt: null });

describe("os usos que contam", () => {
  it("declarado conta sempre; registrado só nos últimos 90 dias", () => {
    const usos = [registrado("serpro", 10), registrado("robo:vigiar_ie", 91), declarado("nfse")];
    expect(usosQueContam(usos, AGORA).map((u) => u.uso)).toEqual(["serpro", "nfse"]);
  });

  it("saem na ordem do catálogo, com o outro no fim", () => {
    const usos = [declarado("outro", "portal da prefeitura"), declarado("nfse"), registrado("robo:observar_sima", 1), registrado("serpro", 1)];
    expect(usosQueContam(usos, AGORA).map((u) => u.uso)).toEqual(["serpro", "robo:observar_sima", "nfse", "outro"]);
  });

  it("a tarefa do robô vira o código do uso, e a que ainda não tem rótulo cai no genérico", () => {
    expect(usoDaTarefa("vigiar_ie")).toBe("robo:vigiar_ie");
    expect(rotuloDoUso({ uso: "robo:vigiar_ie", descricao: null })).toBe("Robô · IE");
    expect(rotuloDoUso({ uso: "robo:tarefa_nova", descricao: null })).toBe("Robô do Societário");
    expect(rotuloDoUso({ uso: "outro", descricao: "Portal X" })).toBe("Portal X");
  });
});

describe("se vencer, para…", () => {
  it("junta os impactos em uma frase", () => {
    const usos = [registrado("robo:vigiar_ie", 0), registrado("serpro", 1), registrado("robo:observar_sima", 2)];
    expect(seVencerPara(usos, AGORA)).toBe(
      "as consultas ao e-CAC pelo Integra Contador, a leitura da inscrição estadual pelo robô e o acompanhamento dos protocolos do SIMA"
    );
    expect(seVencerParaCurto(usos, AGORA)).toBe("e-CAC (Serpro), robô da IE e SIMA");
  });

  it("um uso só, sem vírgula nem 'e'", () => {
    expect(seVencerPara([declarado("nfse")], AGORA)).toBe("a emissão de NFS-e");
  });

  it("sem uso que conte, nada para", () => {
    expect(seVencerPara([registrado("serpro", 200)], AGORA)).toBeNull();
    expect(seVencerPara([], AGORA)).toBeNull();
  });

  it("o outro uso usa o texto de quem marcou", () => {
    expect(seVencerPara([declarado("outro", "o login no portal da prefeitura")], AGORA)).toBe("o login no portal da prefeitura");
  });
});

describe("último uso e sem uso há 90 dias", () => {
  it("o último uso é o mais recente de todos os registrados", () => {
    expect(ultimoUso([registrado("serpro", 5), registrado("robo:vigiar_ie", 1), declarado("nfse")])).toEqual(diasAtras(1));
    expect(ultimoUso([declarado("nfse")])).toBeNull();
  });

  it("sem uso: nada declarado e nada registrado nos 90 dias", () => {
    expect(semUsoHa90Dias([], AGORA)).toBe(true);
    expect(semUsoHa90Dias([registrado("serpro", 120)], AGORA)).toBe(true);
    expect(semUsoHa90Dias([registrado("serpro", 89)], AGORA)).toBe(false);
    expect(semUsoHa90Dias([declarado("procuracao_ecac")], AGORA)).toBe(false);
  });
});

describe("o aviso de vencimento diz o que para", () => {
  it("com uso, acrescenta o impacto", () => {
    expect(mensagemDoAviso({ titular: "Empresa Alfa", expiresAt: diasAFrente(30), agora: AGORA, impactoCurto: "robô da IE e SIMA" })).toBe(
      "Certificado digital de Empresa Alfa vence em 30 dia(s), 05/12/2026. Se vencer, para: robô da IE e SIMA."
    );
  });

  it("sem uso, é o aviso de antes", () => {
    expect(mensagemDoAviso({ titular: "Empresa Alfa", expiresAt: diasAFrente(0), agora: AGORA, impactoCurto: null })).toBe(
      "Certificado digital de Empresa Alfa vence hoje."
    );
  });

  it("vencido, diz que parou", () => {
    expect(mensagemDoAviso({ titular: "Empresa Alfa", expiresAt: diasAFrente(-2), agora: AGORA, impactoCurto: "NFS-e" })).toBe(
      "Certificado digital de Empresa Alfa venceu em 03/11/2026. Parou: NFS-e."
    );
  });

  it("nunca passa de 255 caracteres: o impacto encolhe primeiro", () => {
    const m = mensagemDoAviso({ titular: "Empresa ".repeat(10).trim(), expiresAt: diasAFrente(7), agora: AGORA, impactoCurto: "uso muito longo ".repeat(30).trim() });
    expect(m.length).toBeLessThanOrEqual(255);
    expect(m).toMatch(/Se vencer, para: uso muito longo .*…\.$/);
  });
});

describe("a renovação", () => {
  it("sem marca, aparece 'A pedir' só quando já está a renovar", () => {
    expect(statusDaRenovacao(null, "a_renovar")).toBe("A_PEDIR");
    expect(statusDaRenovacao(null, "vencido")).toBe("A_PEDIR");
    expect(statusDaRenovacao(null, "vigente")).toBeNull();
    expect(statusDaRenovacao("PEDIDO", "vigente")).toBe("PEDIDO");
    expect(statusDaRenovacao("lixo", "vigente")).toBeNull();
  });

  it("lê o custo em reais", () => {
    expect(lerCusto("190")).toBe(19_000);
    expect(lerCusto("R$ 1.140,50")).toBe(114_050);
    expect(lerCusto("0")).toBe(0);
    expect(lerCusto("")).toBeNull();
    expect(lerCusto("abc")).toBeUndefined();
    expect(lerCusto("1,2,3")).toBeUndefined();
  });

  it("valida o formulário", () => {
    expect(validarRenovacao({ status: "PEDIDO", responsavelId: "u-1", custo: "190,00", pagaQuem: "CLIENTE" })).toEqual({
      ok: true,
      dados: { status: "PEDIDO", responsavelId: "u-1", custoCentavos: 19_000, pagaQuem: "CLIENTE" },
    });
    expect(validarRenovacao({ status: "", responsavelId: "", custo: "", pagaQuem: "" })).toEqual({
      ok: true,
      dados: { status: null, responsavelId: null, custoCentavos: null, pagaQuem: null },
    });
    expect(validarRenovacao({ status: "VENDIDO" })).toMatchObject({ ok: false });
    expect(validarRenovacao({ custo: "muito" })).toMatchObject({ ok: false });
    expect(validarRenovacao({ pagaQuem: "VIZINHO" })).toMatchObject({ ok: false });
  });
});

describe("o Usado por à mão", () => {
  it("aceita os usos do catálogo e o outro com texto", () => {
    expect(validarUsosDeclarados([{ uso: "nfse" }, { uso: "outro", descricao: " portal " }])).toEqual([
      { uso: "nfse", descricao: null },
      { uso: "outro", descricao: "portal" },
    ]);
    expect(validarUsosDeclarados([])).toEqual([]);
  });

  it("recusa uso desconhecido e outro sem texto", () => {
    expect(validarUsosDeclarados([{ uso: "cafeteira" }])).toBeNull();
    expect(validarUsosDeclarados([{ uso: "outro", descricao: "  " }])).toBeNull();
    expect(validarUsosDeclarados("nfse")).toBeNull();
  });
});

describe("os totais pelo risco", () => {
  const linha = (p: Partial<LinhaParaTotais>): LinhaParaTotais => ({
    situacao: "vigente",
    expiresAt: diasAFrente(200),
    usos: [],
    renovacaoStatus: null,
    renovacaoCustoCentavos: null,
    ...p,
  });

  it("mês de Brasília, e não o de UTC", () => {
    expect(mesDeBrasilia(new Date("2026-12-01T01:00:00Z"))).toBe("2026-11");
  });

  it("conta cada recorte e soma o custo do mês", () => {
    const linhas = [
      // vence em 10 dias (novembro), usado pelo robô, R$ 190
      linha({ situacao: "a_renovar", expiresAt: diasAFrente(10), usos: [registrado("robo:vigiar_ie", 0)], renovacaoCustoCentavos: 19_000 }),
      // vencido há 3 dias (também novembro: entra na renovação do mês, sem custo), sem uso
      linha({ situacao: "vencido", expiresAt: diasAFrente(-3) }),
      // vence em 20 dias (novembro), NFS-e declarada, sem custo
      linha({ situacao: "a_renovar", expiresAt: diasAFrente(20), usos: [declarado("nfse")] }),
      // vence em novembro mas marcado para não renovar: fora do custo
      linha({ situacao: "a_renovar", expiresAt: diasAFrente(15), renovacaoStatus: "NAO_RENOVAR", renovacaoCustoCentavos: 50_000 }),
      // longe, usado pelo Serpro
      linha({ usos: [registrado("serpro", 1)] }),
      // substituído não entra em nada
      linha({ situacao: "substituido", expiresAt: diasAFrente(5), usos: [registrado("serpro", 1)], renovacaoCustoCentavos: 99_000 }),
    ];
    expect(totaisPorRisco(linhas, AGORA)).toEqual({
      vencem30: 4,
      vencidos: 1,
      aRenovar: 4,
      paramAlgo: 2,
      semUso: 2,
      doMes: 3,
      custoDoMesCentavos: 19_000,
      doMesSemCusto: 2,
    });
  });

  it("'param algo' é a renovar com uso; vigente com uso não entra", () => {
    expect(noRecorte("param", linha({ usos: [registrado("serpro", 1)] }), AGORA)).toBe(false);
    expect(noRecorte("param", linha({ situacao: "a_renovar", expiresAt: diasAFrente(40), usos: [registrado("serpro", 1)] }), AGORA)).toBe(true);
  });
});
