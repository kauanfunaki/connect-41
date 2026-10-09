"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Controlado: o estado vem de fora (e só muda quando quem usa trocar). */
  checked?: boolean;
  /** Não controlado: o estado com que nasce. */
  defaultChecked?: boolean;
  /** Recebe o estado novo a cada clique — no controlado, é o pedido de troca. */
  onCheckedChange?: (ligado: boolean) => void;
  /**
   * No formulário, como a caixa de marcar: envia `value` quando ligado e nada
   * quando desligado (ou `valorDesligado`, se vier).
   */
  name?: string;
  value?: string;
  valorDesligado?: string;
  /** Texto ao lado do trilho; entra no nome do controle e também liga/desliga. */
  rotulo?: React.ReactNode;
  /** `sm` para linha de tabela densa; `md` no resto. */
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  /** Nome para o leitor de tela quando não há rótulo (ou o rótulo muda com o estado). */
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
};

// Trilho e polegar medidos para o polegar andar dentro da borda de 1px:
// md 36×20 (polegar de 14, folga de 2px), sm 28×16 (polegar de 10).
const TRILHO = { md: "h-5 w-9", sm: "h-4 w-7" } as const;
const POLEGAR = { md: "size-3.5", sm: "size-2.5" } as const;
const LIGADO = { md: "translate-x-[18px]", sm: "translate-x-[14px]" } as const;

/**
 * O interruptor do Connect (08/10/2026) — o único. Eram três desenhos soltos:
 * o trilho azul das permissões sensíveis, a pílula verde com trilho
 * (`.c41-toggle-active`) das obrigações e dos atendentes, e o par de botões
 * "Ativar/Desativar" dos módulos.
 *
 * É um `<button role="switch">`: Espaço e Enter alternam, o leitor de tela diz
 * "ligado/desligado" pelo `aria-checked`. O rótulo fica dentro do botão, então
 * clicar no texto também alterna. Desligado, o polegar é cinza num trilho
 * claro com borda (o polegar branco num trilho cinza-claro some no fundo
 * branco); ligado, polegar branco no azul 41.
 *
 * Controlado (`checked` + `onCheckedChange`) para quando a troca passa por
 * confirmação ou pelo servidor; não controlado (`defaultChecked` + `name`) para
 * formulário comum — o valor vai num campo escondido.
 */
export function Switch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  name,
  value = "on",
  valorDesligado,
  rotulo,
  size = "md",
  disabled = false,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  className = "",
}: Props) {
  const controlado = checked !== undefined;
  const [interno, setInterno] = useState(defaultChecked);
  const ligado = controlado ? checked : interno;
  const botaoRef = useRef<HTMLButtonElement>(null);

  // "Limpar" do formulário volta o não controlado ao estado inicial, como
  // faria a caixa de marcar nativa.
  useEffect(() => {
    if (controlado) return;
    const form = botaoRef.current?.form;
    if (!form) return;
    const voltar = () => setInterno(defaultChecked);
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, [controlado, defaultChecked]);

  function alternar() {
    const proximo = !ligado;
    if (!controlado) setInterno(proximo);
    onCheckedChange?.(proximo);
  }

  const valorEnviado = ligado ? value : valorDesligado;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        role="switch"
        id={id}
        aria-checked={ligado}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        disabled={disabled}
        onClick={alternar}
        // O anel de foco é do trilho, não do botão inteiro (que inclui o texto).
        className={`group inline-flex items-center gap-2 align-middle text-left rounded-sm focus-visible:shadow-none! disabled:cursor-not-allowed disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      >
        <span
          aria-hidden
          className={`inline-flex flex-shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none group-focus-visible:shadow-[0_0_0_3px_var(--c41-focus-ring)] ${TRILHO[size]} ${
            ligado ? "bg-brand-solid border-brand-solid" : "bg-surface-hover border-border-strong group-hover:border-fg-muted"
          }`}
        >
          <span
            className={`rounded-full transition-transform motion-reduce:transition-none ${POLEGAR[size]} ${
              ligado ? `bg-white shadow-xs ${LIGADO[size]}` : "bg-fg-muted translate-x-0.5"
            }`}
          />
        </span>
        {rotulo != null && rotulo !== false && (
          <span className={`${size === "sm" ? "text-ui" : "text-label"} leading-5 text-fg-secondary`}>{rotulo}</span>
        )}
      </button>
      {name && valorEnviado !== undefined && <input type="hidden" name={name} value={valorEnviado} />}
    </>
  );
}
