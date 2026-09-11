"use client";

import { useState, useTransition } from "react";
import { Check, CircleSlash, FileStack, AlertTriangle, Bot, Plug, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatInstantDate } from "@/lib/format";
import type { ProcessoState } from "@/app/(app)/processos/actions";

export type ExigenciaNaTela = {
  id: string;
  descricao: string;
  abertaEm: Date;
  prazoAte: Date | null;
  resolvidaEm: Date | null;
};

export type ProtocoloNaTela = {
  id: string;
  orgaoNome: string;
  tentativa: number;
  numero: string | null;
  enviadoEm: Date;
  desfecho: "PENDENTE" | "DEFERIDO" | "EXIGENCIA";
  /** Quando o robô olhou pela última vez. Nulo = nunca foi olhado. */
  verificadoEm: Date | null;
  /** Erro da última verificação, ou nulo quando ela deu certo. */
  erroDaVerificacao: string | null;
  porRobo: boolean;
  exigencias: ExigenciaNaTela[];
};

export type ItemNaTela = {
  id: string;
  rotulo: string;
  obrigatorio: boolean;
  feito: boolean;
};

export type EtapaNaTela = {
  id: string;
  posicao: number;
  rotulo: string;
  descricao: string | null;
  grupoParalelo: string | null;
  opcional: boolean;
  orgaoNome: string | null;
  executorEsperado: "PESSOA" | "ROBO" | "INTEGRACAO";
  status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "DISPENSADA";
  liberada: boolean;
  itens: ItemNaTela[];
  protocolos: ProtocoloNaTela[];
};

const EXECUTOR_ICONE = {
  PESSOA: User,
  ROBO: Bot,
  INTEGRACAO: Plug,
} as const;

const EXECUTOR_TITULO = {
  PESSOA: "Executada por alguém do setor",
  ROBO: "Candidata a automação",
  INTEGRACAO: "Depende de sistema de fora",
} as const;

type Acoes = {
  concluir: (stepId: string) => Promise<ProcessoState>;
  dispensar: (stepId: string) => Promise<ProcessoState>;
  protocolar: (stepId: string, numero: string) => Promise<ProcessoState>;
  deferir: (protocolId: string) => Promise<ProcessoState>;
  exigir: (protocolId: string, descricao: string, prazoAte: string | null) => Promise<ProcessoState>;
  resolverExigencia: (requirementId: string) => Promise<ProcessoState>;
  alternarItem: (itemId: string, feito: boolean) => Promise<ProcessoState>;
};

export function RoteiroDoProcesso({
  etapas,
  acoes,
  podeEditar,
}: {
  etapas: EtapaNaTela[];
  acoes: Acoes;
  podeEditar: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function executar(fn: () => Promise<ProcessoState>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErro(r.error);
    });
  }

  // Agrupa por posição: etapas que dividem posição correm em paralelo, e
  // desenhá-las empilhadas como se fossem sequência seria mentir sobre o fluxo.
  const porPosicao = new Map<number, EtapaNaTela[]>();
  for (const e of etapas) {
    const lista = porPosicao.get(e.posicao) ?? [];
    lista.push(e);
    porPosicao.set(e.posicao, lista);
  }
  const posicoes = [...porPosicao.keys()].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      {posicoes.map((posicao) => {
        const grupo = porPosicao.get(posicao)!;
        const paralelo = grupo.length > 1;
        return (
          <div key={posicao} className="flex flex-col gap-2">
            {paralelo && (
              <p className="text-[11px] text-fg-muted uppercase tracking-wide">
                {grupo[0].grupoParalelo ?? "Em paralelo"} · correm ao mesmo tempo
              </p>
            )}
            <div className={paralelo ? "grid gap-2 md:grid-cols-3" : "flex flex-col gap-2"}>
              {grupo.map((etapa) => (
                <EtapaCard
                  key={etapa.id}
                  etapa={etapa}
                  acoes={acoes}
                  podeEditar={podeEditar}
                  pendente={pendente}
                  executar={executar}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EtapaCard({
  etapa,
  acoes,
  podeEditar,
  pendente,
  executar,
}: {
  etapa: EtapaNaTela;
  acoes: Acoes;
  podeEditar: boolean;
  pendente: boolean;
  executar: (fn: () => Promise<ProcessoState>) => void;
}) {
  const [numero, setNumero] = useState("");
  const Icone = EXECUTOR_ICONE[etapa.executorEsperado];

  const encerrada = etapa.status === "CONCLUIDA" || etapa.status === "DISPENSADA";
  const protocoloAberto = etapa.protocolos.find((p) => p.desfecho === "PENDENTE");

  return (
    <div
      className={`rounded-lg border p-3.5 flex flex-col gap-2.5 ${
        encerrada
          ? "border-border bg-surface/60"
          : etapa.liberada
            ? "border-brand/40 bg-brand/5"
            : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-mono text-fg-muted mt-0.5 tabular-nums">{etapa.posicao}</span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[13px] font-semibold ${encerrada ? "text-fg-muted" : ""}`}>
              {etapa.rotulo}
            </span>
            <span title={EXECUTOR_TITULO[etapa.executorEsperado]} className="text-fg-muted">
              <Icone size={12} />
            </span>
            {etapa.orgaoNome && <span className="text-[11px] text-fg-muted">{etapa.orgaoNome}</span>}
            {etapa.opcional && !encerrada && (
              <span className="text-[11px] text-fg-muted">· opcional</span>
            )}
          </div>
          {etapa.descricao && <p className="text-[12px] text-fg-muted">{etapa.descricao}</p>}
        </div>
        {etapa.status === "CONCLUIDA" && <Check size={15} className="text-success shrink-0" />}
        {etapa.status === "DISPENSADA" && (
          <CircleSlash size={15} className="text-fg-muted shrink-0" />
        )}
      </div>

      {/* ── Checklist ──────────────────────────────────────────────────────
          Os itens vêm do roteiro do setor — os quatro de cada licença saíram
          direto do fluxograma. O obrigatório trava a conclusão à mão, porque
          "documentação completa evita retrabalhos" é o que o próprio setor
          escreveu no rodapé do desenho. */}
      {etapa.itens.length > 0 && (
        <div className="flex flex-col gap-1 pl-0.5">
          {etapa.itens.map((item) => (
            <Checkbox
              key={item.id}
              id={`item-${item.id}`}
              checked={item.feito}
              disabled={!podeEditar || encerrada || pendente}
              onChange={(e) => executar(() => acoes.alternarItem(item.id, e.target.checked))}
              label={
                <span className={`text-[12px] ${item.feito ? "line-through text-fg-muted" : ""}`}>
                  {item.rotulo}
                  {!item.obrigatorio && <span className="text-fg-muted"> · opcional</span>}
                </span>
              }
            />
          ))}
        </div>
      )}

      {/* ── Protocolos: uma linha por apresentação ─────────────────────────
          Cada volta é uma linha própria. É o que transforma "voltou duas
          vezes" num fato consultável em vez de memória de quem tocou. */}
      {etapa.protocolos.length > 0 && (
        <div className="flex flex-col gap-1.5 border-l-2 border-border pl-2.5">
          {etapa.protocolos.map((p) => (
            <Protocolo
              key={p.id}
              protocolo={p}
              acoes={acoes}
              podeEditar={podeEditar}
              pendente={pendente}
              executar={executar}
            />
          ))}
        </div>
      )}

      {podeEditar && etapa.liberada && !encerrada && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {etapa.orgaoNome ? (
            !protocoloAberto && (
              <>
                <Input
                  compact
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Nº do protocolo (opcional)"
                  className="max-w-[220px]"
                />
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={pendente}
                  onClick={() => executar(() => acoes.protocolar(etapa.id, numero))}
                >
                  <FileStack size={12} />
                  {etapa.protocolos.length > 0 ? "Reapresentar" : "Protocolar"}
                </Button>
              </>
            )
          ) : (
            <Button
              variant="secondary"
              size="xs"
              disabled={pendente}
              onClick={() => executar(() => acoes.concluir(etapa.id))}
            >
              <Check size={12} /> Concluir
            </Button>
          )}
          {etapa.opcional && (
            <Button
              variant="linkMuted"
              size="xs"
              disabled={pendente}
              onClick={() => executar(() => acoes.dispensar(etapa.id))}
              className="text-[12px]"
            >
              Não se aplica
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Protocolo({
  protocolo,
  acoes,
  podeEditar,
  pendente,
  executar,
}: {
  protocolo: ProtocoloNaTela;
  acoes: Acoes;
  podeEditar: boolean;
  pendente: boolean;
  executar: (fn: () => Promise<ProcessoState>) => void;
}) {
  const [abrindoExigencia, setAbrindoExigencia] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <span className="text-fg-muted tabular-nums">
          {protocolo.tentativa}ª apresentação
        </span>
        {protocolo.numero && <span className="font-mono text-[11px]">{protocolo.numero}</span>}
        <span className="text-fg-muted">{formatInstantDate(protocolo.enviadoEm)}</span>
        {protocolo.desfecho === "DEFERIDO" && <Badge variant="success">Deferido</Badge>}
        {protocolo.desfecho === "EXIGENCIA" && <Badge variant="warning">Exigência</Badge>}
        {protocolo.desfecho === "PENDENTE" && <Badge variant="info">Aguardando</Badge>}
        {protocolo.porRobo && (
          <span title="Apurado pelo observador de protocolo" className="text-fg-muted">
            <Bot size={12} />
          </span>
        )}
      </div>

      {/* O estado do robô é dito em voz alta: "nunca olhou" e "olhou e nada
          mudou" parecem a mesma coisa sem isto, e aí ninguém sabe se pode
          confiar no automático. */}
      {protocolo.desfecho === "PENDENTE" && (
        <span className="text-[11px] text-fg-muted">
          {protocolo.erroDaVerificacao
            ? `Última verificação falhou: ${protocolo.erroDaVerificacao}`
            : protocolo.verificadoEm
              ? `Verificado automaticamente em ${formatInstantDate(protocolo.verificadoEm)}`
              : "Sem verificação automática — este órgão ainda é conferido à mão"}
        </span>
      )}

      {protocolo.exigencias.map((ex) => (
        <div
          key={ex.id}
          className="text-[12px] rounded-md border border-warning/30 bg-warning/8 px-2.5 py-1.5 flex flex-col gap-1"
        >
          <span className="flex items-start gap-1.5">
            <AlertTriangle size={12} className="text-warning mt-0.5 shrink-0" />
            <span className={ex.resolvidaEm ? "line-through text-fg-muted" : ""}>{ex.descricao}</span>
          </span>
          <span className="text-[11px] text-fg-muted">
            {ex.prazoAte ? `Prazo do órgão: ${formatInstantDate(ex.prazoAte)}` : "Sem prazo do órgão"}
            {ex.resolvidaEm && ` · cumprida em ${formatInstantDate(ex.resolvidaEm)}`}
          </span>
          {podeEditar && !ex.resolvidaEm && (
            <Button
              variant="linkMuted"
              size="xs"
              disabled={pendente}
              onClick={() => executar(() => acoes.resolverExigencia(ex.id))}
              className="text-[11px] self-start"
            >
              Marcar como cumprida
            </Button>
          )}
        </div>
      ))}

      {podeEditar && protocolo.desfecho === "PENDENTE" && (
        <div className="flex flex-col gap-1.5">
          {!abrindoExigencia ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="xs"
                disabled={pendente}
                onClick={() => executar(() => acoes.deferir(protocolo.id))}
              >
                Deferido
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setAbrindoExigencia(true)}>
                Exigência
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Textarea
                rows={2}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que o órgão exigiu"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  compact
                  type="date"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  className="max-w-[180px]"
                />
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={pendente}
                  onClick={() =>
                    executar(async () => {
                      const r = await acoes.exigir(protocolo.id, descricao, prazo || null);
                      if (!r?.error) {
                        setAbrindoExigencia(false);
                        setDescricao("");
                        setPrazo("");
                      }
                      return r;
                    })
                  }
                >
                  Registrar exigência
                </Button>
                <Button variant="linkMuted" size="xs" onClick={() => setAbrindoExigencia(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
