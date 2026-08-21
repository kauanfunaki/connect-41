import { describe, expect, it } from "vitest";
import {
  resolveActiveSector,
  resolveSectorHint,
  sectorScope,
  shouldShowSectorSwitcher,
} from "./activeSector";

const DOMINIO = "useconnect.com.br";

describe("resolveSectorHint", () => {
  it("tira o setor do subdomínio", () => {
    expect(resolveSectorHint("bpo.useconnect.com.br", null, DOMINIO)).toBe("bpo");
    expect(resolveSectorHint("societario.useconnect.com.br", null, DOMINIO)).toBe("societario");
  });

  it("ignora porta e caixa alta no host", () => {
    expect(resolveSectorHint("BPO.UseConnect.com.br:3000", null, DOMINIO)).toBe("bpo");
  });

  it("não trata host reservado como setor", () => {
    expect(resolveSectorHint("app.useconnect.com.br", null, DOMINIO)).toBeNull();
    expect(resolveSectorHint("www.useconnect.com.br", null, DOMINIO)).toBeNull();
  });

  // O domínio-base tem três rótulos e nenhum subdomínio — contar pontos não
  // funcionaria, e foi por isso que virou configuração.
  it("não inventa setor no próprio domínio-base", () => {
    expect(resolveSectorHint("useconnect.com.br", null, DOMINIO)).toBeNull();
    expect(resolveSectorHint("localhost:3000", null, DOMINIO)).toBeNull();
  });

  it("ignora host de outro domínio", () => {
    expect(resolveSectorHint("bpo.outrodominio.com.br", null, DOMINIO)).toBeNull();
  });

  it("ignora subdomínio aninhado", () => {
    expect(resolveSectorHint("a.bpo.useconnect.com.br", null, DOMINIO)).toBeNull();
  });

  // Deploy sem APP_DOMAIN não deve derivar setor de host nenhum.
  it("sem domínio-base configurado, host nunca vira setor", () => {
    expect(resolveSectorHint("bpo.useconnect.com.br", null, null)).toBeNull();
    expect(resolveSectorHint("bpo.useconnect.com.br", "fiscal", null)).toBe("fiscal");
  });

  it("cai no cookie quando o host não diz nada", () => {
    expect(resolveSectorHint("localhost:3000", "fiscal", DOMINIO)).toBe("fiscal");
  });

  // A URL ganha do cookie: link compartilhado tem que abrir no setor certo, e
  // não no último que o destinatário usou.
  it("host vence o cookie", () => {
    expect(resolveSectorHint("bpo.useconnect.com.br", "fiscal", DOMINIO)).toBe("bpo");
  });

  it("recusa valor fora do formato de código de setor", () => {
    expect(resolveSectorHint(null, "../../etc/passwd", DOMINIO)).toBeNull();
    expect(resolveSectorHint(null, "setor com espaco", DOMINIO)).toBeNull();
    expect(resolveSectorHint(null, "a".repeat(41), DOMINIO)).toBeNull();
    expect(resolveSectorHint(null, "", DOMINIO)).toBeNull();
  });
});

describe("resolveActiveSector", () => {
  it("quem tem um setor só fica sempre nele", () => {
    expect(
      resolveActiveSector({ hint: null, userSectors: ["bpo"], isFullAccess: false }),
    ).toBe("bpo");
  });

  // Sem isso, um link de outro setor tiraria a pessoa do único setor dela.
  it("um setor só ignora candidato de outro setor", () => {
    expect(
      resolveActiveSector({ hint: "fiscal", userSectors: ["bpo"], isFullAccess: false }),
    ).toBe("bpo");
  });

  it("candidato permitido vence para quem tem vários setores", () => {
    expect(
      resolveActiveSector({ hint: "fiscal", userSectors: ["bpo", "fiscal"], isFullAccess: false }),
    ).toBe("fiscal");
  });

  it("sem candidato, vários setores caem em Todos", () => {
    expect(
      resolveActiveSector({ hint: null, userSectors: ["bpo", "fiscal"], isFullAccess: false }),
    ).toBeNull();
  });

  // Setor ativo é filtro de visão, não permissão: candidato não permitido leva
  // ao lugar mais próximo que a pessoa pode ver, não a uma tela de erro.
  it("candidato não permitido cai em Todos, não em erro", () => {
    expect(
      resolveActiveSector({ hint: "contabil", userSectors: ["bpo", "fiscal"], isFullAccess: false }),
    ).toBeNull();
  });

  it("full access pode entrar em qualquer setor, mesmo sem UserSector", () => {
    expect(
      resolveActiveSector({ hint: "contabil", userSectors: [], isFullAccess: true }),
    ).toBe("contabil");
  });

  it("full access sem candidato fica em Todos", () => {
    expect(resolveActiveSector({ hint: null, userSectors: [], isFullAccess: true })).toBeNull();
  });

  // Diretoria com um setor atribuído não pode ficar presa nele — ela precisa da
  // visão consolidada, que é o motivo de "Todos" existir.
  it("full access com um setor só NÃO fica preso nele", () => {
    expect(
      resolveActiveSector({ hint: null, userSectors: ["gestao"], isFullAccess: true }),
    ).toBeNull();
  });

  it("usuário sem setor nenhum fica em Todos", () => {
    expect(resolveActiveSector({ hint: "bpo", userSectors: [], isFullAccess: false })).toBeNull();
  });
});

describe("sectorScope", () => {
  it("setor ativo filtra por ele", () => {
    expect(sectorScope("bpo", ["bpo", "fiscal"], false)).toEqual(["bpo"]);
  });

  it("Todos + full access é sem filtro", () => {
    expect(sectorScope(null, [], true)).toBeNull();
  });

  // "Todos" nunca é mais que o que a pessoa já podia ver — é o comportamento
  // que o app tinha antes do setor ativo existir.
  it("Todos sem full access é a união dos setores da pessoa", () => {
    expect(sectorScope(null, ["bpo", "fiscal"], false)).toEqual(["bpo", "fiscal"]);
  });

  it("setor ativo vence mesmo em full access", () => {
    expect(sectorScope("contabil", [], true)).toEqual(["contabil"]);
  });
});

describe("shouldShowSectorSwitcher", () => {
  it("some com uma opção só — o controle vira rótulo", () => {
    expect(shouldShowSectorSwitcher(["bpo"], false)).toBe(false);
  });

  it("aparece com mais de uma opção", () => {
    expect(shouldShowSectorSwitcher(["bpo", "fiscal"], false)).toBe(true);
    expect(shouldShowSectorSwitcher(["bpo", "fiscal"], true)).toBe(true);
  });

  it("some quando não há setor nenhum", () => {
    expect(shouldShowSectorSwitcher([], false)).toBe(false);
  });
});
