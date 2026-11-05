"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { SeletorDeCorLivre } from "@/components/ui/SeletorDeCorLivre";
import { useToast } from "@/components/ui/Toast";
import { salvarMinhaPaleta } from "@/app/(app)/configuracoes/actions";
import { PALETAS, motivoDaCorRecusada, paletaDaCor } from "@/lib/aparencia/paletas";

/** A bolinha da cor personalizada antes de escolher uma: o arco-íris diz "qualquer cor". */
const ARCO_IRIS = "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

/**
 * A paleta da pessoa (30/10/2026), como os temas do Slack: a cor de destaque e
 * o tom da lateral, só para ela. Clicar já aplica; "Do escritório" volta à cor
 * que o escritório escolheu (ou ao azul do Connect).
 *
 * Recolhida desde 05/11/2026 (pedido do Kauan): os temas claro, escuro e do
 * sistema são o principal da Aparência, e a cor fica numa linha com a escolha
 * atual à vista. No mesmo dia: a bolinha "Do escritório" mostra a cor do
 * escritório (mostrava a cor de destaque em uso, a da própria pessoa); a
 * personalizada é um botão como os outros, que abre o seletor livre e aplica
 * no "Confirmar"; e a paleta "41" saiu.
 */
export function SeletorDePaleta({ atual, corDoEscritorio }: { atual: string | null; corDoEscritorio: string }) {
  const router = useRouter();
  const toast = useToast();
  const [escolhida, setEscolhida] = useState<string | null>(atual);
  const [pendente, iniciar] = useTransition();
  const [livreAberto, setLivreAberto] = useState(false);
  const botaoDaLivre = useRef<HTMLButtonElement>(null);

  function aplicar(cor: string | null) {
    const antes = escolhida;
    setEscolhida(cor);
    iniciar(async () => {
      const r = await salvarMinhaPaleta(cor);
      if (r && "error" in r) {
        setEscolhida(antes);
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  const pronta = paletaDaCor(escolhida);
  const ehPropria = escolhida !== null && !pronta;
  const resumo = escolhida === null ? { nome: "Do escritório", cor: corDoEscritorio } : pronta ? { nome: pronta.nome, cor: pronta.cor } : { nome: "Personalizada", cor: escolhida };

  return (
    <Accordion
      chevron="fim"
      classeDoCabecalho="w-full"
      classeDoConteudo="flex flex-col gap-3 pt-3"
      titulo={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ui font-medium text-fg">Cor de destaque</span>
          <span className="flex items-center gap-1.5 text-ui text-fg-secondary">
            <span aria-hidden className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: resumo.cor }} />
            {resumo.nome}
          </span>
        </span>
      }
    >
      <p className="text-ui text-fg-secondary">
        A cor dos botões, da aba aberta e do item do menu, e o tom da lateral, só para você. As cores das áreas não mudam.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Cor de destaque" aria-busy={pendente || undefined}>
        <Amostra nome="Do escritório" cor={corDoEscritorio} ativa={escolhida === null} onClick={() => aplicar(null)} disabled={pendente} />
        {PALETAS.map((p) => (
          <Amostra key={p.codigo} nome={p.nome} cor={p.cor} ativa={escolhida === p.cor} onClick={() => aplicar(p.cor)} disabled={pendente} />
        ))}
        <Amostra
          ref={botaoDaLivre}
          nome="Personalizada"
          cor={ehPropria ? escolhida : ARCO_IRIS}
          ativa={ehPropria}
          onClick={() => setLivreAberto((v) => !v)}
          disabled={pendente}
          abreSeletor={livreAberto}
        />
      </div>
      <PainelFlutuante ancora={botaoDaLivre} aberto={livreAberto} onFechar={() => setLivreAberto(false)} largura={280} align="right" folhaNoCelular aria-label="Cor personalizada" className="p-3">
        {livreAberto && (
          <SeletorDeCorLivre
            valor={ehPropria ? escolhida : "#E91E63"}
            motivoDaRecusa={motivoDaCorRecusada}
            onCancelar={() => {
              setLivreAberto(false);
              botaoDaLivre.current?.focus();
            }}
            onConfirmar={(cor) => {
              setLivreAberto(false);
              botaoDaLivre.current?.focus();
              aplicar(cor);
            }}
          />
        )}
      </PainelFlutuante>
    </Accordion>
  );
}

function Amostra({
  nome,
  cor,
  ativa,
  onClick,
  disabled,
  abreSeletor,
  ref,
}: {
  nome: string;
  cor: string;
  ativa: boolean;
  onClick: () => void;
  disabled: boolean;
  /** A personalizada: abre o seletor livre em vez de aplicar na hora. */
  abreSeletor?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={ativa}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-[var(--c41-disabled-op)] ${
        ativa ? "border-brand bg-brand/5" : "border-border hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      <span aria-hidden className="size-5 flex-shrink-0 rounded-full border border-border" style={{ background: cor }} />
      <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg">
        {nome}
        {abreSeletor !== undefined && <span className="sr-only">, abre o seletor de cor</span>}
      </span>
      {ativa && <Check size={14} className="flex-shrink-0 text-brand" />}
    </button>
  );
}
