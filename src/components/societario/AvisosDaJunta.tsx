"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatInstantDate } from "@/lib/format";
import type { AvisoState } from "@/app/(app)/processos/avisos-actions";

export type AvisoNaTela = {
  id: string;
  recebidoEm: Date;
  remetente: string | null;
  assunto: string | null;
  corpo: string;
  protocolo: string | null;
  /** Protocolo ligado e ainda aberto: dá para aplicar. */
  aplicavel: boolean;
  processo: { id: string; nome: string } | null;
  sugestao: "EXIGENCIA" | "DEFERIDO" | "CANCELADO" | "REVISAR";
  detalhe: string | null;
};

type Acoes = {
  aplicar: (avisoId: string, desfecho: "DEFERIDO" | "EXIGENCIA", descricao: string, prazoAte: string | null) => Promise<AvisoState>;
  descartar: (avisoId: string) => Promise<AvisoState>;
};

const SUGESTAO: Record<AvisoNaTela["sugestao"], { rotulo: string; variante: "success" | "warning" | "danger" | "info" }> = {
  DEFERIDO: { rotulo: "Parece deferido", variante: "success" },
  EXIGENCIA: { rotulo: "Parece exigência", variante: "warning" },
  CANCELADO: { rotulo: "Parece cancelado", variante: "danger" },
  REVISAR: { rotulo: "Conferir", variante: "info" },
};

/**
 * Avisos da Junta que chegaram por e-mail, esperando uma pessoa.
 *
 * O sistema só sugere (28/09): o desfecho vem pré-marcado pela leitura do
 * e-mail, mas quem aplica é a pessoa, lendo o texto do órgão ao lado.
 */
export function AvisosDaJunta({ avisos, acoes, mostrarProcesso = false }: { avisos: AvisoNaTela[]; acoes: Acoes; mostrarProcesso?: boolean }) {
  if (avisos.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {avisos.map((a) => (
        <CartaoDoAviso key={a.id} aviso={a} acoes={acoes} mostrarProcesso={mostrarProcesso} />
      ))}
    </div>
  );
}

function CartaoDoAviso({ aviso, acoes, mostrarProcesso }: { aviso: AvisoNaTela; acoes: Acoes; mostrarProcesso: boolean }) {
  const router = useRouter();
  const [desfecho, setDesfecho] = useState<"DEFERIDO" | "EXIGENCIA">(aviso.sugestao === "DEFERIDO" ? "DEFERIDO" : "EXIGENCIA");
  const [descricao, setDescricao] = useState(aviso.detalhe ?? "");
  const [prazo, setPrazo] = useState("");
  const [abrirTexto, setAbrirTexto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const sugestao = SUGESTAO[aviso.sugestao];

  function rodar(fn: () => Promise<AvisoState>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) setErro(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
        <Badge variant={sugestao.variante}>{sugestao.rotulo}</Badge>
        <span>Recebido em {formatInstantDate(aviso.recebidoEm)}</span>
        {aviso.protocolo && <span>· protocolo {aviso.protocolo}</span>}
        {mostrarProcesso &&
          (aviso.processo ? (
            <Link href={`/processos/${aviso.processo.id}`} className="text-brand hover:underline">
              · {aviso.processo.nome}
            </Link>
          ) : (
            <span>· nenhum protocolo aberto bateu com este aviso</span>
          ))}
      </div>

      {aviso.assunto && <p className="text-[13px] font-medium text-fg">{aviso.assunto}</p>}

      <div>
        <button
          type="button"
          onClick={() => setAbrirTexto((v) => !v)}
          className="text-[12px] text-brand hover:underline"
        >
          {abrirTexto ? "Esconder o e-mail" : "Ler o e-mail do órgão"}
        </button>
        {abrirTexto && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-[12px] text-fg-secondary font-sans">
            {aviso.remetente ? `De: ${aviso.remetente}\n\n` : ""}
            {aviso.corpo}
          </pre>
        )}
      </div>

      {aviso.aplicavel ? (
        <div className="flex flex-col gap-3">
          <SegmentedControl<"DEFERIDO" | "EXIGENCIA">
            label="Desfecho a aplicar"
            active={desfecho}
            onChange={setDesfecho}
            items={[
              { key: "EXIGENCIA", label: "Registrar exigência" },
              { key: "DEFERIDO", label: "Marcar deferido" },
            ]}
          />
          {desfecho === "EXIGENCIA" && (
            <div className="flex flex-col gap-2">
              <Textarea
                aria-label="O que o órgão pediu"
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que o órgão pediu para corrigir"
              />
              <div className="flex items-center gap-2 text-[12px] text-fg-muted">
                <label htmlFor={`prazo-${aviso.id}`}>Prazo do órgão (opcional)</label>
                <Input id={`prazo-${aviso.id}`} type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="w-40" />
              </div>
            </div>
          )}
          {desfecho === "DEFERIDO" && aviso.sugestao !== "DEFERIDO" && (
            <p className="text-[12px] text-warning">
              O sistema não leu “deferido” neste e-mail. Confirme no texto antes de marcar.
            </p>
          )}
        </div>
      ) : (
        !mostrarProcesso && (
          <p className="text-[12px] text-fg-muted">O protocolo deste aviso já foi resolvido. Descarte se não houver nada novo.</p>
        )
      )}

      {aviso.sugestao === "CANCELADO" && (
        <p className="text-[12px] text-fg-muted">
          Cancelamento e reaproveitamento se tratam no processo (situação e novo protocolo). Depois, descarte o aviso.
        </p>
      )}

      {erro && <p className="text-[12px] text-danger">{erro}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={pendente} onClick={() => rodar(() => acoes.descartar(aviso.id))}>
          Descartar
        </Button>
        {aviso.aplicavel && (
          <Button
            variant="primary"
            disabled={pendente || (desfecho === "EXIGENCIA" && !descricao.trim())}
            onClick={() => rodar(() => acoes.aplicar(aviso.id, desfecho, descricao, prazo || null))}
          >
            {pendente ? "Aplicando…" : "Aplicar no protocolo"}
          </Button>
        )}
      </div>
    </div>
  );
}
