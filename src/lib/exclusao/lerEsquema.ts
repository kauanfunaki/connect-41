// Leitura do `prisma/schema.prisma` para os testes da exclusão.
//
// O cliente gerado pelo Prisma 7 (`runtimeDataModel`) guarda os campos de cada
// model, mas não o lado da chave nem o `onDelete` — justamente o que decide se
// a exclusão passa. Por isso os testes leem o schema, que é a fonte de onde o
// cliente é gerado, e conferem os nomes de model contra `Prisma.ModelName`.
//
// Leitor de linha: entende o formato que o `prisma format` escreve (um campo
// por linha, `@relation(...)` na mesma linha). Só para teste — não roda no app.

export type OnDelete = "Cascade" | "SetNull" | "Restrict" | "NoAction" | "SetDefault";

export type RelacaoDoEsquema = {
  /** Model que guarda a chave ("Vaga"). */
  modelo: string;
  /** Campo de relação ("company"). */
  campo: string;
  /** Model apontado ("Company"). */
  alvo: string;
  /** Colunas da chave (["companyId"]). */
  fks: string[];
  opcional: boolean;
  /** O efetivo: o explícito, ou o padrão do Prisma (opcional → SetNull, obrigatório → Restrict). */
  onDelete: OnDelete;
};

export type ModeloDoEsquema = {
  nome: string;
  /** Campos escalares e enums: nome → opcional. */
  escalares: Map<string, { tipo: string; opcional: boolean }>;
};

export type Esquema = {
  modelos: Map<string, ModeloDoEsquema>;
  relacoes: RelacaoDoEsquema[];
};

const TIPOS_ESCALARES = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);

export function lerEsquema(texto: string): Esquema {
  const enums = new Set([...texto.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]));
  const modelos = new Map<string, ModeloDoEsquema>();
  const relacoes: RelacaoDoEsquema[] = [];

  for (const bloco of texto.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const nome = bloco[1];
    const modelo: ModeloDoEsquema = { nome, escalares: new Map() };
    modelos.set(nome, modelo);

    for (const bruta of bloco[2].split("\n")) {
      const linha = bruta.replace(/\/\/.*$/, "").trim();
      if (!linha || linha.startsWith("@@")) continue;
      const m = linha.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!m) continue;
      const [, campo, tipo, lista, opcional, resto] = m;
      if (TIPOS_ESCALARES.has(tipo) || enums.has(tipo)) {
        modelo.escalares.set(campo, { tipo, opcional: !!opcional });
        continue;
      }
      if (lista) continue; // o lado sem chave da relação
      const rel = resto.match(/@relation\(([^)]*)\)/);
      const fks = rel?.[1].match(/fields:\s*\[([^\]]*)\]/)?.[1];
      if (!fks) continue; // o lado sem chave de uma relação 1-1
      const explicito = rel![1].match(/onDelete:\s*(\w+)/)?.[1] as OnDelete | undefined;
      relacoes.push({
        modelo: nome,
        campo,
        alvo: tipo,
        fks: fks.split(",").map((f) => f.trim()),
        opcional: !!opcional,
        onDelete: explicito ?? (opcional ? "SetNull" : "Restrict"),
      });
    }
  }
  return { modelos, relacoes };
}

/** O banco recusa apagar a linha apontada enquanto houver esta ligação. */
export function trava(r: RelacaoDoEsquema): boolean {
  return r.onDelete === "Restrict" || r.onDelete === "NoAction" || r.onDelete === "SetDefault";
}
