"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { digitarNoCampo } from "@/components/ui/digitarNoCampo";
import { normalizar } from "@/lib/buscaDeTelas";

/**
 * As sugestões que casam com o que foi digitado: sem acento nem caixa, sem
 * repetidas; as que começam pelo texto vêm primeiro, depois as que têm uma
 * palavra começando por ele, depois o resto. Sem texto, todas.
 */
export function filtrarSugestoes(sugestoes: readonly string[], texto: string, limite = 50): string[] {
  const vistas = new Set<string>();
  const unicas: string[] = [];
  for (const bruta of sugestoes) {
    const s = bruta.trim();
    const chave = normalizar(s);
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    unicas.push(s);
  }
  const termo = normalizar(texto);
  if (!termo) return unicas.slice(0, limite);
  const noComeco: string[] = [];
  const naPalavra: string[] = [];
  const noMeio: string[] = [];
  for (const s of unicas) {
    const n = normalizar(s);
    const i = n.indexOf(termo);
    if (i === -1) continue;
    if (i === 0) noComeco.push(s);
    else if (/[\s\-/(.]/.test(n[i - 1])) naPalavra.push(s);
    else noMeio.push(s);
  }
  return [...noComeco, ...naPalavra, ...noMeio].slice(0, limite);
}

/** A sugestão destacada depois de ↓ ou ↑: dá a volta nas pontas; −1 = nenhuma. */
export function moverDestaque(atual: number, total: number, direcao: 1 | -1): number {
  if (total <= 0) return -1;
  if (atual < 0 || atual >= total) return direcao === 1 ? 0 : total - 1;
  return (atual + direcao + total) % total;
}

type Props = Omit<React.ComponentProps<typeof Input>, "list" | "direita" | "prefix" | "suffix" | "icon"> & {
  /** As sugestões — o texto continua livre: a pessoa pode escrever outra coisa. */
  sugestoes: readonly string[];
};

/**
 * Campo de texto com sugestões próprias (08/10/2026), no lugar do
 * `<input list>` + `<datalist>` — a lista do navegador, que no Chrome vinha
 * misturada ao histórico de preenchimento, com o triângulo do sistema e sem o
 * tema escuro. O texto segue livre e vai no mesmo `name`.
 *
 * As sugestões abrem ao clicar no campo ou na seta, com ↓, ou ao digitar (aí
 * filtradas, sem acento nem caixa). ↑↓ andam, Enter escolhe a destacada e Esc
 * fecha (só a lista: o modal em volta fica). Sem nenhuma destacada, o Enter é
 * do formulário — escrever e enviar continua igual. É um combobox (ARIA
 * 1.2): o foco fica no campo e o leitor de tela acompanha a destacada pelo
 * `aria-activedescendant`.
 */
export function CampoComSugestoes({
  sugestoes,
  value,
  defaultValue,
  onChange,
  onKeyDown,
  onBlur,
  onMouseDown,
  compact = false,
  disabled,
  readOnly,
  ...rest
}: Props) {
  const [digitado, setDigitado] = useState(String(defaultValue ?? ""));
  const atual = value !== undefined ? String(value) : digitado;
  const [aberto, setAberto] = useState(false);
  // Aberto pela seta (ou ↓, ou clique), mostra todas; ao digitar, filtra.
  const [filtrando, setFiltrando] = useState(false);
  const [destaque, setDestaque] = useState(-1);
  const [largura, setLargura] = useState(280);
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDaLista = useId();

  const opcoes = useMemo(() => filtrarSugestoes(sugestoes, filtrando ? atual : ""), [sugestoes, filtrando, atual]);
  const visivel = aberto && opcoes.length > 0;
  const ativa = destaque < opcoes.length ? destaque : -1;
  const idDaOpcao = (i: number) => `${idDaLista}-${i}`;

  const campo = () => caixaRef.current?.querySelector("input") ?? null;

  // O "limpar" do formulário volta o texto ao inicial.
  useEffect(() => {
    const form = caixaRef.current?.querySelector("input")?.form;
    if (!form) return;
    const reler = () => setTimeout(() => setDigitado(caixaRef.current?.querySelector("input")?.value ?? ""), 0);
    form.addEventListener("reset", reler);
    return () => form.removeEventListener("reset", reler);
  }, []);

  // A destacada fica à vista na lista que rola.
  useEffect(() => {
    if (!visivel || ativa < 0) return;
    document.getElementById(`${idDaLista}-${ativa}`)?.scrollIntoView({ block: "nearest" });
  }, [ativa, visivel, idDaLista]);

  function abrir(comFiltro: boolean, destacar: number = -1) {
    if (disabled || readOnly) return;
    setLargura(Math.max(caixaRef.current?.offsetWidth ?? 280, 200));
    setFiltrando(comFiltro);
    setDestaque(destacar);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setDestaque(-1);
  }

  function escolher(sugestao: string) {
    const input = campo();
    if (input) {
      digitarNoCampo(input, sugestao);
      input.focus();
    }
    setFiltrando(false);
    fechar();
  }

  function noTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const direcao = e.key === "ArrowDown" ? 1 : -1;
      if (!visivel) {
        // Abre com todas, já na escolhida (ou na primeira/última).
        const todas = filtrarSugestoes(sugestoes, "");
        const naAtual = todas.findIndex((s) => normalizar(s) === normalizar(atual));
        abrir(false, naAtual >= 0 ? naAtual : moverDestaque(-1, todas.length, direcao));
        return;
      }
      setDestaque(moverDestaque(ativa, opcoes.length, direcao));
    } else if (e.key === "Enter" && visivel && ativa >= 0) {
      e.preventDefault();
      escolher(opcoes[ativa]);
    } else if (e.key === "Escape" && visivel) {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (e.key === "Tab") {
      fechar();
    }
  }

  return (
    <div ref={caixaRef}>
      <Input
        {...rest}
        compact={compact}
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          setDigitado(e.target.value);
          onChange?.(e);
          if (!disabled && !readOnly) {
            setFiltrando(true);
            setDestaque(-1);
            if (!aberto) abrir(true);
          }
        }}
        onKeyDown={noTeclado}
        onBlur={(e) => {
          onBlur?.(e);
          fechar();
        }}
        // No mousedown, como o campo de data: abrir no clique, com todas.
        onMouseDown={(e) => {
          onMouseDown?.(e);
          if (e.button === 0 && !aberto) abrir(false);
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visivel}
        aria-controls={idDaLista}
        aria-activedescendant={visivel && ativa >= 0 ? idDaOpcao(ativa) : undefined}
        // O preenchimento automático do navegador abriria a lista dele por cima desta.
        autoComplete="off"
        direita={
          <button
            type="button"
            tabIndex={-1}
            aria-label={visivel ? "Fechar as sugestões" : "Mostrar as sugestões"}
            disabled={disabled || readOnly}
            onMouseDown={(e) => {
              e.preventDefault();
              campo()?.focus();
            }}
            onClick={() => (visivel ? fechar() : abrir(false))}
            className="rounded-sm p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:pointer-events-none"
          >
            <ChevronDown size={14} className={`transition-transform motion-reduce:transition-none ${visivel ? "rotate-180" : ""}`} />
          </button>
        }
      />
      <PainelFlutuante role="presentation" ancora={caixaRef} aberto={visivel} onFechar={fechar} largura={largura}>
        {/* O foco fica no campo: clicar numa sugestão (ou na barra de rolagem
            da lista) não tira o cursor de lá. */}
        <div
          id={idDaLista}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          className="scroll-y max-h-64 overflow-y-auto py-1"
        >
          {opcoes.map((s, i) => (
            <div
              key={s}
              id={idDaOpcao(i)}
              role="option"
              aria-selected={i === ativa}
              onMouseEnter={() => setDestaque(i)}
              onClick={() => escolher(s)}
              className={`cursor-pointer px-3 py-2 text-dropdown ${i === ativa ? "bg-surface-hover text-fg" : "text-fg-secondary"}`}
            >
              {s}
            </div>
          ))}
        </div>
      </PainelFlutuante>
    </div>
  );
}
