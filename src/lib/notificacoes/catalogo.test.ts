import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CATALOGO, doTipo, ehAba, filtroDaAba, ocultosValidos, tiposConfiguraveis } from "./catalogo";

// Os tipos que o código grava hoje e que não aparecem como literal num
// `notifyUser({ type: "…" })` (vêm de variável, ternário ou mapa).
const TIPOS_INDIRETOS = [
  "WHATSAPP_HANDOFF",
  "WHATSAPP_MESSAGE",
  "SOLICITACAO_NOVA",
  "SOLICITACAO_RESPOSTA",
  "SOLICITACAO_ENCAMINHADA",
  "SOLICITACAO_CANCELADA",
  "finance_approval_approved",
  "finance_approval_rejected",
  "HANDOFF_RECEIVED",
  "HANDOFF_ASSIGNED",
  "HANDOFF_MENTION",
  "HANDOFF_SECTOR_DONE",
  "CANDIDATE_UPDATE",
  "CANDIDATE_DATA_DELETION",
  "DOC_EXPIRING",
  "CERT_EXPIRING",
  "EXAM_DUE",
  "ADMISSAO_STALE",
  "FINANCE_CONTAS_DIA",
  "GESTAO_PARADO",
  "GESTAO_PRAZO",
  "ARQUIVO_DO_CLIENTE",
  "DRIVE_FILE_EXPIRING",
  "AUTORIZACAO_VALIDAR",
  "AUTORIZACAO_VENCENDO",
];

function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome !== "generated" && nome !== "node_modules") arquivos(p, out);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) out.push(p);
  }
  return out;
}

/** `type: "X"` dentro de uma chamada que cria notificação, no mesmo bloco. */
function tiposLiteraisNoCodigo(): Set<string> {
  const tipos = new Set<string>();
  const chamada = /(notifyUser|notifySector|avisarSobreAVaga|avisarORecrutamento)\s*\([^;]*?type:\s*"([A-Za-z_]+)"/g;
  for (const arq of arquivos(path.join(process.cwd(), "src"))) {
    const s = readFileSync(arq, "utf8");
    for (const m of s.matchAll(chamada)) tipos.add(m[2]);
  }
  return tipos;
}

describe("catálogo das notificações", () => {
  it("todo tipo gravado pelo código tem aba — nenhum cai no 'Aviso' genérico", () => {
    const usados = new Set([...tiposLiteraisNoCodigo(), ...TIPOS_INDIRETOS]);
    const semCatalogo = [...usados].filter((t) => !(t in CATALOGO));
    expect(semCatalogo).toEqual([]);
    // A varredura acha alguma coisa — se a regex quebrar, o teste acima passaria vazio.
    expect(tiposLiteraisNoCodigo().size).toBeGreaterThan(10);
  });

  it("tipo desconhecido cai em Alertas, com o sino", () => {
    expect(doTipo("TIPO_NOVO_QUALQUER")).toMatchObject({ aba: "alertas", icone: "sino" });
  });

  it("Alertas é o resto: o que não é Para mim nem Clientes, inclusive tipo novo", () => {
    const alertas = filtroDaAba("alertas");
    expect(alertas && "notIn" in alertas && alertas.notIn).toContain("MENTION");
    expect(alertas && "notIn" in alertas && alertas.notIn).toContain("NEW_APPLICATION");
    const paraMim = filtroDaAba("para_mim");
    expect(paraMim && "in" in paraMim && paraMim.in).toContain("HANDOFF_RECEIVED");
    expect(filtroDaAba("todas")).toBeUndefined();
  });

  it("tipo oculto sai da aba dele e de Todas; tipo novo nunca some", () => {
    expect(filtroDaAba("todas", ["GESTAO_PARADO"])).toEqual({ notIn: ["GESTAO_PARADO"] });
    const alertas = filtroDaAba("alertas", ["GESTAO_PARADO"]);
    expect(alertas && "notIn" in alertas && alertas.notIn).toContain("GESTAO_PARADO");
    expect(alertas && "notIn" in alertas && alertas.notIn).not.toContain("GESTAO_PRAZO");
    const paraMim = filtroDaAba("para_mim", ["COMMENT"]);
    expect(paraMim && "in" in paraMim && paraMim.in).not.toContain("COMMENT");
    expect(paraMim && "in" in paraMim && paraMim.in).toContain("MENTION");
    // Ocultar tudo de uma aba deixa a lista vazia, e não "sem filtro".
    const todosDeClientes = tiposConfiguraveis().find((g) => g.aba === "clientes")!.tipos.map((t) => t.tipo);
    expect(filtroDaAba("clientes", todosDeClientes)).toEqual({ in: [] });
  });

  it("preferências: só tipo do catálogo, sem legado, sem repetição", () => {
    expect(ocultosValidos(["GESTAO_PARADO", "GESTAO_PARADO", "GESTAO_ALERTA", "TIPO_NOVO", 42, null])).toEqual(["GESTAO_PARADO"]);
    expect(ocultosValidos("GESTAO_PARADO")).toEqual([]);
    const grupos = tiposConfiguraveis();
    expect(grupos.map((g) => g.aba)).toEqual(["para_mim", "clientes", "alertas"]);
    const todos = grupos.flatMap((g) => g.tipos.map((t) => t.tipo));
    expect(todos).toContain("GESTAO_PARADO");
    expect(todos).not.toContain("GESTAO_ALERTA");
    // Cada tipo configurável está na aba do catálogo.
    for (const g of grupos) for (const t of g.tipos) expect(CATALOGO[t.tipo].aba).toBe(g.aba);
  });

  it("aba válida só as quatro", () => {
    expect(ehAba("clientes")).toBe(true);
    expect(ehAba("setor")).toBe(false);
    expect(ehAba(undefined)).toBe(false);
  });
});
