"use client";

// Campo de valor do Planejamento tributário (05/11/2026): reais, percentual,
// dias ou número livre, controlado como `number | null`. Vazio é "não
// informado" — o motor distingue isso de zero. Aceita "1.234,56".

import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/Input";
import { lerNumeroDigitado, textoDoNumero } from "@/lib/tributario/numeroDigitado";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "prefix" | "size" | "defaultValue"> & {
  value: number | null | undefined;
  onChange: (valor: number | null) => void;
  /** "R$" para dinheiro. */
  prefix?: string;
  /** "%" ou "dias". */
  suffix?: string;
  compact?: boolean;
  error?: boolean;
};

export function CampoValor({ value, onChange, onBlur, prefix, suffix, compact, error, placeholder = "Não informado", ...resto }: Props) {
  const [texto, setTexto] = useState(textoDoNumero(value));
  // O último valor que este campo viu: quando o de fora muda sem ser pela
  // digitação (um botão "Sem movimento: R$ 0", uma versão aberta), o texto acompanha.
  const [ultimo, setUltimo] = useState(value ?? null);
  if ((value ?? null) !== ultimo) {
    setUltimo(value ?? null);
    setTexto(textoDoNumero(value));
  }
  return (
    <Input
      {...resto}
      inputMode="decimal"
      autoComplete="off"
      prefix={prefix}
      suffix={suffix}
      compact={compact}
      error={error}
      placeholder={placeholder}
      value={texto}
      onChange={(e) => {
        const t = e.target.value;
        setTexto(t);
        const n = lerNumeroDigitado(t);
        if (n !== undefined) {
          setUltimo(n);
          onChange(n);
        }
      }}
      onBlur={(e) => {
        setTexto(textoDoNumero(value));
        onBlur?.(e);
      }}
    />
  );
}
