"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock3, Building2, User, UserSearch, SquareKanban, SquareCheck, Briefcase, FileText } from "lucide-react";
import { boardPath } from "@/lib/kanbanPaths";
import { IconButton } from "@/components/ui/IconButton";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { useTelasRecentes } from "@/components/shell/TelasRecentes";
import { buscarTelas, type TelaNavegavel } from "@/lib/buscaDeTelas";

type DocumentEntityType = "PERSON" | "COMPANY" | "VAGA" | "PIPELINE_ITEM";

type SearchResults = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  candidatos: { id: string; name: string }[];
  pipelines: { id: string; name: string; sectorCode: string }[];
  vagas: { id: string; name: string }[];
  documentos: { id: string; name: string; entityType: DocumentEntityType; entityId: string }[];
  tarefas: { id: string; name: string; href: string }[];
  /** Processos do Societário (07/10/2026). Opcional: a resposta antiga não traz. */
  processos?: { id: string; name: string; detalhe?: string }[];
};

const EMPTY: SearchResults = { companies: [], people: [], candidatos: [], pipelines: [], vagas: [], documentos: [], tarefas: [], processos: [] };

/** Uma linha do painel: o que as setas percorrem e o Enter abre. */
type Opcao = { chave: string; href: string; rotulo: string; detalhe?: string; icone: React.ReactNode };
type Grupo = { rotulo: string; opcoes: Opcao[] };

// Documento não tem página própria — o resultado leva pra ficha de quem é
// dono dele. Item de Kanban não tem link direto sem saber o pipelineId
// (custaria uma query extra só pra isso) — cai na listagem geral.
function documentHref(entityType: DocumentEntityType, entityId: string): string {
  switch (entityType) {
    case "PERSON": return `/pessoas/${entityId}`;
    case "COMPANY": return `/empresas/${entityId}`;
    case "VAGA": return `/vagas/${entityId}`;
    case "PIPELINE_ITEM": return "/kanban";
  }
}

/**
 * Os grupos do painel, na ordem em que aparecem — e é a mesma ordem do Enter
 * sem seta: telas primeiro (quem digita "conc" quase sempre quer abrir a
 * conciliação, não achar um lançamento com "conc" no nome), depois empresas,
 * os processos do Societário (logo depois da empresa, que é como se procura
 * um processo), pessoas, candidatos, Kanban, tarefas, vagas e documentos.
 *
 * Cada tipo com o seu ícone (07/10/2026): as telas tinham, os resultados de
 * dado não, e a lista misturava os dois sem distinção.
 */
function montarGrupos(telas: TelaNavegavel[], r: SearchResults): Grupo[] {
  const ic = (Icone: typeof Building2) => <Icone size={16} />;
  return [
    {
      rotulo: "Telas",
      opcoes: telas.map((t) => ({ chave: `tela-${t.code}`, href: t.href, rotulo: t.label, detalhe: t.setor, icone: <ModuleIcon code={t.code} /> })),
    },
    { rotulo: "Empresas", opcoes: r.companies.map((c) => ({ chave: `empresa-${c.id}`, href: `/empresas/${c.id}`, rotulo: c.name, icone: ic(Building2) })) },
    {
      rotulo: "Processos",
      opcoes: (r.processos ?? []).map((p) => ({
        chave: `processo-${p.id}`,
        href: `/processos/${p.id}`,
        rotulo: p.name,
        detalhe: p.detalhe,
        icone: <ModuleIcon code="societario_processos" />,
      })),
    },
    { rotulo: "Pessoas", opcoes: r.people.map((p) => ({ chave: `pessoa-${p.id}`, href: `/pessoas/${p.id}`, rotulo: p.name, icone: ic(User) })) },
    { rotulo: "Candidatos", opcoes: r.candidatos.map((c) => ({ chave: `candidato-${c.id}`, href: `/candidatos/${c.id}`, rotulo: c.name, icone: ic(UserSearch) })) },
    { rotulo: "Kanban", opcoes: r.pipelines.map((p) => ({ chave: `kanban-${p.id}`, href: boardPath(p), rotulo: p.name, icone: ic(SquareKanban) })) },
    { rotulo: "Tarefas", opcoes: r.tarefas.map((t) => ({ chave: `tarefa-${t.id}`, href: t.href, rotulo: t.name, icone: ic(SquareCheck) })) },
    { rotulo: "Vagas", opcoes: r.vagas.map((v) => ({ chave: `vaga-${v.id}`, href: `/vagas/${v.id}`, rotulo: v.name, icone: ic(Briefcase) })) },
    {
      rotulo: "Documentos",
      opcoes: r.documentos.map((d) => ({ chave: `documento-${d.id}`, href: documentHref(d.entityType, d.entityId), rotulo: d.name, icone: ic(FileText) })),
    },
  ].filter((g) => g.opcoes.length > 0);
}

// A tecla do atalho, igual nos dois lugares — era "Ctrl K" na lateral e
// "Ctrl+K" no topo, em 10,5 e 11px (07/10/2026).
function Atalho({ className = "" }: { className?: string }) {
  return (
    <kbd className={`items-center flex-shrink-0 px-1.5 py-px rounded-sm border border-border text-micro text-fg-muted font-sans ${className}`.trim()}>
      Ctrl K
    </kbd>
  );
}

// Abaixo de sm, o input inline não cabe na topbar (some espremido pelos
// ícones de tema/notificação/perfil) — vira um botão de lupa que abre um
// campo em overlay cobrindo a topbar inteira, com foco automático.
//
// Desde 18/09 a busca também acha **tela** (as do setor, ligadas para este
// cliente): o filtro é no navegador, sobre a lista que o shell já tem, então
// aparece enquanto se digita, antes de a busca de dados voltar do servidor. E
// aberta sem termo, oferece as últimas telas abertas — é o que faz o Ctrl+K
// valer para "voltar rápido para onde eu estava".
//
// Duas variantes (02/10/2026): "lateral", compacta embaixo da logo, no lugar
// do antigo cartão de setor e escritório, com os resultados num painel largo
// por cima da tela; e "topo", a de sempre, para quando a lateral vira gaveta
// (abaixo de 1024px). O AppShell mostra uma ou outra pelo tamanho da tela, e
// o Ctrl+K vai para a que está visível.
//
// Setas ↑↓ e Enter (07/10/2026): o campo é um combobox, como o
// `SearchableSelect` — as setas andam pelos resultados de todos os grupos, o
// Enter abre o marcado (ou, sem marcado, o primeiro) e o leitor de tela ouve
// qual está marcado (`aria-activedescendant`). O foco fica no campo, então
// dá para seguir digitando.
export function GlobalSearch({
  telas = [],
  variante = "topo",
}: {
  telas?: TelaNavegavel[];
  variante?: "topo" | "lateral";
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  // O termo a que `results` responde: o Enter só usa resultado do termo que
  // está no campo, nunca o da busca anterior que ainda não foi trocada.
  const [termoDosResultados, setTermoDosResultados] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  // A linha marcada pelas setas; -1 = nenhuma.
  const [ativo, setAtivo] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const idBase = useId();
  const idDaLista = `${idBase}-lista`;
  const idDaOpcao = (i: number) => `${idBase}-opcao-${i}`;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      // mobileExpanded também precisa resetar aqui — Ctrl+K liga ele pra
      // garantir foco mesmo em telas maiores (ver atalho abaixo), e sem
      // resetar no clique-fora ele ficava true pra sempre (só o botão X do
      // modo mobile, escondido em telas grandes, resetava), sumindo o hint
      // "Ctrl K" de vez (condição abaixo exige !mobileExpanded).
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMobileExpanded(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (mobileExpanded) inputRef.current?.focus();
  }, [mobileExpanded]);

  // Atalho Ctrl+K / Cmd+K — foca a busca de qualquer lugar do app (convenção
  // comum tipo Linear/GitHub/Slack). Primeiro atalho global do app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        const telaGrande = window.matchMedia("(min-width: 1024px)").matches;
        if ((variante === "lateral") !== telaGrande) return;
        e.preventDefault();
        setMobileExpanded(true);
        setOpen(true);
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [variante]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: SearchResults) => {
          setResults(data);
          setTermoDosResultados(query.trim());
          // A lista mudou embaixo da marca: ela recomeça do zero.
          setAtivo(-1);
        })
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // A linha marcada fica visível quando a lista rola.
  useEffect(() => {
    if (ativo >= 0) document.getElementById(idDaOpcao(ativo))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  const recentes = useTelasRecentes();
  const termo = query.trim();
  const telasEncontradas = buscarTelas(telas, termo);
  const telasRecentes = recentes
    .map((code) => telas.find((t) => t.code === code))
    .filter((t): t is TelaNavegavel => Boolean(t))
    .slice(0, 5);

  const buscando = termo.length >= 2;
  const grupos: Grupo[] = buscando
    ? montarGrupos(telasEncontradas, results)
    : telasRecentes.length > 0
      ? [
          {
            rotulo: "Recentes",
            opcoes: telasRecentes.map((t) => ({
              chave: `recente-${t.code}`,
              href: t.href,
              rotulo: t.label,
              detalhe: t.setor,
              icone: <Clock3 size={16} />,
            })),
          },
        ]
      : [];
  const opcoes = grupos.flatMap((g) => g.opcoes);
  // Aberta sem termo, o painel só aparece quando há recentes — painel vazio
  // embaixo do campo é ruído.
  const painelAberto = open && (buscando || opcoes.length > 0);

  function go(href: string) {
    setOpen(false);
    setMobileExpanded(false);
    setQuery("");
    setAtivo(-1);
    router.push(href);
  }

  /**
   * Enter abre a linha marcada pelas setas; sem marca, o primeiro resultado, na
   * ordem do painel. A ajuda ("Achar qualquer coisa") promete isso desde 01/10,
   * e o campo não tratava o Enter — achado na gravação dos vídeos, em 06/10.
   * Esc fecha o painel.
   */
  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setAtivo(-1);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (opcoes.length === 0) return;
      const n = opcoes.length;
      setAtivo((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
      return;
    }
    if (e.key !== "Enter") return;
    const marcada = painelAberto && ativo >= 0 ? opcoes[ativo] : undefined;
    if (marcada) {
      e.preventDefault();
      go(marcada.href);
      return;
    }
    if (termo.length < 2) return;
    const tela = telasEncontradas[0];
    if (tela) {
      e.preventDefault();
      go(tela.href);
      return;
    }
    if (termoDosResultados !== termo) return;
    const primeiro = montarGrupos([], results)[0]?.opcoes[0];
    if (primeiro) {
      e.preventDefault();
      go(primeiro.href);
    }
  }

  function closeMobile() {
    setMobileExpanded(false);
    setOpen(false);
    setQuery("");
    setAtivo(-1);
  }

  // O que o campo diz ao leitor de tela: é um combobox, que lista controla e
  // qual linha está marcada.
  const propsDoCombobox = {
    role: "combobox" as const,
    "aria-expanded": painelAberto,
    "aria-controls": painelAberto && opcoes.length > 0 ? idDaLista : undefined,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": painelAberto && ativo >= 0 ? idDaOpcao(ativo) : undefined,
  };

  const classeDoPainel =
    variante === "lateral"
      ? "scroll-y absolute left-0 top-[calc(100%+8px)] w-[480px] max-w-[calc(100vw-2rem)] bg-surface-elevated border border-border-strong rounded-lg shadow-lg py-2 z-50 max-h-[420px] overflow-y-auto"
      : "scroll-y absolute left-0 top-[calc(100%+10px)] w-full bg-surface-elevated border border-border-strong rounded-lg shadow-lg py-2 z-20 max-h-[360px] overflow-y-auto";

  let indice = 0;
  const painel = painelAberto && (
    <div className={classeDoPainel}>
      {opcoes.length === 0 ? (
        <p className="px-3.5 py-3 text-ui text-fg-muted">Nenhum resultado para &quot;{query}&quot;.</p>
      ) : (
        <div id={idDaLista} role="listbox" aria-label="Resultados da busca">
          {grupos.map((g) => {
            const idDoGrupo = `${idBase}-grupo-${g.rotulo}`;
            return (
              <div key={g.rotulo} role="group" aria-labelledby={idDoGrupo} className="py-1 px-1">
                <p id={idDoGrupo} className="c41-rotulo px-2.5 pb-1">
                  {g.rotulo}
                </p>
                {g.opcoes.map((o) => {
                  const i = indice++;
                  const marcada = i === ativo;
                  return (
                    <button
                      key={o.chave}
                      id={idDaOpcao(i)}
                      type="button"
                      role="option"
                      aria-selected={marcada}
                      tabIndex={-1}
                      onClick={() => go(o.href)}
                      className={`w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-md text-dropdown text-fg transition-colors ${
                        marcada ? "bg-surface-hover" : "hover:bg-surface-hover"
                      }`}
                    >
                      <span className="flex-shrink-0 text-fg-muted [&>svg]:w-4 [&>svg]:h-4">{o.icone}</span>
                      <span className="truncate">{o.rotulo}</span>
                      {o.detalhe && <span className="ml-auto flex-shrink-0 text-micro text-fg-muted">{o.detalhe}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setAtivo(-1);
  };

  if (variante === "lateral") {
    return (
      <div ref={rootRef} className="relative">
        <div className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-input-bg focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] transition-colors">
          <Search size={14} className="text-fg-muted flex-shrink-0" />
          {/* `focus-visible:shadow-none!`: o anel é da moldura (focus-within);
              o `:focus-visible` global desenhava um segundo aqui dentro — o
              traço vertical da foto de 06/10. `--fs-search`, o papel que a
              busca tinha e não usava (era 13px). */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={aoDigitar}
            onFocus={() => setOpen(true)}
            onKeyDown={aoTeclar}
            placeholder="Buscar…"
            aria-label="Buscar empresas, pessoas, telas…"
            {...propsDoCombobox}
            className="w-full min-w-0 h-full bg-transparent text-search text-fg placeholder:text-fg-muted outline-none border-none focus-visible:shadow-none!"
          />
          {!open && !query && <Atalho className="inline-flex" />}
        </div>
        {painel}
      </div>
    );
  }

  return (
    <>
      {/* Alvo de 40px no celular (07/10/2026) — era o ícone, 19px. */}
      <IconButton size="xl" onClick={() => setMobileExpanded(true)} className="sm:hidden -mr-1" aria-label="Buscar">
        <Search size={19} />
      </IconButton>

      <div
        ref={rootRef}
        className={
          mobileExpanded
            ? "fixed inset-x-0 top-0 z-50 h-[60px] flex items-center px-4 bg-topbar-bg sm:static sm:h-auto sm:px-0 sm:bg-transparent sm:w-full sm:max-w-md"
            : "hidden sm:block relative w-full max-w-md"
        }
      >
        <div className="relative w-full">
          <div className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-md border border-border bg-input-bg focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)] transition-colors">
            <Search size={16} className="text-fg-muted flex-shrink-0" />
            {/* Esta variante é a de tela de toque (abaixo de 1024px): 16px, o
                `--fs-input`, porque abaixo disso o Safari do iPhone dá zoom ao
                focar o campo — com 15px, dava. */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={aoDigitar}
              onFocus={() => setOpen(true)}
              onKeyDown={aoTeclar}
              placeholder="Buscar empresas, pessoas, kanban…"
              aria-label="Buscar empresas, pessoas, telas…"
              {...propsDoCombobox}
              className="w-full h-full bg-transparent text-input text-fg placeholder:text-fg-muted outline-none border-none focus-visible:shadow-none!"
            />
            {!mobileExpanded && !open && !query && <Atalho className="hidden sm:inline-flex" />}
            {mobileExpanded && (
              <IconButton size="md" className="sm:hidden -mr-2" onClick={closeMobile} aria-label="Fechar busca">
                <X size={16} />
              </IconButton>
            )}
          </div>

          {painel}
        </div>
      </div>
    </>
  );
}
