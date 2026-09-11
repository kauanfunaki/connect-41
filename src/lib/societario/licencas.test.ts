import { describe, it, expect } from "vitest";
import {
  situacaoDaLicenca,
  diasAte,
  ordenarLicencas,
  contarPendentes,
  custoEmTaxas,
  AVISO_EM_DIAS,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
  type SituacaoDaLicenca,
} from "./licencas";

// Meio-dia em São Paulo, para os testes não dependerem da hora.
const HOJE = new Date("2026-09-11T15:00:00Z");
const d = (iso: string) => new Date(iso);

const TODAS: SituacaoDaLicenca[] = ["revogada", "sem_validade", "vigente", "a_renovar", "vencida"];

describe("situacaoDaLicenca", () => {
  it("todo estado tem rótulo e cor", () => {
    for (const s of TODAS) {
      expect(SITUACAO_LABEL[s]).toBeTruthy();
      expect(SITUACAO_VARIANTE[s]).toBeTruthy();
    }
  });

  it("vigente, a renovar e vencida", () => {
    expect(situacaoDaLicenca({ expiresAt: d("2027-01-01T12:00:00Z"), revokedAt: null }, HOJE)).toBe("vigente");
    expect(situacaoDaLicenca({ expiresAt: d("2026-10-01T12:00:00Z"), revokedAt: null }, HOJE)).toBe("a_renovar");
    expect(situacaoDaLicenca({ expiresAt: d("2026-09-01T12:00:00Z"), revokedAt: null }, HOJE)).toBe("vencida");
  });

  // Misturar com "vigente" encheria a fila de renovação de coisa que não
  // renova — e fila que mostra o que não precisa ser feito é fila que ninguém
  // olha.
  it("sem validade é estado próprio, não vigente para sempre", () => {
    expect(situacaoDaLicenca({ expiresAt: null, revokedAt: null }, HOJE)).toBe("sem_validade");
  });

  // Uma licença cassada pode ter data futura no papel. Dizer que está vigente
  // é dizer ao setor que está tudo bem com o que não está.
  it("revogada vence a data futura", () => {
    expect(
      situacaoDaLicenca({ expiresAt: d("2030-01-01T12:00:00Z"), revokedAt: d("2026-08-01T12:00:00Z") }, HOJE)
    ).toBe("revogada");
  });

  it("a borda do aviso: no limite ainda é a renovar, um dia além é vigente", () => {
    const limite = new Date(Date.UTC(2026, 8, 11 + AVISO_EM_DIAS, 12));
    const depois = new Date(Date.UTC(2026, 8, 11 + AVISO_EM_DIAS + 1, 12));
    expect(situacaoDaLicenca({ expiresAt: limite, revokedAt: null }, HOJE)).toBe("a_renovar");
    expect(situacaoDaLicenca({ expiresAt: depois, revokedAt: null }, HOJE)).toBe("vigente");
  });

  it("a antecedência é parâmetro", () => {
    const em30 = new Date(Date.UTC(2026, 8, 41, 12));
    expect(situacaoDaLicenca({ expiresAt: em30, revokedAt: null }, HOJE, 15)).toBe("vigente");
    expect(situacaoDaLicenca({ expiresAt: em30, revokedAt: null }, HOJE, 90)).toBe("a_renovar");
  });
});

describe("diasAte", () => {
  // O ponto: conta por dia de calendário, não por 24h. Uma licença que vence
  // hoje às 8h não está vencida para quem olha ao meio-dia — ela vence hoje, e
  // ainda dá para agir.
  it("vencer hoje é zero, mesmo se a hora já passou", () => {
    expect(diasAte(d("2026-09-11T11:00:00Z"), HOJE)).toBe(0);
    expect(situacaoDaLicenca({ expiresAt: d("2026-09-11T11:00:00Z"), revokedAt: null }, HOJE)).toBe(
      "a_renovar"
    );
  });

  it("ontem é −1 e amanhã é 1", () => {
    expect(diasAte(d("2026-09-10T23:00:00Z"), HOJE)).toBe(-1);
    expect(diasAte(d("2026-09-12T04:00:00Z"), HOJE)).toBe(1);
  });

  // 03:00 UTC é meia-noite em São Paulo: o dia vira ali, não às 00:00 UTC.
  it("a virada do dia é a de São Paulo", () => {
    const vespera = new Date("2026-09-12T02:00:00Z"); // ainda dia 11 em SP
    expect(diasAte(vespera, HOJE)).toBe(0);
  });
});

describe("ordenarLicencas", () => {
  it("vencida primeiro, depois a renovar, e o que não renova no fim", () => {
    const lista = [
      { id: "vigente", expiresAt: d("2027-06-01T12:00:00Z"), revokedAt: null },
      { id: "revogada", expiresAt: d("2027-01-01T12:00:00Z"), revokedAt: d("2026-01-01T12:00:00Z") },
      { id: "renovar-tarde", expiresAt: d("2026-11-01T12:00:00Z"), revokedAt: null },
      { id: "vencida-antiga", expiresAt: d("2026-01-01T12:00:00Z"), revokedAt: null },
      { id: "sem-validade", expiresAt: null, revokedAt: null },
      { id: "renovar-cedo", expiresAt: d("2026-09-20T12:00:00Z"), revokedAt: null },
      { id: "vencida-recente", expiresAt: d("2026-09-01T12:00:00Z"), revokedAt: null },
    ];
    expect(ordenarLicencas(lista, HOJE).map((l) => l.id)).toEqual([
      "vencida-antiga",
      "vencida-recente",
      "renovar-cedo",
      "renovar-tarde",
      "vigente",
      "sem-validade",
      "revogada",
    ]);
  });

  it("não modifica a lista recebida", () => {
    const lista = [
      { id: "a", expiresAt: d("2026-01-01T12:00:00Z"), revokedAt: null },
      { id: "b", expiresAt: null, revokedAt: null },
    ];
    const copia = [...lista];
    ordenarLicencas(lista, HOJE);
    expect(lista).toEqual(copia);
  });

  it("lista vazia não quebra", () => {
    expect(ordenarLicencas([], HOJE)).toEqual([]);
  });
});

describe("contarPendentes", () => {
  it("conta só o que pede ação", () => {
    const lista = [
      { id: "1", expiresAt: d("2026-01-01T12:00:00Z"), revokedAt: null },
      { id: "2", expiresAt: d("2026-09-20T12:00:00Z"), revokedAt: null },
      { id: "3", expiresAt: d("2028-01-01T12:00:00Z"), revokedAt: null },
      { id: "4", expiresAt: null, revokedAt: null },
      { id: "5", expiresAt: d("2026-01-01T12:00:00Z"), revokedAt: d("2026-02-01T12:00:00Z") },
    ];
    expect(contarPendentes(lista, HOJE)).toEqual({ vencidas: 1, aRenovar: 1 });
  });

  // Revogada com data passada não é pendência: o ato que ela pede é outro, e
  // contá-la inflaria o número que decide o dia do setor.
  it("revogada vencida não conta como vencida", () => {
    const lista = [{ id: "1", expiresAt: d("2020-01-01T12:00:00Z"), revokedAt: d("2021-01-01T12:00:00Z") }];
    expect(contarPendentes(lista, HOJE)).toEqual({ vencidas: 0, aRenovar: 0 });
  });
});

describe("custoEmTaxas", () => {
  it("soma total e pago", () => {
    const c = custoEmTaxas([
      { amountCents: 10_000, paidAt: d("2026-09-01T12:00:00Z"), attempt: 1 },
      { amountCents: 5_000, paidAt: null, attempt: 1 },
    ]);
    expect(c.totalCentavos).toBe(15_000);
    expect(c.pagoCentavos).toBe(10_000);
  });

  // O número que dá causa ao prazo: "trinta dias" sozinho não conta a história
  // que "trinta dias e duas guias a mais" conta.
  it("só a partir da segunda tentativa é custo de volta", () => {
    const c = custoEmTaxas([
      { amountCents: 10_000, paidAt: null, attempt: 1 },
      { amountCents: 8_000, paidAt: null, attempt: 2 },
      { amountCents: 8_000, paidAt: null, attempt: 3 },
    ]);
    expect(c.custoDasVoltasCentavos).toBe(16_000);
    expect(c.totalCentavos).toBe(26_000);
  });

  it("taxa sem protocolo não é custo de volta", () => {
    const c = custoEmTaxas([{ amountCents: 9_000, paidAt: null, attempt: null }]);
    expect(c.custoDasVoltasCentavos).toBe(0);
    expect(c.totalCentavos).toBe(9_000);
  });

  it("processo sem taxa soma zero", () => {
    expect(custoEmTaxas([])).toEqual({
      totalCentavos: 0,
      pagoCentavos: 0,
      custoDasVoltasCentavos: 0,
    });
  });
});
