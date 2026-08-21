import { describe, expect, it } from "vitest";
import {
  diasEntre,
  ultimoDiaDoMes,
  anosCompletosDeServico,
  diasDeAvisoPrevio,
  dataProjetada,
  contarAvos,
  avosDecimoTerceiro,
  avosFeriasProporcionais,
  diasTrabalhadosNoMes,
} from "./avos";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("utilitários de data", () => {
  it("conta dias entre datas", () => {
    expect(diasEntre(d("2026-01-01"), d("2026-01-31"))).toBe(30);
    expect(diasEntre(d("2026-01-31"), d("2026-02-01"))).toBe(1);
  });

  it("último dia do mês lida com bissexto", () => {
    expect(ultimoDiaDoMes(d("2024-02-10"))).toBe(29); // bissexto
    expect(ultimoDiaDoMes(d("2026-02-10"))).toBe(28);
    expect(ultimoDiaDoMes(d("2026-04-10"))).toBe(30);
  });
});

describe("aviso prévio proporcional (Lei 12.506/2011)", () => {
  it("menos de 1 ano = 30 dias", () => {
    expect(diasDeAvisoPrevio(d("2026-01-10"), d("2026-08-05"))).toBe(30);
  });

  it("11 meses ainda é 30 dias", () => {
    expect(diasDeAvisoPrevio(d("2025-09-10"), d("2026-08-05"))).toBe(30);
  });

  it("1 ano completo = 33 dias", () => {
    expect(diasDeAvisoPrevio(d("2025-01-10"), d("2026-08-05"))).toBe(33);
  });

  it("20 anos bate o teto de 90", () => {
    expect(diasDeAvisoPrevio(d("2006-01-10"), d("2026-08-05"))).toBe(90);
  });

  it("25 anos continua no teto de 90", () => {
    expect(diasDeAvisoPrevio(d("2001-01-10"), d("2026-08-05"))).toBe(90);
  });

  it("aniversário ainda não completado no ano não conta", () => {
    // admitido em 10/12/2024, desligado em 05/08/2026 → 1 ano completo
    expect(anosCompletosDeServico(d("2024-12-10"), d("2026-08-05"))).toBe(1);
    // desligado no dia anterior ao aniversário → ainda 1
    expect(anosCompletosDeServico(d("2024-12-10"), d("2026-12-09"))).toBe(1);
    // no aniversário → 2
    expect(anosCompletosDeServico(d("2024-12-10"), d("2026-12-10"))).toBe(2);
  });
});

describe("projeção do aviso indenizado", () => {
  it("projeta a data somando os dias", () => {
    expect(dataProjetada(d("2026-08-05"), 30).toISOString().slice(0, 10)).toBe("2026-09-04");
  });

  it("atravessa a virada de ano", () => {
    expect(dataProjetada(d("2026-12-20"), 30).toISOString().slice(0, 10)).toBe("2027-01-19");
  });
});

describe("contarAvos — regra dos 15 dias", () => {
  it("mês com exatamente 15 dias CONTA", () => {
    expect(contarAvos(d("2026-03-01"), d("2026-03-15"))).toBe(1);
  });

  it("mês com 14 dias NÃO conta", () => {
    expect(contarAvos(d("2026-03-01"), d("2026-03-14"))).toBe(0);
  });

  it("conta cada mês do intervalo", () => {
    // jan inteiro, fev inteiro, mar com 20 dias → 3 avos
    expect(contarAvos(d("2026-01-01"), d("2026-03-20"))).toBe(3);
  });

  it("mês parcial no início com menos de 15 dias não conta", () => {
    // 20/01 a 31/01 = 12 dias (não conta) + fev inteiro (conta)
    expect(contarAvos(d("2026-01-20"), d("2026-02-28"))).toBe(1);
  });

  it("fim antes do início retorna 0", () => {
    expect(contarAvos(d("2026-05-01"), d("2026-04-01"))).toBe(0);
  });

  it("fevereiro bissexto com 15 dias conta", () => {
    expect(contarAvos(d("2024-02-15"), d("2024-02-29"))).toBe(1); // 15 dias
  });
});

describe("avosDecimoTerceiro — ancorado no ano civil", () => {
  it("admissão anterior ao ano: conta do 1º de janeiro", () => {
    // desligamento 31/08/2026 → jan..ago = 8 avos
    expect(avosDecimoTerceiro(d("2020-05-10"), d("2026-08-31"))).toBe(8);
  });

  it("admissão no meio do ano: conta da admissão", () => {
    // admitido 10/06/2026, desligado 31/08/2026 → jun(21d), jul, ago = 3
    expect(avosDecimoTerceiro(d("2026-06-10"), d("2026-08-31"))).toBe(3);
  });

  it("nunca passa de 12", () => {
    expect(avosDecimoTerceiro(d("2010-01-01"), d("2026-12-31"))).toBe(12);
  });

  it("PROJEÇÃO do aviso atravessando o ano gera avo do ANO NOVO", () => {
    // Dispensa 20/12/2026 com 30 dias de aviso indenizado → projeta 19/01/2027.
    // O 13º de 2027 tem 1 avo (19 dias de janeiro >= 15).
    const projetada = dataProjetada(d("2026-12-20"), 30);
    expect(avosDecimoTerceiro(d("2020-01-01"), projetada)).toBe(1);
  });

  it("desligamento em 01/01 não gera avo daquele ano", () => {
    expect(avosDecimoTerceiro(d("2020-01-01"), d("2026-01-01"))).toBe(0);
  });

  it("desligamento em 31/12 gera os 12 avos", () => {
    expect(avosDecimoTerceiro(d("2020-01-01"), d("2026-12-31"))).toBe(12);
  });
});

describe("avosFeriasProporcionais — ancorado no período aquisitivo", () => {
  it("conta a partir do início do período aquisitivo, não do ano civil", () => {
    // aquisitivo começou 10/09/2025; desligamento 31/08/2026
    // set(21d) out nov dez jan..ago = 12 avos
    expect(avosFeriasProporcionais(d("2025-09-10"), d("2026-08-31"))).toBe(12);
  });

  it("ancoragem diferente do 13º produz contagens diferentes pra mesma pessoa", () => {
    const admissao = d("2025-09-10");
    const desligamento = d("2026-08-31");
    const decimo = avosDecimoTerceiro(admissao, desligamento); // ano civil: jan..ago = 8
    const ferias = avosFeriasProporcionais(admissao, desligamento); // aquisitivo: 12
    expect(decimo).toBe(8);
    expect(ferias).toBe(12);
    expect(decimo).not.toBe(ferias);
  });
});

describe("diasTrabalhadosNoMes — base do saldo de salário", () => {
  it("desligamento no meio do mês", () => {
    expect(diasTrabalhadosNoMes(d("2026-08-18"), d("2020-01-01"))).toBe(18);
  });

  it("admissão e desligamento no MESMO mês conta só o intervalo", () => {
    expect(diasTrabalhadosNoMes(d("2026-08-20"), d("2026-08-06"))).toBe(15);
  });

  it("desligamento no último dia do mês", () => {
    expect(diasTrabalhadosNoMes(d("2026-08-31"), d("2020-01-01"))).toBe(31);
  });

  it("desligamento no dia 1º conta 1 dia", () => {
    expect(diasTrabalhadosNoMes(d("2026-08-01"), d("2020-01-01"))).toBe(1);
  });
});
