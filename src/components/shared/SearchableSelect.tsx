"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type Opcao = { value: string; label: string };

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
};

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
}: Props) {
  const [valor, setValor] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  const selecionada = useMemo(() => options.find((o) => o.value === valor), [options, valor]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q === "" ? options : options.filter((o) => o.label.toLowerCase().includes(q));
    // Teto de 50: a lista é rolável e ninguém percorre 396 itens com os olhos —
    // quem não achou refina a busca, que é mais rápido que rolar.
    return base.slice(0, 50);
  }, [options, query]);

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

  function escolher(v: string) {
    setValor(v);
    setQuery("");
    setAberto(false);
    onChange?.(v);
  }

  const texto = selecionada ? selecionada.label : vazioLabel ?? placeholder;

  return (
    <div className={`relative ${className}`.trim()} ref={caixaRef}>
      <input type="hidden" name={name} value={valor} />

      <Button
        variant="secondary"
        size={compact ? "sm" : "md"}
        className={`w-full flex justify-between gap-2 bg-surface text-left ${
          compact ? "text-[13px]" : "text-[length:var(--fs-body)]"
        } hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand/40`}
        id={id}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        // O rótulo sozinho apagaria o que está escolhido do nome acessível.
        aria-label={ariaLabel ? `${ariaLabel}: ${texto}` : undefined}
      >
        <span className={`truncate ${selecionada ? "text-fg" : "text-fg-muted"}`}>{texto}</span>
        <span className="flex items-center gap-1 shrink-0">
          {selecionada && vazioLabel && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar seleção"
              onClick={(e) => {
                e.stopPropagation();
                escolher("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  escolher("");
                }
              }}
              className="p-0.5 rounded text-fg-muted hover:text-fg hover:bg-surface-2"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className="text-fg-muted" />
        </span>
      </Button>

      {aberto && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="pl-8"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {vazioLabel && (
              <li>
                <button
                  type="button"
                  onClick={() => escolher("")}
                  className="w-full text-left px-3 py-2 text-[length:var(--fs-body)] text-fg-muted hover:bg-surface-hover"
                >
                  {vazioLabel}
                </button>
              </li>
            )}
            {filtradas.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === valor}
                  onClick={() => escolher(o.value)}
                  className={`w-full text-left px-3 py-2 text-[length:var(--fs-body)] hover:bg-surface-hover ${
                    o.value === valor ? "text-brand font-medium" : "text-fg"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {filtradas.length === 0 && (
              <li className="px-3 py-3 text-[length:var(--fs-helper)] text-fg-muted">
                Nada encontrado para “{query}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
