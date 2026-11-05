import { describe, expect, it } from "vitest";
import { setorDoApoio, setoresDoApoio } from "./setorDoApoio";

// Cofre por setor (05/11/2026): o Apoio (senhas, manuais) mostra o setor da
// pessoa, e nunca o de um setor que ela não alcança.

const escritorio = ["bpo", "dp", "societario", "tech"];
type Papel = "SUPER_ADMIN" | "ADMIN" | "READONLY" | "SECTOR_ADMIN" | "SECTOR_USER";
const quem = (role: Papel, sectors: string[], activeSector: string | null = null) =>
  ({ role, sectors, activeSector, subscriptionReadOnly: false }) as Parameters<typeof setorDoApoio>[0];

describe("setoresDoApoio", () => {
  it("a pessoa do setor só alcança os dela; o administrador, todos; o somente leitura, nenhum", () => {
    expect(setoresDoApoio(quem("SECTOR_USER", ["dp"]), escritorio)).toEqual(["dp"]);
    expect(setoresDoApoio(quem("SECTOR_ADMIN", ["bpo", "dp"]), escritorio)).toEqual(["bpo", "dp"]);
    expect(setoresDoApoio(quem("ADMIN", []), escritorio)).toEqual(escritorio);
    expect(setoresDoApoio(quem("READONLY", []), escritorio)).toEqual([]);
  });

  it("setor que não existe mais no escritório não entra", () => {
    expect(setoresDoApoio(quem("SECTOR_USER", ["dp", "antigo"]), escritorio)).toEqual(["dp"]);
  });
});

describe("setorDoApoio", () => {
  it("o DP nunca cai nas senhas do BPO, nem pedindo pelo endereço", () => {
    const dp = quem("SECTOR_USER", ["dp"]);
    const alcance = setoresDoApoio(dp, escritorio);
    expect(setorDoApoio(dp, alcance, null)).toBe("dp");
    expect(setorDoApoio(dp, alcance, "bpo")).toBe("dp");
  });

  it("vale o pedido que a pessoa alcança, depois o setor em que ela está, depois o dela", () => {
    const duas = quem("SECTOR_ADMIN", ["dp", "bpo"], "bpo");
    const alcance = setoresDoApoio(duas, escritorio);
    expect(setorDoApoio(duas, alcance, "dp")).toBe("dp");
    expect(setorDoApoio(duas, alcance, null)).toBe("bpo");
    expect(setorDoApoio(quem("SECTOR_ADMIN", ["dp", "bpo"]), alcance, null)).toBe("dp");
  });

  it("o administrador sem setor abre no BPO, onde estão os dados de antes", () => {
    const admin = quem("SUPER_ADMIN", []);
    expect(setorDoApoio(admin, setoresDoApoio(admin, escritorio), null)).toBe("bpo");
  });

  it("sem setor ao alcance, a tela não abre", () => {
    expect(setorDoApoio(quem("READONLY", []), [], null)).toBeNull();
  });
});
