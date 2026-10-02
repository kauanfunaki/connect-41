"use client";

import { useId } from "react";
import { Clock } from "lucide-react";
import { CLASSE_DO_TEXTO, classesDaCaixa, larguraDoCampo, useCampoDigitado } from "@/components/ui/useCampoDigitado";
import { AvisoDoCampo } from "@/components/ui/AvisoDoCampo";
import { lerHoraDigitada, mascararHora } from "@/lib/datas/calendario";

type Props = {
  name?: string;
  id?: string;
  /** "HH:mm", como o `<input type="time">` recebia. */
  defaultValue?: string;
  value?: string;
  onChange?: (valor: string) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Campo de hora (02/10/2026), no lugar do `<input type="time">`: digita "0930",
 * "9:30" ou "14h". Sem painel — hora se digita mais rápido do que se escolhe.
 */
export function CampoHora({
  name,
  id,
  defaultValue,
  value,
  onChange,
  required = false,
  disabled = false,
  compact = false,
  className = "",
  placeholder = "hh:mm",
  "aria-label": ariaLabel,
}: Props) {
  const idDoErro = useId();
  const campo = useCampoDigitado({
    value,
    defaultValue,
    onChange,
    ler: lerHoraDigitada,
    mascarar: mascararHora,
    paraEdicao: (v) => v,
    porExtenso: (v) => v,
    mensagemDeInvalido: "Hora inválida — use hh:mm.",
  });

  return (
    <div className={`relative ${larguraDoCampo(className)} ${className}`.trim()}>
      {name && <input type="hidden" name={name} value={campo.valor} />}
      <div className={classesDaCaixa({ compact, erro: Boolean(campo.erro), disabled })}>
        <span aria-hidden className="h-full pl-2.5 pr-1 flex items-center text-fg-muted">
          <Clock size={compact ? 14 : 16} />
        </span>
        <input
          {...campo.inputProps}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-invalid={Boolean(campo.erro) || undefined}
          aria-describedby={campo.erro ? idDoErro : undefined}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={CLASSE_DO_TEXTO}
        />
        <AvisoDoCampo id={idDoErro} mensagem={campo.erro} />
      </div>
    </div>
  );
}
