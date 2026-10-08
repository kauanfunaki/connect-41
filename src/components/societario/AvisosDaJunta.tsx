"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Card } from "@/components/ui/Card";
import { CampoData } from "@/components/ui/CampoData";
import { Textarea } from "@/components/ui/Textarea";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatInstantDate } from "@/lib/format";
import type { AvisoState } from "@/app/(app)/processos/avisos-actions";
import { Aviso } from "@/components/ui/Aviso";

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

const SUGESTAO: Record<AvisoNaTela["sugestao"], { rotulo: string; tom: TomDoSelo }> = {
  DEFERIDO: { rotulo: "Parece deferido", tom: "sucesso" },
  EXIGENCIA: { rotulo: "Parece exigência", tom: "atencao" },
  CANCELADO: { rotulo: "Parece cancelado", tom: "perigo" },
  REVISAR: { rotulo: "Conferir", tom: "marca" },
};

/**
 * Avisos da Junta que chegaram por e-mail, esperando uma pessoa.
 *
 * O sistema só sugere (28/09): o desfecho vem pré-marcado pela leitura do
 * e-mail, mas quem aplica é a pessoa, lendo o texto do órgão ao lado.
 */
export function AvisosDaJunta({
  avisos,
  acoes,
  mostrarProcesso = false,
  embutido = false,
}: {
  avisos: AvisoNaTela[];
  acoes: Acoes;
  mostrarProcesso?: boolean;
  /** Dentro do cartão da seção (detalhe do processo, 07/10/2026): cada aviso
   *  vira um bloco separado por linha, e não um cartão dentro do cartão. */
  embutido?: boolean;
}) {
  if (avisos.length === 0) return null;
  return (
    <div className={embutido ? "flex flex-col divide-y divide-border" : "flex flex-col gap-3"}>
      {avisos.map((a) => (
        <CartaoDoAviso key={a.id} aviso={a} acoes={acoes} mostrarProcesso={mostrarProcesso} embutido={embutido} />
      ))}
    </div>
  );
}

function CartaoDoAviso({
  aviso,
  acoes,
  mostrarProcesso,
  embutido,
}: {
  aviso: AvisoNaTela;
  acoes: Acoes;
  mostrarProcesso: boolean;
  embutido: boolean;
}) {
  const router = useRouter();
  const [desfecho, setDesfecho] = useState<"DEFERIDO" | "EXIGENCIA">(aviso.sugestao === "DEFERIDO" ? "DEFERIDO" : "EXIGENCIA");
  const [descricao, setDescricao] = useState(aviso.detalhe ?? "");
  const [prazo, setPrazo] = useState("");
  const [abrirTexto, setAbrirTexto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [acaoEmCurso, setAcaoEmCurso] = useState<"aplicar" | "descartar" | null>(null);
  const [pendente, startTransition] = useTransition();
  const sugestao = SUGESTAO[aviso.sugestao];

  function rodar(acao: "aplicar" | "descartar", fn: () => Promise<AvisoState>) {
    setErro(null);
    setAcaoEmCurso(acao);
    startTransition(async () => {
      const r = await fn();
      if ("error" in r) setErro(r.error);
      else router.refresh();
    });
  }

  const conteudo = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-2)] text-fg-muted">
        {/* Selo: é a situação do aviso, não uma categoria (regra de 02/10 no Selo). */}
        <Selo tom={sugestao.tom}>{sugestao.rotulo}</Selo>
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

      {aviso.assunto && <p className="text-[length:var(--fs-ui)] font-medium text-fg">{aviso.assunto}</p>}

      <div>
        {/* Revisão de 05/10: botão não é link — o abre-e-fecha era texto azul. */}
        <Button variant="ghost" size="xs" onClick={() => setAbrirTexto((v) => !v)} aria-expanded={abrirTexto}>
          {abrirTexto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {abrirTexto ? "Esconder o e-mail" : "Ler o e-mail do órgão"}
        </Button>
        {abrirTexto && (
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-[length:var(--fs-2)] text-fg-secondary font-sans">
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
          {/* Rótulo em cima dos dois campos, como no roteiro do processo: o
              prazo tinha o rótulo ao lado, em 12px, e a descrição nenhum. */}
          {desfecho === "EXIGENCIA" && (
            <div className="flex flex-col gap-4">
              <CampoForm label="O que o órgão pediu" htmlFor={`exigencia-${aviso.id}`}>
                <Textarea
                  id={`exigencia-${aviso.id}`}
                  rows={4}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="O que o órgão pediu para corrigir"
                />
              </CampoForm>
              <CampoForm label="Prazo do órgão" htmlFor={`prazo-${aviso.id}`} helper="Opcional.">
                <CampoData
                  id={`prazo-${aviso.id}`}
                 
                  value={prazo}
                  onChange={(v) => setPrazo(v)}
                  className="sm:w-44"
                />
              </CampoForm>
            </div>
          )}
          {desfecho === "DEFERIDO" && aviso.sugestao !== "DEFERIDO" && (
            <p className="text-[length:var(--fs-2)] text-warning-fg">
              O sistema não leu “deferido” neste e-mail. Confirme no texto antes de marcar.
            </p>
          )}
        </div>
      ) : (
        !mostrarProcesso && (
          <p className="text-[length:var(--fs-2)] text-fg-muted">O protocolo deste aviso já foi resolvido. Descarte se não houver nada novo.</p>
        )
      )}

      {aviso.sugestao === "CANCELADO" && (
        <p className="text-[length:var(--fs-2)] text-fg-muted">
          Cancelamento e reaproveitamento se tratam no processo (situação e novo protocolo). Depois, descarte o aviso.
        </p>
      )}

      {/* Na caixa de erro do resto da página (07/10/2026) — era texto solto de 12px. */}
      {erro && (
        <Aviso>
          {erro}
        </Aviso>
      )}

      {/* Descartar tira o aviso da fila: fica separado, à esquerda, e o
          primário ("Aplicar") por último, à direita. */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
        <Button
          variant="secondary"
          disabled={pendente}
          loading={pendente && acaoEmCurso === "descartar"}
          loadingLabel="Descartando…"
          onClick={() => rodar("descartar", () => acoes.descartar(aviso.id))}
          className={aviso.aplicavel ? "mr-auto" : undefined}
        >
          Descartar
        </Button>
        {aviso.aplicavel && (
          <Button
            variant="primary"
            disabled={pendente || (desfecho === "EXIGENCIA" && !descricao.trim())}
            loading={pendente && acaoEmCurso === "aplicar"}
            loadingLabel="Aplicando…"
            onClick={() => rodar("aplicar", () => acoes.aplicar(aviso.id, desfecho, descricao, prazo || null))}
          >
            Aplicar no protocolo
          </Button>
        )}
      </div>
    </>
  );

  return embutido ? (
    <div className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0">{conteudo}</div>
  ) : (
    <Card className="p-4 flex flex-col gap-4">{conteudo}</Card>
  );
}
