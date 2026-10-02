"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// O miolo dos campos de data, mês e hora (02/10/2026): a pessoa digita com
// máscara, o valor vai num `<input type="hidden">` no formato que o campo
// nativo mandava ("AAAA-MM-DD", "AAAA-MM", "HH:mm") e, fora de foco, o texto
// aparece por extenso ("06 out 2026").
//
// Regras:
// • data completa e válida já vale enquanto digita — Enter submete com ela;
// • ao sair do campo, texto que não é data fica à vista, em vermelho, e o
//   valor enviado fica vazio: o que se vê é o que vai (nada de data velha
//   escondida atrás de um texto errado);
// • `setCustomValidity` leva o erro para a validação do navegador, então um
//   formulário sem `noValidate` não submete com data inválida.

type Opcoes = {
  value?: string;
  defaultValue?: string;
  onChange?: (valor: string) => void;
  /** Texto digitado → valor, ou `null` quando não é um valor. */
  ler: (texto: string) => string | null;
  mascarar: (texto: string) => string;
  /** Valor → texto de edição ("06/10/2026"). */
  paraEdicao: (valor: string) => string;
  /** Valor → texto fora de foco ("06 out 2026"). */
  porExtenso: (valor: string) => string;
  /** Mensagem quando o valor é válido mas não serve (fora de min/max). */
  validar?: (valor: string) => string | null;
  /** Mensagem para texto que não é um valor. */
  mensagemDeInvalido: string;
};

export function useCampoDigitado({
  value,
  defaultValue = "",
  onChange,
  ler,
  mascarar,
  paraEdicao,
  porExtenso,
  validar,
  mensagemDeInvalido,
}: Opcoes) {
  const [interno, setInterno] = useState(defaultValue);
  const valor = value ?? interno;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  // O erro vale para o valor que estava em vigor quando ele apareceu: se o
  // valor muda por fora (filtro limpo, data preenchida pelo CNPJ), some sozinho.
  const [erro, setErro] = useState<{ mensagem: string; texto: string; para: string } | null>(null);
  const erroAtual = erro && erro.para === valor ? erro : null;
  const inputRef = useRef<HTMLInputElement>(null);
  // Só confirma no blur o que foi DIGITADO desde o foco. Com o foco parado no
  // campo enquanto o mouse escolhe no calendário, o blur confirmaria o texto
  // de antes da escolha por cima dela (visto no filtro de período, 02/10).
  const digitou = useRef(false);
  // Tudo selecionado ao entrar, para digitar por cima, como no campo nativo.
  // Depois do redesenho (o texto troca de "06 out 2026" para "06/10/2026", e
  // trocar o valor desfaz a seleção) e antes da próxima tecla: num efeito de
  // layout. Um `requestAnimationFrame` chegava tarde para quem clica e já
  // digita, e a primeira tecla se perdia.
  const selecionar = useRef(false);
  useLayoutEffect(() => {
    if (editando && selecionar.current) inputRef.current?.select();
  }, [editando]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  function definir(novo: string) {
    if (value === undefined) setInterno(novo);
    if (novo !== valor) onChangeRef.current?.(novo);
  }

  // `form.reset()` não alcança estado do React: o campo volta ao valor inicial
  // ouvindo o próprio evento.
  const inicialRef = useRef(defaultValue);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    function voltar() {
      setInterno(inicialRef.current);
      setErro(null);
      setEditando(false);
    }
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, []);

  useEffect(() => {
    inputRef.current?.setCustomValidity(erroAtual?.mensagem ?? "");
  }, [erroAtual?.mensagem]);

  function confirmar(texto: string) {
    if (texto.trim() === "") {
      setErro(null);
      definir("");
      return;
    }
    const lido = ler(texto);
    const mensagem = lido ? validar?.(lido) ?? null : mensagemDeInvalido;
    if (lido && !mensagem) {
      setErro(null);
      definir(lido);
    } else {
      setErro({ mensagem: mensagem!, texto, para: "" });
      definir("");
    }
  }

  const inputProps = {
    ref: inputRef,
    value: editando ? rascunho : erroAtual ? erroAtual.texto : valor ? porExtenso(valor) : "",
    onFocus: () => {
      digitou.current = false;
      selecionar.current = true;
      setEditando(true);
      setRascunho(erroAtual ? erroAtual.texto : valor ? paraEdicao(valor) : "");
    },
    // O mouseup do clique que deu o foco desfaria a seleção, pondo o cursor
    // onde o mouse soltou.
    onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
      if (selecionar.current) e.preventDefault();
      selecionar.current = false;
    },
    onBlur: () => {
      setEditando(false);
      if (digitou.current) confirmar(rascunho);
      digitou.current = false;
      selecionar.current = false;
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      digitou.current = true;
      selecionar.current = false;
      const texto = mascarar(e.target.value);
      setRascunho(texto);
      const lido = ler(texto);
      if (texto === "") definir("");
      else if (lido && !validar?.(lido)) definir(lido);
    },
  };

  /** Põe no texto um valor que veio de fora da digitação, sem avisar o `onChange`. */
  function mostrar(novo: string) {
    digitou.current = false;
    setErro(null);
    setRascunho(novo ? paraEdicao(novo) : "");
  }

  /** Escolha que veio do calendário (ou de um atalho). */
  function escolher(novo: string) {
    mostrar(novo);
    definir(novo);
  }

  return { valor, erro: erroAtual?.mensagem ?? null, editando, inputRef, inputProps, escolher, mostrar };
}

const TOQUE = "(pointer: coarse)";
function assinarToque(aviso: () => void) {
  const mq = window.matchMedia(TOQUE);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/**
 * Tela de toque: o campo não abre o teclado — o calendário, como folha embaixo,
 * é mais rápido que digitar no celular, e os dois disputariam a tela.
 */
export function useTelaDeToque(): boolean {
  return useSyncExternalStore(assinarToque, () => window.matchMedia(TOQUE).matches, () => false);
}

/** Largura do campo: `w-full` por padrão; quem passa largura própria fica com a dela (regra do `Input`). */
export function larguraDoCampo(className: string): string {
  return /(^|\s)w-(?!full(\s|$))\S+/.test(className) ? "" : "w-full";
}

/**
 * O texto de dentro da caixa. O anel de foco é da caixa; o `:focus-visible`
 * global (globals.css, fora das camadas do Tailwind) desenharia outro aqui
 * dentro — por isso o `!`.
 */
export const CLASSE_DO_TEXTO =
  "flex-1 min-w-0 h-full bg-transparent pl-1 pr-2 text-fg placeholder:text-fg-muted outline-none focus-visible:shadow-none! tabular-nums";

/** A caixa com borda e anel de foco, igual à do `Input` com controle à direita. */
export function classesDaCaixa({ compact, erro, disabled }: { compact: boolean; erro: boolean; disabled?: boolean }): string {
  return `flex items-center ${compact ? "h-8 text-[13px]" : "h-9 text-[length:var(--fs-input)]"} rounded-md border bg-input-bg transition-colors ${
    erro
      ? "border-danger focus-within:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
      : "border-border-strong focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
  } ${disabled ? "opacity-[var(--c41-disabled-op)] pointer-events-none" : ""}`;
}
