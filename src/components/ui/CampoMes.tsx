"use client";

import { useId, useRef, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { AtalhoDoCalendario, SeletorDeMesEAno } from "@/components/ui/Calendario";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { CLASSE_DO_TEXTO, classesDaCaixa, larguraDoCampo, useCampoDigitado, useTelaDeToque } from "@/components/ui/useCampoDigitado";
import { AvisoDoCampo } from "@/components/ui/AvisoDoCampo";
import { anoPorExtenso, hojeIso, lerAnoIso, lerMesDigitado, lerMesIso, mascararMes, mesBR, mesPorExtenso } from "@/lib/datas/calendario";
import { formatarCompetenciaNumerica } from "@/lib/format";

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
  /**
   * Fora de foco, "10/2026" em vez de "out 2026" — os filtros da família da
   * DRE (14/10/2026). Ao digitar, é "mm/aaaa" de qualquer jeito.
   */
  mesEmNumero?: boolean;
  /**
   * Oferece também o ano inteiro (14/10/2026, DRE do portal): a grade ganha
   * "Ano inteiro de 2026", o valor passa a ser só o ano ("2026") e vai no
   * formulário com este nome — `ano=2026` no lugar de `mes=…`.
   */
  nomeDoAno?: string;
};

/**
 * Campo de mês (competência, filtro de período) — 02/10/2026, no lugar do
 * `<input type="month">`. Digita "102026" ou "10/2026"; o calendário é a grade
 * de meses, com o ano em ‹ ›. Fora de foco aparece "out 2026" — ou
 * "10/2026", com `mesEmNumero`. Com `nomeDoAno`, o ano inteiro se escolhe na
 * grade e aparece como "Ano de 2026"; digitar continua sendo de mês.
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
  mesEmNumero = false,
  nomeDoAno,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [visao, setVisao] = useState<"meses" | "anos">("meses");
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();
  const idDoErro = useId();
  const toque = useTelaDeToque();
  // O ano inteiro só existe com `nomeDoAno`; sem ele, "2026" não é valor.
  const ehAno = (v: string) => Boolean(nomeDoAno) && lerAnoIso(v) !== null;
  const campo = useCampoDigitado({
    value,
    defaultValue,
    onChange,
    ler: (t) => lerMesDigitado(t),
    mascarar: mascararMes,
    paraEdicao: (v) => (ehAno(v) ? v : mesBR(v)),
    porExtenso: (v) => (ehAno(v) ? anoPorExtenso(v) : mesEmNumero ? formatarCompetenciaNumerica(v) : mesPorExtenso(v)),
    validar: (v) => (min && v < min ? `O mês mínimo é ${mesBR(min)}.` : max && v > max ? `O mês máximo é ${mesBR(max)}.` : null),
    mensagemDeInvalido: "Mês inválido — use mm/aaaa.",
  });
  const hoje = hojeIso();
  const escolhido = lerMesIso(campo.valor);
  const anoEscolhido = ehAno(campo.valor) ? lerAnoIso(campo.valor) : null;
  // O ano inteiro vai com o nome dele: a tela lê `ano` ou `mes`, nunca os dois.
  const nomeDoValor = anoEscolhido !== null ? nomeDoAno : name;

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
      {nomeDoValor && <input type="hidden" name={nomeDoValor} value={campo.valor} />}
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
            ano={escolhido?.ano ?? anoEscolhido ?? Number(hoje.slice(0, 4))}
            selecionado={escolhido}
            anoSelecionado={anoEscolhido}
            hoje={hoje}
            min={min}
            max={max}
            onEscolher={(ano, mes) => escolher(`${ano}-${String(mes).padStart(2, "0")}`)}
            onEscolherAno={nomeDoAno ? (ano) => escolher(String(ano)) : undefined}
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
