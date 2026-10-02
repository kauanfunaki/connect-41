"use client";

import { useEffect, useRef, useState } from "react";
import { CampoData } from "@/components/ui/CampoData";
import { CampoHora } from "@/components/ui/CampoHora";

type Props = {
  name?: string;
  /** Vai no campo da data — é ele que o `<label htmlFor>` foca. */
  id?: string;
  /** "AAAA-MM-DDTHH:mm", como o `<input type="datetime-local">` recebia. */
  defaultValue?: string;
  /** Recebe "AAAA-MM-DDTHH:mm" quando data e hora estão preenchidas; senão "". */
  onChange?: (valor: string) => void;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * Data e hora (agenda, reuniões) — 02/10/2026, no lugar do
 * `<input type="datetime-local">`: o campo de data com o calendário e, ao lado,
 * a hora digitada. O formulário recebe os dois juntos, no formato de antes.
 */
export function CampoDataHora({
  name,
  id,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
  compact = false,
  className = "",
  "aria-label": ariaLabel,
}: Props) {
  const [data, setData] = useState(defaultValue.slice(0, 10));
  const [hora, setHora] = useState(defaultValue.slice(11, 16));
  const valor = data && hora ? `${data}T${hora}` : "";
  const ocultoRef = useRef<HTMLInputElement>(null);

  // Os dois campos de dentro são controlados daqui, então o `reset` do
  // formulário tem de voltar este estado.
  const inicialRef = useRef(defaultValue);
  useEffect(() => {
    const form = ocultoRef.current?.form;
    if (!form) return;
    function voltar() {
      setData(inicialRef.current.slice(0, 10));
      setHora(inicialRef.current.slice(11, 16));
    }
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, []);

  function mudar(novaData: string, novaHora: string) {
    setData(novaData);
    setHora(novaHora);
    onChange?.(novaData && novaHora ? `${novaData}T${novaHora}` : "");
  }

  return (
    <div className={`flex items-start gap-2 ${className}`.trim()}>
      <input ref={ocultoRef} type="hidden" name={name} value={valor} />
      <CampoData
        id={id}
        value={data}
        onChange={(v) => mudar(v, hora)}
        required={required}
        disabled={disabled}
        compact={compact}
        className="flex-1 min-w-0"
        aria-label={ariaLabel ? `${ariaLabel} — data` : undefined}
      />
      <CampoHora
        value={hora}
        onChange={(v) => mudar(data, v)}
        required={required}
        disabled={disabled}
        compact={compact}
        className="w-[92px] flex-shrink-0"
        aria-label={ariaLabel ? `${ariaLabel} — hora` : "Hora"}
      />
    </div>
  );
}
