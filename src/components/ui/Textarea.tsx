"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
  /**
   * O campo cresce com o que se escreve (25/11/2026, melhoria-829): a altura
   * acompanha o texto, sem barra de rolagem, e o `rows`/altura mínima continua
   * sendo o ponto de partida. Volta a medir quando a largura muda (a coluna
   * alarga ou estreita e o texto quebra em outro ponto).
   */
  crescer?: boolean;
};

/** A altura que mostra o texto inteiro: o `scrollHeight` mais as bordas (o `box-sizing` é o da borda). */
function ajustarAltura(el: HTMLTextAreaElement) {
  // Sem largura (um ancestral com display: none), a medida sairia errada; o observador mede quando ela chegar.
  if (el.offsetWidth === 0) return;
  el.style.height = "auto";
  const bordas = el.offsetHeight - el.clientHeight;
  el.style.height = `${el.scrollHeight + bordas}px`;
}

// forwardRef: MentionTextarea (transferencias) precisa do DOM node pra ler
// selectionStart/posicionar o cursor ao inserir uma menção.
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { error = false, crescer = false, className = "", disabled, readOnly, onInput, ...rest },
  ref
) {
  const campo = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => campo.current as HTMLTextAreaElement, []);

  // Controlado: mede de novo a cada valor, antes de pintar (o campo não pisca).
  const valor = rest.value;
  useLayoutEffect(() => {
    if (crescer && campo.current) ajustarAltura(campo.current);
  }, [crescer, valor]);

  // A largura mudou: o texto quebra em outro ponto. Num quadro à parte, para a
  // troca de altura não disparar o próprio observador no mesmo ciclo.
  useEffect(() => {
    const el = campo.current;
    if (!crescer || !el || typeof ResizeObserver === "undefined") return;
    let largura = el.offsetWidth;
    let quadro = 0;
    const observador = new ResizeObserver(() => {
      if (el.offsetWidth === largura) return;
      largura = el.offsetWidth;
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => ajustarAltura(el));
    });
    observador.observe(el);
    return () => {
      observador.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [crescer]);

  return (
    <textarea
      ref={campo}
      disabled={disabled}
      readOnly={readOnly}
      onInput={(e) => {
        // Não controlado: mede a cada tecla.
        if (crescer) ajustarAltura(e.currentTarget);
        onInput?.(e);
      }}
      className={`w-full min-h-[76px] px-3 py-2.5 rounded-md border bg-input-bg text-input text-fg placeholder:text-fg-muted outline-none transition-colors resize-none ${crescer ? "overflow-hidden" : ""} ${
        error
          ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
          : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      } ${readOnly ? "bg-transparent border-dashed" : ""} disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      {...rest}
    />
  );
});
