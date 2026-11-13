import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// O JS que toda tela carrega (13/11/2026, Controle interno melhoria-661). O
// layout do (app) põe o menu, o chat e a chamada do robô em todas as telas; o
// que eles importam, no lado do cliente, vai no pacote de todas elas. O zod
// chegava por três caminhos (meta da Academia, cartão de abertura do
// Societário, assistência do robô) e pesava ~110 KB. O build não reclama
// quando um caminho novo aparece: este teste, sim.

const SRC = path.resolve(__dirname, "../..");
const LAYOUTS = ["app/layout.tsx", "app/(app)/layout.tsx"].map((p) => path.join(SRC, p));

type Fonte = { diretiva: "use client" | "use server" | null; imports: string[] };
const cache = new Map<string, Fonte>();

/** Os imports estáticos que trazem código (não os `import type`, nem o `import()` sob demanda). */
function lerFonte(arquivo: string): Fonte {
  const ja = cache.get(arquivo);
  if (ja) return ja;
  const texto = readFileSync(arquivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const diretiva = (texto.match(/^\s*["'](use client|use server)["']/)?.[1] ?? null) as Fonte["diretiva"];
  const imports: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  for (const m of texto.matchAll(re)) {
    if (m[1]) continue;
    const clausula = (m[2] ?? "").trim();
    const soTipos = /^\{[^}]*\}$/.test(clausula) && clausula.slice(1, -1).split(",").map((p) => p.trim()).filter(Boolean).every((p) => p.startsWith("type "));
    if (!soTipos) imports.push(m[3] ?? m[4]);
  }
  const fonte = { diretiva, imports };
  cache.set(arquivo, fonte);
  return fonte;
}

function resolver(de: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(de), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** O primeiro caminho, no lado do cliente, de um dos `inicios` até um pacote que case com `alvo`. */
function caminhoNoCliente(inicios: string[], alvo: RegExp): string[] | null {
  const vistos = { cliente: new Set<string>(), servidor: new Set<string>() };
  function andar(arquivo: string, noCliente: boolean, trilha: string[]): string[] | null {
    const fonte = lerFonte(arquivo);
    if (noCliente && fonte.diretiva === "use server") return null; // vira referência de ação
    const cliente = noCliente || fonte.diretiva === "use client";
    const vistosAqui = cliente ? vistos.cliente : vistos.servidor;
    if (vistosAqui.has(arquivo)) return null;
    vistosAqui.add(arquivo);
    const aqui = [...trilha, path.relative(SRC, arquivo).replace(/\\/g, "/")];
    for (const spec of fonte.imports) {
      if (cliente && alvo.test(spec)) return [...aqui, spec];
      const proximo = resolver(arquivo, spec);
      const achou = proximo && andar(proximo, cliente, aqui);
      if (achou) return achou;
    }
    return null;
  }
  for (const inicio of inicios) {
    const achou = andar(inicio, false, []);
    if (achou) return achou;
  }
  return null;
}

function arquivosDe(pasta: string, acc: string[] = []): string[] {
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) {
      if (e.name !== "generated") arquivosDe(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("o JS que toda tela carrega", () => {
  it("o menu não traz o zod (os esquemas ficam no servidor)", () => {
    expect(caminhoNoCliente(LAYOUTS, /^zod(\/|$)/)?.join(" → ") ?? null).toBeNull();
  });

  it("o menu não traz o editor de texto", () => {
    expect(caminhoNoCliente(LAYOUTS, /^@tiptap\//)?.join(" → ") ?? null).toBeNull();
  });
});

describe("o editor de texto (Tiptap) vem sob demanda", () => {
  const EDITOR = path.join(SRC, "components/ui/RichTextEditorTiptap.tsx");
  let todos: string[] | null = null;
  const arquivosDoSrc = () => (todos ??= arquivosDe(SRC));

  it("só o RichTextEditorTiptap importa o Tiptap", () => {
    const outros = arquivosDoSrc().filter((f) => f !== EDITOR && lerFonte(f).imports.some((s) => s.startsWith("@tiptap/")));
    expect(outros.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual([]);
  });

  it("ninguém importa o RichTextEditorTiptap de forma estática: as telas usam o RichTextEditor", () => {
    const estaticos = arquivosDoSrc().filter((f) => lerFonte(f).imports.some((s) => resolver(f, s) === EDITOR));
    expect(estaticos.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual([]);
  });
});
