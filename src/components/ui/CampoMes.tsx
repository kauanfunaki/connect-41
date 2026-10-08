"use client";

import { useId, useRef, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { AtalhoDoCalendario, SeletorDeMesEAno } from "@/components/ui/Calendario";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { CLASSE_DO_TEXTO, classesDaCaixa, larguraDoCampo, useCampoDigitado, useTelaDeToque } from "@/components/ui/useCampoDigitado";
import { AvisoDoCampo } from "@/components/ui/AvisoDoCampo";
import { hojeIso, lerMesDigitado, lerMesIso, mascararMes, mesBR, mesPorExtenso } from "@/lib/datas/calendario";

type Props = {
  name?: string;
  id?: string;
  /** "AAAA-MM", como o `<input type="month">` recebia. */
  defaultValue?: string;
  value?: string;
  onChange?: (valor: string) => void;
  /** "AAAA-MM". */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Campo de mês (competência, filtro de período) — 02/10/2026, no lugar do
 * `<input type="month">`. Digita "102026" ou "10/2026"; o calendário é a grade
 * de meses, com o ano em ‹ ›. Fora de foco aparece "out 2026".
 */
export function CampoMes({
  name,
  id,
  defaultValue,
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  compact = false,
  className = "",
  placeholder = "Escolher mês",
  "aria-label": ariaLabel,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [visao, setVisao] = useState<"meses" | "anos">("meses");
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();
  const idDoErro = useId();
  const toque = useTelaDeToque();
  const campo = useCampoDigitado({
    value,
    defaultValue,
    onChange,
    ler: (t) => lerMesDigitado(t),
    mascarar: mascararMes,
    paraEdicao: mesBR,
    porExtenso: mesPorExtenso,
    validar: (v) => (min && v < min ? `O mês mínimo é ${mesBR(min)}.` : max && v > max ? `O mês máximo é ${mesBR(max)}.` : null),
    mensagemDeInvalido: "Mês inválido — use mm/aaaa.",
  });
  const hoje = hojeIso();
  const escolhido = lerMesIso(campo.valor);

  function abrir() {
    if (disabled) return;
    setVisao("meses");
    setAberto(true);
  }

  function escolher(mes: string) {
    campo.escolher(mes);
    setAberto(false);
  }

  return (
    <div className={`relative ${larguraDoCampo(className)} ${className}`.trim()}>
      {name && <input type="hidden" name={name} value={campo.valor} />}
      <div ref={caixaRef} className={classesDaCaixa({ compact, erro: Boolean(campo.erro), disabled })}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Abrir meses"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (aberto) setAberto(false);
            else {
              campo.inputRef.current?.focus();
              abrir();
            }
          }}
          className="h-full pl-2.5 pr-1 flex items-center text-fg-muted hover:text-fg"
        >
          <CalendarRange size={compact ? 14 : 16} />
        </button>
        <input
          {...campo.inputProps}
          id={id}
          type="text"
          inputMode={toque ? "none" : "numeric"}
          autoComplete="off"
          aria-label={ariaLabel}
          role="combobox"
          aria-controls={idDoPainel}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-invalid={Boolean(campo.erro) || undefined}
          aria-describedby={campo.erro ? idDoErro : undefined}
          required={required}
          disabled={disabled}
          placeholder={campo.editando ? "mm/aaaa" : placeholder}
          onMouseDown={(e) => e.button === 0 && !aberto && abrir()}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !aberto) {
              e.preventDefault();
              abrir();
            } else if ((e.key === "Escape" || e.key === "Enter") && aberto) {
              e.preventDefault();
              e.stopPropagation();
              setAberto(false);
            } else if (e.key === "Tab") setAberto(false);
          }}
          className={CLASSE_DO_TEXTO}
        />
        <AvisoDoCampo id={idDoErro} mensagem={campo.erro} />
        {campo.valor && !required && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpar mês"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => escolher("")}
            className="mr-1.5 p-0.5 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-hover"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <PainelFlutuante id={idDoPainel} ancora={caixaRef} aberto={aberto} onFechar={() => setAberto(false)} largura={280} folhaNoCelular aria-label="Meses" className="p-3">
        <div onMouseDown={(e) => e.preventDefault()}>
          <SeletorDeMesEAno
            key={aberto ? "aberto" : "fechado"}
            visao={visao}
            setVisao={(v) => setVisao(v === "anos" ? "anos" : "meses")}
            ano={escolhido?.ano ?? Number(hoje.slice(0, 4))}
            selecionado={escolhido}
            hoje={hoje}
            min={min}
            max={max}
            onEscolher={(ano, mes) => escolher(`${ano}-${String(mes).padStart(2, "0")}`)}
          />
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5">
            <AtalhoDoCalendario
              onClick={() => escolher(hoje.slice(0, 7))}
              disabled={Boolean((min && hoje.slice(0, 7) < min) || (max && hoje.slice(0, 7) > max))}
            >
              Este mês
            </AtalhoDoCalendario>
          </div>
        </div>
      </PainelFlutuante>
    </div>
  );
}
