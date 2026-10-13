import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Desde 13/10/2026 a IA do chat é a Lígia, com o setor embaixo do nome. Este
// teste lê o código das telas do chat e das mensagens que o servidor manda
// para elas, sem os comentários, e garante que não sobrou "IA do {setor}" nem
// "Pergunte à IA" em texto que alguém vê. O texto de instrução dos agentes
// (`src/lib/ia/chat/agentes.ts`) fica de fora: é para o modelo, não para a tela.

const RAIZ = path.resolve(__dirname, "../../..");
const ARQUIVOS_COM_TEXTO_DO_CHAT = [
  "src/components/shell/ChatDeIA.tsx",
  "src/components/ia/Ligia.tsx",
  "src/lib/ia/chat/responder.ts",
  "src/app/(app)/ia/chat-actions.ts",
];

/** O código sem comentários: os de bloco (também os de JSX) e os de linha, menos o "//" de "https://". */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("textos do chat", () => {
  it.each(ARQUIVOS_COM_TEXTO_DO_CHAT)("%s não diz mais 'IA do {setor}' nem 'Pergunte à IA'", (arquivo) => {
    const codigo = semComentarios(readFileSync(path.join(RAIZ, arquivo), "utf-8"));
    expect(codigo).not.toMatch(/\bIA d[oa]s? /);
    expect(codigo).not.toMatch(/[Pp]ergunt[ea]r? à IA/);
    expect(codigo).not.toMatch(/à IA\b/);
    // "A IA parou antes de terminar", "a IA desta conversa": quem fala agora é a Lígia.
    expect(codigo).not.toMatch(/\b[Aa] IA\b/);
  });

  it("o chat chama a Lígia pelo nome e mostra o setor de cada agente", () => {
    const codigo = semComentarios(readFileSync(path.join(RAIZ, "src/components/shell/ChatDeIA.tsx"), "utf-8"));
    expect(codigo).toContain("NOME_DA_ASSISTENTE");
    expect(codigo).toContain("agente.especialidade");
    expect(codigo).not.toContain("OrbeDaIA");
  });

  it("o tira-comentários não come texto de verdade", () => {
    expect(semComentarios('const a = "https://x"; // fora\n/* bloco */ b')).toBe('const a = "https://x"; \n b');
  });
});
