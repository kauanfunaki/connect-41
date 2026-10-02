import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Contrato do gate de módulo (02/10/2026): toda tela e toda ação destas pastas
// passa por `abrirTelaDoModulo` / `podeNoModulo`. Em 30/09 o DP inteiro estava
// aberto para qualquer pessoa do escritório porque cada tela nova nascia sem o
// gate — este teste é o que impede a próxima de nascer assim.

const APP = path.join(process.cwd(), "src", "app", "(app)");

const PASTAS = [
  "colaboradores",
  "admissoes",
  "ferias",
  "desligamentos",
  "afastamentos",
  "horas-extras",
  "escalas",
  "treinamentos",
  "avaliacoes",
  "indicadores-rh",
  "cargos-salarios",
  "candidatos",
  "colaboradores-clientes",
  "pessoas/[id]/afastamentos",
  "pessoas/[id]/horas-extras",
  "pessoas/[id]/escala",
  "pessoas/[id]/treinamentos",
  "pessoas/[id]/avaliacoes",
  "pessoas/[id]/ferias",
  "pessoas/[id]/desligamento",
  "pessoas/[id]/exames",
  "pessoas/[id]/beneficios",
  "pessoas/[id]/salario",
  "pessoas/[id]/esocial-s2200",
];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const telas = PASTAS.flatMap((p) => arquivos(path.join(APP, p))).filter((f) => f.endsWith("page.tsx"));
const acoes = [
  ...PASTAS.flatMap((p) => arquivos(path.join(APP, p))),
  path.join(APP, "pessoas", "[id]", "admissao-actions.ts"),
].filter((f) => /(^|[\\/])([a-z-]+-)?actions\.ts$/.test(f));

const nome = (f: string) => path.relative(APP, f).replace(/\\/g, "/");

describe("gate de módulo nas telas do DP, Gestão de RH e Recrutamento", () => {
  it("achou as telas e as ações", () => {
    expect(telas.length).toBeGreaterThan(30);
    expect(acoes.length).toBeGreaterThan(15);
  });

  it.each(telas.map((f) => [nome(f), f]))("tela %s abre pelo gate", (_, f) => {
    const s = readFileSync(f, "utf8");
    expect(s).toMatch(/abrirTelaDoModulo\("[a-z_]+"\)/);
    expect(s).not.toMatch(/canWrite\(ctx\.role\)/);
  });

  it.each(acoes.map((f) => [nome(f), f]))("ação %s checa o módulo antes de gravar", (_, f) => {
    const s = readFileSync(f, "utf8");
    expect(s).toMatch(/podeNoModulo\(ctx, "[a-z_]+", "(agir|gerir)"\)/);
    expect(s).not.toMatch(/canWrite\(ctx\.role\)|canWriteEntity\(ctx\)/);
  });
});
