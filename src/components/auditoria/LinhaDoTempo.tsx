import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { Accordion } from "@/components/ui/Accordion";
import { Badge } from "@/components/ui/Badge";
import type { PedacoDaFrase } from "@/lib/auditoria/frase";
import type { Fato, LinhaDoRegistro, Mudanca } from "@/lib/auditoria/metadados";
import type { TipoDaAcao } from "@/lib/auditoria/acoes";

export type EventoNaTela = {
  id: string;
  hora: string;
  pedacos: PedacoDaFrase[];
  area: { rotulo: string; cor: string };
  tipo: TipoDaAcao;
  mudancas: Mudanca[];
  fatos: Fato[];
  /** O cadastro existe e tem tela, mas não tem nome para virar link na frase. */
  abrir: string | null;
  ator: { nome: string; foto: string | null };
  registro: LinhaDoRegistro[];
};

export type DiaNaTela = {
  dia: string;
  titulo: string;
  apoio: string;
  eventos: EventoNaTela[];
  /** "Mostrar mais N ações de hoje" — `null` quando o dia já está inteiro. */
  mais: { href: string; rotulo: string } | null;
};

function Frase({ pedacos }: { pedacos: PedacoDaFrase[] }) {
  return (
    <p className="text-label text-fg-secondary leading-relaxed">
      {pedacos.map((p, i) => {
        if (p.tipo === "forte") return <b key={i} className="font-semibold text-fg">{p.texto}</b>;
        if (p.tipo === "link")
          return (
            <Link key={i} href={p.href} className="font-semibold text-brand hover:underline underline-offset-2">
              {p.texto}
            </Link>
          );
        if (p.tipo === "mudo") return <span key={i} className="text-fs-2 text-fg-muted">{p.texto}</span>;
        return <span key={i}>{p.texto}</span>;
      })}
    </p>
  );
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** O "de → para": o campo, o valor de antes riscado e o de depois. */
function Mudancas({ mudancas }: { mudancas: Mudanca[] }) {
  return (
    <ul className="mt-2 rounded-md border border-border overflow-hidden text-fs-2" aria-label="O que mudou">
      {mudancas.map((m, i) => (
        <li
          key={`${m.campo}-${i}`}
          className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] sm:grid-cols-[7.5rem_minmax(0,1fr)_1rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 items-center px-2.5 py-1.5 border-t border-border first:border-t-0"
        >
          <span className="text-fg-muted truncate">{m.campo}</span>
          <span className="min-w-0 break-words">
            {m.de === null ? <span className="text-fg-muted">(vazio)</span> : <span className="text-danger line-through decoration-1">{m.de}</span>}
            <span className="sr-only"> passou para </span>
          </span>
          <ArrowRight size={13} aria-hidden className="hidden sm:block text-fg-muted" />
          <span className="min-w-0 break-words col-start-2 sm:col-start-auto">
            {m.para === null ? <span className="text-fg-muted">(vazio)</span> : <span className="text-success-fg font-medium">{m.para}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Evento({ ev }: { ev: EventoNaTela }) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-3 px-4 py-3 border-t border-border first:border-t-0 items-start">
      <AvatarImage src={ev.ator.foto} name={ev.ator.nome} size={28} bordered={false} />
      <div className="min-w-0">
        <Frase pedacos={ev.pedacos} />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-fs-2 text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: ev.area.cor }} />
            {ev.area.rotulo}
          </span>
          {ev.tipo === "excluiu" && <Badge variant="danger">Exclusão</Badge>}
          {ev.mudancas.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{plural(ev.mudancas.length, "mudança", "mudanças")}</span>
            </>
          )}
          {ev.fatos.map((f) => (
            <span key={f.rotulo} className="inline-flex items-center gap-2 min-w-0">
              <span aria-hidden>·</span>
              <span className="min-w-0 break-words">
                {f.rotulo}: <span className="text-fg-secondary">{f.valor}</span>
              </span>
            </span>
          ))}
          {ev.abrir && (
            <>
              <span aria-hidden>·</span>
              <Link href={ev.abrir} className="font-semibold text-brand hover:underline underline-offset-2">
                Abrir
              </Link>
            </>
          )}
        </div>
        {ev.mudancas.length > 0 && <Mudancas mudancas={ev.mudancas} />}
        {ev.registro.length > 0 && (
          <Accordion
            className="mt-1.5"
            classeDoCabecalho="text-fs-2 text-fg-muted hover:text-fg"
            classeDoConteudo="pt-1.5"
            titulo={<span>Registro completo · {plural(ev.registro.length, "campo", "campos")}</span>}
          >
            <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md bg-surface-2 px-2.5 py-2 font-mono text-micro text-fg-secondary">
              {ev.registro.map((l) => (
                <div key={l.chave} className="contents">
                  <dt className="text-fg-muted truncate" title={l.chave}>
                    {l.chave}
                  </dt>
                  <dd className="min-w-0 break-words">{l.valor}</dd>
                </div>
              ))}
            </dl>
          </Accordion>
        )}
      </div>
      <span className="text-fs-2 text-fg-muted tabular-nums pt-0.5">{ev.hora}</span>
    </li>
  );
}

/** A linha do tempo: um bloco por dia, as ações do mais recente para o mais antigo. */
export function LinhaDoTempo({ dias }: { dias: DiaNaTela[] }) {
  return (
    <div className="flex flex-col gap-6">
      {dias.map((d) => (
        <section key={d.dia} aria-labelledby={`dia-${d.dia}`}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mb-2.5">
            <h2 id={`dia-${d.dia}`} className="font-display text-fs-4 font-semibold text-fg">
              {d.titulo}
            </h2>
            <span className="text-fs-2 text-fg-muted">{d.apoio}</span>
          </div>
          <div className="bg-surface border border-border rounded-lg shadow-xs overflow-hidden">
            <ol>
              {d.eventos.map((ev) => (
                <Evento key={ev.id} ev={ev} />
              ))}
            </ol>
            {d.mais && (
              <Link
                href={d.mais.href}
                scroll={false}
                className="block text-center px-4 py-2.5 border-t border-border text-fs-2 font-semibold text-brand hover:bg-surface-hover transition-colors"
              >
                {d.mais.rotulo}
              </Link>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
