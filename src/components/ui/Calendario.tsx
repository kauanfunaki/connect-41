"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DIAS_DA_SEMANA,
  INICIAIS_DA_SEMANA,
  MESES,
  dataParaLeitura,
  diaDaSemana,
  diasNoMes,
  ehFimDeSemana,
  foraDoLimite,
  gradeDoMes,
  hojeIso,
  lerIso,
  mesCurto,
  mesIso,
  paraIso,
  somarDias,
  somarMeses,
  somarMesesNaData,
} from "@/lib/datas/calendario";
import { useFeriados } from "@/components/ui/useFeriados";

// O calendário do campo de data (02/10/2026): grade do mês com a semana na
// segunda, hoje com anel da marca, o escolhido preenchido, dia de outro mês
// esmaecido, fim de semana apagado e feriado do escritório em vermelho com o
// nome no hover. Clicar no mês troca para a grade de meses, e no ano, para a
// de anos — data de nascimento sem oitenta cliques em ‹.

type Mes = { ano: number; mes: number };
type Visao = "dias" | "meses" | "anos";

type Props = {
  /** Dia escolhido (campo de data). */
  valor?: string;
  /** Período (campo de período). */
  periodo?: { de: string; ate: string };
  /** Escolhendo o fim do período: a faixa vai do início até o dia sob o mouse. */
  previa?: boolean;
  onEscolher: (iso: string) => void;
  min?: string;
  max?: string;
  /** Põe o foco no dia ao abrir (abertura pelo teclado). */
  autoFoco?: boolean;
  /** Atalhos e ações embaixo da grade. */
  rodape?: React.ReactNode;
};

export function Calendario({ valor, periodo, previa = false, onEscolher, min, max, autoFoco = false, rodape }: Props) {
  const hoje = useMemo(() => hojeIso(), []);
  const feriados = useFeriados();
  const [visivel, setVisivel] = useState<Mes>(() => {
    const base = lerIso(valor || periodo?.ate || periodo?.de || "") ?? lerIso(hoje)!;
    return { ano: base.ano, mes: base.mes };
  });
  const [visao, setVisao] = useState<Visao>("dias");
  const [foco, setFoco] = useState(() => (lerIso(valor) ? valor! : lerIso(periodo?.de) ? periodo!.de : hoje));
  const [passando, setPassando] = useState<string | null>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  // Só puxa o foco para a grade quando a pessoa está no teclado; com o mouse,
  // o foco fica onde está (no campo, digitando).
  const peloTeclado = useRef(autoFoco);

  const grade = useMemo(() => gradeDoMes(visivel.ano, visivel.mes), [visivel]);
  const primeiroDoMes = paraIso({ ...visivel, dia: 1 });
  const focoNaGrade = grade.some((s) => s.includes(foco)) ? foco : primeiroDoMes;

  useEffect(() => {
    if (!peloTeclado.current || visao !== "dias") return;
    gradeRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${focoNaGrade}"]`)?.focus();
  }, [focoNaGrade, visao]);

  function irPara(iso: string) {
    peloTeclado.current = true;
    setFoco(iso);
    const d = lerIso(iso)!;
    if (d.ano !== visivel.ano || d.mes !== visivel.mes) setVisivel({ ano: d.ano, mes: d.mes });
  }

  function noTeclado(e: React.KeyboardEvent) {
    const atual = focoNaGrade;
    const destino: Record<string, () => string> = {
      ArrowLeft: () => somarDias(atual, -1),
      ArrowRight: () => somarDias(atual, 1),
      ArrowUp: () => somarDias(atual, -7),
      ArrowDown: () => somarDias(atual, 7),
      PageUp: () => somarMesesNaData(atual, e.shiftKey ? -12 : -1),
      PageDown: () => somarMesesNaData(atual, e.shiftKey ? 12 : 1),
      Home: () => somarDias(atual, -diaDaSemana(atual)),
      End: () => somarDias(atual, 6 - diaDaSemana(atual)),
    };
    const ir = destino[e.key];
    if (!ir) return;
    e.preventDefault();
    irPara(ir());
  }

  function mudarMes(n: number) {
    const novo = somarMeses(visivel.ano, visivel.mes, n);
    setVisivel(novo);
    setFoco(paraIso({ ...novo, dia: Math.min(lerIso(focoNaGrade)!.dia, diasNoMes(novo.ano, novo.mes)) }));
  }

  // Período: escolhendo o fim, a faixa vai até o dia sob o mouse.
  const de = periodo?.de ?? "";
  const ateMostrado = periodo ? (previa && de && passando && passando >= de ? passando : periodo.ate) : "";

  function celula(dia: string) {
    const d = lerIso(dia)!;
    const doMes = d.mes === visivel.mes;
    const bloqueado = foraDoLimite(dia, min, max);
    const feriado = feriados.get(dia);
    const ehPonta = dia === valor || (Boolean(de) && dia === de) || (Boolean(ateMostrado) && dia === ateMostrado);
    const noMeio = Boolean(de && ateMostrado) && dia > de && dia < ateMostrado;
    const ehHoje = dia === hoje;
    // A faixa do período sai do meio da ponta, para as pontas ficarem redondas.
    const faixa =
      de && ateMostrado && de !== ateMostrado
        ? dia === de
          ? "linear-gradient(to right, transparent 50%, var(--color-brand-subtle) 50%)"
          : dia === ateMostrado
            ? "linear-gradient(to left, transparent 50%, var(--color-brand-subtle) 50%)"
            : noMeio
              ? "var(--color-brand-subtle)"
              : undefined
        : undefined;

    let cor: string;
    if (ehPonta) cor = "bg-brand-solid text-on-brand font-semibold";
    else if (bloqueado) cor = "text-fg-muted opacity-[var(--c41-disabled-op)] cursor-not-allowed";
    else cor = `hover:bg-surface-hover ${feriado ? "text-danger font-medium" : ehFimDeSemana(dia) ? "text-fg-muted" : "text-fg"}`;

    return (
      <div key={dia} role="gridcell" aria-selected={ehPonta} className="flex items-center justify-center py-0.5" style={{ background: faixa }}>
        <button
          type="button"
          data-dia={dia}
          tabIndex={dia === focoNaGrade ? 0 : -1}
          disabled={bloqueado}
          aria-label={`${dataParaLeitura(dia)}${feriado ? `, feriado: ${feriado}` : ""}${ehHoje ? ", hoje" : ""}`}
          aria-current={ehHoje ? "date" : undefined}
          title={feriado}
          onClick={() => onEscolher(dia)}
          onMouseEnter={() => setPassando(dia)}
          onFocus={() => setFoco(dia)}
          className={`relative size-9 rounded-full text-ui tabular-nums transition-colors outline-none ${cor} ${
            !doMes && !ehPonta ? "opacity-40" : ""
          } ${ehHoje && !ehPonta ? "ring-1 ring-inset ring-brand font-semibold" : ""}`}
        >
          {d.dia}
          {feriado && (
            <span
              aria-hidden
              className={`absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full ${ehPonta ? "bg-on-brand" : "bg-danger"}`}
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {visao === "dias" ? (
        <>
          <Cabecalho
            titulo={`${MESES[visivel.mes - 1]} ${visivel.ano}`}
            onTitulo={() => setVisao("meses")}
            rotuloDoTitulo="Escolher mês e ano"
            onAnterior={() => mudarMes(-1)}
            onProximo={() => mudarMes(1)}
            rotuloAnterior="Mês anterior"
            rotuloProximo="Próximo mês"
          />
          <div ref={gradeRef} role="grid" aria-label={`${MESES[visivel.mes - 1]} de ${visivel.ano}`} onKeyDown={noTeclado} onMouseLeave={() => setPassando(null)}>
            <div role="row" className="grid grid-cols-7">
              {INICIAIS_DA_SEMANA.map((inicial, i) => (
                <span
                  key={i}
                  role="columnheader"
                  aria-label={DIAS_DA_SEMANA[i]}
                  className={`h-7 flex items-center justify-center text-micro font-semibold uppercase ${i >= 5 ? "text-fg-muted/70" : "text-fg-muted"}`}
                >
                  {inicial}
                </span>
              ))}
            </div>
            {grade.map((semana, s) => (
              <div key={s} role="row" className="grid grid-cols-7">
                {semana.map(celula)}
              </div>
            ))}
          </div>
        </>
      ) : (
        <SeletorDeMesEAno
          visao={visao}
          setVisao={setVisao}
          ano={visivel.ano}
          selecionado={visivel}
          hoje={hoje}
          min={min?.slice(0, 7)}
          max={max?.slice(0, 7)}
          onEscolher={(ano, mes) => {
            setVisivel({ ano, mes });
            setFoco(paraIso({ ano, mes, dia: 1 }));
            setVisao("dias");
          }}
        />
      )}
      {rodape && <div className="mt-2 pt-2 border-t border-border flex flex-wrap items-center gap-1.5">{rodape}</div>}
    </div>
  );
}

/**
 * Grade de meses (e, clicando no ano, de anos). É o calendário inteiro do campo
 * de mês e a troca rápida do de data.
 */
export function SeletorDeMesEAno({
  visao,
  setVisao,
  ano: anoInicial,
  selecionado,
  hoje,
  min,
  max,
  onEscolher,
}: {
  visao: "meses" | "anos";
  setVisao: (v: Visao) => void;
  ano: number;
  /** Mês marcado como escolhido. */
  selecionado?: Mes | null;
  hoje: string;
  /** "AAAA-MM". */
  min?: string;
  max?: string;
  onEscolher: (ano: number, mes: number) => void;
}) {
  const [ano, setAno] = useState(anoInicial);
  const [inicioDosAnos, setInicioDosAnos] = useState(anoInicial - 7);
  const mesDeHoje = hoje.slice(0, 7);

  if (visao === "anos") {
    const anos = Array.from({ length: 12 }, (_, i) => inicioDosAnos + i);
    return (
      <div>
        <Cabecalho
          titulo={`${anos[0]} – ${anos[11]}`}
          onAnterior={() => setInicioDosAnos((a) => a - 12)}
          onProximo={() => setInicioDosAnos((a) => a + 12)}
          rotuloAnterior="Anos anteriores"
          rotuloProximo="Próximos anos"
        />
        <div className="grid grid-cols-3 gap-1">
          {anos.map((a) => {
            const bloqueado = Boolean((min && `${a}-12` < min) || (max && `${a}-01` > max));
            return (
              <BotaoDaGrade
                key={a}
                ativo={a === ano}
                atual={String(a) === hoje.slice(0, 4)}
                disabled={bloqueado}
                onClick={() => {
                  setAno(a);
                  setVisao("meses");
                }}
              >
                {a}
              </BotaoDaGrade>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Cabecalho
        titulo={String(ano)}
        onTitulo={() => {
          setInicioDosAnos(ano - 7);
          setVisao("anos");
        }}
        rotuloDoTitulo="Escolher ano"
        onAnterior={() => setAno((a) => a - 1)}
        onProximo={() => setAno((a) => a + 1)}
        rotuloAnterior="Ano anterior"
        rotuloProximo="Próximo ano"
      />
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const iso = mesIso(ano, m);
          return (
            <BotaoDaGrade
              key={m}
              ativo={selecionado?.ano === ano && selecionado.mes === m}
              atual={iso === mesDeHoje}
              disabled={Boolean((min && iso < min) || (max && iso > max))}
              onClick={() => onEscolher(ano, m)}
              aria-label={`${MESES[m - 1]} de ${ano}`}
            >
              {mesCurto(m)}
            </BotaoDaGrade>
          );
        })}
      </div>
    </div>
  );
}

function BotaoDaGrade({
  ativo,
  atual,
  children,
  ...rest
}: { ativo: boolean; atual: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`h-10 rounded-lg text-ui capitalize tabular-nums transition-colors outline-none disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${
        ativo ? "bg-brand-solid text-on-brand font-semibold" : "text-fg hover:bg-surface-hover"
      } ${atual && !ativo ? "ring-1 ring-inset ring-brand font-semibold" : ""}`}
    >
      {children}
    </button>
  );
}

function Cabecalho({
  titulo,
  onTitulo,
  rotuloDoTitulo,
  onAnterior,
  onProximo,
  rotuloAnterior,
  rotuloProximo,
}: {
  titulo: string;
  onTitulo?: () => void;
  rotuloDoTitulo?: string;
  onAnterior: () => void;
  onProximo: () => void;
  rotuloAnterior: string;
  rotuloProximo: string;
}) {
  const seta = "size-8 inline-flex items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg outline-none";
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      {onTitulo ? (
        <button
          type="button"
          onClick={onTitulo}
          aria-label={`${titulo} — ${rotuloDoTitulo}`}
          className="inline-flex items-center gap-1 h-8 px-2 -ml-1 rounded-md text-label font-semibold text-fg capitalize hover:bg-surface-hover outline-none"
        >
          {titulo}
          <ChevronDown size={14} className="text-fg-muted" />
        </button>
      ) : (
        <span className="h-8 px-1 inline-flex items-center text-label font-semibold text-fg tabular-nums">{titulo}</span>
      )}
      <div className="flex items-center">
        <button type="button" onClick={onAnterior} aria-label={rotuloAnterior} className={seta}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={onProximo} aria-label={rotuloProximo} className={seta}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/** Botão de atalho do rodapé ("Hoje", "Limpar", "Este mês"). */
export function AtalhoDoCalendario({
  children,
  onClick,
  disabled,
  discreto = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  discreto?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2.5 rounded-md text-fs-2 font-medium transition-colors outline-none disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${
        discreto ? "text-fg-muted hover:text-fg hover:bg-surface-hover" : "text-brand hover:bg-brand-subtle"
      }`}
    >
      {children}
    </button>
  );
}
