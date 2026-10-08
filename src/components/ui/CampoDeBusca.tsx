"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { digitarNoCampo } from "@/components/ui/digitarNoCampo";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "icon" | "direita" | "prefix" | "suffix"> & {
  /**
   * Ao limpar, envia o formulário em volta — a busca por GET que já filtrou a
   * lista volta a mostrar tudo. Padrão: envia quando a busca abriu preenchida
   * (`defaultValue`), que é quando a lista está filtrada por ela.
   */
  enviarAoLimpar?: boolean;
};

/**
 * Caixa de busca do Connect (08/10/2026): lupa, `type="search"` (o teclado do
 * celular mostra "Buscar", o leitor de tela diz "busca") e um "limpar" próprio
 * — o "X" do Chrome saiu no globals.css, porque cada navegador o desenhava de
 * um jeito e o Firefox nem tinha. Esc continua limpando, como antes.
 *
 * O botão some com a caixa vazia (sem mudar a largura) e não entra na
 * tabulação: o teclado já limpa com Esc. Serve controlado e não controlado; o
 * limpar dispara o `onChange` como se a pessoa tivesse apagado.
 */
export function CampoDeBusca({ value, defaultValue, onChange, enviarAoLimpar, compact = false, ...rest }: Props) {
  const [digitado, setDigitado] = useState(String(defaultValue ?? ""));
  const atual = value !== undefined ? String(value) : digitado;
  const enviar = enviarAoLimpar ?? String(defaultValue ?? "").trim() !== "";

  function limpar(botao: HTMLButtonElement) {
    // O botão mora dentro da caixa do `Input`, junto do campo.
    const input = botao.parentElement?.parentElement?.querySelector("input");
    if (!input) return;
    digitarNoCampo(input, "");
    input.focus();
    if (enviar) input.form?.requestSubmit();
  }

  return (
    <Input
      {...rest}
      compact={compact}
      type="search"
      icon={<Search />}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => {
        setDigitado(e.target.value);
        onChange?.(e);
      }}
      direita={
        <button
          type="button"
          tabIndex={-1}
          aria-label="Limpar a busca"
          aria-hidden={atual === "" || undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => limpar(e.currentTarget)}
          className={`rounded-sm p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg ${atual === "" ? "invisible" : ""}`}
        >
          <X size={compact ? 13 : 14} />
        </button>
      }
    />
  );
}
