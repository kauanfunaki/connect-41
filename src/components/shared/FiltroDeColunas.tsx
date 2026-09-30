"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";

/** O valor de cada coluna filtrável numa linha, pelo nome do campo. Data vai em ISO (AAAA-MM-DD). */
export type ValoresDaLinha = Record<string, string | null | undefined>;
export type LinhaDoFiltro = { id: string; valores: ValoresDaLinha };

export type CampoDaColuna = {
  chave: string;
  rotulo: string;
  /** `data`: o valor vem em ISO, aparece em dd/mm/aaaa e ordena do mais recente para o mais antigo. */
  tipo?: "texto" | "data";
};

type Filtros = Record<string, string[]>;

type Contexto = {
  linhas: LinhaDoFiltro[];
  filtros: Filtros;
  ocultas: Set<string>;
  definir: (chave: string, aceitos: string[] | null) => void;
};

const Ctx = createContext<Contexto | null>(null);

const VAZIO = "";

function valorDe(l: LinhaDoFiltro, chave: string): string {
  return (l.valores[chave] ?? VAZIO).trim();
}

function passa(l: LinhaDoFiltro, filtros: Filtros, exceto?: string): boolean {
  for (const [chave, aceitos] of Object.entries(filtros)) {
    if (chave === exceto) continue;
    if (!aceitos.includes(valorDe(l, chave))) return false;
  }
  return true;
}

function rotuloDoValor(v: string, tipo: CampoDaColuna["tipo"]): string {
  if (v === VAZIO) return "(vazio)";
  if (tipo === "data" && /^\d{4}-\d{2}-\d{2}/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return v;
}

/**
 * Filtro por coluna, como o do Excel — pedido do Kauan em 30/09 para não
 * encher as telas de filtros: cada coluna ganha um funil no cabeçalho, com a
 * lista dos valores que ela tem e caixas para marcar.
 *
 * Filtra **as linhas que a tela já trouxe**, no navegador. O recorte grande
 * (situação, competência, empresa) continua no servidor, pelo botão "Filtros";
 * este refina o que está na tela, sem ida ao servidor. As listas são em
 * cascata, como no Excel: o funil de uma coluna só oferece os valores das
 * linhas que passaram pelos filtros das outras.
 *
 * Uso: `TabelaFiltravel` em volta do casco (recebe os valores de cada linha,
 * calculados no servidor), `FiltroDaColuna` no `<th>` e `LinhaFiltravel` no
 * lugar do `<tr>`. As células continuam componente de servidor — só a linha é
 * de cliente, e só para sumir quando não passa.
 */
export function TabelaFiltravel({ linhas, children }: { linhas: LinhaDoFiltro[]; children: React.ReactNode }) {
  const [filtros, setFiltros] = useState<Filtros>({});

  const ocultas = useMemo(() => {
    const s = new Set<string>();
    if (Object.keys(filtros).length === 0) return s;
    for (const l of linhas) if (!passa(l, filtros)) s.add(l.id);
    return s;
  }, [linhas, filtros]);

  const contexto = useMemo<Contexto>(
    () => ({
      linhas,
      filtros,
      ocultas,
      definir: (chave, aceitos) =>
        setFiltros((atual) => {
          const novo = { ...atual };
          if (aceitos === null) delete novo[chave];
          else novo[chave] = aceitos;
          return novo;
        }),
    }),
    [linhas, filtros, ocultas]
  );

  const ativos = Object.keys(filtros).length;
  const visiveis = linhas.length - ocultas.size;

  return (
    <Ctx.Provider value={contexto}>
      {ativos > 0 && (
        <div className="hidden md:flex items-center gap-2 mb-2 text-[12px] text-fg-secondary">
          <ListFilter size={13} className="text-brand" />
          <span>
            Filtro nas colunas: <strong className="font-semibold text-fg tabular-nums">{visiveis}</strong> de{" "}
            <span className="tabular-nums">{linhas.length}</span> linhas
          </span>
          <button
            type="button"
            onClick={() => setFiltros({})}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border-strong text-[11.5px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
          >
            <X size={11} /> Limpar filtros das colunas
          </button>
        </div>
      )}
      {children}
      {ativos > 0 && visiveis === 0 && (
        <p className="hidden md:block mt-3 text-center text-[13px] text-fg-muted">Nenhuma linha com os filtros das colunas.</p>
      )}
    </Ctx.Provider>
  );
}

/** A `<tr>` que some quando não passa nos filtros das colunas. */
export function LinhaFiltravel({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx);
  if (ctx?.ocultas.has(id)) return null;
  return <tr className={className}>{children}</tr>;
}

/**
 * O cabeçalho com o funil. Uma coluna pode filtrar por mais de um campo — a de
 * fornecedor em /pagar mostra a empresa embaixo do nome, e filtra pelos dois.
 */
export function FiltroDaColuna({
  rotulo,
  chave,
  campos,
  tipo,
  align = "left",
}: {
  rotulo: React.ReactNode;
  /** Atalho para coluna de um campo só. */
  chave?: string;
  campos?: CampoDaColuna[];
  tipo?: CampoDaColuna["tipo"];
  align?: "left" | "right";
}) {
  const ctx = useContext(Ctx);
  const lista: CampoDaColuna[] = campos ?? (chave ? [{ chave, rotulo: typeof rotulo === "string" ? rotulo : chave, tipo }] : []);
  const [campoAtual, setCampoAtual] = useState(lista[0]?.chave ?? "");
  const [busca, setBusca] = useState("");

  const campo = lista.find((c) => c.chave === campoAtual) ?? lista[0];
  const ativo = !!ctx && lista.some((c) => ctx.filtros[c.chave]);

  // Valores do campo nas linhas que passam pelos filtros das OUTRAS colunas
  // (cascata), com a contagem de cada um.
  const valores = useMemo(() => {
    if (!ctx || !campo) return [];
    const contagem = new Map<string, number>();
    for (const l of ctx.linhas) {
      if (!passa(l, ctx.filtros, campo.chave)) continue;
      const v = valorDe(l, campo.chave);
      contagem.set(v, (contagem.get(v) ?? 0) + 1);
    }
    const todos = [...contagem.entries()].map(([valor, n]) => ({ valor, n }));
    if (campo.tipo === "data") todos.sort((a, b) => b.valor.localeCompare(a.valor));
    else todos.sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true, sensitivity: "base" }));
    return todos;
  }, [ctx, campo]);

  if (!ctx || !campo) return <>{rotulo}</>;

  const aceitos = ctx.filtros[campo.chave];
  const marcado = (v: string) => !aceitos || aceitos.includes(v);
  const q = busca.trim().toLowerCase();
  const visiveis = q ? valores.filter((v) => rotuloDoValor(v.valor, campo.tipo).toLowerCase().includes(q)) : valores;
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((v) => marcado(v.valor));

  function aplicar(novos: Set<string>) {
    if (!ctx || !campo) return;
    // Tudo marcado é o mesmo que não ter filtro — e não esconde linha que
    // aparecer depois com um valor novo.
    const universo = valores.map((v) => v.valor);
    if (universo.every((v) => novos.has(v))) ctx.definir(campo.chave, null);
    else ctx.definir(campo.chave, [...novos]);
  }

  function alternar(v: string) {
    const atual = new Set(aceitos ?? valores.map((x) => x.valor));
    if (atual.has(v)) atual.delete(v);
    else atual.add(v);
    aplicar(atual);
  }

  function alternarVisiveis() {
    const atual = new Set(aceitos ?? valores.map((x) => x.valor));
    for (const v of visiveis) {
      if (todosVisiveisMarcados) atual.delete(v.valor);
      else atual.add(v.valor);
    }
    aplicar(atual);
  }

  return (
    <span className="inline-flex items-center gap-1">
      {rotulo}
      <Popover
        align={align}
        width={280}
        aria-label={`Filtrar ${typeof rotulo === "string" ? rotulo.toLowerCase() : "coluna"}`}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              toggle();
            }}
            aria-label={`Filtrar a coluna ${typeof rotulo === "string" ? rotulo.toLowerCase() : ""}`.trim()}
            aria-expanded={open}
            className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
              ativo ? "bg-brand text-on-brand" : open ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <ListFilter size={11} />
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-2 normal-case tracking-normal font-normal">
            {lista.length > 1 && (
              <div className="flex rounded-md border border-border p-0.5 gap-0.5" role="tablist">
                {lista.map((c) => (
                  <button
                    key={c.chave}
                    type="button"
                    role="tab"
                    aria-selected={c.chave === campo.chave}
                    onClick={() => {
                      setCampoAtual(c.chave);
                      setBusca("");
                    }}
                    className={`flex-1 h-7 rounded text-[12px] font-medium transition-colors ${
                      c.chave === campo.chave ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {c.rotulo}
                    {ctx.filtros[c.chave] && " •"}
                  </button>
                ))}
              </div>
            )}
            <Input
              compact
              autoFocus
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar…"
              aria-label={`Buscar ${campo.rotulo.toLowerCase()}`}
            />
            <ul className="scroll-y max-h-[240px] overflow-y-auto flex flex-col">
              {visiveis.length > 0 && (
                <li>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-medium text-fg hover:bg-surface-hover cursor-pointer">
                    <Checkbox checked={todosVisiveisMarcados} onChange={alternarVisiveis} />
                    {q ? `Selecionar os ${visiveis.length} encontrados` : "(Selecionar tudo)"}
                  </label>
                </li>
              )}
              {visiveis.map((v) => (
                <li key={v.valor || "__vazio"}>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-fg-secondary hover:bg-surface-hover hover:text-fg cursor-pointer">
                    <Checkbox checked={marcado(v.valor)} onChange={() => alternar(v.valor)} className="flex-shrink-0" />
                    <span className={`flex-1 truncate ${v.valor === VAZIO ? "italic text-fg-muted" : ""}`}>
                      {rotuloDoValor(v.valor, campo.tipo)}
                    </span>
                    <span className="text-[11px] text-fg-muted tabular-nums">{v.n}</span>
                  </label>
                </li>
              ))}
              {visiveis.length === 0 && <li className="px-2 py-2 text-[12px] text-fg-muted">Nada encontrado.</li>}
            </ul>
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <button
                type="button"
                disabled={!aceitos}
                onClick={() => ctx.definir(campo.chave, null)}
                className="h-7 px-2.5 rounded-md text-[12px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Limpar esta coluna
              </button>
              <button
                type="button"
                onClick={close}
                className="h-7 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors"
              >
                Pronto
              </button>
            </div>
          </div>
        )}
      </Popover>
    </span>
  );
}
