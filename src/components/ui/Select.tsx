"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { useTelaDeToque } from "@/components/ui/useCampoDigitado";
import {
  LIMITE_SEM_BUSCA,
  agruparEmSecoes,
  ehTeclaDeTexto,
  escolherNoSelect,
  filtrarOpcoes,
  indicePorDigitacao,
  lerOpcoes,
  moverAtiva,
  naLista,
  opcaoMostrada,
  paraTexto,
  vigiarValor,
  type OpcaoDoSelect,
} from "@/components/ui/opcoesDoSelect";

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size"> & {
  error?: boolean;
  /**
   * Variante enxuta pra barras de ferramentas (filtros e seletores de visão ao
   * lado de botões), pelo mesmo motivo do `compact` do Input: ali o tamanho de
   * formulário — 36px de altura e 16px de fonte — destoa dos controles de
   * 32px/12px em volta. Formulário continua no tamanho padrão (ver o comentário
   * em Input.tsx: 16px é o que evita o zoom automático do Safari no iOS).
   */
  compact?: boolean;
};

/** Quanto tempo as letras digitadas seguidas contam como uma busca só ("são p"). */
const ESPERA_DA_DIGITACAO = 800;
/** Largura mínima do painel — o campo `w-auto` de "Nova" não pode dar um painel de 90px. */
const LARGURA_MINIMA = 220;

// O clique no `<label for>` do campo chega ao gatilho como um clique simulado.
// O `<select>` nativo só ganhava o foco com ele, sem abrir; aqui também. Um
// ouvinte só, no documento, em captura: o clique no rótulo passa por ele antes
// do clique simulado chegar ao gatilho.
let controleDoRotulo: Element | null = null;
let ouvindoRotulos = false;
function ouvirRotulos() {
  if (ouvindoRotulos) return;
  ouvindoRotulos = true;
  document.addEventListener(
    "click",
    (e) => {
      const rotulo = e.target instanceof Element ? e.target.closest("label") : null;
      const controle = rotulo?.control ?? null;
      if (!controle || controle.contains(e.target as Node)) return;
      controleDoRotulo = controle;
      setTimeout(() => {
        controleDoRotulo = null;
      }, 0);
    },
    true
  );
}

/**
 * Seletor do Connect (08/10/2026), no lugar do `<select>` nativo — o Kauan
 * não quer nada do navegador na interface (o calendário e as notificações já
 * eram próprios). Mesma API de antes, para os 168 usos não mudarem.
 *
 * Como funciona:
 * • Um `<select>` de verdade continua no formulário, escondido (`display:
 *   none`), e é a fonte da verdade: é ele que vai no FormData (também no form
 *   GET de página de servidor, sem JS), que tem `name`, `required`,
 *   `defaultValue`, `disabled`, e que dispara o `onChange` do React. Escondido
 *   por `display: none`, e não `sr-only`, para não virar parada do Tab no
 *   `useDialog` (que conta todo `select:not([disabled])` renderizado).
 * • Por cima, o gatilho (botão com `role="combobox"`, o `id` vai nele — o
 *   `<label htmlFor>` do `CampoForm` dá o nome) e o painel no
 *   `PainelFlutuante`: portal no `body`, não é cortado por tabela, folha
 *   embaixo no celular.
 * • Escolher muda o `<select>` pelo setter nativo e dispara `change` que
 *   borbulha (`escolherNoSelect`): chega no `onChange` do campo e no do
 *   `<form>` em volta (EmpresaForm/PessoaForm guardam o estado assim).
 * • `select.value = …` por código (o preenchimento pelo CEP) e `form.reset()`
 *   também aparecem no campo.
 * • Mais de 8 opções: busca no topo, sem acento. Teclado: Enter/Espaço/↓
 *   abrem; ↑↓ Home End PageUp PageDown andam; letras pulam (typeahead) ou vão
 *   para a busca; Enter escolhe; Esc fecha e devolve o foco.
 *
 * O `<select>` não recebe foco: `onFocus`, `onBlur` e `onKeyDown` passados
 * aqui não disparam. A validação (`required`) mostra o balão próprio do
 * `ValidacaoDosFormularios` no gatilho, pelo `data-c41-foco`.
 */
export function Select({
  error = false,
  compact = false,
  className = "",
  disabled = false,
  children,
  id,
  value,
  defaultValue,
  required,
  title,
  autoFocus,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  ...rest
}: Props) {
  const idBase = useId();
  const idDoGatilho = id ?? `${idBase}campo`;
  const idDaLista = `${idBase}lista`;
  const idDaBusca = `${idBase}busca`;
  const idDaOpcao = (o: OpcaoDoSelect) => `${idBase}op${o.indice}`;

  const selectRef = useRef<HTMLSelectElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const digitado = useRef({ texto: "", ate: 0 });
  const toque = useTelaDeToque();

  const opcoes = useMemo(() => lerOpcoes(children), [children]);
  const controlado = value != null;
  const [interno, setInterno] = useState(() => paraTexto(defaultValue));
  const mostrada = opcaoMostrada(opcoes, controlado ? paraTexto(value) : interno);
  const vazia = !mostrada || mostrada.valor === "";
  // O campo tem a largura da maior opção, como o `<select>` tinha — numa
  // fileira de filtros sem largura definida, ele não pula ao trocar de opção.
  const maisLonga = useMemo(
    () => opcoes.reduce((maior, o) => (o.rotulo.length > maior.length ? o.rotulo : maior), ""),
    [opcoes]
  );

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativa, setAtiva] = useState(-1);
  const [largura, setLargura] = useState(LARGURA_MINIMA);
  const [rotulo, setRotulo] = useState("");

  // Desabilitado com o painel aberto (o `pending` de quem salva na troca):
  // fecha, e não reabre sozinho quando voltar.
  const [desabilitadoAntes, setDesabilitadoAntes] = useState(disabled);
  if (disabled !== desabilitadoAntes) {
    setDesabilitadoAntes(disabled);
    if (disabled) setAberto(false);
  }
  const painelAberto = aberto && !disabled;

  const listaveis = useMemo(() => opcoes.filter(naLista), [opcoes]);
  const comBusca = listaveis.length > LIMITE_SEM_BUSCA;
  const visiveis = useMemo(() => (comBusca ? filtrarOpcoes(listaveis, busca) : listaveis), [comBusca, listaveis, busca]);
  // Na tela de toque a busca não ganha o foco sozinha: abriria o teclado por
  // cima da folha a cada toque no campo.
  const focoNaBusca = comBusca && !toque;
  const indiceAtivo = ativa >= 0 && ativa < visiveis.length ? ativa : -1;
  const opcaoAtiva = indiceAtivo >= 0 ? visiveis[indiceAtivo]! : null;
  const idDaAtiva = opcaoAtiva ? idDaOpcao(opcaoAtiva) : undefined;

  useEffect(() => {
    ouvirRotulos();
  }, []);

  // `select.value = …` por código e `form.reset()` não passam pelo React.
  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const desfazer = vigiarValor(select, () => setInterno(select.value));
    const form = select.form;
    // O `reset` avisa antes de limpar: o valor novo só existe na volta.
    const aoLimpar = () => setTimeout(() => setInterno(select.value), 0);
    form?.addEventListener("reset", aoLimpar);
    return () => {
      desfazer();
      form?.removeEventListener("reset", aoLimpar);
    };
  }, []);

  // Ao abrir, a busca ganha o foco (sem rolar a página: o painel ainda pode
  // estar sendo posicionado) e a escolhida aparece no meio da lista.
  useEffect(() => {
    if (!painelAberto) return;
    if (focoNaBusca) {
      const campo = document.getElementById(idDaBusca) as HTMLInputElement | null;
      campo?.focus({ preventScroll: true });
      campo?.setSelectionRange(campo.value.length, campo.value.length);
    }
    const lista = listaRef.current;
    const item = lista?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (lista && item) lista.scrollTop = item.offsetTop - lista.clientHeight / 2 + item.offsetHeight / 2;
  }, [painelAberto, focoNaBusca, idDaBusca]);

  // A ativa (teclado) fica à vista, rolando só a lista — `scrollIntoView`
  // rolaria a página junto.
  useEffect(() => {
    if (!painelAberto || !idDaAtiva) return;
    const lista = listaRef.current;
    const item = document.getElementById(idDaAtiva);
    if (!lista || !item) return;
    const topo = item.offsetTop;
    const base = topo + item.offsetHeight;
    if (topo < lista.scrollTop) lista.scrollTop = topo;
    else if (base > lista.scrollTop + lista.clientHeight) lista.scrollTop = base - lista.clientHeight;
  }, [painelAberto, idDaAtiva]);

  function rotuloDoCampo(): string {
    if (ariaLabel) return ariaLabel;
    const texto = gatilhoRef.current?.labels?.[0]?.textContent ?? "";
    // O asterisco do obrigatório (CampoForm) não é parte do nome.
    return texto.replace(/\s*\*\s*$/, "").trim();
  }

  function abrir(onde: "escolhida" | "inicio" | "fim", letra?: string) {
    if (disabled) return;
    setLargura(Math.max(caixaRef.current?.offsetWidth ?? 0, LARGURA_MINIMA));
    setRotulo(rotuloDoCampo());
    // Com busca, a letra que abriu já é o começo dela.
    const termo = letra && focoNaBusca ? letra : "";
    const lista = termo ? filtrarOpcoes(listaveis, termo) : listaveis;
    const daEscolhida = lista.findIndex((o) => o.indice === mostrada?.indice && !o.desabilitada);
    let i: number;
    if (termo || onde === "inicio") i = moverAtiva(lista, -1, 1);
    else if (onde === "fim") i = moverAtiva(lista, -1, -1);
    else if (letra) {
      digitado.current = { texto: letra, ate: Date.now() + ESPERA_DA_DIGITACAO };
      const achada = indicePorDigitacao(lista, daEscolhida, letra);
      i = achada >= 0 ? achada : daEscolhida;
    } else i = daEscolhida >= 0 ? daEscolhida : moverAtiva(lista, -1, 1);
    setBusca(termo);
    setAtiva(i);
    setAberto(true);
  }

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    setBusca("");
    if (devolverFoco) gatilhoRef.current?.focus({ preventScroll: true });
  }

  function escolher(o: OpcaoDoSelect) {
    if (o.desabilitada) return;
    fechar(true);
    if (!controlado) setInterno(o.valor);
    const select = selectRef.current;
    // Escolher a que já estava não é mudança — o nativo também não avisa.
    if (select && select.value !== o.valor) escolherNoSelect(select, o.valor);
  }

  function digitar(tecla: string) {
    const agora = Date.now();
    const antes = digitado.current;
    const texto = (agora < antes.ate ? antes.texto : "") + tecla;
    digitado.current = { texto, ate: agora + ESPERA_DA_DIGITACAO };
    const i = indicePorDigitacao(visiveis, indiceAtivo, texto);
    if (i >= 0) setAtiva(i);
  }

  // Teclado com o painel aberto — no gatilho (sem busca) ou na busca. A tecla
  // usada aqui não segue para quem está em volta (a linha da tabela, o card).
  function navegar(e: React.KeyboardEvent, naBusca: boolean) {
    const passos: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
    const consumir = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "ArrowUp" && e.altKey) {
      consumir();
      if (opcaoAtiva) escolher(opcaoAtiva);
      else fechar(true);
    } else if (e.key in passos) {
      consumir();
      setAtiva(moverAtiva(visiveis, indiceAtivo, passos[e.key]!));
    } else if (e.key === "Home" || e.key === "End") {
      consumir();
      setAtiva(moverAtiva(visiveis, -1, e.key === "Home" ? 1 : -1));
    } else if (e.key === "Enter") {
      consumir();
      if (opcaoAtiva) escolher(opcaoAtiva);
    } else if (e.key === "Escape") {
      // Só o painel: o modal em volta fica. O React escuta no `document`,
      // junto com o `useDialog` — por isso o `stopImmediatePropagation`.
      consumir();
      e.nativeEvent.stopImmediatePropagation();
      fechar(true);
    } else if (e.key === "Tab") {
      // Sem `preventDefault`: com o foco de volta no gatilho, o Tab segue
      // para o campo seguinte (ou o anterior, com Shift), como no nativo.
      fechar(naBusca);
    } else if (!naBusca && e.key === " " && Date.now() >= digitado.current.ate) {
      consumir();
      if (opcaoAtiva) escolher(opcaoAtiva);
    } else if (!naBusca && ehTeclaDeTexto(e)) {
      consumir();
      digitar(e.key);
    }
  }

  function noTecladoDoGatilho(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (painelAberto) {
      navegar(e, false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      abrir("escolhida");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      abrir(e.key === "Home" ? "inicio" : "fim");
    } else if (ehTeclaDeTexto(e)) {
      e.preventDefault();
      abrir("escolhida", e.key);
    }
  }

  const secoes = agruparEmSecoes(visiveis);

  return (
    <div ref={caixaRef} className={`relative ${className}`.trim()}>
      <select
        ref={selectRef}
        value={value}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        hidden
        tabIndex={-1}
        aria-hidden
        data-c41-foco={idDoGatilho}
        {...rest}
      >
        {children}
      </select>
      <button
        ref={gatilhoRef}
        type="button"
        id={idDoGatilho}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={painelAberto}
        aria-controls={idDaLista}
        aria-activedescendant={painelAberto && !focoNaBusca ? idDaAtiva : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-required={required || undefined}
        aria-invalid={error || undefined}
        disabled={disabled}
        title={title}
        autoFocus={autoFocus}
        onClick={(e) => {
          if (controleDoRotulo === e.currentTarget) return;
          if (painelAberto) fechar(false);
          else abrir("escolhida");
        }}
        onKeyDown={noTecladoDoGatilho}
        // O Espaço já abriu no keydown; no Firefox o keyup ainda "clicaria" o
        // botão e fecharia o painel.
        onKeyUp={(e) => {
          if (e.key === " ") e.preventDefault();
        }}
        // `!` no anel vermelho: o `:focus-visible` global (fora das camadas do
        // Tailwind) o trocaria pelo azul justamente no campo com erro.
        className={`relative w-full flex items-center ${compact ? "h-8 text-ui" : "h-9 text-input"} pl-3 pr-8 rounded-md border bg-input-bg text-fg text-left outline-none transition-colors cursor-pointer ${
          error
            ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]!"
            : `focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${
                painelAberto ? "border-brand shadow-[0_0_0_3px_var(--c41-focus-ring)]" : "border-border-strong"
              }`
        } disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed`}
      >
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
          <span className={`col-start-1 row-start-1 truncate ${vazia ? "text-fg-muted" : ""}`}>
            {mostrada?.rotulo || " "}
          </span>
          <span aria-hidden className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap">
            {maisLonga}
          </span>
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none transition-transform ${
            painelAberto ? "rotate-180" : ""
          }`}
        />
      </button>

      <PainelFlutuante
        ancora={caixaRef}
        aberto={painelAberto}
        onFechar={() => fechar(false)}
        largura={largura}
        folhaNoCelular
        role="presentation"
      >
        {/* No celular a folha cobre o campo: o nome dele vai no topo. */}
        {rotulo && <p className="c41-rotulo px-1 pb-2 sm:hidden">{rotulo}</p>}
        {comBusca && (
          <div className="pb-1.5 sm:p-1.5 sm:border-b sm:border-border">
            <div className="flex items-center h-9 sm:h-8 rounded-md border border-border-strong bg-input-bg transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]">
              <Search size={14} aria-hidden className="ml-2.5 flex-shrink-0 text-fg-muted" />
              {/* 16px no celular (abaixo disso o iOS dá zoom ao focar), 13px no desktop. */}
              <input
                id={idDaBusca}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={idDaLista}
                aria-autocomplete="list"
                aria-activedescendant={idDaAtiva}
                aria-label="Buscar"
                autoComplete="off"
                spellCheck={false}
                placeholder="Buscar…"
                value={busca}
                onChange={(e) => {
                  // O evento atravessa o portal até o `<form onChange>` em volta
                  // (EmpresaForm): a busca não é campo do formulário.
                  e.stopPropagation();
                  setBusca(e.target.value);
                  setAtiva(moverAtiva(filtrarOpcoes(listaveis, e.target.value), -1, 1));
                }}
                // As teclas da busca são do painel (no nativo, a lista nem era
                // da página): não chegam ao card ou à linha em volta. O Tab segue.
                onKeyDown={(e) => {
                  if (e.key !== "Tab") e.stopPropagation();
                  navegar(e, true);
                }}
                className="flex-1 min-w-0 h-full bg-transparent px-2 text-input sm:text-ui text-fg placeholder:text-fg-muted outline-none focus-visible:shadow-none!"
              />
            </div>
          </div>
        )}
        <div
          ref={listaRef}
          id={idDaLista}
          role="listbox"
          aria-label={rotulo || undefined}
          className="relative scroll-y max-h-[60vh] sm:max-h-72 overflow-y-auto sm:p-1.5"
        >
          {secoes.map((secao, s) => {
            const linhas = secao.itens.map(({ opcao: o, posicao }) => {
              const escolhida = o.indice === mostrada?.indice;
              return (
                <div
                  key={o.indice}
                  id={idDaOpcao(o)}
                  role="option"
                  aria-selected={escolhida}
                  aria-disabled={o.desabilitada || undefined}
                  // O foco fica onde está (gatilho ou busca) enquanto o mouse escolhe.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (!o.desabilitada && posicao !== indiceAtivo) setAtiva(posicao);
                  }}
                  onClick={() => escolher(o)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-dropdown select-none ${
                    posicao === indiceAtivo ? "bg-surface-hover" : ""
                  } ${o.desabilitada ? "opacity-[var(--c41-disabled-op)] cursor-not-allowed" : "cursor-pointer"} ${
                    escolhida ? "text-brand font-medium" : o.valor === "" ? "text-fg-muted" : "text-fg"
                  }`}
                >
                  <span className="min-w-0 flex-1 break-words">{o.rotulo || " "}</span>
                  {escolhida && <Check size={14} aria-hidden className="flex-shrink-0 text-brand" />}
                </div>
              );
            });
            if (secao.grupo === null) return <div key={`s${s}`} role="presentation">{linhas}</div>;
            const idDoGrupo = `${idBase}g${s}`;
            return (
              <div key={`s${s}`} role="group" aria-labelledby={idDoGrupo}>
                <p id={idDoGrupo} className="c41-rotulo px-2.5 pt-2.5 pb-1">
                  {secao.grupo}
                </p>
                {linhas}
              </div>
            );
          })}
          {visiveis.length === 0 && (
            <p className="px-2.5 py-2 text-ui text-fg-muted">
              {busca.trim() ? `Nada encontrado para “${busca.trim()}”.` : "Nenhuma opção."}
            </p>
          )}
        </div>
      </PainelFlutuante>
    </div>
  );
}
