"use client";

import { useId, useState, useTransition } from "react";
import { Check, ChevronDown, CircleSlash, FileStack, AlertTriangle, Bot, Plug, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Textarea } from "@/components/ui/Textarea";
import { Selo } from "@/components/ui/Selo";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatInstantDate } from "@/lib/format";
import type { ProcessoState } from "@/app/(app)/processos/actions";
import { Aviso } from "@/components/ui/Aviso";

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
  /** Quando a etapa foi concluída ou dispensada. */
  encerradaEm: Date | null;
  /**
   * Dias úteis que a etapa levou (concluída) ou leva até agora (em andamento),
   * com os feriados do tenant. Nulo quando não se sabe quando começou.
   */
  diasUteis: number | null;
  /** Quem concluiu, para a linha da etapa feita. */
  executadaPor: string | null;
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

/** Executa uma ação da etapa; `chave` diz qual botão mostra o "…ando". */
type Executar = (chave: string, fn: () => Promise<ProcessoState>) => void;

const estaEncerrada = (etapa: EtapaNaTela) => etapa.status === "CONCLUIDA" || etapa.status === "DISPENSADA";

/** "no mesmo dia", "1 dia útil", "4 dias úteis". */
export function textoDosDiasUteis(dias: number): string {
  if (dias <= 0) return "no mesmo dia";
  return dias === 1 ? "1 dia útil" : `${dias} dias úteis`;
}

const temExigenciaAberta = (etapa: EtapaNaTela) =>
  etapa.protocolos.some((p) => p.exigencias.some((x) => x.resolvidaEm === null));

type Marco = "feito" | "dispensado" | "atual" | "proximo";

/** O marco de uma posição do roteiro (etapas paralelas dividem o marco). */
function marcoDoGrupo(grupo: EtapaNaTela[]): Marco {
  if (grupo.every((e) => e.status === "DISPENSADA")) return "dispensado";
  if (grupo.every(estaEncerrada) && !grupo.some(temExigenciaAberta)) return "feito";
  if (grupo.some((e) => (e.liberada && !estaEncerrada(e)) || temExigenciaAberta(e))) return "atual";
  return "proximo";
}

const ESTILO_DO_MARCO: Record<Marco, string> = {
  feito: "bg-success/10 text-success-fg border border-success/25",
  dispensado: "bg-surface text-fg-muted border border-border",
  atual: "bg-brand-solid text-on-brand",
  proximo: "bg-surface text-fg-muted border-2 border-border",
};

/**
 * O roteiro do processo como linha do tempo vertical (escolha do Kauan na
 * página de opções de 04/11/2026 — Processo B). Cada posição do roteiro tem um
 * marco na trilha da esquerda: ✓ na feita, o número cheio na de agora e vazado
 * nas próximas, com o traço verde até onde o processo já andou.
 *
 * - A etapa de agora abre como cartão, com checklist, protocolos e ações.
 * - Feitas e próximas ficam numa linha (data, quanto levou, quem fez); o
 *   checklist e os protocolos delas abrem em "Detalhes" — recolhível começa
 *   fechado (08/10/2026). Substitui o "3 etapas concluídas · ver" de 08/10:
 *   com a etapa feita em uma linha, ver o caminho inteiro não pesa.
 * - Etapa encerrada com exigência ainda aberta continua aberta: o "Marcar como
 *   cumprida" dela não pode ficar escondido.
 * - Etapas que dividem posição correm em paralelo e ficam lado a lado no mesmo
 *   marco — desenhá-las em sequência seria mentir sobre o fluxo.
 */
export function RoteiroDoProcesso({
  etapas,
  acoes,
  podeEditar,
}: {
  etapas: EtapaNaTela[];
  acoes: Acoes;
  podeEditar: boolean;
}) {
  const porPosicao = new Map<number, EtapaNaTela[]>();
  for (const e of etapas) {
    const lista = porPosicao.get(e.posicao) ?? [];
    lista.push(e);
    porPosicao.set(e.posicao, lista);
  }
  const posicoes = [...porPosicao.keys()].sort((a, b) => a - b);

  return (
    <ol className="flex flex-col">
      {posicoes.map((posicao, i) => {
        const grupo = porPosicao.get(posicao)!;
        const paralelo = grupo.length > 1;
        const marco = marcoDoGrupo(grupo);
        const ultimo = i === posicoes.length - 1;
        return (
          <li key={posicao} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
            {/* A trilha é desenho: o texto da etapa já diz a situação. */}
            <div className="flex flex-col items-center" aria-hidden>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-micro font-semibold tabular-nums ${ESTILO_DO_MARCO[marco]}`}
              >
                {marco === "feito" ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : marco === "dispensado" ? (
                  <CircleSlash size={13} />
                ) : (
                  i + 1
                )}
              </span>
              {!ultimo && (
                <span className={`my-1 w-0.5 flex-1 rounded-full ${marco === "feito" ? "bg-success/40" : "bg-border"}`} />
              )}
            </div>
            <div className={`min-w-0 flex flex-col gap-2 ${ultimo ? "" : "pb-4"}`}>
              {paralelo && (
                <p className="c41-rotulo pt-1.5">
                  {grupo[0].grupoParalelo ?? "Em paralelo"} · correm ao mesmo tempo
                </p>
              )}
              {/* Colunas pela largura do cartão, e não pela da tela (08/10/2026). */}
              <div className={paralelo ? "grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]" : "flex flex-col"}>
                {grupo.map((etapa) => (
                  <EtapaDoRoteiro key={etapa.id || etapa.rotulo} etapa={etapa} acoes={acoes} podeEditar={podeEditar} emGrade={paralelo} />
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EtapaDoRoteiro({
  etapa,
  acoes,
  podeEditar,
  emGrade,
}: {
  etapa: EtapaNaTela;
  acoes: Acoes;
  podeEditar: boolean;
  /** Etapa paralela, lado a lado com as irmãs: precisa de caixa própria. */
  emGrade: boolean;
}) {
  const [numero, setNumero] = useState("");
  // Erro e espera por etapa (07/10/2026). Eram um estado só para o roteiro
  // inteiro: o erro aparecia no topo da lista, longe da etapa clicada (a 8ª
  // fica uns 900px abaixo), e todos os botões de todas as etapas apagavam
  // juntos, sem dizer qual estava gravando.
  const [erro, setErro] = useState<string | null>(null);
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const Icone = EXECUTOR_ICONE[etapa.executorEsperado];

  const executar: Executar = (chave, fn) => {
    setErro(null);
    setAcaoEmCurso(chave);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErro(r.error);
    });
  };
  const carregando = (chave: string) => pendente && acaoEmCurso === chave;

  const encerrada = estaEncerrada(etapa);
  const aberta = etapa.liberada && !encerrada;
  const protocoloAberto = etapa.protocolos.find((p) => p.desfecho === "PENDENTE");
  // Feita ou próxima vira uma linha; o resto abre em "Detalhes".
  const compacta = !aberta && !temExigenciaAberta(etapa);
  const temDetalhes = etapa.itens.length > 0 || etapa.protocolos.length > 0 || Boolean(etapa.descricao);
  const [verDetalhes, setVerDetalhes] = useState(false);
  const idDosDetalhes = useId();
  const mostraCorpo = !compacta || verDetalhes;

  // A etapa de agora é um cartão com a borda da marca; as outras são linhas
  // da trilha. Lado a lado (paralelas), cada uma tem caixa.
  const caixa = emGrade
    ? `rounded-md border p-3 ${aberta ? "border-brand/40 bg-brand/5" : "border-border"}`
    : compacta
      ? "pt-1"
      : `rounded-lg border p-3 ${aberta ? "border-brand/40 bg-brand/5" : "border-warning/25 bg-warning/10"}`;

  // A linha de baixo do nome: quando, quanto levou e quem fez.
  const linhaDoAndamento =
    etapa.status === "CONCLUIDA"
      ? [
          etapa.encerradaEm && `Concluída em ${formatInstantDate(etapa.encerradaEm)}`,
          etapa.diasUteis !== null && textoDosDiasUteis(etapa.diasUteis),
          etapa.executadaPor && `por ${etapa.executadaPor}`,
        ]
      : etapa.status === "DISPENSADA"
        ? ["Não se aplica", etapa.encerradaEm && `desde ${formatInstantDate(etapa.encerradaEm)}`]
        : aberta
          ? [
              etapa.diasUteis === null
                ? "Em andamento"
                : etapa.diasUteis <= 0
                  ? "Em andamento desde hoje"
                  : `Em andamento há ${textoDosDiasUteis(etapa.diasUteis)}`,
            ]
          : ["A seguir"];
  const andamento = linhaDoAndamento.filter(Boolean).join(" · ");

  return (
    <div className={`flex flex-col gap-3 ${caixa}`.trim()}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-ui font-semibold ${etapa.status === "DISPENSADA" ? "text-fg-muted line-through decoration-fg-muted/50" : "text-fg"}`}>
              {etapa.rotulo}
            </span>
            <span title={EXECUTOR_TITULO[etapa.executorEsperado]} className="inline-flex text-fg-muted">
              <Icone size={14} />
            </span>
            {etapa.orgaoNome && <span className="text-micro text-fg-muted">{etapa.orgaoNome}</span>}
            {etapa.opcional && !encerrada && (
              <span className="text-micro text-fg-muted">· opcional</span>
            )}
          </div>
          <p className={`text-micro tabular-nums ${aberta ? "text-brand font-medium" : "text-fg-muted"}`}>{andamento}</p>
          {mostraCorpo && etapa.descricao && <p className="text-fs-2 text-fg-muted">{etapa.descricao}</p>}
        </div>
        {compacta && temDetalhes && (
          <button
            type="button"
            aria-expanded={verDetalhes}
            aria-controls={idDosDetalhes}
            onClick={() => setVerDetalhes((v) => !v)}
            className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-micro text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Detalhes
            <ChevronDown size={14} aria-hidden className={`transition-transform ${verDetalhes ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* Classe, e não o atributo `hidden`: o `flex` venceria o `hidden`. */}
      <div id={idDosDetalhes} className={`${mostraCorpo ? "flex" : "hidden"} flex-col gap-3`}>

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
              onChange={(e) => executar(`item-${item.id}`, () => acoes.alternarItem(item.id, e.target.checked))}
              label={
                <span className={`text-fs-2 ${item.feito ? "line-through text-fg-muted" : ""}`}>
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
              carregando={carregando}
              executar={executar}
            />
          ))}
        </div>
      )}

      {/* Barra de ações da etapa: campo compacto (h-8) e botões `sm` (h-8) na
          mesma linha. Era Input h-8 ao lado de botão h-7, desencontrados.
          Enquanto grava, só o botão clicado diz o que está fazendo. */}
      {podeEditar && aberta && (
        <div className="flex flex-wrap items-center gap-2">
          {etapa.orgaoNome ? (
            !protocoloAberto && (
              <>
                <Input
                  compact
                  aria-label="Número do protocolo"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Nº do protocolo (opcional)"
                  className="sm:w-56 max-w-full"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pendente}
                  loading={carregando("protocolar")}
                  loadingLabel={etapa.protocolos.length > 0 ? "Reapresentando…" : "Protocolando…"}
                  onClick={() => executar("protocolar", () => acoes.protocolar(etapa.id, numero))}
                >
                  <FileStack size={14} />
                  {etapa.protocolos.length > 0 ? "Reapresentar" : "Protocolar"}
                </Button>
              </>
            )
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={pendente}
              loading={carregando("concluir")}
              loadingLabel="Concluindo…"
              onClick={() => executar("concluir", () => acoes.concluir(etapa.id))}
            >
              <Check size={14} /> Concluir
            </Button>
          )}
          {/* Revisão de 05/10: botão não é link — era texto cinza ao lado do Concluir. */}
          {etapa.opcional && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pendente}
              loading={carregando("dispensar")}
              loadingLabel="Dispensando…"
              onClick={() => executar("dispensar", () => acoes.dispensar(etapa.id))}
            >
              Não se aplica
            </Button>
          )}
        </div>
      )}

      </div>

      {erro && (
        <Aviso>
          {erro}
        </Aviso>
      )}
    </div>
  );
}

function Protocolo({
  protocolo,
  acoes,
  podeEditar,
  pendente,
  carregando,
  executar,
}: {
  protocolo: ProtocoloNaTela;
  acoes: Acoes;
  podeEditar: boolean;
  pendente: boolean;
  carregando: (chave: string) => boolean;
  executar: Executar;
}) {
  const [abrindoExigencia, setAbrindoExigencia] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-fs-2">
        <span className="text-fg-muted tabular-nums">
          {protocolo.tentativa}ª apresentação
        </span>
        {protocolo.numero && <span className="font-mono text-micro">{protocolo.numero}</span>}
        <span className="text-fg-muted">{formatInstantDate(protocolo.enviadoEm)}</span>
        {/* Selo, e não Badge: é a situação de uma linha (regra de 02/10 no Selo). */}
        {protocolo.desfecho === "DEFERIDO" && <Selo tom="sucesso">Deferido</Selo>}
        {protocolo.desfecho === "EXIGENCIA" && <Selo tom="atencao">Exigência</Selo>}
        {protocolo.desfecho === "PENDENTE" && <Selo tom="marca">Aguardando</Selo>}
        {protocolo.porRobo && (
          <span title="Apurado pelo observador de protocolo" className="inline-flex text-fg-muted">
            <Bot size={14} />
          </span>
        )}
      </div>

      {/* O estado do robô é dito em voz alta: "nunca olhou" e "olhou e nada
          mudou" parecem a mesma coisa sem isto, e aí ninguém sabe se pode
          confiar no automático. */}
      {protocolo.desfecho === "PENDENTE" && (
        <span className="text-micro text-fg-muted">
          {protocolo.erroDaVerificacao
            ? `Última verificação falhou: ${protocolo.erroDaVerificacao}`
            : protocolo.verificadoEm
              ? `Verificado automaticamente em ${formatInstantDate(protocolo.verificadoEm)}`
              : "Sem verificação automática — este órgão ainda é conferido à mão"}
        </span>
      )}

      {/* A exigência no `Aviso` de atenção (15/10/2026): era uma caixa âmbar
          montada à mão. A cumprida sai do âmbar — não pede mais nada. */}
      {protocolo.exigencias.map((ex) => (
        <Aviso key={ex.id} tom={ex.resolvidaEm ? "neutro" : "atencao"} icone={<AlertTriangle />}>
          <div className="flex flex-col gap-1.5">
            <span className={ex.resolvidaEm ? "line-through text-fg-muted" : "text-fg"}>{ex.descricao}</span>
            <span className="text-micro text-fg-muted">
              {ex.prazoAte ? `Prazo do órgão: ${formatInstantDate(ex.prazoAte)}` : "Sem prazo do órgão"}
              {ex.resolvidaEm && ` · cumprida em ${formatInstantDate(ex.resolvidaEm)}`}
            </span>
            {/* Botão como os outros do cartão — era um link de 11px, fácil de
                não ver numa ação que fecha a exigência. */}
            {podeEditar && !ex.resolvidaEm && (
              <Button
                variant="secondary"
                size="sm"
                disabled={pendente}
                loading={carregando(`cumprir-${ex.id}`)}
                loadingLabel="Marcando…"
                onClick={() => executar(`cumprir-${ex.id}`, () => acoes.resolverExigencia(ex.id))}
                className="self-start"
              >
                <Check size={14} /> Marcar como cumprida
              </Button>
            )}
          </div>
        </Aviso>
      ))}

      {podeEditar && protocolo.desfecho === "PENDENTE" && (
        <div className="flex flex-col gap-2">
          {!abrindoExigencia ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pendente}
                loading={carregando(`deferir-${protocolo.id}`)}
                loadingLabel="Registrando…"
                onClick={() => executar(`deferir-${protocolo.id}`, () => acoes.deferir(protocolo.id))}
              >
                Deferido
              </Button>
              {/* Também espera: abrir o formulário enquanto o "Deferido" grava
                  deixaria registrar os dois desfechos no mesmo protocolo. */}
              <Button variant="secondary" size="sm" disabled={pendente} onClick={() => setAbrindoExigencia(true)}>
                Exigência
              </Button>
            </div>
          ) : (
            // Formulário com rótulo em cima de cada campo: a data solta ao lado
            // dos botões não dizia de que prazo era.
            <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
              <CampoForm label="O que o órgão exigiu" htmlFor={`exigencia-${protocolo.id}`}>
                <Textarea
                  id={`exigencia-${protocolo.id}`}
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Prazo do órgão" htmlFor={`prazo-exigencia-${protocolo.id}`} helper="Opcional.">
                <CampoData
                  id={`prazo-exigencia-${protocolo.id}`}
                  value={prazo}
                  onChange={(v) => setPrazo(v)}
                  className="sm:w-44"
                />
              </CampoForm>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" size="sm" disabled={pendente} onClick={() => setAbrindoExigencia(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pendente}
                  loading={carregando(`exigir-${protocolo.id}`)}
                  loadingLabel="Registrando…"
                  onClick={() =>
                    executar(`exigir-${protocolo.id}`, async () => {
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
