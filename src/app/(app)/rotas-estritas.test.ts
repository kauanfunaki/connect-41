import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Modo estrito de rotas do Next 16.4 (13/11/2026): um catch-all no `@modal` do
// grupo (app), que fica na raiz, vale para toda URL. Sem `(app)/default.tsx`,
// as páginas de fora do grupo (/login, /portal, /carreiras…) dão 404. Ver o
// comentário em `default.tsx`.
const GRUPO = path.join(process.cwd(), "src", "app", "(app)");

describe("rotas do grupo (app) no modo estrito", () => {
  it("com catch-all no @modal, o grupo tem default.tsx", () => {
    const temCatchAll = readdirSync(path.join(GRUPO, "@modal")).some((nome) => nome.startsWith("[..."));
    if (temCatchAll) expect(existsSync(path.join(GRUPO, "default.tsx"))).toBe(true);
  });
});
