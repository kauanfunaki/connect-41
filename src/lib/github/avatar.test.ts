import { describe, expect, it } from "vitest";
import { avatarDoGithub, iniciaisDoLogin } from "./avatar";

describe("foto do desenvolvedor", () => {
  it("é a do GitHub, pelo login", () => {
    expect(avatarDoGithub("victorgomesdesa")).toBe("https://github.com/victorgomesdesa.png?size=64");
    expect(avatarDoGithub("kauan-41", 96)).toBe("https://github.com/kauan-41.png?size=96");
  });

  it("bot, autoria não identificada e login inválido ficam sem foto", () => {
    expect(avatarDoGithub("dependabot[bot]")).toBeNull();
    expect(avatarDoGithub("Autoria não identificada")).toBeNull();
    expect(avatarDoGithub("")).toBeNull();
    expect(avatarDoGithub("-comeca-com-hifen")).toBeNull();
    expect(avatarDoGithub("../outro")).toBeNull();
    expect(avatarDoGithub("a".repeat(40))).toBeNull();
  });

  it("o fallback são as iniciais", () => {
    expect(iniciaisDoLogin("victorgomesdesa")).toBe("VI");
  });
});
