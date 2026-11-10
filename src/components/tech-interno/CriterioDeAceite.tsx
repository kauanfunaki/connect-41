"use client";

import { Fragment, useOptimistic, useTransition } from "react";
import { CircleCheck, ListChecks, TriangleAlert } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import { conferirCriterioTech } from "@/app/(app)/controle-interno/actions";
import { lerCriterioDeAceite, type BlocoDoCriterio, type PontoDeConferencia } from "@/lib/tech-interno/criterioDeAceite";

/** Quem conferiu o ponto e quando, já no texto da tela. */
export type MarcaDoPonto = { por: string; quando: string };
type Marcas = Record<number, MarcaDoPonto | null>;
type Mudanca = { posicao: number; marca: MarcaDoPonto | null };

// Enquanto grava, o ponto aparece marcado (ou desmarcado) na hora; se o
// servidor recusar, volta sozinho ao que estava.
const SALVANDO: MarcaDoPonto = { por: "", quando: "" };

/**
 * A seção "Critério de aceite" da visualização do item (10/11/2026): os
 * rótulos (Mudança, Termos, Antes de testar, Onde testar, Observação), os
 * passos numerados e o "Aprovado quando" como lista de conferência. A marca de
 * cada ponto fica salva no item, com quem marcou — a validação costuma
 * atravessar o deploy, e quem volta ao item vê onde parou e quem conferiu o
 * quê. Quem só vê o módulo vê as marcas, sem marcar.
 *
 * Texto fora do formato aparece como texto simples, sem quebrar a tela.
 */
export function CriterioDeAceite({ itemId, texto, marcas, podeEditar, editarHref, concluido = false }: {
  itemId: string;
  texto: string | null;
  /** As marcas que valem, por posição do ponto (a partir de 1). */
  marcas: Record<number, MarcaDoPonto>;
  podeEditar: boolean;
  /** A edição do item, para escrever o critério que ainda não existe. */
  editarHref?: string;
  /** O item já está Concluído: o "tudo conferido" não manda concluir de novo. */
  concluido?: boolean;
}) {
  const lido = lerCriterioDeAceite(texto);
  const toast = useToast();
  const [, iniciar] = useTransition();
  const [otimistas, aplicar] = useOptimistic<Marcas, Mudanca>(marcas, (atuais, { posicao, marca }) => ({ ...atuais, [posicao]: marca }));
  const pontos = lido?.pontos ?? [];
  const conferidos = pontos.filter(p => otimistas[p.posicao]).length;

  function alternar(ponto: PontoDeConferencia, marcar: boolean) {
    iniciar(async () => {
      aplicar({ posicao: ponto.posicao, marca: marcar ? SALVANDO : null });
      try {
        const r = await conferirCriterioTech(itemId, ponto.posicao, ponto.texto, marcar);
        if ("error" in r) toast.error(r.error);
      } catch { toast.error("Não foi possível confirmar a marca. Atualize a página antes de tentar de novo."); }
    });
  }

  return <section aria-labelledby="tech-criterio" className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id="tech-criterio" className="flex items-center gap-2 text-card-title font-semibold text-fg">
        <ListChecks size={16} aria-hidden className="shrink-0 text-brand" />Critério de aceite
      </h2>
      {lido?.data && <span className="text-helper text-fg-muted">Escrito em {lido.data}</span>}
    </div>
    {!lido
      ? <div className="flex flex-col items-start gap-1.5 rounded-md border border-dashed border-border-strong px-4 py-3">
        <p className="text-ui text-fg-secondary">Este item ainda não tem critério de aceite: o que conferir e quando ele está aprovado.</p>
        {podeEditar && editarHref && <Button variant="link" className="text-ui" href={`${editarHref}#tech-criteria`}>Escrever o critério</Button>}
      </div>
      : !lido.estruturado
        ? <TextoComCodigo texto={lido.texto} />
        : <>
          {agrupar(lido.blocos).map((grupo, i) => grupo.tipo === "campos"
            ? <dl key={i} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              {grupo.campos.map((c, j) => <Fragment key={j}>
                <dt className="text-ui font-medium text-fg-secondary sm:pt-0.5">{c.rotulo}</dt>
                <dd className="-mt-2 min-w-0 sm:mt-0">
                  {/* "Antes de testar" com algo a fazer (migration, módulo a ligar) não pode passar batido. */}
                  {c.rotulo === "Antes de testar" && !/^nada\b/i.test(c.texto.trim())
                    ? <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/8 px-3 py-2">
                      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-warning-fg" />
                      <div className="min-w-0 flex-1"><TextoComCodigo texto={c.texto} /></div>
                    </div>
                    : <TextoComCodigo texto={c.texto} />}
                </dd>
              </Fragment>)}
            </dl>
            : <Bloco key={i} bloco={grupo.bloco} otimistas={otimistas} podeEditar={podeEditar} alternar={alternar} />)}
          {pontos.length > 0 && conferidos === pontos.length && <p className="flex items-center gap-1.5 text-ui font-medium text-success-fg">
            <CircleCheck size={16} aria-hidden className="shrink-0" />{concluido ? "Tudo conferido." : "Tudo conferido. Para fechar o item, mude a situação para Concluído."}
          </p>}
        </>}
  </section>;
}

type Grupo = { tipo: "campos"; campos: Extract<BlocoDoCriterio, { tipo: "campo" }>[] } | { tipo: "bloco"; bloco: Exclude<BlocoDoCriterio, { tipo: "campo" }> };
/** Rótulos seguidos viram uma lista só, alinhada; o resto fica na ordem em que foi escrito. */
function agrupar(blocos: BlocoDoCriterio[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const b of blocos) {
    const ultimo = grupos.at(-1);
    if (b.tipo !== "campo") grupos.push({ tipo: "bloco", bloco: b });
    else if (ultimo?.tipo === "campos") ultimo.campos.push(b);
    else grupos.push({ tipo: "campos", campos: [b] });
  }
  return grupos;
}

function Bloco({ bloco, otimistas, podeEditar, alternar }: {
  bloco: Exclude<BlocoDoCriterio, { tipo: "campo" }>; otimistas: Marcas; podeEditar: boolean;
  alternar: (ponto: PontoDeConferencia, marcar: boolean) => void;
}) {
  if (bloco.tipo === "texto") return <TextoComCodigo texto={bloco.texto} />;
  if (bloco.tipo === "contexto") return <Accordion titulo={<span className="text-ui font-medium text-fg-secondary">Contexto anterior</span>} classeDoConteudo="pt-2">
    <TextoComCodigo texto={bloco.texto} apoio />
  </Accordion>;
  if (bloco.tipo === "passos") return <div className="flex flex-col gap-2">
    <h3 className="text-ui font-semibold text-fg-secondary">Passos</h3>
    <ol className="flex flex-col gap-2.5">
      {bloco.itens.map((passo, i) => <li key={i} className="flex gap-3">
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-helper font-semibold tabular-nums text-fg-secondary">{i + 1}</span>
        <div className="min-w-0 flex-1 pt-0.5"><TextoComCodigo texto={passo} /></div>
      </li>)}
    </ol>
  </div>;
  const conferidos = bloco.pontos.filter(p => otimistas[p.posicao]).length;
  const idDoTitulo = `tech-aprovado-${bloco.pontos[0].posicao}`;
  return <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <h3 id={idDoTitulo} className="text-ui font-semibold text-fg-secondary">Aprovado quando</h3>
      <span className="text-helper tabular-nums text-fg-muted" aria-live="polite">{conferidos} de {bloco.pontos.length} conferido{bloco.pontos.length === 1 ? "" : "s"}</span>
    </div>
    <ul aria-labelledby={idDoTitulo} className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
      {bloco.pontos.map(ponto => {
        const marca = otimistas[ponto.posicao] ?? null, id = `tech-ponto-${ponto.posicao}`;
        const salvando = marca === SALVANDO;
        // O nome do ponto é o texto dele; quem conferiu vai como descrição.
        return <li key={ponto.posicao} className={`flex gap-3 px-3 py-2.5 ${podeEditar ? "hover:bg-surface-hover" : ""} ${marca ? "bg-success/5" : ""}`.trim()}>
          <span className="flex h-6 shrink-0 items-center">
            <Checkbox id={id} checked={!!marca} disabled={!podeEditar}
              aria-describedby={marca ? `${id}-quem` : undefined} onChange={e => alternar(ponto, e.currentTarget.checked)} />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor={id} className={`block whitespace-pre-wrap break-words text-body text-fg [overflow-wrap:anywhere] ${podeEditar ? "cursor-pointer" : ""}`.trim()}>{ponto.texto}</label>
            {marca && <p id={`${id}-quem`} className="mt-0.5 text-helper text-fg-muted">{salvando ? "Salvando…" : `Conferido por ${marca.por} em ${marca.quando}`}</p>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}

/**
 * O texto de um campo, de um passo ou de um parágrafo, com as quebras de linha
 * de quem escreveu. Linhas recuadas (o comando a rodar) saem em bloco de código.
 */
function TextoComCodigo({ texto, apoio = false }: { texto: string; apoio?: boolean }) {
  const partes: { codigo: boolean; linhas: string[] }[] = [];
  for (const linha of texto.split("\n")) {
    const codigo = /^( {2,}|\t)\S/.test(linha), ultima = partes.at(-1);
    if (ultima && ultima.codigo === codigo) ultima.linhas.push(linha);
    else partes.push({ codigo, linhas: [linha] });
  }
  const classe = apoio ? "text-ui text-fg-secondary" : "text-body text-fg";
  return <div className="flex min-w-0 flex-col gap-1.5">
    {partes.map((p, i) => p.codigo
      ? <pre key={i} className="overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-ui text-fg"><code>{recuar(p.linhas).join("\n")}</code></pre>
      : <p key={i} className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${classe}`}>{p.linhas.join("\n")}</p>)}
  </div>;
}

/** Tira o recuo comum das linhas de código. */
function recuar(linhas: string[]) {
  const menor = Math.min(...linhas.filter(l => l.trim()).map(l => /^\s*/.exec(l)![0].length));
  return linhas.map(l => l.slice(Number.isFinite(menor) ? menor : 0));
}
