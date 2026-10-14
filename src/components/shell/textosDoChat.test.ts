import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Desde 13/10/2026 a IA do chat é a Ceci, com o setor embaixo do nome. Este
// teste lê o código das telas do chat e das mensagens que o servidor manda
// para elas, sem os comentários, e garante que não sobrou "IA do {setor}" nem
// "Pergunte à IA" em texto que alguém vê. O texto de instrução dos agentes
// (`src/lib/ia/chat/agentes.ts`) fica de fora: é para o modelo, não para a tela.

const RAIZ = path.resolve(__dirname, "../../..");
const ARQUIVOS_COM_TEXTO_DO_CHAT = [
  "src/components/shell/ChatDeIA.tsx",
  "src/components/ia/Ceci.tsx",
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
    // "A IA parou antes de terminar", "a IA desta conversa": quem fala agora é a Ceci.
    expect(codigo).not.toMatch(/\b[Aa] IA\b/);
  });

  it("o chat chama a Ceci pelo nome e mostra o setor de cada agente", () => {
    const codigo = semComentarios(readFileSync(path.join(RAIZ, "src/components/shell/ChatDeIA.tsx"), "utf-8"));
    expect(codigo).toContain("NOME_DA_ASSISTENTE");
    expect(codigo).toContain("agente.especialidade");
    expect(codigo).not.toContain("OrbeDaIA");
  });

  // O botão do canto é só o desenho (13/10/2026): nome e setor saíram da
  // vista, mas continuam no nome acessível e na dica ao passar o mouse.
  it("o botão do canto mostra só a Ceci e guarda nome e setor no aria-label e na dica", () => {
    // Sem o \r do checkout no Windows (autocrlf): o fim do bloco é procurado pela quebra de linha.
    const codigo = semComentarios(readFileSync(path.join(RAIZ, "src/components/shell/ChatDeIA.tsx"), "utf-8").replace(/\r\n/g, "\n"));
    const inicio = codigo.indexOf("if (!aberto) {");
    const fim = codigo.indexOf("\n  }\n", inicio);
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const botao = codigo.slice(inicio, fim);
    // Com mensagem nova, o aviso vai junto no nome acessível ("… — BPO. 1 mensagem nova da Ceci").
    expect(botao).toContain("aria-label={`Falar com a ${NOME_DA_ASSISTENTE}, assistente do Connect — ${agente.especialidade}${aviso ? `. ${aviso}` : \"\"}`}");
    expect(botao).toContain("data-dica={`${NOME_DA_ASSISTENTE} · ${agente.especialidade}`}");
    expect(botao).not.toMatch(/>\s*\{(NOME_DA_ASSISTENTE|agente\.especialidade)\}\s*</);
    expect(botao).not.toContain("title=");
  });

  // Pedido do Kauan (13/10/2026): o campo não diz mais "Enter envia" — o Enter continua enviando.
  it("o campo não mostra o 'Enter envia', e o Enter continua mandando a pergunta", () => {
    const codigo = semComentarios(readFileSync(path.join(RAIZ, "src/components/shell/ChatDeIA.tsx"), "utf-8"));
    expect(codigo).not.toMatch(/Enter envia/i);
    expect(codigo).toContain('e.key === "Enter" && !e.shiftKey');
  });

  it("embaixo da pergunta vai o nome da tela, nunca o caminho cru", () => {
    const codigo = semComentarios(readFileSync(path.join(RAIZ, "src/components/shell/ChatDeIA.tsx"), "utf-8"));
    expect(codigo).toContain("contextoParaMostrar(m.contexto)");
    expect(codigo).not.toMatch(/\{m\.contexto\}/);
  });

  it("o brilho do botão para com prefers-reduced-motion", () => {
    const css = readFileSync(path.join(RAIZ, "src/app/globals.css"), "utf-8").replace(/\r\n/g, "\n");
    const semMovimento = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(semMovimento).toMatch(/\.c41-chamar\b[^{]*\{\s*animation: none/);
    expect(css).not.toContain("c41-borda-girando");
  });

  it("o tira-comentários não come texto de verdade", () => {
    expect(semComentarios('const a = "https://x"; // fora\n/* bloco */ b')).toBe('const a = "https://x"; \n b');
  });
});
