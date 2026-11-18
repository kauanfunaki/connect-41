"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Hourglass, Info, Link2, ListChecks, MessageSquareReply, Paperclip, PencilLine, RefreshCw, RotateCcw, ScanSearch, Shuffle, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Accordion } from "@/components/ui/Accordion";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { formatInstantDateTime } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Campo, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import { CaixaDeMensagem } from "./CaixaDeMensagem";
import { EditarDadosDoChamado } from "./EditarDadosDoChamado";
import { FaixaDoPrazo } from "./FaixaDoPrazo";
import { Avatar, LinhaDoTempo, LinkDoAnexo } from "./LinhaDoTempo";
import { SeletorDePessoas } from "./SeletorDePessoas";
import { SeletorDePrioridade } from "./SeletorDePrioridade";
import { SeloDaSituacao, SeletorDeSituacao } from "./SeletorDeSituacao";
import { ResultadoDaTriagem, TriagemEmAndamento } from "./ResultadoDaTriagem";
import { mudar } from "@/app/(app)/chamados/actions";
import { ROTULOS_PRIORIDADE, aguardandoSolicitante, emTriagem, fechado, parecerSchema, situacoesDoSeletor, triagemSchema, type DadosDoChamado, type PapelNoChamado, type Prioridade, type Status } from "@/lib/chamados/regras";
import type { detalhe } from "@/lib/chamados/consultas";
import { montarLinhaDoTempo } from "@/lib/chamados/linhaDoTempo";
import { painelDoPrazo } from "@/lib/chamados/painelDoPrazo";
import { TOM_DA_PRIORIDADE } from "@/lib/chamados/tons";
import { idCurto } from "@/lib/enderecoCurto";
import { TENTATIVAS_NO_HUB } from "@/lib/chamados/hub";

type Chamado = Awaited<ReturnType<typeof detalhe>>;
type Usuario = { id: string; name: string; atendente: boolean };
type Setor = { code: string; label: string };
/** `setoresQueAtendem`: os que administram os chamados (12/11/2026); com dois ou mais, a tela mostra qual atende e permite redirecionar. */
type Props = { chamado: Chamado; eu: string; agora: string; usuarios: Usuario[]; categorias: CategoriaDaTela[]; setores: Setor[]; setoresQueAtendem: Setor[]; permissoes: { operar: boolean; gerenciar: boolean; responder: boolean; interno: boolean; aprovar: boolean; escrever: boolean; verOrquestrador: boolean; redirecionar: boolean } };
type Resultado = { ok: true; valor: unknown } | { ok: false; error: string };
/** As janelas que saem do menu "…" e dos avisos do alto (18/11/2026): os formulários deixaram de morar no cartão. */
type Janela = "editar" | "setor" | "prazo" | "aprovar" | "recusar" | "reabrir" | "recusar_reabertura" | "pedir_reabertura";
const data = (v: Date | string) => formatInstantDateTime(new Date(v));
const ID_DA_CAIXA = "caixa-de-resposta";
// O cabeçalho de um recolhível do cartão: a linha inteira, com o resumo à direita e a seta na ponta.
const LINHA_RECOLHIVEL = "w-full items-center py-2.5 text-ui font-semibold text-fg hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Uma linha dos dados do chamado no cartão: o nome à esquerda e o valor à direita. */
function DadoDoChamado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="flex-shrink-0 text-fg-secondary">{rotulo}</dt><dd className="min-w-0 break-words text-right font-medium text-fg">{children}</dd></div>;
}
/** Uma seção do cartão (Pessoas, Classificação, Registro): o rótulo em caixa alta e, quando grava, o "Salvando…" ao lado dele. */
function SecaoDoCartao({ titulo, salvando = false, children }: { titulo: string; salvando?: boolean; children: React.ReactNode }) {
  return <section aria-label={titulo} className="min-w-0 space-y-3">
    <div className="flex items-center justify-between gap-2"><p aria-hidden className="c41-rotulo">{titulo}</p>{salvando && <span role="status" className="text-helper text-fg-muted">Salvando…</span>}</div>
    {children}
  </section>;
}
/** A janela de uma ação do menu ou do aviso: o formulário, o erro junto dele e o rodapé Cancelar/confirmar. */
function JanelaDeAcao({ titulo, aberta, salvando, erro, rotulo, perigo = false, onFechar, onEnviar, children }: { titulo: string; aberta: boolean; salvando: boolean; erro: string; rotulo: string; perigo?: boolean; onFechar: () => void; onEnviar: (f: FormData) => void; children: React.ReactNode }) {
  return <Modal open={aberta} onClose={() => { if (!salvando) onFechar(); }} title={titulo} maxWidth="max-w-lg">
    <form onSubmit={e => { e.preventDefault(); onEnviar(new FormData(e.currentTarget)); }} className="space-y-4">
      <fieldset disabled={salvando} className="space-y-4">{children}</fieldset>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" disabled={salvando} onClick={onFechar}>Cancelar</Button>
        <Button type="submit" variant={perigo ? "danger" : "primary"} loading={salvando} loadingLabel="Salvando…">{rotulo}</Button>
      </div>
    </form>
  </Modal>;
}
/** O relógio da faixa do prazo: parte da hora do servidor (a mesma na hidratação) e anda de minuto em minuto. */
function useAgora(inicial: string) {
  const [agora, setAgora] = useState(() => new Date(inicial));
  useEffect(() => { const id = setInterval(() => setAgora(new Date()), 60_000); return () => clearInterval(id); }, []);
  return agora;
}

/**
 * A tela do chamado na alternativa C (18/11/2026, melhoria-782): "ação no
 * cabeçalho, detalhes em seções".
 * - Cabeçalho: título, quem pediu, a situação num seletor (só as trocas que o
 *   servidor aceita), a ação principal (Assumir ou Responder) e o menu "…"
 *   com o resto — os formulários abrem em janela.
 * - Avisos do alto: aprovação pendente e reabertura, que antes caíam embaixo
 *   do cartão, fora da vista, justo quando eram a próxima ação.
 * - Cartão da direita: a faixa do prazo (05/11/2026, opção A) e as seções
 *   Pessoas (quem pediu primeiro), Classificação (prioridade muda ali mesmo)
 *   e Registro; checklist e triagem recolhidos, com o resumo na linha.
 * - Conversa: eventos seguidos recolhidos, filtro "Só mensagens", e para
 *   quem pediu um aviso no lugar da caixa que sumia.
 * Erros vão para um aviso que some (toast) ou para dentro da janela, e o
 * "Salvando…" fica no controle clicado.
 */
export function DetalheDoChamado({ chamado: t, eu, agora: agoraDoServidor, usuarios, categorias, setores, setoresQueAtendem, permissoes: p }: Props) {
  const router = useRouter(), toast = useToast();
  const [salvando, setSalvando] = useState<string | null>(null), [erroDaJanela, setErroDaJanela] = useState("");
  const [janela, setJanela] = useState<Janela | null>(null);
  const [checklist, setChecklist] = useState(t.checklist), [situacao, setSituacao] = useState<Status>(t.status as Status);
  const [prioridade, setPrioridade] = useState<Prioridade>(t.priority as Prioridade);
  const [soMensagens, setSoMensagens] = useState(false);
  const agora = useAgora(agoraDoServidor);
  const busy = salvando !== null;
  const dadosAtuais: DadosDoChamado = { title: t.title, description: t.description, categoryId: t.categoryId, requesterSectorCode: t.requesterSectorCode, priority: t.priority, requestData: t.requestData as Record<string, string>, tags: t.tags as string[], handlingSectorCode: t.handlingSectorCode };
  const nome = (id: string) => usuarios.find(u => u.id === id)?.name ?? "Usuário indisponível";
  const nomeDoSetor = (code: string) => setores.find(s => s.code === code)?.label ?? code;
  const ciclo = t.cycles[0], encerrado = fechado(t.status), triando = emTriagem(t.status);
  const prazo = painelDoPrazo(ciclo, t.status, agora);
  // Equipe = atende no setor do chamado e pode escrever; o resto (quem pediu, o gestor do setor dele) só acompanha.
  const papel: PapelNoChamado = p.operar && p.escrever ? "equipe" : "solicitante";
  const opcoes = situacoesDoSeletor({ status: situacao, approvalStatus: t.approvalStatus }, papel);
  // O resultado da triagem depois do envio (10/11/2026): o último evento "triagem".
  const eventoDaTriagem = triagemSchema.safeParse(t.events.find(e => e.type === "triagem")?.data);
  const triagem = eventoDaTriagem.success ? eventoDaTriagem.data : null;
  const parecer = parecerSchema.safeParse(t.draft.review);
  // Cada parecer já vira mensagem do assistente (resumo + perguntas); repetir o
  // resumo embaixo duplicava o texto quando a análise aprovava o chamado.
  const resumoNaConversa = parecer.success && t.draft.messages.some(m => m.role === "assistant" && m.body.startsWith(parecer.data.summary));
  // Os arquivos da abertura ficam com a solicitação; os seguintes, na conversa.
  const daAbertura = t.attachments.filter(a => a.createdAt <= t.createdAt);
  const linha = montarLinhaDoTempo({ mensagens: t.comments, anexos: t.attachments.filter(a => a.createdAt > t.createdAt), eventos: t.events });
  const temEventos = linha.some(i => i.tipo === "evento"), temMensagens = linha.some(i => i.tipo !== "evento");
  const responsaveis = t.assignees.map(a => a.userId), participantes = t.participants.map(a => a.userId), atendentes = usuarios.filter(u => u.atendente);
  const categoria = categorias.find(c => c.id === t.categoryId);
  const variosSetores = setoresQueAtendem.length > 1;
  const destinos = setoresQueAtendem.filter(s => s.code !== t.handlingSectorCode);
  const podeRedirecionar = p.redirecionar && !encerrado && destinos.length > 0;
  const podeAjustarPrazo = p.gerenciar && p.escrever && !encerrado && !!ciclo && !ciclo.resolvedAt;
  const podeEditar = papel === "equipe" && !encerrado && !triando;
  const mostraChecklist = !!checklist.length && p.interno;
  const feitos = checklist.filter(i => i.done).length;
  const aprovacaoPendente = t.approvalStatus === "PENDING" && t.status === "AGUARDANDO_APROVACAO";
  const reaberturaPendente = t.status === "RESOLVIDO" ? t.reopenRequests.find(r => r.status === "PENDING") : undefined;
  const podePedirReabertura = t.status === "RESOLVIDO" && p.escrever && !reaberturaPendente;
  const podeAssumir = papel === "equipe" && !encerrado && !responsaveis.includes(eu) && atendentes.some(u => u.id === eu);
  const souQuemPediu = papel === "solicitante";

  async function executar(chave: string, fn: () => Promise<Resultado>, naJanela = false) {
    setSalvando(chave); setErroDaJanela("");
    try { const r = await fn(); if (!r.ok) throw new Error(r.error); router.refresh(); return true; }
    catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível concluir. Atualize a página.";
      if (naJanela) setErroDaJanela(msg); else toast.error(msg);
      return false;
    }
    finally { setSalvando(null); }
  }
  const acao = (chave: string, op: string, valor: unknown) => void executar(chave, () => mudar(t.id, t.version, op, valor));
  /** O envio de uma janela: grava, e só fecha se deu certo (o erro fica dentro dela). */
  const enviarDaJanela = (op: string, valor: unknown) => void executar("janela", () => mudar(t.id, t.version, op, valor), true).then(ok => { if (ok) setJanela(null); });
  const abrirJanela = (j: Janela) => { setErroDaJanela(""); setJanela(j); };
  const fecharJanela = () => { setJanela(null); setErroDaJanela(""); };
  // Resolver e cancelar encerram o chamado: passam pela confirmação (auditoria de
  // UX, 30/10/2026). No seletor (18/11/2026) continua assim.
  const [finalPedido, setFinalPedido] = useState<"RESOLVIDO" | "CANCELADO" | null>(null);
  function trocarSituacao(nova: Status) { const anterior = situacao; setSituacao(nova); void executar("situacao", () => mudar(t.id, t.version, "status", nova)).then(ok => { if (!ok) setSituacao(anterior); }); }
  // A prioridade muda no lugar (18/11/2026): o controle deslizante troca a faixa
  // a cada passo do arraste, então a gravação espera a pessoa parar.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);
  function trocarPrioridade(nova: Prioridade) {
    setPrioridade(nova);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      if (nova === t.priority) return;
      void executar("prioridade", () => mudar(t.id, t.version, "prioridade", nova)).then(ok => { if (!ok) setPrioridade(t.priority as Prioridade); });
    }, 600);
  }
  function irParaResposta() {
    const caixa = document.getElementById(ID_DA_CAIXA);
    caixa?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    caixa?.querySelector("textarea")?.focus({ preventScroll: true });
  }
  async function copiarLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/chamados/${idCurto("chamado", t.number)}`); toast.success("Link do chamado copiado."); }
    catch { toast.error("Não foi possível copiar o link. Copie pela barra de endereço."); }
  }

  const acaoPrincipal = podeAssumir
    ? <Button onClick={() => acao("assumir", "assumir", null)} loading={salvando === "assumir"} loadingLabel="Assumindo…" disabled={busy}><UserPlus size={15} aria-hidden />Assumir</Button>
    : p.responder ? <Button onClick={irParaResposta}><MessageSquareReply size={15} aria-hidden />Responder</Button> : null;
  const cabecalho = <PageHeader title={t.title}
    meta={<>
      <span>Pedido por <span className="font-semibold text-fg">{nome(t.createdById)}</span> ({nomeDoSetor(t.requesterSectorCode)})</span>
      <span aria-hidden>·</span><time dateTime={new Date(t.createdAt).toISOString()} className="tabular-nums">{data(t.createdAt)}</time>
      <Selo tom={TOM_DA_PRIORIDADE[prioridade]}>Prioridade {ROTULOS_PRIORIDADE[prioridade].toLocaleLowerCase("pt-BR")}</Selo>
    </>}
    action={<div className="flex flex-wrap items-center gap-2">
      {papel === "equipe" && !encerrado && !triando
        ? <SeletorDeSituacao atual={situacao} opcoes={opcoes} aprovacaoPendente={t.approvalStatus === "PENDING"} salvando={salvando === "situacao"} onTrocar={trocarSituacao} onEncerrar={setFinalPedido} />
        : <SeloDaSituacao status={situacao} />}
      {acaoPrincipal}
      <MenuDeMaisAcoes sempreMenu size="md" width={232} rotulo="Mais ações do chamado">
        {({ close }) => <>
          {podeEditar && <ItemDoMenu icone={<PencilLine />} onClick={() => { close(); abrirJanela("editar"); }}>Editar dados</ItemDoMenu>}
          {podeRedirecionar && <ItemDoMenu icone={<Shuffle />} onClick={() => { close(); abrirJanela("setor"); }}>Enviar para outro setor</ItemDoMenu>}
          {podeAjustarPrazo && <ItemDoMenu icone={<CalendarClock />} onClick={() => { close(); abrirJanela("prazo"); }}>Ajustar prazo</ItemDoMenu>}
          {podePedirReabertura && <ItemDoMenu icone={<RotateCcw />} onClick={() => { close(); abrirJanela("pedir_reabertura"); }}>Pedir reabertura</ItemDoMenu>}
          <ItemDoMenu icone={<Link2 />} onClick={() => { close(); void copiarLink(); }}>Copiar link</ItemDoMenu>
          <ItemDoMenu icone={<RefreshCw />} onClick={() => { close(); router.refresh(); }}>Atualizar</ItemDoMenu>
        </>}
      </MenuDeMaisAcoes>
    </div>} />;

  // O que quem pediu vê no lugar da caixa de resposta, quando a regra a tira (`podeResponder`).
  const avisoSemCaixa = t.status === "RESOLVIDO"
    ? <Aviso tom="neutro" icone={<Info />}><p className="font-semibold text-fg">O chamado foi resolvido.</p><p>{reaberturaPendente ? "O pedido de reabertura está com a equipe." : podePedirReabertura ? "Se o problema voltou, peça a reabertura." : "A conversa está encerrada."}</p>{podePedirReabertura && <Button variant="secondary" size="sm" className="mt-2" onClick={() => abrirJanela("pedir_reabertura")}><RotateCcw size={14} aria-hidden />Pedir reabertura</Button>}</Aviso>
    : t.status === "CANCELADO" ? <Aviso tom="neutro" icone={<Info />}><p className="font-semibold text-fg">O chamado foi cancelado.</p><p>A conversa está encerrada.</p></Aviso>
    : souQuemPediu ? <Aviso tom="info" icone={<Info />}><p className="font-semibold text-fg">{t.status === "AGUARDANDO_APROVACAO" ? "O chamado aguarda aprovação." : triando ? "A triagem automática está analisando o pedido." : "A equipe está cuidando do seu pedido."}</p><p className="text-fg-secondary">Quando ela precisar de algo seu, a pergunta aparece aqui e o sino avisa. Aí você responde por esta caixa.</p></Aviso>
    : null;

  return <div className="space-y-5">
    {cabecalho}
    <ConfirmDialog open={finalPedido !== null} title={finalPedido === "CANCELADO" ? "Cancelar o chamado?" : "Marcar o chamado como resolvido?"}
      description={finalPedido === "CANCELADO" ? "O chamado é encerrado sem solução e sai da fila. O solicitante é avisado." : "O chamado é encerrado e o solicitante é avisado. Ele pode pedir reabertura depois."}
      confirmLabel={finalPedido === "CANCELADO" ? "Cancelar o chamado" : "Marcar como resolvido"} cancelLabel="Voltar" destructive={finalPedido === "CANCELADO"}
      onConfirm={() => { if (finalPedido) trocarSituacao(finalPedido); setFinalPedido(null); }} onCancel={() => setFinalPedido(null)} />
    {janela === "editar" && <EditarDadosDoChamado inicial={dadosAtuais} categorias={categorias} setores={setores} salvando={salvando === "janela"} erro={erroDaJanela} onFechar={fecharJanela}
      onSalvar={dados => enviarDaJanela("dados", dados)} />}
    {/* Enviar para outro setor (12/11/2026), em dois tipos desde 16/11/2026 (funcionalidade-709): continuar ou corrigir. */}
    {janela === "setor" && <EnviarParaOutroSetor destinos={destinos} salvando={salvando === "janela"} erro={erroDaJanela} onFechar={fecharJanela} onEnviar={v => enviarDaJanela("redirecionar", v)} />}
    <JanelaDeAcao titulo="Ajustar prazo" aberta={janela === "prazo"} salvando={salvando === "janela"} erro={erroDaJanela} rotulo="Salvar prazo" onFechar={fecharJanela}
      onEnviar={f => enviarDaJanela("prazo", { prazo: new Date(`${f.get("prazo")}:00-03:00`).toISOString(), motivo: String(f.get("motivo")) })}>
      <Campo label="Novo prazo de resolução (Brasília)"><CampoDataHora name="prazo" required /></Campo>
      <Campo label="Justificativa"><Textarea name="motivo" required minLength={5} maxLength={1000} rows={3} /></Campo>
    </JanelaDeAcao>
    <JanelaDeAcao titulo={janela === "recusar" ? "Recusar o chamado" : "Aprovar o chamado"} aberta={janela === "aprovar" || janela === "recusar"} salvando={salvando === "janela"} erro={erroDaJanela}
      rotulo={janela === "recusar" ? "Recusar" : "Aprovar"} perigo={janela === "recusar"} onFechar={fecharJanela}
      onEnviar={f => enviarDaJanela("aprovar", { aprovado: janela === "aprovar", motivo: String(f.get("motivo")) })}>
      <p className="text-ui text-fg-secondary">{janela === "recusar" ? "O chamado é cancelado e quem pediu é avisado." : "O chamado segue para a equipe atender."}</p>
      <Campo label="Justificativa da decisão"><Textarea name="motivo" required maxLength={2000} rows={3} /></Campo>
    </JanelaDeAcao>
    <JanelaDeAcao titulo={janela === "recusar_reabertura" ? "Recusar a reabertura" : "Reabrir o chamado"} aberta={janela === "reabrir" || janela === "recusar_reabertura"} salvando={salvando === "janela"} erro={erroDaJanela}
      rotulo={janela === "recusar_reabertura" ? "Recusar reabertura" : "Reabrir"} perigo={janela === "recusar_reabertura"} onFechar={fecharJanela}
      onEnviar={f => enviarDaJanela("decidir_reabertura", { aprovado: janela === "reabrir", motivo: String(f.get("motivo")) })}>
      <Campo label="Motivo da decisão"><Textarea name="motivo" required maxLength={2000} rows={3} /></Campo>
    </JanelaDeAcao>
    <JanelaDeAcao titulo="Pedir reabertura" aberta={janela === "pedir_reabertura"} salvando={salvando === "janela"} erro={erroDaJanela} rotulo="Pedir reabertura" onFechar={fecharJanela}
      onEnviar={f => enviarDaJanela("pedir_reabertura", String(f.get("motivo")))}>
      <Campo label="Por que precisa reabrir?"><Textarea name="motivo" required minLength={5} maxLength={2000} rows={3} /></Campo>
    </JanelaDeAcao>

    {/* Os avisos do alto (18/11/2026): a próxima ação, à vista sem rolar. */}
    {aprovacaoPendente && <Aviso tom="atencao" icone={<Hourglass />}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0"><p className="font-semibold">Aguardando aprovação</p><p className="text-fg-secondary">{p.aprovar ? "A categoria do chamado pede aprovação antes do atendimento." : "Quem aprova decide se o chamado segue para o atendimento."}</p></div>
        {p.aprovar && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => abrirJanela("recusar")}>Recusar</Button><Button size="sm" onClick={() => abrirJanela("aprovar")}>Aprovar</Button></div>}
      </div>
    </Aviso>}
    {reaberturaPendente && <Aviso tom="atencao" icone={<RotateCcw />}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0"><p className="font-semibold">{nome(reaberturaPendente.requestedById)} pediu a reabertura em {data(reaberturaPendente.createdAt)}</p><p className="whitespace-pre-wrap break-words text-fg-secondary">{reaberturaPendente.reason}</p></div>
        {p.gerenciar && p.escrever && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => abrirJanela("recusar_reabertura")}>Recusar</Button><Button size="sm" onClick={() => abrirJanela("reabrir")}>Reabrir</Button></div>}
      </div>
    </Aviso>}

    {/* Abaixo de 1280px o cartão vem antes da conversa (antes descia para depois dela inteira), com as seções lado a lado do `md` ao `xl`. */}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-5">
        {triando ? <TriagemEmAndamento id={t.id} version={t.version} /> : triagem && <ResultadoDaTriagem triagem={triagem} pedido={t.description} podeVerOps={p.verOrquestrador} souQuemAbriu={t.createdById === eu} />}
        <Card className="p-5 space-y-4"><h2 className="text-card-title font-semibold text-fg">Solicitação</h2>
          <p className="whitespace-pre-wrap break-words text-body leading-relaxed text-fg">{t.description}</p>
          {!!Object.keys(t.requestData as Record<string, string>).length && <dl className="grid gap-x-5 gap-y-3 text-ui sm:grid-cols-2">{Object.entries(t.requestData as Record<string, string>).map(([key, valor]) => <div key={key} className="min-w-0"><dt className="text-helper text-fg-muted">{categoria?.formSchema.find(f => f.key === key)?.label ?? key}</dt><dd className="whitespace-pre-wrap break-words font-medium text-fg">{valor}</dd></div>)}</dl>}
          {!!daAbertura.length && <div className="flex flex-wrap items-center gap-2"><Paperclip size={14} aria-label="Arquivos da abertura" className="text-fg-muted" />{daAbertura.map(a => <LinkDoAnexo key={a.id} anexo={a} />)}</div>}
        </Card>
        <Card as="section" aria-labelledby="titulo-conversa" className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="titulo-conversa" className="text-card-title font-semibold text-fg">Conversa</h2>
            {temEventos && temMensagens && <SegmentedControl label="O que mostrar na conversa" active={soMensagens ? "mensagens" : "tudo"} onChange={k => setSoMensagens(k === "mensagens")} items={[{ key: "tudo", label: "Tudo" }, { key: "mensagens", label: "Só mensagens" }]} />}
          </div>
          {linha.length ? <LinhaDoTempo itens={linha} nome={nome} soMensagens={soMensagens} /> : <p className="text-ui text-fg-muted">Ainda não há mensagens.</p>}
          {/* Quem pediu, quando a equipe espera a resposta dele: o destaque acima da caixa (18/11/2026). */}
          {p.responder && souQuemPediu && aguardandoSolicitante(t.status) && <Aviso tom="atencao" icone={<MessageSquareReply />}><p className="font-semibold">A equipe espera a sua resposta.</p><p className="text-fg-secondary">Responda abaixo para o atendimento continuar.</p></Aviso>}
          {p.responder ? <div id={ID_DA_CAIXA}><CaixaDeMensagem chamado={{ id: t.id, draftId: t.draftId, version: t.version }} podeInterno={p.operar} /></div> : avisoSemCaixa}
        </Card>
        {!!t.reopenRequests.length && <Card className="p-5"><Accordion titulo="Histórico de reaberturas" classeDoCabecalho="font-semibold text-fg">{t.reopenRequests.map(r => <div key={r.id} className="my-3 space-y-2 border-b border-border pb-3 text-ui text-fg-secondary"><p className="text-helper">Pedido por {nome(r.requestedById)} em {data(r.createdAt)} · {r.status === "PENDING" ? "Pendente" : r.status === "APPROVED" ? "Aceito" : "Recusado"}</p><p className="whitespace-pre-wrap break-words">{r.reason}</p>{r.decidedById && <><p className="text-helper">Decisão de {nome(r.decidedById)}{r.decidedAt ? " em " + data(r.decidedAt) : ""}</p><p className="whitespace-pre-wrap break-words">{r.note}</p></>}</div>)}</Accordion></Card>}
      </div>
      <div className="min-w-0 max-xl:order-first">
        {/* O cartão do atendimento: a faixa do prazo (05/11/2026, opção A) e as seções (18/11/2026). */}
        <Card as="section" aria-label="Dados do atendimento" className="overflow-hidden border-grupo/30!">
          <FaixaDoPrazo painel={prazo} ciclo={ciclo?.cycleNumber ?? null} idDoTitulo="titulo-prazo" />
          <div className="grid gap-5 p-5 md:max-xl:grid-cols-3">
            <SecaoDoCartao titulo="Pessoas" salvando={salvando === "pessoas"}>
              <div className="space-y-2">
                <h3 className="text-helper font-semibold text-fg-secondary">Quem pediu</h3>
                <p className="flex min-w-0 items-center gap-2 text-ui text-fg"><Avatar nome={nome(t.createdById)} className="size-6 text-micro" /><span className="min-w-0 truncate font-medium" data-dica={nome(t.createdById)}>{nome(t.createdById)}</span><span className="shrink-0 text-helper text-fg-muted">{nomeDoSetor(t.requesterSectorCode)}</span></p>
              </div>
              <SeletorDePessoas titulo="Responsáveis" selecionados={responsaveis} nome={nome} vazio="Ninguém ainda" disabled={busy || encerrado}
                opcoes={p.gerenciar ? atendentes : atendentes.filter(u => u.id === eu)}
                onAdicionar={papel === "equipe" && !encerrado ? id => p.gerenciar ? acao("pessoas", "responsaveis", [...responsaveis, id]) : acao("pessoas", "assumir", null) : undefined}
                onRetirar={p.gerenciar && p.escrever && !encerrado ? id => acao("pessoas", "responsaveis", responsaveis.filter(r => r !== id)) : undefined} />
              {t.assignees.some(a => !usuarios.find(u => u.id === a.userId)?.atendente) && <p className="text-helper text-warning-fg">Há responsável fora do setor atual ou inativo. O gestor deve redistribuir o chamado.</p>}
              <SeletorDePessoas titulo="Participantes" selecionados={participantes} opcoes={usuarios} nome={nome} vazio="Nenhum adicional" disabled={busy || encerrado}
                onAdicionar={p.gerenciar && p.escrever && !encerrado ? id => acao("pessoas", "participantes", [...participantes, id]) : undefined}
                onRetirar={p.gerenciar && p.escrever && !encerrado ? id => acao("pessoas", "participantes", participantes.filter(r => r !== id)) : undefined} />
            </SecaoDoCartao>
            <SecaoDoCartao titulo="Classificação" salvando={salvando === "prioridade"}>
              <dl className="space-y-1.5 text-ui">
                <DadoDoChamado rotulo="Categoria">{nomeDaCategoria(categorias, t.categoryId) || t.category.name}</DadoDoChamado>
                {papel !== "equipe" || encerrado ? <DadoDoChamado rotulo="Prioridade"><Selo tom={TOM_DA_PRIORIDADE[prioridade]}>{ROTULOS_PRIORIDADE[prioridade]}</Selo></DadoDoChamado> : null}
                {variosSetores && <DadoDoChamado rotulo="Setor que atende">{nomeDoSetor(t.handlingSectorCode)}</DadoDoChamado>}
                {/* Quem encaminhou para outro setor continuar segue acompanhando (16/11/2026, funcionalidade-709). */}
                {variosSetores && t.followingSectors.length > 0 && <DadoDoChamado rotulo="Acompanham">{t.followingSectors.map(f => nomeDoSetor(f.sectorCode)).join(", ")}</DadoDoChamado>}
                {!!(t.tags as string[]).length && <DadoDoChamado rotulo="Tags">{(t.tags as string[]).join(", ")}</DadoDoChamado>}
              </dl>
              {/* A prioridade muda ali mesmo (18/11/2026), pela operação "prioridade" que já existia. */}
              {papel === "equipe" && !encerrado && <SeletorDePrioridade value={prioridade} onChange={trocarPrioridade} disabled={salvando === "prioridade"} />}
            </SecaoDoCartao>
            <SecaoDoCartao titulo="Registro">
              <dl className="space-y-1.5 text-ui">
                <DadoDoChamado rotulo="Protocolo"><span className="tabular-nums">{idCurto("chamado", t.number)}</span></DadoDoChamado>
                <DadoDoChamado rotulo="Aberto em"><span className="tabular-nums">{data(t.createdAt)}</span></DadoDoChamado>
                {ciclo && <DadoDoChamado rotulo="Prazo contado desde"><span className="tabular-nums">{data(ciclo.openedAt)}</span></DadoDoChamado>}
                {(t.approvalRequired || t.approvals.length > 0) && <DadoDoChamado rotulo="Aprovação">{t.approvalStatus === "PENDING" ? "Pendente" : t.approvalStatus === "APPROVED" ? "Aprovado" : t.approvalStatus === "REJECTED" ? "Recusado" : "Não exigida"}</DadoDoChamado>}
                {/* A cópia no Hub, só de ida (17/11/2026, funcionalidade-711). */}
                {t.hubTicketUrl ? (
                  <DadoDoChamado rotulo="No Hub">
                    <a href={t.hubTicketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      Abrir<ExternalLink size={13} aria-hidden /><span className="sr-only"> no Hub (abre em outra aba)</span>
                    </a>
                  </DadoDoChamado>
                ) : t.hubTicketId ? (
                  <DadoDoChamado rotulo="No Hub">Enviado</DadoDoChamado>
                ) : t.hubPending ? (
                  <DadoDoChamado rotulo="No Hub">
                    <span className="font-normal text-fg-muted" title={t.hubLastError ?? undefined}>
                      {t.hubAttempts >= TENTATIVAS_NO_HUB ? "Não foi enviado" : "Ainda não foi"}
                    </span>
                  </DadoDoChamado>
                ) : null}
              </dl>
              {t.approvals.filter(a => a.decidedById).map(a => <p key={a.id} className="text-helper text-fg-secondary">{a.status === "APPROVED" ? "Aprovado" : "Recusado"} por {nome(a.decidedById!)}{a.note ? `: ${a.note}` : ""}</p>)}
            </SecaoDoCartao>
          </div>
          {(mostraChecklist || p.interno) && <div className="divide-y divide-border border-t border-border px-5">
            {mostraChecklist && <Accordion chevron="fim" titulo={<span className="flex items-center gap-1.5"><ListChecks size={14} aria-hidden className="text-fg-muted" />Checklist interno<span className="ml-auto font-medium tabular-nums text-fg-secondary">{feitos} de {checklist.length}</span></span>} classeDoCabecalho={LINHA_RECOLHIVEL} classeDoConteudo="space-y-2.5 pb-4 pt-1">
              {checklist.map(i => <label key={i.id} className="flex items-start gap-2 text-ui text-fg-secondary"><Checkbox checked={i.done} disabled={busy || papel !== "equipe" || encerrado} onChange={e => { const done = e.target.checked; setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done } : item)); void executar("checklist", () => mudar(t.id, t.version, "checklist", { id: i.id, done })).then(ok => { if (!ok) setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done: !done } : item)); }); }} />{i.label}</label>)}
            </Accordion>}
            {/* A triagem é material da equipe, como as notas internas: a justificativa
                da classificação e, nos chamados de 28/10 a 10/11, a conversa com a IA. */}
            {p.interno && <Accordion chevron="fim" classeDoCabecalho={LINHA_RECOLHIVEL} classeDoConteudo="pb-4 pt-1"
              titulo={<span className="flex min-w-0 items-center gap-1.5"><ScanSearch size={14} aria-hidden className="shrink-0 text-fg-muted" /><span className="shrink-0">{t.draft.messages.length ? "Conversa da triagem" : "Triagem automática"}</span><span className="ml-auto min-w-0 truncate font-medium text-fg-secondary" data-dica={triagem?.categoria ?? undefined}>{triando ? "Rodando" : triagem ? triagem.categoria ?? "A classificar" : t.draft.messages.length ? `${t.draft.messages.length} mensagens` : "Não houve"}</span></span>}>
              {triagem && <dl className="mb-3 space-y-2 text-ui"><div><dt className="text-helper font-semibold text-fg">Classificação</dt><dd className="text-fg-secondary">{triagem.categoria ?? "A classificar"}{triagem.justificativa ? ` — ${triagem.justificativa}` : ""}</dd></div><div><dt className="text-helper font-semibold text-fg">Orquestrador</dt><dd className="text-fg-secondary">{triagem.existente ? `${triagem.existente.match === "same" ? "Já existe" : "Parecido"}: ${triagem.existente.nome}${triagem.existente.reason ? ` — ${triagem.existente.reason}` : ""}` : "Nada cadastrado faz o pedido."}</dd></div></dl>}
              {triando && <p className="mb-3 text-ui text-fg-muted">A triagem ainda está rodando.</p>}
              {!!t.draft.messages.length && <p className="mb-3 text-helper text-fg-muted">As mensagens abaixo complementam a descrição original.</p>}{t.draft.messages.map(m => <div key={m.id} className="mb-3 rounded-md bg-surface-hover p-3"><p className="text-helper font-semibold text-fg">{m.role === "user" ? "Solicitante" : "Assistente"}</p><p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{m.body}</p></div>)}{parecer.success && <div className="space-y-2 text-helper text-fg-secondary">{!resumoNaConversa && <p>{parecer.data.summary}</p>}{parecer.data.attachments.map(a => <p key={a.id}><strong>{a.name}:</strong> {a.reason}</p>)}</div>}{!t.draft.messages.length && !triagem && !triando && <p className="text-ui text-fg-muted">Chamado enviado sem triagem automática.</p>}
            </Accordion>}
          </div>}
        </Card>
      </div>
    </div>
  </div>;
}

/**
 * Os dois tipos de envio (16/11/2026, funcionalidade-709). "Continuar": o outro
 * setor faz a parte dele, e este passa a acompanhar. "Corrigir": o chamado
 * estava no setor errado, e este sai. Numa janela desde 18/11/2026.
 */
function EnviarParaOutroSetor({ destinos, salvando, erro, onFechar, onEnviar }: { destinos: Setor[]; salvando: boolean; erro: string; onFechar: () => void; onEnviar: (v: { setor: string; motivo: string; tipo: "continuar" | "corrigir" }) => void }) {
  const [tipo, setTipo] = useState<"continuar" | "corrigir">("continuar");
  const continuar = tipo === "continuar";
  return <JanelaDeAcao titulo="Enviar para outro setor" aberta salvando={salvando} erro={erro} rotulo={continuar ? "Encaminhar" : "Corrigir o setor"} onFechar={onFechar}
    onEnviar={f => onEnviar({ setor: String(f.get("setor")), motivo: String(f.get("motivo") ?? ""), tipo })}>
    <RadioGroup<"continuar" | "corrigir"> legenda="Por que enviar" variante="linha" valor={tipo} onChange={setTipo} opcoes={[
      { valor: "continuar", rotulo: "Para o outro setor continuar", descricao: "Este setor fez a parte dele e segue acompanhando o chamado." },
      { valor: "corrigir", rotulo: "O chamado está no setor errado", descricao: "Este setor sai do chamado." },
    ]} />
    <Campo label="Setor"><Select name="setor" required defaultValue=""><option value="" disabled>Selecione o setor</option>{destinos.map(st => <option key={st.code} value={st.code}>{st.label}</option>)}</Select></Campo>
    <Campo label={continuar ? "O que o outro setor precisa fazer" : "Motivo (opcional)"}><Textarea name="motivo" required={continuar} minLength={continuar ? 5 : undefined} maxLength={1000} rows={2} placeholder={continuar ? "Ex.: emitir a guia do INSS com os valores do anexo." : "Conte por que o chamado é do outro setor."} /></Campo>
    <p className="text-helper text-fg-muted">Os responsáveis atuais saem do chamado, a equipe do outro setor e quem abriu são avisados.</p>
  </JanelaDeAcao>;
}
