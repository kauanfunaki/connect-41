import { describe, expect, it } from "vitest";
import {
  PRAZO_DA_EXECUCAO_MS,
  capacidadesConhecidas,
  chaveAberta,
  destinoDaFalha,
  devolucaoSchema,
  execucaoPerdida,
  maquinaSemSinal,
  motivoParaPessoa,
} from "./tarefas";

// A fila do robô do Societário (30/10/2026): o que volta para a fila e o que
// chama uma pessoa. A regra que importa é a do tipo que não se repete — hoje
// não há nenhum, e o teste do alvará cobre o caminho repetível.

describe("destinoDaFalha", () => {
  it("queda de rede volta para a fila enquanto há tentativa", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 1, recuperavel: true })).toBe("PENDENTE");
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 2, recuperavel: true })).toBe("PENDENTE");
  });

  it("na terceira, chama alguém", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 3, recuperavel: true })).toBe("PRECISA_DE_GENTE");
  });

  it("o que o órgão mostrou e o robô não decide vai direto para alguém", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 1, recuperavel: false })).toBe("PRECISA_DE_GENTE");
  });
});

describe("execucaoPerdida", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  it("passa de 15 minutos sem devolver", () => {
    expect(execucaoPerdida(new Date(agora.getTime() - PRAZO_DA_EXECUCAO_MS - 1), agora)).toBe(true);
    expect(execucaoPerdida(new Date(agora.getTime() - 60_000), agora)).toBe(false);
    expect(execucaoPerdida(null, agora)).toBe(false);
  });
});

describe("maquinaSemSinal (04/11/2026)", () => {
  const agora = new Date("2026-11-04T12:00:00Z");
  it("sem sinal há mais que o prazo de uma execução, ou nunca: está parada", () => {
    expect(maquinaSemSinal(new Date(agora.getTime() - PRAZO_DA_EXECUCAO_MS - 1), agora)).toBe(true);
    expect(maquinaSemSinal(null, agora)).toBe(true);
  });

  it("no meio de uma tarefa longa, sem pedir trabalho, ainda conta como ligada", () => {
    expect(maquinaSemSinal(new Date(agora.getTime() - 10 * 60_000), agora)).toBe(false);
  });
});

describe("chaveAberta e capacidades", () => {
  it("uma tarefa aberta por licença, tipo e escritório", () => {
    expect(chaveAberta("t1", "imprimir_alvara", "lic-1")).toBe("t1:imprimir_alvara:lic-1");
  });

  it("a máquina só recebe o que o Connect conhece", () => {
    expect(capacidadesConhecidas(["imprimir_alvara", "observar_protocolo", "imprimir_alvara"])).toEqual(["imprimir_alvara"]);
  });
});

describe("devolucaoSchema", () => {
  it("falha exige motivo e se dá para tentar de novo", () => {
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "site fora do ar", recuperavel: true }).success).toBe(true);
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "" , recuperavel: true }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "x" }).success).toBe(false);
  });

  it("sucesso leva o resultado", () => {
    expect(devolucaoSchema.safeParse({ ok: true, resultado: { tela: "encontrado" } }).success).toBe(true);
  });

  // 05/11/2026: a máquina nova manda o CNPJ do certificado usado.
  it("o certificado é opcional: a máquina antiga segue passando", () => {
    const antiga = devolucaoSchema.parse({ ok: true, resultado: { situacao: "ATIVO" } });
    expect(antiga).toEqual({ ok: true, resultado: { situacao: "ATIVO" } });
    const nova = devolucaoSchema.parse({ ok: true, resultado: { situacao: "ATIVO" }, certificado: { documento: "11222333000181" } });
    expect(nova).toMatchObject({ certificado: { documento: "11222333000181" } });
  });

  it("certificado mal formado é descartado, sem recusar a devolução", () => {
    const r = devolucaoSchema.safeParse({ ok: true, resultado: {}, certificado: { documento: 123 } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.certificado).toBeUndefined();
  });
});

// 03/11/2026: a tela mostrava o erro do navegador cru.
describe("motivoParaPessoa", () => {
  it("traduz o erro cru que as máquinas antigas guardaram", () => {
    expect(motivoParaPessoa("O robô falhou no site: locator.innerText: Target page, context or browser has been closed")).toMatch(/^A janela do navegador fechou/);
    expect(motivoParaPessoa("O robô falhou no site: locator.waitFor: Timeout 30000ms exceeded.")).toMatch(/demorou demais/);
    expect(motivoParaPessoa("O robô falhou no site: page.goto: net::ERR_NAME_NOT_RESOLVED")).toMatch(/não abriu/);
    expect(motivoParaPessoa("O robô falhou no site: qualquer outra coisa")).not.toMatch(/qualquer outra coisa/);
  });

  it("deixa como está o motivo que já é frase", () => {
    expect(motivoParaPessoa("A prefeitura não achou alvará para esta inscrição.")).toBe("A prefeitura não achou alvará para esta inscrição.");
    expect(motivoParaPessoa(null)).toBeNull();
  });
});
