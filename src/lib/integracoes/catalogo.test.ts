import { describe, it, expect } from "vitest";
import { INTEGRATION_CATALOG, integracaoDoCatalogo } from "./catalogo";

describe("INTEGRATION_CATALOG", () => {
  it("não tem código repetido", () => {
    const codes = INTEGRATION_CATALOG.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Integração nunca nasce ligada: ligar significa começar a falar com sistema
  // de terceiro usando credencial de alguém. É ato deliberado, não padrão.
  it("nenhuma nasce ligada", () => {
    expect(INTEGRATION_CATALOG.every((i) => i.defaultEnabled === false)).toBe(true);
  });

  it("toda integração declara ao menos um campo obrigatório", () => {
    for (const i of INTEGRATION_CATALOG) {
      expect(i.campos.some((c) => c.required), i.code).toBe(true);
    }
  });

  // Campo de credencial que não for `secret` volta para a tela em texto no
  // primeiro `configParaTela` — e aí o segredo está no HTML.
  //
  // A regra é sobre **o que sozinho dá acesso**, e não sobre o nome parecer
  // credencial. `appKey` do Omie, `accountId` do Chatwoot e `phoneNumberId` da
  // Meta são identificadores: dizem *qual* conta, não abrem nenhuma. Escondê-los
  // tiraria da tela a única forma de alguém notar que configurou a conta errada.
  it("todo campo que sozinho dá acesso é do tipo secret", () => {
    const daAcesso = /secret|token|senha|password/i;
    for (const i of INTEGRATION_CATALOG) {
      for (const c of i.campos) {
        if (daAcesso.test(c.name)) {
          expect(c.type, `${i.code}.${c.name}`).toBe("secret");
        }
      }
    }
  });

  // O outro lado da mesma regra: identificador fica visível de propósito.
  it("identificador de conta continua visível", () => {
    const identificadores = ["appKey", "accountId", "phoneNumberId", "wabaId"];
    for (const i of INTEGRATION_CATALOG) {
      for (const c of i.campos) {
        if (identificadores.includes(c.name)) {
          expect(c.type, `${i.code}.${c.name}`).not.toBe("secret");
        }
      }
    }
  });
});


describe("Chatwoot e SPED, depois da convergência de 11/09", () => {
  it("os dois estão no catálogo", () => {
    expect(integracaoDoCatalogo("chatwoot")).not.toBeNull();
    expect(integracaoDoCatalogo("sped")).not.toBeNull();
  });

  // O `accountId` é o que distingue duas contas do mesmo Chatwoot no mesmo
  // cliente — é ele que vira `instanceKey`, e sem ele a segunda conta
  // sobrescreveria a primeira.
  it("o Chatwoot pede o accountId, que vira a instância", () => {
    const def = integracaoDoCatalogo("chatwoot")!;
    expect(def.campos.map((c) => c.name)).toContain("accountId");
    expect(def.campos.find((c) => c.name === "accountId")!.required).toBe(true);
  });

  // Os dois segredos do Chatwoot não podem voltar para a tela: o token abre a
  // conta inteira, e o segredo do webhook é o que autentica cada entrega.
  it("token e segredo do webhook são secret, não texto", () => {
    const def = integracaoDoCatalogo("chatwoot")!;
    for (const nome of ["apiToken", "webhookSecret"]) {
      expect(def.campos.find((c) => c.name === nome)!.type).toBe("secret");
    }
  });

  // É o bloqueio de produtização: hoje o token vive no .env do servidor, que é
  // de quem hospeda. Aqui ele passa a ser por cliente.
  it("o SPED pede o token de serviço como segredo", () => {
    const def = integracaoDoCatalogo("sped")!;
    expect(def.campos.find((c) => c.name === "serviceToken")!.type).toBe("secret");
  });

  it("nenhuma das duas nasce ligada", () => {
    expect(integracaoDoCatalogo("chatwoot")!.defaultEnabled).toBe(false);
    expect(integracaoDoCatalogo("sped")!.defaultEnabled).toBe(false);
  });

  // O cofre do BPO NÃO é integração: é senha que pessoa lê, com registro de
  // quem olhou. Se algum dia aparecer aqui, foi engano.
  it("o cofre do BPO não virou integração", () => {
    expect(integracaoDoCatalogo("bpo_senhas")).toBeNull();
    expect(integracaoDoCatalogo("bpo_credenciais")).toBeNull();
  });
});
