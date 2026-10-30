"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AvatarImage } from "@/components/shared/AvatarImage";

export type Opcao = {
  value: string;
  label: string;
  /** Imagem à esquerda (logo da empresa). Com `avatar`, `null` mostra as iniciais. */
  imagem?: string | null;
  /** Linha pequena embaixo do nome (o CNPJ, por exemplo). */
  descricao?: string;
  /** Texto a mais que a busca procura — o CNPJ só com dígitos. */
  busca?: string;
  /** Um nível de recuo: a filial embaixo da matriz. */
  recuo?: boolean;
};

type Props = {
  name: string;
  options: Opcao[];
  defaultValue?: string;
  placeholder?: string;
  /** Texto da opção que limpa a seleção. Omitir torna a escolha obrigatória. */
  vazioLabel?: string;
  id?: string;
  /**
   * Avisa o formulário pai da escolha.
   *
   * Necessário porque o valor viaja num `<input type="hidden">`, e mudar o
   * `value` de um hidden pelo React NÃO dispara `change` — um formulário que
   * escuta `onChange` no `<form>` (como o de empresa) nunca ficaria sabendo.
   */
  onChange?: (value: string) => void;
  /**
   * Altura das barras de filtro (h-8), ao lado de `Input` e `Select` compactos
   * — é onde a empresa se escolhe nas telas financeiras.
   */
  compact?: boolean;
  /** Largura do campo; nas barras de filtro, a do `<select>` que ele substituiu. */
  className?: string;
  /** Nome acessível quando não há `<label>` — nas barras de filtro. */
  "aria-label"?: string;
  /** Logo ou iniciais à esquerda de cada opção e no campo fechado (empresa). */
  avatar?: boolean;
  /**
   * Guarda as últimas 5 escolhas neste navegador, com esta chave, e as mostra
   * em "Recentes" no topo — quem escolhe empresa o dia todo volta sempre às
   * mesmas. Telas diferentes com a mesma lista usam a mesma chave.
   */
  lembrarRecentes?: string;
  /**
   * O texto do campo fechado quando nada está escolhido, no lugar do
   * `vazioLabel` (13/10/2026). Para a tela que oferece "Todas as empresas" mas
   * ainda não tem escolha nenhuma: o campo diz "Escolha a empresa…", e não
   * "Todas", que ela não está mostrando.
   */
  textoSemValor?: string;
};

/** Até quantas opções a lista mostra; acima disso, pede para refinar a busca. */
const TETO = 100;
const QUANTOS_RECENTES = 5;

function chaveDosRecentes(chave: string) {
  return `c41:recentes:${chave}`;
}

// localStorage pode faltar ou recusar (aba anônima, cota, bloqueio): sem
// recentes, a lista funciona igual.
function lerRecentes(chave: string): string[] {
  try {
    const bruto = window.localStorage.getItem(chaveDosRecentes(chave));
    const lista = bruto ? (JSON.parse(bruto) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function gravarRecente(chave: string, valor: string) {
  try {
    const lista = [valor, ...lerRecentes(chave).filter((v) => v !== valor)].slice(0, QUANTOS_RECENTES);
    window.localStorage.setItem(chaveDosRecentes(chave), JSON.stringify(lista));
  } catch {
    /* sem recentes */
  }
}

function soDigitos(s: string) {
  return s.replace(/\D/g, "");
}

/** Passa na busca pelo nome ou, com 3+ dígitos digitados, pelo texto extra (CNPJ). */
export function casaComABusca(o: Opcao, termo: string): boolean {
  const q = termo.trim().toLowerCase();
  if (q === "") return true;
  if (o.label.toLowerCase().includes(q)) return true;
  // Só número (com a pontuação do CNPJ, se vier colado): "Padaria 123" não
  // pode achar uma empresa qualquer cujo CNPJ tenha 123.
  if (!/^[\d.\/\-\s]+$/.test(q)) return false;
  const digitos = soDigitos(q);
  return digitos.length >= 3 && !!o.busca && soDigitos(o.busca).includes(digitos);
}

/**
 * Escolha ÚNICA com busca, para listas grandes demais para um `<select>`.
 *
 * Nasceu do campo "Empresa matriz": depois da importação do Acessórias são 396
 * opções, e o `<select>` nativo obriga o usuário a adivinhar a inicial e rolar.
 * Mesma ideia do `AttendeePicker`, que resolveu isso para responsáveis, só que
 * de seleção única.
 *
 * O valor vai para o formulário por `<input type="hidden">`, então a action
 * continua lendo `form.get(name)` como se fosse um select comum.
 *
 * Desde 02/10/2026 (pedido de 01/10): logo ou iniciais (`avatar`), descrição
 * e busca pelo CNPJ, filial recuada embaixo da matriz, "Recentes" no topo, ✓
 * na escolhida e teclado (setas, Enter, Esc).
 */
export function SearchableSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Buscar…",
  vazioLabel,
  id,
  onChange,
  compact = false,
  className = "",
  "aria-label": ariaLabel,
  avatar = false,
  lembrarRecentes,
  textoSemValor,
}: Props) {
  const [valor, setValor] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [aberto, setAberto] = useState(false);
  const [recentes, setRecentes] = useState<string[]>([]);
  const [ativa, setAtiva] = useState(0);
  const caixaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const idBase = useId();
  const idDaLista = `${idBase}lista`;
  const idDaOpcao = (indice: number) => `${idBase}op${indice}`;

  const selecionada = useMemo(() => options.find((o) => o.value === valor), [options, valor]);

  const encontradas = useMemo(() => options.filter((o) => casaComABusca(o, query)), [options, query]);
  const filtradas = encontradas.slice(0, TETO);

  // "Recentes" só sem busca — com busca, a pessoa já disse o que quer.
  const opcoesRecentes = useMemo(() => {
    if (!lembrarRecentes || query.trim() !== "") return [];
    const porValor = new Map(options.map((o) => [o.value, o]));
    return recentes.map((v) => porValor.get(v)).filter((o): o is Opcao => Boolean(o));
  }, [lembrarRecentes, query, recentes, options]);

  // A ordem que o teclado percorre: limpar, recentes e a lista.
  const navegaveis = useMemo(
    () => [
      ...(vazioLabel ? [{ value: "", label: vazioLabel } as Opcao] : []),
      ...opcoesRecentes,
      ...filtradas,
    ],
    [vazioLabel, opcoesRecentes, filtradas]
  );

  // Fechar ao clicar fora: sem isso o painel fica aberto por cima do resto do
  // formulário depois que o usuário desiste.
  useEffect(() => {
    if (!aberto) return;
    function onDown(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [aberto]);

  // A opção ativa no teclado fica à vista.
  useEffect(() => {
    if (!aberto) return;
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${ativa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativa, aberto]);

  function abrir() {
    if (lembrarRecentes) setRecentes(lerRecentes(lembrarRecentes));
    setAtiva(0);
    setAberto(true);
  }

  // Fechar volta o foco ao campo (auditoria de UX, 30/10/2026): a busca, onde ele
  // estava, some com a lista, e o foco caía no `body` — o próximo Tab recomeçava
  // do topo da página.
  function fechar() {
    setAberto(false);
    gatilhoRef.current?.focus();
  }

  function escolher(v: string) {
    setValor(v);
    setQuery("");
    fechar();
    if (v && lembrarRecentes) gravarRecente(lembrarRecentes, v);
    onChange?.(v);
  }

  function noTeclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtiva((i) => Math.min(i + 1, navegaveis.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = navegaveis[ativa];
      if (o) escolher(o.value);
    } else if (e.key === "Escape") {
      // O `preventDefault` avisa a pilha de camadas: dentro de um modal, este Esc
      // fecha só a lista.
      e.preventDefault();
      fechar();
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  const texto = selecionada ? selecionada.label : textoSemValor ?? vazioLabel ?? placeholder;
  const limpavel = Boolean(selecionada && vazioLabel);
  const tamanhoDoAvatar = compact ? 18 : 20;

  function linha(o: Opcao, indice: number) {
    const escolhida = o.value === valor;
    return (
      <li key={`${indice}-${o.value}`} role="none">
        <button
          type="button"
          role="option"
          id={idDaOpcao(indice)}
          tabIndex={-1}
          aria-selected={escolhida}
          data-indice={indice}
          onClick={() => escolher(o.value)}
          onMouseEnter={() => setAtiva(indice)}
          className={`w-full flex items-center gap-2.5 text-left px-3 py-2 text-body ${
            indice === ativa ? "bg-surface-hover" : ""
          } ${o.recuo ? "pl-8" : ""}`}
        >
          {avatar && <AvatarImage src={o.imagem ?? null} name={o.label} size={24} shape="lg" fontSize={10} />}
          <span className="min-w-0 flex-1">
            <span className={`block truncate ${escolhida ? "text-brand font-medium" : "text-fg"}`}>{o.label}</span>
            {o.descricao && (
              <span className="block truncate text-micro text-fg-muted tabular-nums">{o.descricao}</span>
            )}
          </span>
          {escolhida && <Check size={14} className="flex-shrink-0 text-brand" />}
        </button>
      </li>
    );
  }

  const rotuloDeSecao = "px-3 pt-2 pb-1 c41-rotulo";
  const inicioDosRecentes = vazioLabel ? 1 : 0;
  const inicioDaLista = inicioDosRecentes + opcoesRecentes.length;

  return (
    <div className={`relative ${className}`.trim()} ref={caixaRef}>
      <input type="hidden" name={name} value={valor} />

      <Button
        ref={gatilhoRef}
        variant="secondary"
        size={compact ? "sm" : "md"}
        // `!`: a base do `Button` centraliza, põe negrito e tem fonte e recuo de
        // botão; aqui é campo de formulário e segue o `Select` — texto à
        // esquerda, peso normal, a fonte do campo e a seta na ponta.
        className={`w-full flex justify-between! font-normal! px-3! gap-2 bg-input-bg text-left ${
          compact ? "text-ui!" : "text-input!"
        } ${limpavel ? "pr-12!" : ""} hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand/40`}
        id={id}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        // O rótulo sozinho apagaria o que está escolhido do nome acessível.
        aria-label={ariaLabel ? `${ariaLabel}: ${texto}` : undefined}
      >
        <span className="min-w-0 flex items-center gap-2">
          {avatar && selecionada && (
            <AvatarImage src={selecionada.imagem ?? null} name={selecionada.label} size={tamanhoDoAvatar} shape="lg" fontSize={9} />
          )}
          <span className={`truncate ${selecionada ? "text-fg" : "text-fg-muted"}`}>{texto}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-fg-muted" />
      </Button>
      {/* O "Limpar" fica ao lado do campo, e não dentro do botão dele: controle
          dentro de controle (um `span role=button` no `<button>`) não tem
          comportamento definido no HTML e o leitor de tela o lia como parte do
          nome do campo (auditoria de UX, 30/10/2026). */}
      {limpavel && (
        <button
          type="button"
          aria-label="Limpar seleção"
          onClick={() => escolher("")}
          className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-2"
        >
          <X size={13} />
        </button>
      )}

      {aberto && (
        <div className="c41-surgir absolute z-30 mt-1 w-full min-w-[280px] rounded-lg border border-border-strong bg-surface-elevated shadow-lg">
          {/* A busca fica fixa no topo; quem rola é a lista. */}
          <div className="p-2 border-b border-border">
            <Input
              compact
              autoFocus
              icon={<Search />}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Com busca, o Enter vai no primeiro resultado, e não no "Todas".
                setAtiva(e.target.value.trim() && vazioLabel ? 1 : 0);
              }}
              onKeyDown={noTeclado}
              placeholder={placeholder}
              aria-label={placeholder}
              // Combobox de verdade: o foco fica na busca e o leitor de tela
              // anuncia a opção que as setas destacam.
              role="combobox"
              aria-expanded
              aria-controls={idDaLista}
              aria-autocomplete="list"
              aria-activedescendant={navegaveis[ativa] ? idDaOpcao(ativa) : undefined}
            />
          </div>
          <ul ref={listaRef} id={idDaLista} role="listbox" className="scroll-y max-h-72 overflow-y-auto py-1">
            {vazioLabel && (
              <li role="none">
                <button
                  type="button"
                  role="option"
                  id={idDaOpcao(0)}
                  tabIndex={-1}
                  aria-selected={valor === ""}
                  data-indice={0}
                  onClick={() => escolher("")}
                  onMouseEnter={() => setAtiva(0)}
                  className={`w-full text-left px-3 py-2 text-body text-fg-muted ${ativa === 0 ? "bg-surface-hover" : ""}`}
                >
                  {vazioLabel}
                </button>
              </li>
            )}
            {opcoesRecentes.length > 0 && (
              <>
                <li className={rotuloDeSecao} aria-hidden>
                  Recentes
                </li>
                {opcoesRecentes.map((o, i) => linha({ ...o, recuo: false }, inicioDosRecentes + i))}
                <li className={rotuloDeSecao} aria-hidden>
                  Todas
                </li>
              </>
            )}
            {filtradas.map((o, i) => linha(o, inicioDaLista + i))}
            {filtradas.length === 0 && (
              <li className="px-3 py-3 text-helper text-fg-muted">Nada encontrado para “{query}”.</li>
            )}
            {encontradas.length > TETO && (
              <li className="px-3 py-2 text-helper text-fg-muted border-t border-border">
                Mostrando {TETO} de {encontradas.length}. Digite mais para refinar.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
