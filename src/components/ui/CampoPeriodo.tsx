"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { AtalhoDoCalendario, Calendario } from "@/components/ui/Calendario";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { CLASSE_DO_TEXTO, classesDaCaixa, larguraDoCampo, useCampoDigitado, useTelaDeToque } from "@/components/ui/useCampoDigitado";
import { AvisoDoCampo } from "@/components/ui/AvisoDoCampo";
import { atalhosDePeriodo, dataBR, dataPorExtenso, hojeIso, lerDataDigitada, mascararData } from "@/lib/datas/calendario";

export type Periodo = { de: string; ate: string };

type Props = {
  /** Nomes no formulário (filtro GET: "de"/"ate", "from"/"to"). */
  nomeDe?: string;
  nomeAte?: string;
  defaultDe?: string;
  defaultAte?: string;
  /** Controlado: os dois juntos. */
  de?: string;
  ate?: string;
  onChange?: (periodo: Periodo) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  /** Nome do grupo ("Período"); cada ponta ganha "— início" e "— fim". */
  "aria-label"?: string;
};

/**
 * Período de–até numa caixa só (02/10/2026): as duas datas digitáveis lado a
 * lado e um calendário que escolhe as duas pontas — o primeiro clique é o
 * início, o segundo o fim, com a faixa acompanhando o mouse — e atalhos
 * ("Últimos 7 dias", "Este mês", "Mês passado"…).
 */
export function CampoPeriodo({
  nomeDe,
  nomeAte,
  defaultDe = "",
  defaultAte = "",
  de: deControlado,
  ate: ateControlado,
  onChange,
  min,
  max,
  disabled = false,
  compact = false,
  className = "",
  "aria-label": ariaLabel = "Período",
}: Props) {
  const controlado = deControlado !== undefined || ateControlado !== undefined;
  const [interno, setInterno] = useState<Periodo>({ de: defaultDe, ate: defaultAte });
  const atual: Periodo = controlado ? { de: deControlado ?? "", ate: ateControlado ?? "" } : interno;
  const [aberto, setAberto] = useState(false);
  const [escolhendo, setEscolhendo] = useState<"de" | "ate">("de");
  const caixaRef = useRef<HTMLDivElement>(null);
  const idDoErro = useId();
  const ocultoRef = useRef<HTMLInputElement>(null);
  const toque = useTelaDeToque();
  const hoje = hojeIso();

  function mudar(p: Periodo) {
    if (!controlado) setInterno(p);
    onChange?.(p);
  }

  const inicialRef = useRef({ de: defaultDe, ate: defaultAte });
  useEffect(() => {
    const form = ocultoRef.current?.form;
    if (!form) return;
    const voltar = () => setInterno(inicialRef.current);
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, []);

  const validar = (v: string) =>
    min && v < min ? `A data mínima é ${dataBR(min)}.` : max && v > max ? `A data máxima é ${dataBR(max)}.` : null;
  const comum = {
    ler: (t: string) => lerDataDigitada(t),
    mascarar: mascararData,
    paraEdicao: dataBR,
    porExtenso: dataPorExtenso,
    validar,
    mensagemDeInvalido: "Data inválida — use dd/mm/aaaa.",
  };
  const campoDe = useCampoDigitado({ ...comum, value: atual.de, onChange: (v) => mudar({ ...atual, de: v }) });
  const campoAte = useCampoDigitado({ ...comum, value: atual.ate, onChange: (v) => mudar({ ...atual, ate: v }) });
  const erro = campoDe.erro ?? campoAte.erro;

  function abrir(ponta: "de" | "ate") {
    if (disabled) return;
    setEscolhendo(ponta);
    setAberto(true);
  }

  // Escolha pelo calendário ou atalho: muda o período e o texto dos dois campos
  // (um deles pode estar com o foco, com o texto de antes).
  function definirPeriodo(p: Periodo) {
    mudar(p);
    campoDe.mostrar(p.de);
    campoAte.mostrar(p.ate);
  }

  function escolherDia(dia: string) {
    if (escolhendo === "de") {
      definirPeriodo({ de: dia, ate: atual.ate && atual.ate >= dia ? atual.ate : "" });
      setEscolhendo("ate");
      return;
    }
    // Clicou antes do início escolhendo o fim: recomeça por ele.
    if (!atual.de || dia < atual.de) {
      definirPeriodo({ de: dia, ate: "" });
      return;
    }
    definirPeriodo({ de: atual.de, ate: dia });
    setAberto(false);
  }

  function aplicar(p: Periodo) {
    definirPeriodo(p);
    setAberto(false);
  }

  function teclado(ponta: "de" | "ate") {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" && !aberto) {
        e.preventDefault();
        abrir(ponta);
      } else if ((e.key === "Escape" || e.key === "Enter") && aberto) {
        e.preventDefault();
        e.stopPropagation();
        setAberto(false);
      } else if (e.key === "Tab" && ponta === "ate") setAberto(false);
      else if (e.key === "Tab" && aberto) setEscolhendo(e.shiftKey ? "de" : "ate");
    };
  }

  const atalhos = atalhosDePeriodo(hoje);

  return (
    <div role="group" aria-label={ariaLabel} className={`relative ${larguraDoCampo(className)} ${className}`.trim()}>
      <input ref={ocultoRef} type="hidden" name={nomeDe} value={atual.de} />
      {nomeAte && <input type="hidden" name={nomeAte} value={atual.ate} />}
      <div ref={caixaRef} className={classesDaCaixa({ compact, erro: Boolean(erro), disabled })}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Abrir calendário"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (aberto ? setAberto(false) : abrir(atual.de && !atual.ate ? "ate" : "de"))}
          className="h-full pl-2.5 pr-1 flex items-center text-fg-muted hover:text-fg"
        >
          <CalendarDays size={compact ? 14 : 16} />
        </button>
        <input
          {...campoDe.inputProps}
          type="text"
          inputMode={toque ? "none" : "numeric"}
          autoComplete="off"
          aria-label={`${ariaLabel} — início`}
          aria-invalid={Boolean(campoDe.erro) || undefined}
          aria-describedby={campoDe.erro ? idDoErro : undefined}
          disabled={disabled}
          placeholder={campoDe.editando ? "dd/mm/aaaa" : "Início"}
          onMouseDown={(e) => e.button === 0 && abrir("de")}
          onKeyDown={teclado("de")}
          className={CLASSE_DO_TEXTO}
        />
        <span aria-hidden className="text-fg-muted px-0.5">
          –
        </span>
        <input
          {...campoAte.inputProps}
          type="text"
          inputMode={toque ? "none" : "numeric"}
          autoComplete="off"
          aria-label={`${ariaLabel} — fim`}
          aria-invalid={Boolean(campoAte.erro) || undefined}
          aria-describedby={campoAte.erro ? idDoErro : undefined}
          disabled={disabled}
          placeholder={campoAte.editando ? "dd/mm/aaaa" : "Fim"}
          onMouseDown={(e) => e.button === 0 && abrir("ate")}
          onKeyDown={teclado("ate")}
          className={CLASSE_DO_TEXTO}
        />
        <AvisoDoCampo id={idDoErro} mensagem={erro} />
        {(atual.de || atual.ate) && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpar período"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => aplicar({ de: "", ate: "" })}
            className="mr-1.5 p-0.5 rounded text-fg-muted hover:text-fg hover:bg-surface-hover"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <PainelFlutuante ancora={caixaRef} aberto={aberto} onFechar={() => setAberto(false)} largura={300} folhaNoCelular aria-label="Calendário do período" className="p-3">
        <div onMouseDown={(e) => e.preventDefault()}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
            {escolhendo === "de" ? "Escolha o início" : "Escolha o fim"}
          </p>
          <Calendario
            periodo={atual}
            previa={escolhendo === "ate"}
            onEscolher={escolherDia}
            min={min}
            max={max}
            rodape={
              <>
                {atalhos.map((a) => (
                  <AtalhoDoCalendario key={a.rotulo} onClick={() => aplicar({ de: a.de, ate: a.ate })}>
                    {a.rotulo}
                  </AtalhoDoCalendario>
                ))}
                {(atual.de || atual.ate) && (
                  <AtalhoDoCalendario discreto onClick={() => aplicar({ de: "", ate: "" })}>
                    Limpar
                  </AtalhoDoCalendario>
                )}
              </>
            }
          />
        </div>
      </PainelFlutuante>
    </div>
  );
}
