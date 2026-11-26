"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, CloudDownload, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { pedirVarredura, conferirNoAcessorias, liberarEnviosAoAcessorias } from "@/app/(app)/honorarios/actions";
import { dataHora, tempoRelativo } from "@/lib/honorarios/rotulos";
import { formatarNumero } from "@/lib/format";
import type { StatusAuditoria } from "@/lib/honorarios/servidor/auditSyncService";
import type { EstadoAcessorias } from "@/lib/honorarios/servidor/acessoriasService";
import { MaisAcoes } from "./PecasDaLista";
import { useAcao } from "./useAcao";

// A faixa de uma linha embaixo das abas de Contratos e honorários (26/11/2026,
// melhoria-813, alternativa A): a varredura das pastas e, na aba Honorários, o
// Acessórias — cada um com um ponto colorido, uma frase curta e o que pede
// olhar. O resto (números da varredura, robô, última operação, documentos
// lidos) foi para o "Detalhes", e "Varrer" e "Conferir" também ficam no ⋯.
// Eram dois cartões de duas ou três linhas de texto, um deles acima das abas
// (SituacaoDaVarredura e QuadroDoAcessorias).
//
// A varredura em andamento (com a barra) e os envios travados continuam à
// vista, na própria faixa. A tela se recarrega sozinha enquanto há varredura
// (a cada 5 s) ou operação com o Acessórias (a cada 3 s) e avisa ao terminar.

type Tom = "ok" | "atencao" | "perigo" | "andamento" | "neutro";

const COR_DO_PONTO: Record<Tom, string> = {
  ok: "bg-success",
  atencao: "bg-warning",
  perigo: "bg-danger",
  andamento: "bg-brand animate-pulse motion-reduce:animate-none",
  neutro: "bg-fg-muted",
};

/** O ponto colorido; o texto ao lado diz o mesmo, a cor não fala sozinha. */
function Ponto({ tom }: { tom: Tom }) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full ${COR_DO_PONTO[tom]}`} />;
}

function Separador() {
  return <span aria-hidden className="hidden h-4 w-px shrink-0 bg-border sm:block" />;
}

/** A moldura da faixa: o que está acontecendo à esquerda, Detalhes e ⋯ à direita. */
function Faixa({ rotulo, children, direita }: { rotulo: string; children: React.ReactNode; direita?: React.ReactNode }) {
  return (
    <section
      aria-label={rotulo}
      className="mb-4 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-1.5 text-ui shadow-xs"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
        {children}
      </div>
      {direita && <div className="flex shrink-0 items-center gap-1.5">{direita}</div>}
    </section>
  );
}

/** Uma seção do "Detalhes", com o rótulo em caixa alta (o do painel de Filtros). */
function SecaoDosDetalhes({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-soft pt-3 first:border-t-0 first:pt-0">
      <span className="c41-rotulo">{rotulo}</span>
      {children}
    </div>
  );
}

type ResumoAcessorias = { conferidoEm: Date | null; iguais: number; diferentes: number; naoEncontradas: number };

/**
 * A faixa das abas Honorários, Contratos, Aditivos e Pastas. `acessorias` só na
 * de Honorários; `detalhes` são linhas a mais na seção da varredura (os
 * documentos lidos pelo robô, as pastas com subpasta de contrato).
 */
export function FaixaDaVarredura({
  status,
  podeAgir,
  detalhes = [],
  acessorias,
}: {
  status: StatusAuditoria;
  podeAgir: boolean;
  detalhes?: string[];
  acessorias?: { estado: EstadoAcessorias; resumo: ResumoAcessorias; podeGerir: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pedindo, iniciar] = useTransition();
  const { rodando, rodar } = useAcao();
  const [verTrava, setVerTrava] = useState(false);
  const { ativo, ultimoConcluido, ultimoErro, robo } = status;
  const estado = acessorias?.estado;
  const op = estado?.operacao ?? null;

  // Recarrega enquanto há varredura; avisa quando ela termina.
  const ativoAntes = useRef(ativo?.id ?? null);
  useEffect(() => {
    const antes = ativoAntes.current;
    ativoAntes.current = ativo?.id ?? null;
    if (antes && !ativo) {
      if (ultimoConcluido?.id === antes) toast.success("Varredura concluída.");
      else if (ultimoErro?.id === antes) toast.error(`A varredura falhou: ${ultimoErro.erro ?? "erro desconhecido"}`);
    }
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [ativo, ultimoConcluido, ultimoErro, router, toast]);

  // Recarrega enquanto há operação com o Acessórias; avisa o resultado.
  const opAntes = useRef(op?.executando ? op.id : null);
  useEffect(() => {
    const antes = opAntes.current;
    opAntes.current = op?.executando ? op.id : null;
    if (antes && op?.id === antes && !op.executando && op.mensagem) {
      if (op.erros > 0) toast.error(op.mensagem);
      else toast.success(op.mensagem);
    }
    if (!op?.executando) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [op, router, toast]);

  function varrer() {
    iniciar(async () => {
      const r = await pedirVarredura();
      if (!r.ok) toast.error(r.erro);
      else toast.show(r.mensagem ?? "Varredura pedida.", "info");
    });
  }
  const conferir = () => rodar(() => conferirNoAcessorias());

  // ── A varredura ─────────────────────────────────────────────
  let curto: string;
  let longo: string;
  let tom: Tom;
  let progresso: number | null = null;
  if (ativo?.status === "pendente") {
    curto = longo = "Aguardando o robô começar a varredura…";
    tom = "andamento";
  } else if (ativo?.status === "executando") {
    const total = ativo.pastasTotal ? formatarNumero(ativo.pastasTotal, 0) : "…";
    curto = `Varrendo: ${formatarNumero(ativo.pastasRecebidas, 0)} de ${total} pastas`;
    longo = `Varrendo as pastas da rede: ${formatarNumero(ativo.pastasRecebidas, 0)} de ${total} · ${formatarNumero(ativo.arquivosRecebidos, 0)} arquivos até agora`;
    tom = "andamento";
    if (ativo.pastasTotal) progresso = Math.min(100, Math.round((ativo.pastasRecebidas / ativo.pastasTotal) * 100));
  } else if (ultimoConcluido) {
    const quando = tempoRelativo(ultimoConcluido.concluidoEm ?? ultimoConcluido.solicitadoEm);
    curto = `Varredura ${quando}`;
    longo = `Última varredura ${quando}${ultimoConcluido.origem === "agendado" ? " (automática)" : ""} · ${formatarNumero(ultimoConcluido.pastasRecebidas, 0)} pastas · ${formatarNumero(ultimoConcluido.arquivosRecebidos, 0)} arquivos`;
    tom = ultimoErro ? "perigo" : robo && !robo.online ? "atencao" : "ok";
  } else {
    curto = "Nenhuma varredura ainda";
    longo = "Nenhuma varredura ainda. O robô da rede lê as pastas de contrato e manda o que achou.";
    tom = ultimoErro ? "perigo" : "neutro";
  }
  const falhou = !ativo && ultimoErro;
  const complemento = falhou ? (
    <span className="text-danger">· a última tentativa falhou</span>
  ) : robo ? (
    robo.online ? (
      <span className="text-fg-muted">· robô respondendo</span>
    ) : (
      <span className="text-warning-fg">· robô sem resposta</span>
    )
  ) : (
    <span className="text-fg-muted">· robô não conectado</span>
  );
  const linhaDoRobo = robo
    ? robo.online
      ? `Robô ${robo.host} respondendo`
      : `Robô sem resposta desde ${dataHora(robo.vistoEm)}${ativo ? " — a varredura começa quando ele voltar" : ""}`
    : "O robô da rede ainda não se conectou ao Connect.";

  // ── O Acessórias ────────────────────────────────────────────
  let segmentoAcessorias: React.ReactNode = null;
  let andamento: string | null = null;
  if (acessorias && estado) {
    const { resumo } = acessorias;
    if (op?.executando) {
      andamento = op.tipo === "conferir" ? `Lendo o Acessórias… ${op.feitos} empresa(s) até agora.` : `Enviando… ${op.feitos} de ${op.total ?? "?"}.`;
    } else if (op?.mensagem) {
      andamento = `Última operação (${op.conta}, ${dataHora(op.concluidaEm ?? op.iniciadaEm)}): ${op.mensagem}`;
    }
    if (!estado.configurado) {
      segmentoAcessorias = (
        <span className="inline-flex items-center gap-2">
          <Ponto tom="neutro" />
          <span className="text-fg-secondary">Acessórias não configurado</span>
        </span>
      );
    } else if (estado.bloqueio) {
      segmentoAcessorias = (
        <span className="inline-flex flex-wrap items-center gap-2">
          <LockKeyhole size={14} className="shrink-0 text-danger" aria-hidden />
          <span className="font-medium text-danger">Envios ao Acessórias travados</span>
          <Button variant="ghost" size="xs" onClick={() => setVerTrava(true)} aria-haspopup="dialog">
            Ver o que mudou
          </Button>
        </span>
      );
    } else if (op?.executando) {
      segmentoAcessorias = (
        <span className="inline-flex items-center gap-2">
          <Ponto tom="andamento" />
          <span>{andamento}</span>
        </span>
      );
    } else if (resumo.conferidoEm) {
      segmentoAcessorias = (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="inline-flex items-center gap-2">
            <Ponto tom={resumo.diferentes > 0 ? "atencao" : "ok"} />
            <span>Acessórias conferido em {dataHora(resumo.conferidoEm)}</span>
          </span>
          {resumo.diferentes > 0 && (
            <Link href="/honorarios?situacao=todas&acessorias=DIFERENTE" className="font-medium text-warning-fg hover:underline">
              · {formatarNumero(resumo.diferentes, 0)} {resumo.diferentes === 1 ? "diferente" : "diferentes"}
            </Link>
          )}
        </span>
      );
    } else {
      segmentoAcessorias = (
        <span className="inline-flex items-center gap-2">
          <Ponto tom="neutro" />
          <span className="text-fg-secondary">Acessórias ainda não conferido</span>
        </span>
      );
    }
  }
  const podeConferir = !!(podeAgir && estado?.configurado);

  return (
    <>
      <Faixa
        rotulo={acessorias ? "Varredura das pastas e Acessórias" : "Varredura das pastas"}
        direita={
          <>
            <Popover
              align="right"
              width={340}
              aria-label="Detalhes da varredura"
              trigger={({ open, toggle }) => (
                <Button variant="ghost" size="xs" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
                  Detalhes
                  <ChevronDown size={14} aria-hidden className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
                </Button>
              )}
            >
              <div className="flex flex-col gap-3 text-label">
                <SecaoDosDetalhes rotulo="Varredura das pastas">
                  <span className="text-fg">{longo}</span>
                  {progresso !== null && <BarraDeProgresso valor={progresso} className="w-full" />}
                  {falhou && (
                    <span className="text-danger">
                      A tentativa de {dataHora(ultimoErro.solicitadoEm)} falhou: {ultimoErro.erro ?? "erro desconhecido"}.
                      {ultimoConcluido && " O relatório mostra a última varredura que deu certo."}
                    </span>
                  )}
                  <span className={robo && !robo.online && ativo ? "text-warning-fg" : "text-fg-muted"}>{linhaDoRobo}</span>
                  {detalhes.map((d) => (
                    <span key={d} className="text-fg-muted">
                      {d}
                    </span>
                  ))}
                  {podeAgir && (
                    <div className="mt-1 flex justify-end">
                      <Button variant="secondary" size="xs" onClick={varrer} disabled={!!ativo || pedindo} title="Pede ao robô uma nova varredura das pastas dos clientes">
                        <RefreshCw size={13} aria-hidden className={ativo || pedindo ? "animate-spin motion-reduce:animate-none" : undefined} />
                        {ativo ? "Varrendo…" : pedindo ? "Pedindo…" : "Varrer as pastas"}
                      </Button>
                    </div>
                  )}
                </SecaoDosDetalhes>
                {acessorias && estado && (
                  <SecaoDosDetalhes rotulo="Acessórias">
                    {!estado.configurado ? (
                      <>
                        <span className="text-fg-secondary">
                          {estado.motivoNaoConfigurado} Dá para conferir os valores lidos e informar os que faltam, mas não para ler nem atualizar o
                          Acessórias.
                        </span>
                        <Link href="/admin/integracoes" className="font-medium text-brand hover:underline">
                          Abrir Integrações
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="text-fg">
                          {acessorias.resumo.conferidoEm ? `Conferido em ${dataHora(acessorias.resumo.conferidoEm)}` : "Ainda não conferido"}
                        </span>
                        {acessorias.resumo.conferidoEm && (
                          <span className="text-fg-secondary">
                            <Link href="/honorarios?situacao=todas&acessorias=DIFERENTE" className={acessorias.resumo.diferentes > 0 ? "text-warning-fg hover:underline" : "hover:underline"}>
                              {acessorias.resumo.diferentes} diferente(s)
                            </Link>
                            {" · "}
                            <Link href="/honorarios?situacao=todas&acessorias=IGUAL" className="hover:underline">
                              {acessorias.resumo.iguais} igual(is)
                            </Link>
                            {" · "}
                            <Link href="/honorarios?situacao=todas&acessorias=NAO_ENCONTRADA" className="hover:underline">
                              {acessorias.resumo.naoEncontradas} não encontrada(s)
                            </Link>
                          </span>
                        )}
                        {andamento && <span className="text-fg-muted">{andamento}</span>}
                        {estado.bloqueio && (
                          <button type="button" onClick={() => setVerTrava(true)} className="self-start font-medium text-danger hover:underline">
                            Envios travados: ver o que mudou
                          </button>
                        )}
                        {podeAgir && (
                          <div className="mt-1 flex justify-end">
                            <Button
                              variant="secondary"
                              size="xs"
                              disabled={rodando || !!op?.executando}
                              onClick={conferir}
                              title="Lê o honorário de todas as empresas no Acessórias para comparar. Nada é alterado lá."
                            >
                              {op?.executando && op.tipo === "conferir" ? (
                                <RefreshCw size={13} className="animate-spin motion-reduce:animate-none" aria-hidden />
                              ) : (
                                <CloudDownload size={13} aria-hidden />
                              )}
                              Conferir no Acessórias
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </SecaoDosDetalhes>
                )}
              </div>
            </Popover>
            {podeAgir && (
              <MaisAcoes
                rotulo="Mais ações da varredura"
                itens={[
                  {
                    rotulo: ativo ? "Varrendo as pastas…" : "Varrer as pastas",
                    icone: <RefreshCw />,
                    onClick: varrer,
                    disabled: !!ativo || pedindo,
                  },
                  podeConferir && {
                    rotulo: "Conferir no Acessórias",
                    icone: <CloudDownload />,
                    onClick: conferir,
                    disabled: rodando || !!op?.executando,
                  },
                ]}
              />
            )}
          </>
        }
      >
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="inline-flex items-center gap-2">
            <Ponto tom={tom} />
            <span className="text-fg">{curto}</span>
          </span>
          {progresso !== null ? <BarraDeProgresso valor={progresso} className="w-24" /> : complemento}
        </span>
        {segmentoAcessorias && (
          <>
            <Separador />
            {segmentoAcessorias}
          </>
        )}
      </Faixa>
      {estado?.bloqueio && verTrava && (
        <JanelaDaTrava bloqueio={estado.bloqueio} podeGerir={acessorias?.podeGerir ?? false} aoFechar={() => setVerTrava(false)} />
      )}
    </>
  );
}

function BarraDeProgresso({ valor, className = "" }: { valor: number; className?: string }) {
  return (
    <span
      className={`inline-block h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`.trim()}
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Pastas recebidas"
    >
      <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${valor}%` }} />
    </span>
  );
}

const vazio = (v: unknown) => (v === null || v === undefined || v === "" ? "(vazio)" : typeof v === "string" ? v : JSON.stringify(v));
const curtoDe = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}…` : s);

/** Um envio mexeu em outros campos da ficha no Acessórias: tudo para até alguém conferir lá. */
function JanelaDaTrava({ bloqueio, podeGerir, aoFechar }: { bloqueio: NonNullable<EstadoAcessorias["bloqueio"]>; podeGerir: boolean; aoFechar: () => void }) {
  const [verDetalhe, setVerDetalhe] = useState(false);
  const { rodando, rodar } = useAcao();
  return (
    <Modal open onClose={aoFechar} title="Envios ao Acessórias travados" maxWidth="max-w-2xl">
      <div className="space-y-4 text-label">
        <p className="text-fg-secondary">
          Ao atualizar o honorário de <strong className="text-fg">{bloqueio.razaoSocial}</strong> ({dataHora(bloqueio.enviadoEm)}, por {bloqueio.conta}), estes
          campos também mudaram no Acessórias: <strong className="text-fg">{bloqueio.outrosCampos.join(", ")}</strong>. Confira a empresa no Acessórias,
          corrija o que for preciso e só então libere.
        </p>
        <Button variant="secondary" size="xs" onClick={() => setVerDetalhe((v) => !v)} aria-expanded={verDetalhe}>
          {verDetalhe ? "Esconder antes e depois" : "Ver antes e depois"}
        </Button>
        {verDetalhe && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-label text-fg">
              <thead>
                <tr className="text-left">
                  <th className="c41-rotulo py-1 pr-3">Campo</th>
                  <th className="c41-rotulo py-1 pr-3">Antes</th>
                  <th className="c41-rotulo py-1">Depois</th>
                </tr>
              </thead>
              <tbody>
                {bloqueio.outrosCampos.map((c) => (
                  <Fragment key={c}>
                    <tr className="border-t border-border-soft align-top">
                      <td className="py-1 pr-3 font-medium">{c}</td>
                      <td className="py-1 pr-3 break-words">{curtoDe(vazio(bloqueio.fichaAntes?.[c]))}</td>
                      <td className="py-1 break-words">{curtoDe(vazio(bloqueio.fichaDepois?.[c]))}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={aoFechar}>
            Fechar
          </Button>
          {podeGerir && (
            <Button disabled={rodando} onClick={() => rodar(() => liberarEnviosAoAcessorias(bloqueio.id), aoFechar)}>
              {rodando ? "Liberando…" : "Já conferi no Acessórias: liberar envios"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * A faixa da aba Termo aditivo: o termo não depende da varredura, depende do
 * modelo em Word. Aqui fica o modelo atual (ou o aviso de que falta) e o botão
 * "Modelo do termo", que antes ficava no topo da tela.
 */
export function FaixaDoModelo({
  modelo,
  podeGerir,
  botao,
}: {
  modelo: { nomeArquivo: string; enviadoPor: string; atualizadoEm: string } | null;
  podeGerir: boolean;
  /** O "Modelo do termo" (`ModeloDoTermo`), para quem gerencia. */
  botao?: React.ReactNode;
}) {
  return (
    <Faixa rotulo="Modelo do termo" direita={podeGerir ? botao : undefined}>
      {modelo ? (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="inline-flex min-w-0 items-center gap-2">
            <Ponto tom="ok" />
            <span className="truncate text-fg" title={modelo.nomeArquivo}>
              Modelo do termo: {modelo.nomeArquivo}
            </span>
          </span>
          <span className="text-fg-muted">
            · enviado por {modelo.enviadoPor} em {modelo.atualizadoEm}
          </span>
        </span>
      ) : (
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="inline-flex items-center gap-2">
            <Ponto tom="atencao" />
            <span className="text-warning-fg">O escritório ainda não enviou o modelo do termo em Word</span>
          </span>
          <span className="text-fg-muted">
            · {podeGerir ? "envie em “Modelo do termo”" : "quem gerencia Contratos e honorários envia"}; enquanto isso, dá para completar os dados das empresas
          </span>
        </span>
      )}
    </Faixa>
  );
}
