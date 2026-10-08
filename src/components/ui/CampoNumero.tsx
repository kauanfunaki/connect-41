"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { classesDaCaixa, larguraDoCampo } from "@/components/ui/useCampoDigitado";

type Limites = { min?: number; max?: number; step?: number };

function casasDecimais(n: number): number {
  const texto = String(n);
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * O valor depois de um clique no − ou no +, com a regra do `stepUp` do
 * navegador: vazio conta como 0; um valor fora do passo encosta no passo
 * seguinte (ou anterior), e não anda um passo inteiro; o resultado fica entre
 * `min` e `max`.
 */
export function passoDoNumero(atual: string, direcao: 1 | -1, { min, max, step = 1 }: Limites): string {
  const passo = step > 0 ? step : 1;
  const base = min ?? 0;
  const n = atual.trim() === "" ? 0 : Number(atual);
  if (Number.isNaN(n)) return atual;
  const k = (n - base) / passo;
  const alinhado = Math.abs(k - Math.round(k)) < 1e-9;
  let alvo = alinhado ? n + direcao * passo : base + (direcao === 1 ? Math.ceil(k) : Math.floor(k)) * passo;
  if (min !== undefined && alvo < min) alvo = min;
  if (max !== undefined && alvo > max) alvo = max;
  // 0.1 + 0.2: arredonda nas casas do passo e da base, como o campo nativo.
  const casas = Math.max(casasDecimais(passo), casasDecimais(base));
  return String(Number(alvo.toFixed(casas)));
}

/** Troca o valor como se a pessoa tivesse digitado: o `onChange` do React e o `change` do formulário disparam. */
function digitar(input: HTMLInputElement, valor: string) {
  const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  definir?.call(input, valor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function numeroOuUndefined(v: number | string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "prefix" | "size"> & {
  /** Altura das barras de filtro (h-8). */
  compact?: boolean;
  error?: boolean;
  /** Unidade depois do número ("dias", "meses"). */
  suffix?: string;
};

/**
 * Campo de número com − e + próprios (08/10/2026), para contagem pequena:
 * volumes do Valora, quantidade de vagas, parcelas, dias. As setinhas do
 * navegador saíram de todo `type="number"` (globals.css); onde elas ajudavam,
 * entra este.
 *
 * Por dentro segue um `<input type="number">` com `name`, `min`, `max` e
 * `step`: o formulário recebe o mesmo valor pelo `FormData`, as setas ↑↓ do
 * teclado continuam andando, e o `required`/`min`/`max` continuam valendo. Os
 * botões ficam fora da tabulação (o teclado já tem as setas) e não roubam o
 * foco do campo; cada clique dispara o `onChange` como se fosse digitado, então
 * serve controlado e não controlado.
 */
export function CampoNumero({
  compact = false,
  error = false,
  suffix,
  className = "",
  disabled,
  readOnly,
  min,
  max,
  step,
  value,
  defaultValue,
  onChange,
  inputMode,
  ...rest
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Espelho do valor para saber se − e + ainda andam. No controlado, vale o `value`.
  const [digitado, setDigitado] = useState(String(defaultValue ?? ""));
  const atual = value !== undefined ? String(value) : digitado;

  const limites: Limites = { min: numeroOuUndefined(min), max: numeroOuUndefined(max), step: numeroOuUndefined(step) };
  const n = atual.trim() === "" ? NaN : Number(atual);
  const noMinimo = limites.min !== undefined && !Number.isNaN(n) && n <= limites.min;
  const noMaximo = limites.max !== undefined && !Number.isNaN(n) && n >= limites.max;
  const travado = disabled || readOnly;

  // O "limpar" do formulário (e o reset do React depois da action) volta o
  // campo ao valor inicial sem passar pelo `onChange`: relê depois do reset.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reler = () => setTimeout(() => setDigitado(inputRef.current?.value ?? ""), 0);
    form.addEventListener("reset", reler);
    return () => form.removeEventListener("reset", reler);
  }, []);

  function andar(direcao: 1 | -1) {
    const input = inputRef.current;
    if (!input || travado) return;
    const novo = passoDoNumero(input.value, direcao, limites);
    if (novo !== input.value) digitar(input, novo);
  }

  const inteiro = limites.step === undefined || Number.isInteger(limites.step);
  const botao = (direcao: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={direcao === 1 ? "Aumentar" : "Diminuir"}
      disabled={travado || (direcao === 1 ? noMaximo : noMinimo)}
      // Sem isto o clique tiraria o foco do campo (e quem digitava perderia o cursor).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => andar(direcao)}
      className={`flex h-full w-8 flex-shrink-0 items-center justify-center text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted ${
        direcao === 1 ? "border-l border-border" : "border-r border-border"
      }`}
    >
      {direcao === 1 ? <Plus size={compact ? 13 : 14} /> : <Minus size={compact ? 13 : 14} />}
    </button>
  );

  return (
    <div
      className={`${classesDaCaixa({ compact, erro: error, disabled })} overflow-hidden ${larguraDoCampo(className)} ${className}`.trim()}
    >
      {botao(-1)}
      <input
        ref={inputRef}
        type="number"
        inputMode={inputMode ?? (inteiro ? "numeric" : "decimal")}
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          setDigitado(e.target.value);
          onChange?.(e);
        }}
        disabled={disabled}
        readOnly={readOnly}
        className="h-full min-w-0 flex-1 bg-transparent px-1 text-center tabular-nums text-fg placeholder:text-fg-muted outline-none focus-visible:shadow-none!"
        {...rest}
      />
      {suffix && <span className="flex-shrink-0 pr-2 text-helper text-fg-muted select-none">{suffix}</span>}
      {botao(1)}
    </div>
  );
}
