"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
export function TabelaFiltravel({
  linhas,
  children,
  onLinhasVisiveis,
}: {
  linhas: LinhaDoFiltro[];
  children: React.ReactNode;
  /** Os ids que o funil deixa à vista, a cada mudança — para a seleção em
   *  massa, que mora acima da tabela, não levar linha escondida (02/10/2026). */
  onLinhasVisiveis?: (ids: Set<string>) => void;
}) {
  const [filtros, setFiltros] = useState<Filtros>({});

  const ocultas = useMemo(() => {
    const s = new Set<string>();
    if (Object.keys(filtros).length === 0) return s;
    for (const l of linhas) if (!passa(l, filtros)) s.add(l.id);
    return s;
  }, [linhas, filtros]);

  // Por uma chave de texto, e não pelo array: quem passa `linhas` costuma
  // recriá-lo a cada renderização, e avisar a cada uma faria um laço com o
  // estado do pai. Só avisa quando o conjunto visível muda de fato.
  const chaveDosVisiveis = linhas
    .filter((l) => !ocultas.has(l.id))
    .map((l) => l.id)
    .join("|");
  useEffect(() => {
    onLinhasVisiveis?.(new Set(chaveDosVisiveis ? chaveDosVisiveis.split("|") : []));
  }, [chaveDosVisiveis, onLinhasVisiveis]);

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
        <div className="c41-faixa-colunas hidden md:flex items-center gap-2 mb-2 text-[12px] text-fg-secondary">
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
        <p className="c41-sem-linhas hidden md:block mt-3 text-center text-[13px] text-fg-muted">Nenhuma linha com os filtros das colunas.</p>
      )}
    </Ctx.Provider>
  );
}

/** A `<tr>` que some quando não passa nos filtros das colunas. */
export function LinhaFiltravel({
  id,
  className,
  children,
  href,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
  /** Clicar na linha abre este endereço (05/10/2026, linha do Valora). O
   *  teclado segue pelo link que a linha já tem na primeira coluna. */
  href?: string;
}) {
  const ctx = useContext(Ctx);
  const router = useRouter();
  if (ctx?.ocultas.has(id)) return null;
  if (!href) return <tr className={className}>{children}</tr>;
  return (
    <tr
      className={`${className ?? ""} cursor-pointer`.trim()}
      onClick={(e) => {
        const alvo = e.target as HTMLElement;
        // Só o clique na própria linha: botão, link e campo seguem com o deles,
        // e o que vem de uma janela aberta a partir da linha (portal) não está
        // dentro do <tr>. Texto selecionado também não navega.
        if (!e.currentTarget.contains(alvo)) return;
        if (alvo.closest("a, button, input, select, textarea, label, [role='dialog']")) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

/** Um valor oferecido no funil: o que vai no filtro, o que aparece e quantas linhas têm. */
type ValorDoFunil = { valor: string; rotulo: string; n?: number };

/**
 * A lista do funil — busca, "(Selecionar tudo)" e uma caixa por valor. É a
 * mesma no funil que filtra no navegador e no que filtra no servidor; muda só
 * o que se faz com a escolha.
 *
 * `aceitos === null` quer dizer "sem filtro" (tudo marcado). Marcar tudo de
 * volta devolve `null`, e não a lista inteira: assim um valor que aparecer
 * depois não fica de fora de um filtro que ninguém quis fazer.
 */
function ListaDeValores({
  valores,
  aceitos,
  onMudar,
  rotuloDoCampo,
}: {
  valores: ValorDoFunil[];
  aceitos: Set<string> | null;
  onMudar: (novos: Set<string> | null) => void;
  rotuloDoCampo: string;
}) {
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  const visiveis = q ? valores.filter((v) => v.rotulo.toLowerCase().includes(q)) : valores;
  const marcado = (v: string) => !aceitos || aceitos.has(v);
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((v) => marcado(v.valor));

  function mudar(novos: Set<string>) {
    onMudar(valores.every((v) => novos.has(v.valor)) ? null : novos);
  }

  function alternar(v: string) {
    const atual = new Set(aceitos ?? valores.map((x) => x.valor));
    if (atual.has(v)) atual.delete(v);
    else atual.add(v);
    mudar(atual);
  }

  function alternarVisiveis() {
    const atual = new Set(aceitos ?? valores.map((x) => x.valor));
    for (const v of visiveis) {
      if (todosVisiveisMarcados) atual.delete(v.valor);
      else atual.add(v.valor);
    }
    mudar(atual);
  }

  return (
    <>
      <Input
        compact
        autoFocus
        icon={<Search />}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar…"
        aria-label={`Buscar ${rotuloDoCampo.toLowerCase()}`}
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
              <span className={`flex-1 truncate ${v.valor === VAZIO ? "italic text-fg-muted" : ""}`}>{v.rotulo}</span>
              {v.n !== undefined && <span className="text-[11px] text-fg-muted tabular-nums">{v.n}</span>}
            </label>
          </li>
        ))}
        {visiveis.length === 0 && <li className="px-2 py-2 text-[12px] text-fg-muted">Nada encontrado.</li>}
      </ul>
    </>
  );
}

/** O funil do cabeçalho — o botão; aceso quando a coluna tem filtro. */
function BotaoDoFunil({ ativo, open, onClick, rotulo }: { ativo: boolean; open: boolean; onClick: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filtrar a coluna ${rotulo}`.trim()}
      aria-expanded={open}
      className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
        ativo ? "bg-brand text-on-brand" : open ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-hover"
      }`}
    >
      <ListFilter size={11} />
    </button>
  );
}

const BOTAO_SECUNDARIO =
  "h-7 px-2.5 rounded-md text-[12px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-40 disabled:pointer-events-none transition-colors";
const BOTAO_PRIMARIO =
  "h-7 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-40 disabled:pointer-events-none transition-colors";

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
  // Remonta a lista ao abrir e ao trocar de campo: a busca começa vazia.
  const [versao, setVersao] = useState(0);

  const campo = lista.find((c) => c.chave === campoAtual) ?? lista[0];
  const ativo = !!ctx && lista.some((c) => ctx.filtros[c.chave]);

  // Valores do campo nas linhas que passam pelos filtros das OUTRAS colunas
  // (cascata), com a contagem de cada um.
  const valores = useMemo<ValorDoFunil[]>(() => {
    if (!ctx || !campo) return [];
    const contagem = new Map<string, number>();
    for (const l of ctx.linhas) {
      if (!passa(l, ctx.filtros, campo.chave)) continue;
      const v = valorDe(l, campo.chave);
      contagem.set(v, (contagem.get(v) ?? 0) + 1);
    }
    const todos = [...contagem.entries()].map(([valor, n]) => ({ valor, n, rotulo: rotuloDoValor(valor, campo.tipo) }));
    if (campo.tipo === "data") todos.sort((a, b) => b.valor.localeCompare(a.valor));
    else todos.sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR", { numeric: true, sensitivity: "base" }));
    return todos;
  }, [ctx, campo]);

  if (!ctx || !campo) return <>{rotulo}</>;

  const aceitos = ctx.filtros[campo.chave];
  const nome = typeof rotulo === "string" ? rotulo.toLowerCase() : "";

  return (
    <span className="inline-flex items-center gap-1">
      {rotulo}
      <Popover
        align={align}
        width={280}
        aria-label={`Filtrar ${nome || "coluna"}`}
        trigger={({ open, toggle }) => (
          <BotaoDoFunil
            ativo={ativo}
            open={open}
            rotulo={nome}
            onClick={() => {
              setVersao((v) => v + 1);
              toggle();
            }}
          />
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
                      setVersao((v) => v + 1);
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
            <ListaDeValores
              key={`${campo.chave}-${versao}`}
              valores={valores}
              aceitos={aceitos ? new Set(aceitos) : null}
              onMudar={(novos) => ctx.definir(campo.chave, novos ? [...novos] : null)}
              rotuloDoCampo={campo.rotulo}
            />
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <button type="button" disabled={!aceitos} onClick={() => ctx.definir(campo.chave, null)} className={BOTAO_SECUNDARIO}>
                Limpar esta coluna
              </button>
              <button type="button" onClick={close} className={BOTAO_PRIMARIO}>
                Pronto
              </button>
            </div>
          </div>
        )}
      </Popover>
    </span>
  );
}

/**
 * O funil para tabela **paginada** (Empresas, Pessoas, Clientes): filtra no
 * servidor, pela URL, e não nas linhas da tela.
 *
 * Numa lista de 20 por página, filtrar só as linhas visíveis engana — "Simples
 * Nacional" sumiria da página 1 e continuaria nas outras 19. Aqui os valores e
 * as contagens vêm do banco (a tela inteira, não a página), a escolha vai para
 * a URL como parâmetro repetido (`?regime=A&regime=B`) e a página volta para 1.
 * Por ir ao servidor, aplica no "Aplicar", e não a cada caixa marcada.
 */
export function FiltroDaColunaNaUrl({
  rotulo,
  chave,
  opcoes,
  align = "left",
}: {
  rotulo: string;
  /** Nome do parâmetro na URL. */
  chave: string;
  opcoes: ValorDoFunil[];
  align?: "left" | "right";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const naUrl = params.getAll(chave);
  const [rascunho, setRascunho] = useState<Set<string> | null>(naUrl.length ? new Set(naUrl) : null);

  function ir(valores: string[] | null) {
    const q = new URLSearchParams(params.toString());
    q.delete(chave);
    for (const v of valores ?? []) q.append(chave, v);
    q.delete("page");
    q.delete("pagina");
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <span className="inline-flex items-center gap-1">
      {rotulo}
      <Popover
        align={align}
        width={300}
        aria-label={`Filtrar ${rotulo.toLowerCase()}`}
        trigger={({ open, toggle }) => (
          <BotaoDoFunil
            ativo={naUrl.length > 0}
            open={open}
            rotulo={rotulo.toLowerCase()}
            onClick={() => {
              // Abre sempre no que está aplicado, não no rascunho abandonado.
              setRascunho(naUrl.length ? new Set(naUrl) : null);
              toggle();
            }}
          />
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-2 normal-case tracking-normal font-normal">
            <ListaDeValores valores={opcoes} aceitos={rascunho} onMudar={setRascunho} rotuloDoCampo={rotulo} />
            <div className="flex justify-between gap-2 border-t border-border pt-2">
              <button
                type="button"
                disabled={naUrl.length === 0}
                onClick={() => {
                  close();
                  ir(null);
                }}
                className={BOTAO_SECUNDARIO}
              >
                Limpar esta coluna
              </button>
              <button
                type="button"
                disabled={rascunho !== null && rascunho.size === 0}
                onClick={() => {
                  close();
                  ir(rascunho ? [...rascunho] : null);
                }}
                className={BOTAO_PRIMARIO}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </Popover>
    </span>
  );
}

/**
 * A faixa "Filtro nas colunas" do funil que filtra pela URL — o par da que a
 * `TabelaFiltravel` mostra. Vai acima da tabela **e** do estado vazio: quando o
 * funil esvazia a lista, a tabela some e o funil some com ela, e era só daqui
 * (antes, de um "Limpar" posto à mão no estado vazio de cada tela) que dava
 * para desfazer o filtro (02/10/2026).
 */
export function FiltrosDasColunasNaUrl({ colunas }: { colunas: { chave: string; rotulo: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ativas = colunas
    .map((c) => ({ ...c, n: params.getAll(c.chave).length }))
    .filter((c) => c.n > 0);
  if (ativas.length === 0) return null;

  function tirar(chaves: string[]) {
    const q = new URLSearchParams(params.toString());
    for (const k of chaves) q.delete(k);
    q.delete("page");
    q.delete("pagina");
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="c41-faixa-colunas flex flex-wrap items-center gap-2 mb-2 text-[12px] text-fg-secondary">
      <ListFilter size={13} className="text-brand" />
      <span>Filtro nas colunas:</span>
      {ativas.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => tirar([c.chave])}
          aria-label={`Tirar o filtro de ${c.rotulo.toLowerCase()}`}
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-full border border-brand/30 bg-brand-subtle text-[11.5px] font-medium text-fg hover:border-brand/60 transition-colors"
        >
          {c.rotulo}
          {c.n > 1 && <span className="tabular-nums text-fg-muted">({c.n})</span>}
          <X size={11} className="text-fg-muted" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => tirar(ativas.map((c) => c.chave))}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border-strong text-[11.5px] font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
      >
        <X size={11} /> Limpar filtros das colunas
      </button>
    </div>
  );
}
