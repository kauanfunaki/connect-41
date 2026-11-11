"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, Check, ChevronDown, ChevronUp, CircleCheck, Lock, Send, UserRound, Zap } from "lucide-react";
import { AcaoRapida, BarraDoPainel, PainelDeConversa } from "@/components/conversas/caixa/Caixa";
import { NavegacaoPorTeclado } from "@/components/conversas/caixa/Interativos";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import type { DetalheDoAtendimento } from "@/lib/atendimento/consultas";
import { formatInstantDate, formatInstantTime } from "@/lib/format";
import { ROTULO_DA_SITUACAO, noRecorte, preencherCampos } from "@/lib/atendimento/regras";
import { anotarAction, assumirAction, responderAction, type Resultado } from "@/app/(app)/atendimento/actions";
import { useCaixaDoAtendimento } from "./CaixaDoAtendimento";
import { PainelDeEncaminhar, PainelDoContato, JanelaDeEncerrar, JanelaDeTransferir, FaixaDoPedido } from "./AcoesDoAtendimento";

const hora = (iso: string) => formatInstantTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) => formatInstantDate(new Date(iso), { day: "2-digit", month: "2-digit", year: "numeric" });
const quando = (iso: string) => `${dia(iso).slice(0, 5)} ${hora(iso)}`;

type Abertura = null | "encaminhar" | "contato" | "encerrar" | "transferir";

export function PainelDoAtendimento({ d }: { d: DetalheDoAtendimento }) {
  const v = useCaixaDoAtendimento();
  const [aberto, setAberto] = useState<Abertura>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // A anterior e a próxima no recorte que está à vista.
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem };
  const doRecorte = v.cartoes.filter((c) => noRecorte(c, v.recorte, quem));
  const i = doRecorte.findIndex((c) => c.cicloId === d.ciclo.id);
  const anterior = i > 0 ? v.hrefDoCiclo(doRecorte[i - 1]!.cicloId) : null;
  const proxima = i >= 0 && i < doRecorte.length - 1 ? v.hrefDoCiclo(doRecorte[i + 1]!.cicloId) : null;

  function rodar(acao: () => Promise<Resultado>, sucesso?: string) {
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) toast.error(r.erro);
      else {
        if (sucesso) toast.success(sucesso);
        router.refresh();
      }
    });
  }

  const etiquetas = [
    <Selo key="sit" tom={d.ciclo.situacao === "TRIAGEM" || d.ciclo.situacao === "NO_SETOR" ? "atencao" : d.ciclo.situacao === "ENCERRADO" ? "neutro" : "marca"}>
      {d.ciclo.situacao === "TRIAGEM" ? `Na triagem · ${d.setorDaTriagem.label}` : ROTULO_DA_SITUACAO[d.ciclo.situacao]}
    </Selo>,
    d.ciclo.setor ? (
      <Selo key="setor" cor={d.ciclo.setor.cor}>
        {d.ciclo.setor.label}
      </Selo>
    ) : null,
    d.ciclo.responsavel ? (
      <span key="resp" className="inline-flex items-center gap-1 text-ui">
        <UserRound size={14} /> {d.ciclo.responsavel.id === d.eu.id ? "Com você" : d.ciclo.responsavel.nome}
      </span>
    ) : null,
    d.contato.tipo === "DESCONHECIDO" ? (
      <Selo key="tipo" tom="atencao">
        Contato novo
      </Selo>
    ) : d.contato.tipo === "NOVO" ? (
      <Selo key="tipo" tom="marca">
        Ainda não é cliente
      </Selo>
    ) : null,
  ].filter(Boolean) as React.ReactNode[];

  const acoes = (
    <div className="flex flex-wrap items-center gap-1">
      {d.pode.assumir && (
        <Button size="sm" onClick={() => rodar(() => assumirAction(d.ciclo.id), "Conversa assumida.")} loading={ocupado} loadingLabel="Assumindo…">
          <Check size={14} /> Assumir
        </Button>
      )}
      {(d.pode.encaminharDireto || d.pode.pedirEncaminhamento) && (
        <AcaoRapida icone={<ArrowRight />} onClick={() => setAberto("encaminhar")}>
          Encaminhar
        </AcaoRapida>
      )}
      {d.pode.agir && d.pessoasDoSetor.length > 0 && (
        <AcaoRapida icone={<ArrowRightLeft />} onClick={() => setAberto("transferir")}>
          Transferir
        </AcaoRapida>
      )}
      {d.pode.vincular && (
        <AcaoRapida icone={<UserRound />} onClick={() => setAberto("contato")}>
          {d.contato.tipo === "CLIENTE" ? "Contato" : "Quem é?"}
        </AcaoRapida>
      )}
      {d.pode.agir && (
        <AcaoRapida icone={<CircleCheck />} onClick={() => setAberto("encerrar")}>
          Encerrar
        </AcaoRapida>
      )}
    </div>
  );

  return (
    <>
      <NavegacaoPorTeclado anterior={anterior} proxima={proxima} fechar={v.hrefDaLista} />
      <PainelDeConversa
        barra={<BarraDoPainel fecharHref={v.hrefDaLista} anteriorHref={anterior} proximaHref={proxima} data={`Desde ${quando(d.ciclo.abertoEm)}`} />}
        titulo={d.contato.titulo}
        subtitulo={d.contato.subtitulo ? `${d.contato.subtitulo} · ${d.contato.telefone}` : d.contato.telefone}
        etiquetas={etiquetas}
        acoes={acoes}
        aviso={d.pedido ? <FaixaDoPedido d={d} podeDecidir={d.pode.decidirPedido} /> : undefined}
        corpo="fixo"
      >
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col">
            <Mensagens d={d} />
            <Escrever d={d} aoAssumir={() => rodar(() => assumirAction(d.ciclo.id), "Conversa assumida.")} ocupado={ocupado} />
          </div>
          <aside className="hidden xl:flex w-72 shrink-0 flex-col gap-4 border-l border-border-soft p-4 overflow-y-auto scroll-y" aria-label="Cliente e caminho da conversa">
            <Cliente d={d} />
            <Caminho d={d} />
          </aside>
        </div>
      </PainelDeConversa>

      <PainelDeEncaminhar d={d} aberto={aberto === "encaminhar"} aoFechar={() => setAberto(null)} />
      <PainelDoContato d={d} aberto={aberto === "contato"} aoFechar={() => setAberto(null)} />
      <JanelaDeEncerrar d={d} aberta={aberto === "encerrar"} aoFechar={() => setAberto(null)} />
      <JanelaDeTransferir d={d} aberta={aberto === "transferir"} aoFechar={() => setAberto(null)} />
    </>
  );
}

function Mensagens({ d }: { d: DetalheDoAtendimento }) {
  const fim = useRef<HTMLDivElement>(null);
  const total = d.mensagens.length;
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [total]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-y bg-canvas/50 px-4 sm:px-5 py-4 flex flex-col gap-2.5">
      {d.mensagens.length === 0 && <p className="text-ui text-fg-muted text-center py-8">Nenhuma mensagem ainda.</p>}
      {d.mensagens.map((m, i) => {
        const antes = i > 0 ? d.mensagens[i - 1]! : null;
        const diaDaMsg = dia(m.quando);
        const separaDia = !antes || dia(antes.quando) !== diaDaMsg;
        const separaCiclo = !!antes && !antes.doCicloAtual && m.doCicloAtual;
        return (
          <div key={m.id} className="flex flex-col gap-2.5">
            {separaCiclo && <p className="self-center text-micro text-fg-muted">Este atendimento começa aqui</p>}
            {separaDia && <span className="self-center text-micro text-fg-muted bg-surface border border-border rounded-full px-2.5 py-0.5">{diaDaMsg}</span>}
            <Balao m={m} />
          </div>
        );
      })}
      <div ref={fim} />
    </div>
  );
}

function Balao({ m }: { m: DetalheDoAtendimento["mensagens"][number] }) {
  if (m.interna) {
    return (
      <div className="self-stretch rounded-lg border border-dashed border-warning/60 bg-warning/10 px-3 py-2">
        <p className="flex items-center gap-1.5 text-micro font-semibold text-warning-fg">
          <Lock size={13} aria-hidden /> Nota interna{m.assinatura ? ` · ${m.assinatura}` : ""}
        </p>
        <p className="text-ui text-fg whitespace-pre-wrap break-words mt-0.5">{m.texto}</p>
        <p className="text-micro text-fg-muted mt-0.5">{hora(m.quando)} · só a equipe vê</p>
      </div>
    );
  }
  const saida = m.direcao === "SAIDA";
  return (
    <div
      className={`max-w-[78%] rounded-lg px-3 py-2 ${saida ? "self-end bg-brand-subtle rounded-br-sm" : "self-start bg-surface border border-border rounded-bl-sm"} ${m.doCicloAtual ? "" : "opacity-75"}`}
    >
      {saida && m.assinatura && (
        <p className="text-micro font-semibold text-fg-secondary">
          {m.assinatura}
          {m.automatica ? " · automática" : ""}
        </p>
      )}
      <p className={`text-ui text-fg whitespace-pre-wrap break-words ${m.midia ? "italic text-fg-secondary" : ""}`}>{m.texto}</p>
      <p className="text-micro text-fg-muted text-right mt-0.5">
        {hora(m.quando)}
        {saida && m.status === "FALHOU" && <span className="text-danger"> · não saiu{m.erro ? `: ${m.erro}` : ""}</span>}
        {saida && m.status === "PENDENTE" && " · enviando"}
      </p>
    </div>
  );
}

function Escrever({ d, aoAssumir, ocupado }: { d: DetalheDoAtendimento; aoAssumir: () => void; ocupado: boolean }) {
  const podeNota = d.pode.agir;
  const podeCliente = d.pode.responder && d.janela.ok;
  // Quem não pode responder ao cliente (ainda não assumiu, janela fechada) cai
  // na nota; ao assumir, a resposta ao cliente volta a ser a aba aberta.
  const [modoEscolhido, setModo] = useState<"cliente" | "nota">("cliente");
  const modo = podeCliente ? modoEscolhido : "nota";
  const [texto, setTexto] = useState("");
  const [enviando, iniciar] = useTransition();
  const [padroesAbertos, setPadroesAbertos] = useState(false);
  const router = useRouter();
  const toast = useToast();

  if (d.ciclo.situacao === "ENCERRADO") {
    return <p className="shrink-0 border-t border-border px-4 py-3 text-ui text-fg-muted">Atendimento encerrado. Se o cliente escrever de novo, a conversa volta.</p>;
  }
  if (!podeNota) {
    return <p className="shrink-0 border-t border-border px-4 py-3 text-ui text-fg-muted">Você só acompanha esta conversa.</p>;
  }

  const assinatura = `${d.ciclo.responsavel?.id === d.eu.id ? d.ciclo.responsavel.nome : "Você"} · ${d.ciclo.setor?.label ?? d.setorDaTriagem.label}`;
  const campos = {
    nomeDoContato: d.contato.nome ?? d.contato.nomeNoWhatsapp ?? null,
    empresa: d.contato.empresa?.nome ?? null,
    seuNome: d.ciclo.responsavel?.id === d.eu.id ? d.ciclo.responsavel.nome : "",
    seuSetor: d.ciclo.setor?.label ?? d.setorDaTriagem.label,
  };

  function enviar() {
    const t = texto.trim();
    if (!t) return;
    iniciar(async () => {
      const r = modo === "cliente" ? await responderAction(d.ciclo.id, t) : await anotarAction(d.ciclo.id, t);
      if (!r.ok) {
        toast.error(r.erro);
        // A mensagem que não saiu fica registrada, com o motivo no balão:
        // a conversa mostra o que a pessoa tentou mandar.
        router.refresh();
      } else {
        setTexto("");
        router.refresh();
      }
    });
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      <div role="tablist" aria-label="Tipo de mensagem" className="flex gap-1 px-3 pt-2">
        <button
          type="button"
          role="tab"
          aria-selected={modo === "cliente"}
          disabled={!podeCliente}
          onClick={() => setModo("cliente")}
          className={`h-8 px-3 text-ui border-b-2 ${modo === "cliente" ? "border-brand font-semibold text-fg" : "border-transparent text-fg-secondary"} disabled:opacity-50`}
        >
          Responder ao cliente
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === "nota"}
          onClick={() => setModo("nota")}
          className={`h-8 px-3 text-ui border-b-2 inline-flex items-center gap-1.5 ${modo === "nota" ? "border-warning font-semibold text-fg" : "border-transparent text-fg-secondary"}`}
        >
          <Lock size={13} aria-hidden /> Nota interna
        </button>
      </div>
      <div className="px-4 pb-3 pt-2 flex flex-col gap-2">
        {modo === "cliente" ? (
          <p className="text-micro text-fg-muted">
            Sai assinada como <b className="text-fg">{assinatura}</b>
          </p>
        ) : (
          <p className="text-micro text-fg-muted">Só a equipe vê. Não vai para o cliente.</p>
        )}
        {!d.pode.responder && (
          <div className="flex flex-wrap items-center gap-2 text-ui text-fg-secondary">
            Assuma a conversa para responder ao cliente. Quem assume vira o responsável e assina as mensagens.
            {d.pode.assumir && (
              <Button size="xs" onClick={aoAssumir} loading={ocupado} loadingLabel="Assumindo…">
                Assumir e responder
              </Button>
            )}
          </div>
        )}
        {d.pode.responder && !d.janela.ok && d.janela.motivo && <Aviso>{d.janela.motivo}</Aviso>}
        <Textarea
          id={`resposta-${d.ciclo.id}`}
          aria-label={modo === "cliente" ? "Resposta ao cliente" : "Nota interna"}
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder={modo === "cliente" ? "Escreva para o cliente" : "Escreva para a equipe"}
          disabled={enviando || (modo === "cliente" && !podeCliente)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {d.mensagensPadrao.length > 0 && (
            <div className="relative">
              <Button size="sm" variant="ghost" onClick={() => setPadroesAbertos((x) => !x)} aria-expanded={padroesAbertos}>
                <Zap size={14} /> Mensagens padrão {padroesAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
              {padroesAbertos && (
                <div className="absolute bottom-full mb-1 left-0 z-20 w-80 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-[var(--c41-shadow-lg)] p-1">
                  {d.mensagensPadrao.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setTexto((t) => (t.trim() ? `${t.trim()}\n${preencherCampos(m.texto, campos)}` : preencherCampos(m.texto, campos)));
                        setPadroesAbertos(false);
                      }}
                      className="w-full text-left rounded-md px-3 py-2 hover:bg-surface-hover"
                    >
                      <span className="block text-ui font-medium text-fg">
                        {m.titulo}
                        {m.setor ? <span className="text-fg-muted font-normal"> · {m.setor}</span> : null}
                      </span>
                      <span className="block text-micro text-fg-muted truncate">{m.texto}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="flex-1" />
          <span className="hidden sm:inline text-micro text-fg-muted">Enter envia · Shift+Enter quebra a linha</span>
          <Button size="sm" onClick={enviar} loading={enviando} loadingLabel="Enviando…" disabled={!texto.trim() || (modo === "cliente" && !podeCliente)}>
            <Send size={14} /> {modo === "cliente" ? "Enviar" : "Anotar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Cliente({ d }: { d: DetalheDoAtendimento }) {
  const linhas: [string, string][] = [];
  if (d.contato.empresa) {
    linhas.push(["Empresa", d.contato.empresa.nome]);
    if (d.contato.empresa.cnpj) linhas.push(["CNPJ", d.contato.empresa.cnpj]);
  }
  if (d.contato.tipo === "NOVO") {
    if (d.contato.nome) linhas.push(["Nome", d.contato.nome]);
    if (d.contato.interesse) linhas.push(["Interesse", d.contato.interesse]);
  }
  linhas.push(["Telefone", d.contato.telefone]);
  if (d.contato.nomeNoWhatsapp) linhas.push(["No WhatsApp", d.contato.nomeNoWhatsapp]);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-ui font-semibold text-fg">Cliente</h3>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-ui">
        {linhas.map(([r, val]) => (
          <div key={r} className="contents">
            <dt className="text-fg-muted">{r}</dt>
            <dd className="text-fg break-words">{val}</dd>
          </div>
        ))}
        {d.contato.empresa && (
          <div className="contents">
            <dt className="text-fg-muted">Portal</dt>
            <dd className={d.contato.temPortal ? "text-success-fg font-medium" : "text-warning-fg font-medium"}>{d.contato.temPortal ? "Tem acesso" : "Sem acesso"}</dd>
          </div>
        )}
      </dl>
      {d.contato.empresa && (
        <Link href={`/empresas/${d.contato.empresa.id}`} className="text-ui font-medium text-brand hover:underline">
          Abrir a ficha da empresa
        </Link>
      )}
    </section>
  );
}

function frase(mv: DetalheDoAtendimento["caminho"][number]): string {
  const por = mv.por ?? "O Connect";
  switch (mv.tipo) {
    case "CHEGOU":
      return "Chegou pelo WhatsApp e entrou na triagem";
    case "ASSUMIU":
      return `${por} assumiu`;
    case "ENCAMINHOU":
      return `${por} encaminhou ao ${mv.paraSetor ?? "setor"}${mv.para ? `, para ${mv.para}` : ""}`;
    case "TRANSFERIU":
      return `${por} transferiu para ${mv.para ?? "outra pessoa"}`;
    case "PEDIU":
      return `${por} pediu para passar ao ${mv.paraSetor ?? "setor a definir"}`;
    case "APROVOU":
      return `${por} aprovou: foi para ${mv.paraSetor ?? "outro setor"}`;
    case "RECUSOU":
      return `${por} recusou o pedido de encaminhamento`;
    case "ENCERROU":
      return `${por} encerrou${mv.nota ? `: ${mv.nota}` : ""}`;
    case "REABRIU":
      return `O cliente voltou a escrever: reaberto no ${mv.paraSetor ?? "setor"}`;
    case "VINCULOU":
      return `${por}: ${mv.nota ?? "atualizou o contato"}`;
    default:
      return por;
  }
}

/** O caminho da conversa: os 2 eventos mais recentes, e o resto em "Ver mais". */
function Caminho({ d }: { d: DetalheDoAtendimento }) {
  const [todos, setTodos] = useState(false);
  const lista = useMemo(() => (todos ? d.caminho : d.caminho.slice(0, 2)), [todos, d.caminho]);
  const resto = d.caminho.length - 2;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-ui font-semibold text-fg flex-1">Caminho da conversa</h3>
        <span className="text-micro text-fg-muted">mais recente primeiro</span>
      </div>
      <ol className="flex flex-col gap-2.5">
        {lista.map((mv) => (
          <li key={mv.id} className="flex gap-2 text-ui">
            <span className="w-11 shrink-0 text-fg-muted tabular-nums">{hora(mv.quando)}</span>
            <span className="min-w-0 text-fg">{frase(mv)}</span>
          </li>
        ))}
      </ol>
      {resto > 0 && (
        <button type="button" onClick={() => setTodos((x) => !x)} className="self-start inline-flex items-center gap-1 text-ui font-medium text-brand hover:underline">
          {todos ? (
            <>
              <ChevronUp size={14} /> Ver menos
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Ver mais ({resto})
            </>
          )}
        </button>
      )}
    </section>
  );
}
