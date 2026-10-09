"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { parseHexColor, readableTextOn } from "@/lib/color";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

/** As cores do Connect: as dos setores, na ordem da paleta, e o magenta da Controladoria. */
export const PALETA_DO_CONNECT: readonly string[] = [...SECTOR_COLOR_PALETTE, "#B8327A"];

// Nome para o leitor de tela — "#2E6FB8" lido em voz alta não diz nada.
const NOME_DA_COR: Record<string, string> = {
  "#2E6FB8": "Azul",
  "#7C5CBF": "Roxo",
  "#1E8E5A": "Verde",
  "#C8860D": "Mostarda",
  "#0E9384": "Verde-água",
  "#C5374B": "Vermelho",
  "#4F46E5": "Anil",
  "#B7791F": "Ocre",
  "#E15A2B": "Laranja",
  "#0891B2": "Ciano",
  "#586577": "Cinza",
  "#B8327A": "Magenta",
};

/** "#rgb", "#rrggbb" ou sem "#" → "#RRGGBB"; `null` se não for cor. */
export function hexCanonico(valor: string): string | null {
  const rgb = parseHexColor(valor);
  if (!rgb) return null;
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mesmaCor(a: string, b: string): boolean {
  const x = hexCanonico(a);
  return x !== null && x === hexCanonico(b);
}

function nomeDaCor(cor: string): string {
  const hex = hexCanonico(cor);
  return (hex && NOME_DA_COR[hex]) ?? `Cor personalizada ${hex ?? cor}`;
}

type Props = {
  /** Controlado. Sai sempre como "#RRGGBB". */
  valor?: string;
  /** Não controlado: a cor ao abrir. Padrão: a primeira da paleta. */
  valorInicial?: string;
  onChange?: (cor: string) => void;
  /** Nome do campo no formulário (um campo escondido com a cor). */
  name?: string;
  cores?: readonly string[];
  /** Campo de cor em hexadecimal embaixo da paleta, para quem precisa de outra. */
  corLivre?: boolean;
  /**
   * `paleta`: as bolinhas à vista, no formulário (setor, tag).
   * `botao`: uma amostra de 36px que abre a paleta num painel — na linha do
   * estágio do kanban, ao lado do nome.
   */
  modo?: "paleta" | "botao";
  /** Do que é a cor ("Cor do estágio 2"). */
  "aria-label"?: string;
  id?: string;
};

/**
 * Seletor de cor do Connect (08/10/2026), no lugar do `<input type="color">`,
 * que abria o seletor do sistema operacional — outra janela, outro desenho, um
 * arco-íris inteiro para escolher a cor de um estágio. Aqui a escolha é entre
 * as cores do Connect, com a escolhida marcada (✓ e contorno), e o hexadecimal
 * para quem precisa de outra. O valor segue no mesmo formato ("#RRGGBB").
 *
 * As bolinhas são rádios de verdade por baixo, como no `RadioGroup`: setas
 * andam entre as cores, e o nome de cada uma é lido pelo leitor de tela. Uma
 * cor salva que não está na paleta aparece como mais uma bolinha, marcada.
 */
export function SeletorDeCor({
  valor,
  valorInicial,
  onChange,
  name,
  cores = PALETA_DO_CONNECT,
  corLivre = true,
  modo = "paleta",
  "aria-label": ariaLabel = "Cor",
  id,
}: Props) {
  const [interna, setInterna] = useState(() => hexCanonico(valorInicial ?? "") ?? cores[0]);
  const atual = valor ?? interna;
  const escondidoRef = useRef<HTMLInputElement>(null);

  // O "limpar" do formulário volta o não controlado à cor inicial.
  useEffect(() => {
    if (valor !== undefined) return;
    const form = escondidoRef.current?.form;
    if (!form) return;
    const voltar = () => setInterna(hexCanonico(valorInicial ?? "") ?? cores[0]);
    form.addEventListener("reset", voltar);
    return () => form.removeEventListener("reset", voltar);
  }, [valor, valorInicial, cores]);

  function escolher(cor: string) {
    if (valor === undefined) setInterna(cor);
    onChange?.(cor);
  }

  const escondido = name ? <input ref={escondidoRef} type="hidden" name={name} value={atual} /> : null;

  if (modo === "paleta") {
    return (
      <>
        <Paleta cores={cores} atual={atual} onEscolher={escolher} rotulo={ariaLabel} corLivre={corLivre} />
        {escondido}
      </>
    );
  }

  return <SeletorNoBotao atual={atual} onEscolher={escolher} cores={cores} corLivre={corLivre} rotulo={ariaLabel} id={id} escondido={escondido} />;
}

function SeletorNoBotao({
  atual,
  onEscolher,
  cores,
  corLivre,
  rotulo,
  id,
  escondido,
}: {
  atual: string;
  onEscolher: (cor: string) => void;
  cores: readonly string[];
  corLivre: boolean;
  rotulo: string;
  id?: string;
  escondido: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();

  // Ao abrir, o foco vai para a cor marcada: dali as setas já trocam a cor.
  useEffect(() => {
    if (!aberto) return;
    const quadro = requestAnimationFrame(() => {
      conteudoRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    botaoRef.current?.focus();
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        id={id}
        aria-label={`${rotulo}: ${nomeDaCor(atual)}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idDoPainel : undefined}
        onClick={() => setAberto((v) => !v)}
        className="size-9 flex-shrink-0 cursor-pointer rounded-md border border-border-strong bg-input-bg p-1 transition-colors hover:border-fg-muted"
      >
        <span className="block size-full rounded-sm" style={{ background: atual }} />
      </button>
      {escondido}
      <PainelFlutuante
        id={idDoPainel}
        ancora={botaoRef}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        largura={240}
        aria-label={rotulo}
        className="p-3"
      >
        <div
          ref={conteudoRef}
          onKeyDown={(e) => {
            // Só o painel: o modal em volta continua aberto.
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              fechar();
            }
          }}
        >
          <Paleta
            cores={cores}
            atual={atual}
            onEscolher={onEscolher}
            rotulo={rotulo}
            corLivre={corLivre}
            aoClicarNaCor={fechar}
          />
        </div>
      </PainelFlutuante>
    </>
  );
}

function Paleta({
  cores,
  atual,
  onEscolher,
  rotulo,
  corLivre,
  aoClicarNaCor,
}: {
  cores: readonly string[];
  atual: string;
  onEscolher: (cor: string) => void;
  rotulo: string;
  corLivre: boolean;
  /** Clique de mouse ou toque numa cor (não as setas do teclado). */
  aoClicarNaCor?: () => void;
}) {
  const nome = useId();
  const naPaleta = cores.some((c) => mesmaCor(c, atual));
  const lista = naPaleta || !hexCanonico(atual) ? cores : [...cores, atual];

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
        {lista.map((cor) => {
          const marcada = mesmaCor(cor, atual);
          return (
            <label
              key={cor}
              // `detail` 0 é o clique que as setas do teclado sintetizam no
              // rádio: só o clique de verdade fecha o painel. A escolha vai
              // aqui mesmo, antes de fechar — o painel pode sair da tela antes
              // de o `change` do rádio chegar.
              onClick={(e) => {
                if (e.detail === 0 || !aoClicarNaCor) return;
                onEscolher(hexCanonico(cor) ?? cor);
                aoClicarNaCor();
              }}
              className={`relative size-7 flex-shrink-0 cursor-pointer rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring ${
                marcada ? "outline-2 outline-offset-2 outline-fg" : ""
              }`}
              style={{ background: cor }}
            >
              {/* Sem dono (`form=""`): a bolinha não vai para o formulário — quem vai é o campo escondido. */}
              <input
                type="radio"
                name={nome}
                form=""
                value={cor}
                checked={marcada}
                onChange={() => onEscolher(hexCanonico(cor) ?? cor)}
                aria-label={nomeDaCor(cor)}
                className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
              />
              <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]">
                {marcada && <Check size={14} strokeWidth={3} style={{ color: readableTextOn(cor) }} />}
              </span>
            </label>
          );
        })}
      </div>
      {corLivre && <CampoHex atual={atual} onEscolher={onEscolher} />}
    </div>
  );
}

function semCerquilha(cor: string): string {
  return (hexCanonico(cor) ?? cor).replace(/^#/, "");
}

/** O hexadecimal, para a cor fora da paleta. Aplica com 6 dígitos, ao sair do campo ou no Enter. */
function CampoHex({ atual, onEscolher }: { atual: string; onEscolher: (cor: string) => void }) {
  const [texto, setTexto] = useState(semCerquilha(atual));
  // A cor mudou por fora (clique na paleta): o campo acompanha.
  const [atualAntes, setAtualAntes] = useState(atual);
  if (atual !== atualAntes) {
    setAtualAntes(atual);
    setTexto(semCerquilha(atual));
  }
  const digitada = hexCanonico(texto);

  function aplicar() {
    if (digitada) {
      if (!mesmaCor(digitada, atual)) onEscolher(digitada);
      setTexto(semCerquilha(digitada));
    } else {
      setTexto(semCerquilha(atual));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-8 flex-shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
        style={{ background: digitada ?? atual }}
      />
      <Input
        compact
        prefix="#"
        value={texto}
        onChange={(e) => {
          const limpo = e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
          setTexto(limpo);
          const cor = limpo.length === 6 ? hexCanonico(limpo) : null;
          if (cor && !mesmaCor(cor, atual)) onEscolher(cor);
        }}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
          }
        }}
        aria-label="Outra cor, em hexadecimal"
        placeholder="1F5EEA"
        spellCheck={false}
        autoComplete="off"
        className="w-32 font-mono"
      />
    </div>
  );
}
