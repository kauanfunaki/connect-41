// As chaves estrangeiras como as migrations deixaram o banco — e onde elas
// divergem do `prisma/schema.prisma`.
//
// Por que existe: as migrations deste projeto são escritas à mão (nunca
// `db push`), e nada obriga o SQL a bater com o schema. Em 24/07/2026 o link do
// teste (`assessment_links`) nasceu com ON DELETE RESTRICT para a candidatura e
// para o modelo, enquanto o schema (relação opcional, sem `onDelete`) diz
// SetNull — e a exclusão de candidato e de empresa, que confia no schema,
// esbarrava no banco (corrigido em 20261014200000). Este leitor refaz, migration
// a migration, o estado final de cada chave e da nulidade das colunas, para os
// testes simularem a exclusão contra o banco e acusarem divergência nova.
//
// Limite: só enxerga o que está nas migrations. Se alguém mexeu no banco de
// produção à mão (há drift conhecido lá), isto não vê.
//
// Leitor de SQL do MySQL no formato que as migrations usam (CREATE TABLE,
// ALTER TABLE com ADD/MODIFY/CHANGE/DROP COLUMN, ADD CONSTRAINT … FOREIGN KEY,
// DROP FOREIGN KEY, DROP TABLE, RENAME TABLE). Só para teste — não roda no app.

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import type { Esquema, OnDelete, RelacaoDoEsquema } from "./lerEsquema";

export type ChaveDoBanco = {
  /** Nome da constraint ("assessment_links_candidaturaId_fkey"). */
  nome: string;
  tabela: string;
  colunas: string[];
  /** Tabela apontada. */
  alvo: string;
  onDelete: OnDelete;
  /** A migration que deixou a chave como está. */
  migration: string;
};

export type EstadoDoBanco = {
  /** Por nome da constraint. */
  chaves: Map<string, ChaveDoBanco>;
  /** tabela → coluna → aceita NULL. */
  colunas: Map<string, Map<string, boolean>>;
};

export type Migration = { nome: string; sql: string };

const ACAO: Record<string, OnDelete> = {
  "SET NULL": "SetNull",
  RESTRICT: "Restrict",
  CASCADE: "Cascade",
  "NO ACTION": "NoAction",
  "SET DEFAULT": "SetDefault",
};

/** Lê `prisma/migrations/<pasta>/migration.sql` em ordem. Com `antesDe`, para antes da pasta que começa por ele. */
export function lerMigrations(dir: string, opcoes: { antesDe?: string } = {}): Migration[] {
  const saida: Migration[] = [];
  for (const pasta of readdirSync(dir).sort()) {
    if (opcoes.antesDe && pasta >= opcoes.antesDe) break;
    const arquivo = path.join(dir, pasta, "migration.sql");
    if (!existsSync(arquivo)) continue;
    saida.push({ nome: pasta, sql: readFileSync(arquivo, "utf8") });
  }
  return saida;
}

// ─── Leitura do SQL ─────────────────────────────────────────────────────────

/** Tira comentários (`-- …` e `/* … *\/`) fora de aspas. */
function semComentarios(sql: string): string {
  let saida = "";
  let aspas: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (aspas) {
      saida += c;
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      aspas = c;
      saida += c;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      saida += "\n";
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const fim = sql.indexOf("*/", i + 2);
      i = fim < 0 ? sql.length : fim + 1;
      saida += " ";
      continue;
    }
    saida += c;
  }
  return saida;
}

/** Divide no separador, fora de aspas e de parênteses. */
function dividir(texto: string, separador: ";" | ","): string[] {
  const partes: string[] = [];
  let atual = "";
  let aspas: string | null = null;
  let nivel = 0;
  for (const c of texto) {
    if (aspas) {
      atual += c;
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") aspas = c;
    else if (c === "(") nivel++;
    else if (c === ")") nivel--;
    else if (c === separador && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
      continue;
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes.filter(Boolean);
}

const nomes = (lista: string) => [...lista.matchAll(/`(\w+)`/g)].map((m) => m[1]!);

/** "`col` VARCHAR(191) NOT NULL DEFAULT …" → aceita NULL? */
const aceitaNulo = (definicao: string) => !/\bNOT\s+NULL\b/i.test(definicao) && !/\bPRIMARY\s+KEY\b/i.test(definicao);

const RE_CHAVE =
  /^(?:ADD\s+)?CONSTRAINT\s+`(\w+)`\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+`(\w+)`\s*\([^)]*\)(?:\s+ON\s+DELETE\s+(SET\s+NULL|RESTRICT|CASCADE|NO\s+ACTION|SET\s+DEFAULT))?/i;

function aplicarClausula(estado: EstadoDoBanco, tabela: string, clausula: string, migration: string): void {
  const colunas = () => {
    let t = estado.colunas.get(tabela);
    if (!t) estado.colunas.set(tabela, (t = new Map()));
    return t;
  };

  const chave = clausula.match(RE_CHAVE);
  if (chave) {
    const [, nome, cols, alvo, acao] = chave;
    estado.chaves.set(nome!, {
      nome: nome!,
      tabela,
      colunas: nomes(cols!),
      alvo: alvo!,
      // Sem ON DELETE, o InnoDB usa NO ACTION — que no MySQL é o mesmo que RESTRICT.
      onDelete: acao ? ACAO[acao.toUpperCase().replace(/\s+/g, " ")]! : "Restrict",
      migration,
    });
    return;
  }
  let m = clausula.match(/^DROP\s+FOREIGN\s+KEY\s+`(\w+)`/i);
  if (m) {
    estado.chaves.delete(m[1]!);
    return;
  }
  m = clausula.match(/^ADD\s+(?:COLUMN\s+)?`(\w+)`\s+([\s\S]*)$/i);
  if (m) {
    colunas().set(m[1]!, aceitaNulo(m[2]!));
    return;
  }
  m = clausula.match(/^MODIFY\s+(?:COLUMN\s+)?`(\w+)`\s+([\s\S]*)$/i);
  if (m) {
    colunas().set(m[1]!, aceitaNulo(m[2]!));
    return;
  }
  m = clausula.match(/^CHANGE\s+(?:COLUMN\s+)?`(\w+)`\s+`(\w+)`\s+([\s\S]*)$/i);
  if (m) {
    colunas().delete(m[1]!);
    colunas().set(m[2]!, aceitaNulo(m[3]!));
    return;
  }
  m = clausula.match(/^DROP\s+(?:COLUMN\s+)?`(\w+)`/i);
  if (m) colunas().delete(m[1]!);
  // ADD INDEX, ADD UNIQUE, DROP INDEX, RENAME INDEX…: não mexem em chave nem em nulidade.
}

function aplicarComando(estado: EstadoDoBanco, comando: string, migration: string): void {
  let m = comando.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`(\w+)`\s*\(([\s\S]*)\)[^)]*$/i);
  if (m) {
    const tabela = m[1]!;
    estado.colunas.set(tabela, new Map());
    for (const item of dividir(m[2]!, ",")) {
      if (item.startsWith("`")) {
        const col = item.match(/^`(\w+)`\s+([\s\S]*)$/);
        if (col) estado.colunas.get(tabela)!.set(col[1]!, aceitaNulo(col[2]!));
      } else {
        aplicarClausula(estado, tabela, item, migration);
      }
    }
    return;
  }
  m = comando.match(/^ALTER\s+TABLE\s+`(\w+)`\s+([\s\S]*)$/i);
  if (m) {
    for (const clausula of dividir(m[2]!, ",")) aplicarClausula(estado, m[1]!, clausula, migration);
    return;
  }
  m = comando.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`(\w+)`/i);
  if (m) {
    const tabela = m[1]!;
    estado.colunas.delete(tabela);
    for (const [nome, c] of estado.chaves) if (c.tabela === tabela) estado.chaves.delete(nome);
    return;
  }
  m = comando.match(/^RENAME\s+TABLE\s+`(\w+)`\s+TO\s+`(\w+)`/i);
  if (m) {
    const [, de, para] = m;
    const cols = estado.colunas.get(de!);
    if (cols) {
      estado.colunas.delete(de!);
      estado.colunas.set(para!, cols);
    }
    for (const c of estado.chaves.values()) {
      if (c.tabela === de) c.tabela = para!;
      if (c.alvo === de) c.alvo = para!;
    }
  }
}

/** O banco depois de rodar as migrations, em ordem. */
export function estadoDoBanco(migrations: readonly Migration[]): EstadoDoBanco {
  const estado: EstadoDoBanco = { chaves: new Map(), colunas: new Map() };
  for (const { nome, sql } of migrations) {
    for (const comando of dividir(semComentarios(sql), ";")) aplicarComando(estado, comando, nome);
  }
  return estado;
}

// ─── Comparação com o schema ────────────────────────────────────────────────

/** No MySQL, NO ACTION e RESTRICT são a mesma coisa (o InnoDB confere na hora). */
const mesmaAcao = (a: OnDelete, b: OnDelete) => a === b || (["Restrict", "NoAction"].includes(a) && ["Restrict", "NoAction"].includes(b));

const chaveDe = (tabela: string, colunas: readonly string[]) => `${tabela}(${colunas.join(",")})`;

export type Divergencia =
  | {
      tipo: "acao";
      modelo: string;
      campo: string;
      tabela: string;
      colunas: string[];
      alvo: string;
      banco: OnDelete;
      schema: OnDelete;
      constraint: string;
      migration: string;
    }
  | { tipo: "nulidade"; modelo: string; campo: string; tabela: string; coluna: string; bancoAceitaNulo: boolean; schemaOpcional: boolean }
  | { tipo: "so-no-schema"; modelo: string; campo: string; tabela: string; colunas: string[]; schema: OnDelete }
  | { tipo: "so-no-banco"; tabela: string; colunas: string[]; alvo: string; banco: OnDelete; constraint: string };

/**
 * Onde o schema e o banco (pelas migrations) discordam nas chaves estrangeiras:
 * a ação do ON DELETE, a nulidade da coluna da chave, e chave que só existe de
 * um dos lados. Casa pela tabela e pelas colunas, não pelo nome da constraint.
 */
export function divergencias(esquema: Esquema, banco: EstadoDoBanco): Divergencia[] {
  const saida: Divergencia[] = [];
  const doBanco = new Map<string, ChaveDoBanco>();
  for (const c of banco.chaves.values()) doBanco.set(chaveDe(c.tabela, c.colunas), c);
  const vistas = new Set<string>();

  for (const r of esquema.relacoes) {
    const tabela = esquema.modelos.get(r.modelo)?.tabela ?? r.modelo;
    const k = chaveDe(tabela, r.fks);
    const c = doBanco.get(k);
    if (!c) {
      saida.push({ tipo: "so-no-schema", modelo: r.modelo, campo: r.campo, tabela, colunas: r.fks, schema: r.onDelete });
      continue;
    }
    vistas.add(k);
    if (!mesmaAcao(c.onDelete, r.onDelete)) {
      saida.push({
        tipo: "acao",
        modelo: r.modelo,
        campo: r.campo,
        tabela,
        colunas: r.fks,
        alvo: c.alvo,
        banco: c.onDelete,
        schema: r.onDelete,
        constraint: c.nome,
        migration: c.migration,
      });
    }
    for (const coluna of r.fks) {
      const nulo = banco.colunas.get(tabela)?.get(coluna);
      if (nulo === undefined) continue;
      // Relação opcional no schema sobre coluna NOT NULL no banco (ou o contrário).
      const opcional = esquema.modelos.get(r.modelo)?.escalares.get(coluna)?.opcional ?? r.opcional;
      if (nulo !== opcional) {
        saida.push({ tipo: "nulidade", modelo: r.modelo, campo: r.campo, tabela, coluna, bancoAceitaNulo: nulo, schemaOpcional: opcional });
      }
    }
  }
  for (const [k, c] of doBanco) {
    if (!vistas.has(k)) saida.push({ tipo: "so-no-banco", tabela: c.tabela, colunas: c.colunas, alvo: c.alvo, banco: c.onDelete, constraint: c.nome });
  }
  return saida;
}

/** Uma linha legível por divergência — para a mensagem do teste e para a lista do PR. */
export function descrever(d: Divergencia): string {
  switch (d.tipo) {
    case "acao":
      return `${d.tabela}.${d.colunas.join(",")} → ${d.alvo}: banco ON DELETE ${d.banco}, schema ${d.schema} (${d.modelo}.${d.campo}; ${d.constraint}, ${d.migration})`;
    case "nulidade":
      return `${d.tabela}.${d.coluna}: banco ${d.bancoAceitaNulo ? "NULL" : "NOT NULL"}, schema ${d.schemaOpcional ? "opcional" : "obrigatório"} (${d.modelo}.${d.campo})`;
    case "so-no-schema":
      return `${d.tabela}.${d.colunas.join(",")}: relação ${d.modelo}.${d.campo} sem chave estrangeira nas migrations`;
    case "so-no-banco":
      return `${d.tabela}.${d.colunas.join(",")} → ${d.alvo}: chave ${d.constraint} (ON DELETE ${d.banco}) sem relação no schema`;
  }
}

/**
 * As relações do schema com o ON DELETE que o banco tem de fato (pelas
 * migrations). Relação sem chave no banco fica com o do schema.
 */
export function relacoesComOBanco(esquema: Esquema, banco: EstadoDoBanco): RelacaoDoEsquema[] {
  const doBanco = new Map<string, ChaveDoBanco>();
  for (const c of banco.chaves.values()) doBanco.set(chaveDe(c.tabela, c.colunas), c);
  return esquema.relacoes.map((r) => {
    const tabela = esquema.modelos.get(r.modelo)?.tabela ?? r.modelo;
    const c = doBanco.get(chaveDe(tabela, r.fks));
    return c ? { ...r, onDelete: c.onDelete } : r;
  });
}
