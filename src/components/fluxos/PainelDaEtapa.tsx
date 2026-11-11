"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { ehVolta, nomeCurtoDaEtapa, saidasDasEtapas, type Etapa } from "@/lib/fluxos/etapas";
import { telaDoConnect } from "@/lib/fluxos/telas";
import { SeloDoExecutor } from "./SeloDoExecutor";

type Props = {
  etapa: Etapa;
  etapas: Etapa[];
  numeros: Map<string, number>;
  rotuloDoSetor: (codigo: string) => string;
  painelId: string;
  /**
   * Muda a cada etapa escolhida no desenho ou na lista: o título do painel
   * recebe o foco. Anterior e Próxima não mexem nele — o foco fica no botão,
   * para apertar de novo.
   */
  sinalDeFoco: number;
  aoIrPara: (id: string) => void;
  /** Esc: o foco volta para a etapa no desenho, e o painel fica. */
  aoVoltarParaAEtapa: () => void;
  aoFechar: () => void;
};

/**
 * A etapa ao lado do desenho (leitura A, 10/11/2026, pedido do Kauan): o
 * número de quantas, o nome, quem executa, prazo, o que entra, o que sai, o
 * que fazer se der erro, para onde segue e o link da tela do Connect onde a
 * etapa se faz — com Anterior e Próxima na ordem da lista.
 */
export function PainelDaEtapa({ etapa, etapas, numeros, rotuloDoSetor, painelId, sinalDeFoco, aoIrPara, aoVoltarParaAEtapa, aoFechar }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sinalDeFoco > 0) titulo.current?.focus();
  }, [sinalDeFoco]);

  const indice = etapas.findIndex((e) => e.id === etapa.id);
  const anterior = etapas[indice - 1] ?? null;
  const proxima = etapas[indice + 1] ?? null;
  const numero = numeros.get(etapa.id);
  const onde = numero ? `${etapa.tipo === "decisao" ? "Decisão" : "Etapa"} ${numero} de ${numeros.size}` : nomeCurtoDaEtapa(etapa, numeros);
  const tela = telaDoConnect(etapa.tela);
  const porId = new Map(etapas.map((e) => [e.id, e]));
  const nome = (id: string) => {
    const e = porId.get(id);
    return e ? `${nomeCurtoDaEtapa(e, numeros)} · ${e.titulo}` : "";
  };

  const detalhes: [string, string | undefined][] = [
    ["Prazo", etapa.prazo],
    ["Entra", etapa.entra],
    ["Sai", etapa.sai],
    ["Se der erro", etapa.seDerErro],
  ];
  const preenchidos = detalhes.filter(([, v]) => v);
  const saidas = saidasDasEtapas(etapas).get(etapa.id) ?? [];
  const tituloId = `${painelId}-titulo`;

  return (
    <Card
      as="section"
      id={painelId}
      aria-labelledby={tituloId}
      className="flex flex-col gap-3 border-brand/40 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          aoVoltarParaAEtapa();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="c41-rotulo">{onde}</span>
          <h3 ref={titulo} id={tituloId} tabIndex={-1} className="text-card-title font-semibold text-fg outline-none">
            {etapa.titulo || "Sem nome"}
          </h3>
        </div>
        <IconButton title="Fechar a etapa" onClick={aoFechar} className="-mr-1 -mt-1 max-md:size-11">
          <X size={16} />
        </IconButton>
      </div>

      {etapa.executor && <SeloDoExecutor executor={etapa.executor} rotuloDoSetor={rotuloDoSetor} className="self-start" />}

      {preenchidos.length > 0 ? (
        <dl className="flex flex-col gap-2">
          {preenchidos.map(([rotulo, valor]) => (
            <div key={rotulo} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-ui">
              <dt className="text-fg-muted">{rotulo}</dt>
              <dd className="whitespace-pre-line text-fg">{valor}</dd>
            </div>
          ))}
        </dl>
      ) : (
        etapa.tipo !== "fim" && <p className="text-fs-2 text-fg-muted">Sem prazo, entrada ou saída escritos para esta etapa.</p>
      )}

      {saidas.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-border-soft pt-3 text-ui">
          {saidas.map((s) => (
            <li key={s.tipo} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-fg-muted">{s.tipo === "sim" ? "Sim:" : s.tipo === "nao" ? "Não:" : ehVolta(etapas, etapa.id, s.para) ? "Volta para" : "Depois:"}</span>
              <Button variant="link" className="text-left text-ui" onClick={() => aoIrPara(s.para)}>
                {nome(s.para)}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {tela && (
        <Button href={tela.href} variant="secondary" size="sm" className="self-start max-md:h-11">
          <Link2 size={14} /> Abrir {tela.rotulo} no Connect
        </Button>
      )}

      <div className="mt-1 flex items-center justify-between gap-2 border-t border-border-soft pt-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={!anterior}
          onClick={() => anterior && aoIrPara(anterior.id)}
          aria-label={anterior ? `Anterior: ${nomeCurtoDaEtapa(anterior, numeros)}` : "Sem etapa anterior"}
          className="max-md:h-11"
        >
          <ChevronLeft size={14} /> {anterior ? nomeCurtoDaEtapa(anterior, numeros) : "Anterior"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!proxima}
          onClick={() => proxima && aoIrPara(proxima.id)}
          aria-label={proxima ? `Próxima: ${nomeCurtoDaEtapa(proxima, numeros)}` : "Sem próxima etapa"}
          className="max-md:h-11"
        >
          {proxima ? nomeCurtoDaEtapa(proxima, numeros) : "Próxima"} <ChevronRight size={14} />
        </Button>
      </div>
    </Card>
  );
}
