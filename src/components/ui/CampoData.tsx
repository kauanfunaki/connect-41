"use client";

import { useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendario, AtalhoDoCalendario } from "@/components/ui/Calendario";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { CLASSE_DO_TEXTO, classesDaCaixa, larguraDoCampo, useCampoDigitado, useTelaDeToque } from "@/components/ui/useCampoDigitado";
import { AvisoDoCampo } from "@/components/ui/AvisoDoCampo";
import { dataBR, dataPorExtenso, foraDoLimite, hojeIso, lerDataDigitada, mascararData } from "@/lib/datas/calendario";

export type PropsDoCampoData = {
  name?: string;
  id?: string;
  /** "AAAA-MM-DD", como o `<input type="date">` recebia. */
  defaultValue?: string;
  value?: string;
  /** Recebe "AAAA-MM-DD", ou "" quando a data é apagada ou inválida. */
  onChange?: (valor: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  title?: string;
  error?: boolean;
  "aria-label"?: string;
};

/**
 * Campo de data do Connect (02/10/2026), no lugar do `<input type="date">`.
 *
 * Digitar continua valendo — "06102026" ou "06/10/2026", com máscara —, e o
 * calendário abre ao clicar (ou com ↓ no teclado). O valor vai num
 * `<input type="hidden">` em "AAAA-MM-DD", então as actions não mudam.
 *
 * Diferente do campo nativo, não dispara `change` no `<form>`: formulário que
 * escuta `onChange` no form recebe a data pelo `onChange` daqui.
 */
export function CampoData({
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
  placeholder = "Escolher data",
  autoFocus,
  title,
  error = false,
  "aria-label": ariaLabel,
}: PropsDoCampoData) {
  const [aberto, setAberto] = useState(false);
  const [focoNaGrade, setFocoNaGrade] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();
  const idDoErro = useId();
  const toque = useTelaDeToque();
  const campo = useCampoDigitado({
    value,
    defaultValue,
    onChange,
    ler: (t) => lerDataDigitada(t),
    mascarar: mascararData,
    paraEdicao: dataBR,
    porExtenso: dataPorExtenso,
    validar: (v) =>
      min && v < min ? `A data mínima é ${dataBR(min)}.` : max && v > max ? `A data máxima é ${dataBR(max)}.` : null,
    mensagemDeInvalido: "Data inválida — use dd/mm/aaaa.",
  });
  const hoje = hojeIso();

  function abrir(peloTeclado: boolean) {
    if (disabled) return;
    setFocoNaGrade(peloTeclado);
    setAberto(true);
  }

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    // No quadro seguinte: o `onFocus` do campo lê o valor, e ele só muda depois
    // que o React redesenha com a escolha.
    if (devolverFoco) requestAnimationFrame(() => campo.inputRef.current?.focus());
  }

  function escolher(dia: string) {
    campo.escolher(dia);
    fechar(focoNaGrade);
  }

  function noTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && !aberto) {
      e.preventDefault();
      abrir(true);
    } else if (e.key === "Escape" && aberto) {
      // Só o calendário: o modal em volta continua aberto.
      e.preventDefault();
      e.stopPropagation();
      fechar(false);
    } else if (e.key === "Enter" && aberto) {
      e.preventDefault();
      fechar(false);
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  // Esc e Tab dentro da grade voltam para o campo.
  function noTecladoDoPainel(e: React.KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    }
  }

  return (
    // O `title` de quem usa vira a dica do Connect (o campo tem o próprio `aria-label`).
    <div className={`relative ${larguraDoCampo(className)} ${className}`.trim()} data-dica={title || undefined}>
      {name && <input type="hidden" name={name} value={campo.valor} />}
      <div ref={caixaRef} className={classesDaCaixa({ compact, erro: error || Boolean(campo.erro), disabled })}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Abrir calendário"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (aberto) fechar(false);
            else {
              campo.inputRef.current?.focus();
              abrir(false);
            }
          }}
          className="h-full pl-2.5 pr-1 flex items-center text-fg-muted hover:text-fg"
        >
          <CalendarDays size={compact ? 14 : 16} />
        </button>
        <input
          {...campo.inputProps}
          id={id}
          type="text"
          // Na tela de toque, sem teclado: o calendário abre como folha. Não é
          // `readOnly` porque campo só-leitura sai da validação do `required`.
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
          autoFocus={autoFocus}
          placeholder={campo.editando ? "dd/mm/aaaa" : placeholder}
          // No mousedown, e não no click: se algo acima mudar de altura no blur
          // do campo anterior, o click já cairia em outro lugar.
          onMouseDown={(e) => e.button === 0 && !aberto && abrir(false)}
          onKeyDown={noTeclado}
          className={CLASSE_DO_TEXTO}
        />
        <AvisoDoCampo id={idDoErro} mensagem={campo.erro} />
        {campo.valor && !required && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpar data"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              campo.escolher("");
              setAberto(false);
            }}
            className="mr-1.5 p-0.5 rounded-sm text-fg-muted hover:text-fg hover:bg-surface-hover"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <PainelFlutuante
        id={idDoPainel}
        ancora={caixaRef}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        largura={300}
        folhaNoCelular
        aria-label="Calendário"
        className="p-3"
      >
        {/* O foco fica no campo enquanto o mouse escolhe: sem isto, clicar num
            dia tiraria o foco do texto digitado e o validaria pela metade. */}
        <div onMouseDown={(e) => e.preventDefault()} onKeyDown={noTecladoDoPainel}>
          <Calendario
            valor={campo.valor}
            onEscolher={escolher}
            min={min}
            max={max}
            autoFoco={focoNaGrade}
            rodape={
              <>
                <AtalhoDoCalendario onClick={() => escolher(hoje)} disabled={foraDoLimite(hoje, min, max)}>
                  Hoje
                </AtalhoDoCalendario>
                {!required && campo.valor && (
                  <span className="ml-auto">
                    <AtalhoDoCalendario discreto onClick={() => escolher("")}>
                      Limpar
                    </AtalhoDoCalendario>
                  </span>
                )}
              </>
            }
          />
        </div>
      </PainelFlutuante>
    </div>
  );
}
