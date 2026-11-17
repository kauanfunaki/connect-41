"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, Check, ChevronDown, ChevronUp, CircleCheck, Copy, Download, ExternalLink, Hand, Lock, Paperclip, Route, Send, Upload, UserRound, UserX, X, Zap } from "lucide-react";
import Link from "next/link";
import { Iniciais } from "@/components/conversas/caixa/Caixa";
import { NavegacaoPorTeclado } from "@/components/conversas/caixa/Interativos";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import type { DetalheDoAtendimento } from "@/lib/atendimento/consultas";
import { formatInstantDate, formatInstantTime } from "@/lib/format";
import { ROTULO_DA_SITUACAO, noRecorte, preencherCampos } from "@/lib/atendimento/regras";
import { anotarAction, assumirAction, pedirParaAssumirAction, responderAction, retomarConversaAction, type Resultado } from "@/app/(app)/atendimento/actions";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useCaixaDoAtendimento } from "./CaixaDoAtendimento";
import { PainelDeEncaminhar, PainelDoContato, JanelaDeEncerrar, JanelaDeTransferir, JanelaDeTirar, FaixaDoPedido, FaixaDoPedidoDeAssumir } from "./AcoesDoAtendimento";

const hora = (iso: string) => formatInstantTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) => formatInstantDate(new Date(iso), { day: "2-digit", month: "2-digit", year: "numeric" });
const quando = (iso: string) => `${dia(iso).slice(0, 5)} ${hora(iso)}`;

type Abertura = null | "encaminhar" | "contato" | "encerrar" | "transferir" | "tirar" | "caminho";

/** O arquivo vai ao cliente: precisa ter assumido, a janela de 24 h aberta e o envio de arquivo ligado. */
const podeMandarArquivo = (d: DetalheDoAtendimento) => d.pode.responder && d.janela.ok && d.enviaArquivo && d.ciclo.situacao !== "ENCERRADO";

/**
 * A conversa aberta. Desde 17/11/2026 (melhoria-728, protótipo aprovado pelo
 * Victor): no topo só o "Assumir"; o resto das ações num "…"; a seta ao lado
 * do nome abre o número, a empresa e o CNPJ; o caminho da conversa abre numa
 * janela, e não fica mais numa coluna à direita; arrastar um arquivo para a
 * conversa o anexa, com o texto como legenda.
 */
export function PainelDoAtendimento({ d }: { d: DetalheDoAtendimento }) {
  const v = useCaixaDoAtendimento();
  const [aberto, setAberto] = useState<Abertura>(null);
  const [dadosAbertos, setDadosAbertos] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const geral = v.ehTriagem || v.veTudo;

  // A anterior e a próxima no recorte que está à vista.
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem, veTudo: v.veTudo };
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

  // Arrastar um arquivo para a conversa (17/11/2026). O `dragleave` dispara a
  // cada filho que o ponteiro cruza: só vale quando sai do painel inteiro.
  const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  function aoArrastar(e: DragEvent<HTMLElement>) {
    if (!temArquivo(e)) return;
    e.preventDefault();
    if (!arrastando) setArrastando(true);
  }
  function aoSair(e: DragEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
  }
  function aoSoltar(e: DragEvent<HTMLElement>) {
    if (!temArquivo(e)) return;
    e.preventDefault();
    setArrastando(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!podeMandarArquivo(d)) {
      toast.error(d.pode.responder ? "Arquivo só sai com a conversa aberta pelo cliente nas últimas 24 h." : "Assuma a conversa para mandar arquivos ao cliente.");
      return;
    }
    setArquivo(f);
  }

  const resp = d.ciclo.responsavel;
  const podePedirAssumir = !!resp && resp.id !== d.eu.id && !d.pedidoAssumir && !d.pode.assumir && d.ciclo.situacao !== "ENCERRADO";

  return (
    <>
      <NavegacaoPorTeclado anterior={anterior} proxima={proxima} fechar={v.hrefDaLista} />
      <section
        className="relative flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden"
        aria-label={d.contato.titulo}
        onDragEnter={aoArrastar}
        onDragOver={aoArrastar}
        onDragLeave={aoSair}
        onDrop={aoSoltar}
      >
        {/* Só o fechar e a data (17/11/2026, pedido do Victor): saíram as setas de anterior e próxima e a dica
            "↑↓ para passar pelas conversas". As teclas continuam valendo (NavegacaoPorTeclado). */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0">
          <Link
            href={v.hrefDaLista}
            scroll={false}
            aria-label="Fechar e voltar à lista"
            title="Fechar (Esc)"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg"
          >
            <X size={16} />
          </Link>
          <span className="ml-auto text-micro text-fg-muted tabular-nums truncate">Desde {quando(d.ciclo.abertoEm)}</span>
        </div>
        <div className="shrink-0 border-b border-border px-4 py-3 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Iniciais nome={d.contato.tipo === "DESCONHECIDO" ? null : d.contato.titulo} tamanho={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <h2 className="truncate text-heading font-semibold text-fg">{d.contato.titulo}</h2>
                <button
                  type="button"
                  onClick={() => setDadosAbertos((x) => !x)}
                  aria-expanded={dadosAbertos}
                  aria-label="Dados do contato"
                  data-dica="Dados do contato"
                  className="inline-grid place-items-center w-7 h-7 shrink-0 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg"
                >
                  <ChevronDown size={16} className={`transition-transform duration-150 motion-reduce:transition-none ${dadosAbertos ? "rotate-180" : ""}`} aria-hidden />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {d.contato.subtitulo && <span className="text-micro text-fg-muted">{d.contato.subtitulo}</span>}
                {d.contato.tipo === "DESCONHECIDO" && <span className="text-micro text-fg-muted">Contato novo</span>}
                <Selo tom={d.ciclo.situacao === "TRIAGEM" ? "atencao" : d.ciclo.situacao === "NO_SETOR" ? "perigo" : d.ciclo.situacao === "ENCERRADO" ? "sucesso" : d.ciclo.situacao === "AGUARDANDO_CLIENTE" ? "neutro" : "marca"}>
                  {ROTULO_DA_SITUACAO[d.ciclo.situacao]}
                </Selo>
                {/* O setor com a cor, só para quem vê a triagem ou todos os setores; abre o caminho da conversa. */}
                {geral && (
                  <button
                    type="button"
                    onClick={() => setAberto("caminho")}
                    data-dica="Ver o caminho da conversa"
                    className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border text-micro font-semibold text-fg-secondary hover:border-border-strong hover:text-fg"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: d.ciclo.setor?.cor ?? v.triagem.cor }} aria-hidden />
                    {d.ciclo.setor?.label ?? d.setorDaTriagem.label}
                    <Route size={12} aria-hidden />
                  </button>
                )}
                {resp && (
                  <span className="inline-flex items-center gap-1 text-micro text-fg-secondary">
                    <UserRound size={13} aria-hidden /> {resp.id === d.eu.id ? "Com você" : resp.nome}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {d.pode.assumir && (
                <Button size="sm" onClick={() => rodar(() => assumirAction(d.ciclo.id), "Conversa assumida.")} loading={ocupado} loadingLabel="Assumindo…">
                  <Check size={14} /> Assumir
                </Button>
              )}
              <MenuDeMaisAcoes rotulo="Mais ações da conversa" size="md" width={270} sempreMenu>
                {({ close }) => {
                  // O menu fecha antes de abrir a janela da ação, para não ficar por cima dela.
                  const fechar = (acao: () => void) => {
                    close();
                    acao();
                  };
                  return (
                    <>
                      <ItemDoMenu icone={<Route />} onClick={() => fechar(() => setAberto("caminho"))}>
                        Caminho da conversa
                      </ItemDoMenu>
                      {(d.pode.encaminharDireto || d.pode.pedirEncaminhamento) && (
                        <ItemDoMenu icone={<ArrowRight />} onClick={() => fechar(() => setAberto("encaminhar"))}>
                          Encaminhar para outro setor
                        </ItemDoMenu>
                      )}
                      {d.pode.agir && d.pessoasDoSetor.length > 0 && (
                        <ItemDoMenu icone={<ArrowRightLeft />} onClick={() => fechar(() => setAberto("transferir"))}>
                          Transferir para outra pessoa
                        </ItemDoMenu>
                      )}
                      {podePedirAssumir && (
                        <ItemDoMenu icone={<Hand />} onClick={() => fechar(() => rodar(() => pedirParaAssumirAction(d.ciclo.id), `Pedido enviado. ${resp!.nome} decide se passa a conversa.`))}>
                          Pedir para assumir
                        </ItemDoMenu>
                      )}
                      {d.pode.tirar && (
                        <ItemDoMenu icone={<UserX />} onClick={() => fechar(() => setAberto("tirar"))}>
                          Tirar da conversa
                        </ItemDoMenu>
                      )}
                      {d.pode.agir && (
                        <ItemDoMenu icone={<CircleCheck />} danger onClick={() => fechar(() => setAberto("encerrar"))}>
                          Encerrar atendimento
                        </ItemDoMenu>
                      )}
                    </>
                  );
                }}
              </MenuDeMaisAcoes>
            </div>
          </div>
          {dadosAbertos && <DadosDoContato d={d} aoAdicionar={() => setAberto("contato")} />}
          {d.pedido ? (
            <FaixaDoPedido d={d} podeDecidir={d.pode.decidirPedido} />
          ) : d.pedidoAssumir ? (
            <FaixaDoPedidoDeAssumir d={d} />
          ) : d.ciclo.transferidaPara ? (
            <div className="rounded-lg border border-brand/40 bg-brand/5 px-3.5 py-3 text-ui">
              {d.ciclo.transferidaPara.paraMim ? (
                <>
                  <b>Esta conversa foi passada para você.</b> Assuma para responder ao cliente.
                </>
              ) : (
                <>
                  <b>Passada para {d.ciclo.transferidaPara.nome}.</b> Esperando a pessoa assumir.
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <Mensagens d={d} />
          <Escrever d={d} arquivo={arquivo} aoMudarArquivo={setArquivo} aoAssumir={() => rodar(() => assumirAction(d.ciclo.id), "Conversa assumida.")} ocupado={ocupado} />
        </div>
        {arrastando && (
          <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-lg border-2 border-dashed border-[var(--c41-grupo-atendimento)] bg-surface/90" aria-hidden>
            <span className="flex flex-col items-center gap-2 text-ui font-semibold text-fg">
              <Upload size={26} />
              {podeMandarArquivo(d) ? "Solte o arquivo para anexar à conversa" : "Assuma a conversa para mandar arquivos"}
            </span>
          </div>
        )}
      </section>

      <Modal open={aberto === "caminho"} onClose={() => setAberto(null)} title="Caminho da conversa">
        <CaminhoDaConversa d={d} />
      </Modal>
      <PainelDeEncaminhar d={d} aberto={aberto === "encaminhar"} aoFechar={() => setAberto(null)} />
      <PainelDoContato d={d} aberto={aberto === "contato"} aoFechar={() => setAberto(null)} />
      <JanelaDeEncerrar d={d} aberta={aberto === "encerrar"} aoFechar={() => setAberto(null)} />
      <JanelaDeTransferir d={d} aberta={aberto === "transferir"} aoFechar={() => setAberto(null)} />
      {d.pode.tirar && <JanelaDeTirar d={d} aberta={aberto === "tirar"} aoFechar={() => setAberto(null)} />}
    </>
  );
}

/**
 * Os dados do contato, abertos pela seta ao lado do nome: o número e o CNPJ
 * copiam num clique; a empresa abre a ficha numa nova janela. Sem empresa
 * ligada, o "Adicionar contato" (que antes era o "Quem é?" das ações).
 */
function DadosDoContato({ d, aoAdicionar }: { d: DetalheDoAtendimento; aoAdicionar: () => void }) {
  const toast = useToast();
  function copiar(valor: string, rotulo: string) {
    navigator.clipboard.writeText(valor).then(
      () => toast.success(`${rotulo} copiado.`),
      () => toast.error(`Não deu para copiar o ${rotulo.toLowerCase()}.`)
    );
  }
  const copiavel = (valor: string, rotulo: string) => (
    <button
      type="button"
      onClick={() => copiar(valor, rotulo)}
      data-dica={`Copiar o ${rotulo.toLowerCase()}`}
      className="inline-flex items-center gap-1.5 self-start text-ui font-semibold text-brand tabular-nums hover:underline"
    >
      {valor} <Copy size={13} aria-hidden />
    </button>
  );
  const empresa = d.contato.empresa;
  return (
    <div className="grid gap-4 rounded-lg border border-border-soft bg-surface-2 px-3.5 py-3 sm:grid-cols-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-micro font-semibold uppercase tracking-wide text-fg-muted">Número</span>
        {copiavel(d.contato.telefone, "Número")}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-micro font-semibold uppercase tracking-wide text-fg-muted">Empresa</span>
        {empresa ? (
          <span className="inline-flex items-center gap-1 min-w-0">
            <span className="truncate text-ui text-fg">{empresa.nome}</span>
            <a
              href={`/empresas/${empresa.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir a ficha de ${empresa.nome} numa nova janela`}
              data-dica="Abrir a ficha da empresa numa nova janela"
              className="inline-grid place-items-center w-6 h-6 shrink-0 rounded-md text-brand hover:bg-surface-hover"
            >
              <ExternalLink size={14} aria-hidden />
            </a>
          </span>
        ) : (
          <span className="text-ui text-fg-muted">Sem empresa ligada</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-micro font-semibold uppercase tracking-wide text-fg-muted">CNPJ</span>
        {empresa?.cnpj ? copiavel(empresa.cnpj, "CNPJ") : <span className="text-ui text-fg-muted">—</span>}
      </div>
      {d.contato.nomeNoWhatsapp && d.contato.nomeNoWhatsapp !== d.contato.titulo && (
        <p className="sm:col-span-3 text-micro text-fg-muted">No WhatsApp: {d.contato.nomeNoWhatsapp}</p>
      )}
      {!empresa && d.pode.vincular && (
        <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
          <span className="text-micro text-fg-muted">{d.contato.tipo === "DESCONHECIDO" ? "Contato novo: o nome é o que a pessoa usa no WhatsApp, ou o número." : "Este contato ainda não está ligado a uma empresa."}</span>
          <Button size="xs" variant="secondary" onClick={aoAdicionar}>
            <UserRound size={13} /> Adicionar contato
          </Button>
        </div>
      )}
    </div>
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
      {m.arquivo &&
        (m.arquivo.imagem ? (
          <a href={`/api/atendimento/anexos/${m.id}`} className="block my-1" title={`Baixar ${m.arquivo.nome}`}>
            {/* Imagem guardada pelo Connect, servida pela rota autenticada: sem otimização do Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/atendimento/anexos/${m.id}?ver=1`} alt={m.arquivo.nome} className="max-h-60 max-w-full rounded-md border border-border object-contain bg-surface" />
          </a>
        ) : (
          <a
            href={`/api/atendimento/anexos/${m.id}`}
            className="my-1 flex items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2 text-ui text-fg hover:border-brand/40"
          >
            <Paperclip size={16} className="text-fg-muted shrink-0" aria-hidden />
            <span className="min-w-0 truncate font-medium">{m.arquivo.nome}</span>
            <Download size={14} className="ml-auto text-fg-muted shrink-0" aria-hidden />
          </a>
        ))}
      {m.texto && (m.arquivo ? m.texto !== m.arquivo.nome : true) && (
        <p className={`text-ui text-fg whitespace-pre-wrap break-words ${m.midia && !m.arquivo ? "italic text-fg-secondary" : ""}`}>{m.texto}</p>
      )}
      <p className="text-micro text-fg-muted text-right mt-0.5">
        {hora(m.quando)}
        {saida && m.status === "FALHOU" && <span className="text-danger"> · não saiu{m.erro ? `: ${m.erro}` : ""}</span>}
        {saida && m.status === "PENDENTE" && " · enviando"}
      </p>
    </div>
  );
}

function Escrever({ d, arquivo, aoMudarArquivo: setArquivo, aoAssumir, ocupado }: { d: DetalheDoAtendimento; arquivo: File | null; aoMudarArquivo: (f: File | null) => void; aoAssumir: () => void; ocupado: boolean }) {
  const podeNota = d.pode.agir;
  const podeCliente = d.pode.responder && d.janela.ok;
  // Quem não pode responder ao cliente (ainda não assumiu, janela fechada) cai
  // na nota; ao assumir, a resposta ao cliente volta a ser a aba aberta.
  const [modoEscolhido, setModo] = useState<"cliente" | "nota">("cliente");
  // O arquivo (arrastado ou escolhido) só vai ao cliente: com ele, a aba é a da resposta.
  const modo = podeCliente ? (arquivo ? "cliente" : modoEscolhido) : "nota";
  const [texto, setTexto] = useState("");
  const campoDoArquivo = useRef<HTMLInputElement>(null);
  // A prévia da imagem, enquanto o arquivo espera para sair.
  const previa = useMemo(() => (arquivo && arquivo.type.startsWith("image/") ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(
    () => () => {
      if (previa) URL.revokeObjectURL(previa);
    },
    [previa]
  );
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
    if (arquivo && modo === "cliente") {
      // O arquivo vai pela rota (até 16 MB), com o texto como legenda.
      iniciar(async () => {
        const form = new FormData();
        form.append("cicloId", d.ciclo.id);
        form.append("legenda", t);
        form.append("arquivo", arquivo);
        let r: { ok: boolean; erro?: string };
        try {
          r = (await (await fetch("/api/atendimento/anexos", { method: "POST", body: form })).json()) as { ok: boolean; erro?: string };
        } catch {
          r = { ok: false, erro: "Não deu para falar com o servidor. Confira a conexão e tente de novo." };
        }
        if (!r.ok) toast.error(r.erro ?? "O arquivo não saiu.");
        else {
          setTexto("");
          setArquivo(null);
        }
        router.refresh();
      });
      return;
    }
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
        {d.pode.responder && !d.janela.ok && <RetomarConversa d={d} />}
        {arquivo && modo === "cliente" && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-ui">
            {previa ? (
              // Prévia local do arquivo escolhido (blob:), sem passar pelo otimizador do Next.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previa} alt={arquivo.name} className="w-14 h-14 shrink-0 rounded-md object-cover border border-border" />
            ) : (
              <span className="w-14 h-14 shrink-0 grid place-items-center rounded-md bg-surface border border-border text-micro font-bold text-fg-secondary uppercase" aria-hidden>
                {arquivo.name.includes(".") ? arquivo.name.split(".").pop()!.slice(0, 4) : <Paperclip size={16} />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-fg">{arquivo.name}</span>
              <span className="block text-micro text-fg-muted">{tamanho(arquivo.size)} · o texto abaixo vai como legenda</span>
            </span>
            <button type="button" onClick={() => setArquivo(null)} className="inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover" aria-label="Tirar o arquivo">
              <X size={14} />
            </button>
          </div>
        )}
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
          {modo === "cliente" && podeCliente && d.enviaArquivo && (
            <>
              <input
                ref={campoDoArquivo}
                type="file"
                className="sr-only"
                aria-label="Anexar arquivo"
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => campoDoArquivo.current?.click()} disabled={enviando}>
                <Paperclip size={14} /> Anexar
              </Button>
            </>
          )}
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
          <Button size="sm" onClick={enviar} loading={enviando} loadingLabel="Enviando…" disabled={(!texto.trim() && !(arquivo && modo === "cliente")) || (modo === "cliente" && !podeCliente)}>
            <Send size={14} /> {modo === "cliente" ? "Enviar" : "Anotar"}
          </Button>
        </div>
      </div>
    </div>
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
      return mv.nota === "Pedido para assumir" ? `${por} recusou o pedido de ${mv.para ?? "alguém"} para assumir` : `${por} recusou o pedido de encaminhamento`;
    case "INICIOU":
      return `${por} começou a conversa${mv.paraSetor ? ` pelo ${mv.paraSetor}` : ""}`;
    case "PEDIU_ASSUMIR":
      return `${por} pediu para assumir a conversa de ${mv.para ?? "quem atendia"}`;
    case "CEDEU":
      return `${por} passou a conversa para ${mv.para ?? "quem pediu"}`;
    case "TIROU":
      return `${por} tirou ${mv.para ?? "a pessoa"} da conversa${mv.nota ? `: ${mv.nota}` : ""}`;
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

/** O caminho da conversa, na janela aberta pelo "…" ou pelo setor ao lado do nome: do mais recente ao primeiro. */
function CaminhoDaConversa({ d }: { d: DetalheDoAtendimento }) {
  if (d.caminho.length === 0) return <p className="text-ui text-fg-muted">Nenhum movimento ainda.</p>;
  return (
    <ol className="flex flex-col">
      {d.caminho.map((mv, i) => (
        <li key={mv.id} className="flex gap-3">
          <span className="flex flex-col items-center" aria-hidden>
            <span className={`mt-1 w-2.5 h-2.5 rounded-full ${i === 0 ? "bg-[var(--c41-grupo-atendimento)]" : "bg-border-strong"}`} />
            {i < d.caminho.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
          </span>
          <span className="pb-3 min-w-0">
            <span className="block text-ui text-fg">{frase(mv)}</span>
            <span className="block text-micro text-fg-muted tabular-nums">{quando(mv.quando)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const tamanho = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Passadas 24 h sem mensagem do cliente, só sai modelo aprovado pela Meta. O
 * {{1}} do modelo é a assinatura de quem manda; as outras variáveis, a pessoa preenche.
 */
function RetomarConversa({ d }: { d: DetalheDoAtendimento }) {
  const [modeloId, setModeloId] = useState(d.modelos[0]?.id ?? "");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const modelo = d.modelos.find((m) => m.id === modeloId) ?? null;

  if (d.modelos.length === 0) {
    return <p className="text-micro text-fg-muted">Nenhum modelo da Meta cadastrado. Cadastre nas configurações do Atendimento para retomar a conversa.</p>;
  }
  const extras = modelo ? Array.from({ length: Math.max(0, modelo.variaveis - 1) }, (_, i) => i + 2) : [];
  const assinatura = `${d.ciclo.responsavel?.nome ?? "Você"} · ${d.ciclo.setor?.label ?? d.setorDaTriagem.label}`;
  const previa = modelo
    ? modelo.texto.replace(/\{\{\s*(\d{1,2})\s*\}\}/g, (_, n: string) => (n === "1" ? assinatura : valores[n]?.trim() || `{{${n}}}`))
    : "";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <b className="text-ui">Retomar conversa</b>
      <Select aria-label="Modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
        {d.modelos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.rotulo}
          </option>
        ))}
      </Select>
      {extras.map((n) => (
        <Input key={n} aria-label={`Variável ${n}`} placeholder={`Valor do {{${n}}}`} value={valores[n] ?? ""} onChange={(e) => setValores({ ...valores, [n]: e.target.value })} />
      ))}
      {modelo && <p className="text-micro text-fg-secondary whitespace-pre-wrap rounded-md bg-brand-subtle px-2.5 py-2">{previa}</p>}
      <div className="flex justify-end">
        <Button
          size="sm"
          loading={enviando}
          loadingLabel="Enviando…"
          disabled={!modelo}
          onClick={() =>
            iniciar(async () => {
              const r = await retomarConversaAction(d.ciclo.id, modeloId, extras.map((n) => valores[n] ?? ""));
              if (!r.ok) toast.error(r.erro);
              else toast.success("Modelo enviado. Quando o cliente responder, a conversa abre de novo.");
              router.refresh();
            })
          }
        >
          <Send size={14} /> Enviar modelo
        </Button>
      </div>
    </div>
  );
}
