"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Briefcase,
  CircleDot,
  FileText,
  Hand,
  Link2,
  Phone,
  Send,
  Undo2,
  Unlink,
  User,
  UserRound,
  Users,
  XCircle,
  Gauge,
} from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { AcaoRapida, BarraDoPainel, LinhasDeInfo, PainelDeConversa } from "@/components/conversas/caixa/Caixa";
import { AbasDoPainel, RolarParaOFim } from "@/components/conversas/caixa/Interativos";
import { formatInstantDateTime } from "@/lib/format";
import {
  situacaoDaConversa,
  podeResponder,
  podeDevolverAoRobo,
  podeAssumir,
  podeSoltar,
  podeEncerrar,
  podeTransferir,
  telefoneLegivel,
  SITUACAO_LABEL,
  SITUACAO_TOM,
} from "@/lib/whatsapp/conversas";
import {
  responderConversa,
  devolverAoRobo,
  assumirConversa,
  soltarConversa,
  encerrarAtendimento,
  transferirConversa,
  vincularCandidatura,
  desvincularCandidatura,
  type AcaoNaConversa,
} from "@/app/(app)/whatsapp/actions";
import type { ConversaDetalhada } from "@/lib/whatsapp/data";
import type { PessoaDoAtendimento } from "@/lib/whatsapp/equipe";
import { DESFECHOS, DESFECHOS_DA_TELA, rotuloDoDesfecho } from "@/lib/whatsapp/atendimentos";
import { ROTULO_DA_FAIXA } from "@/lib/recrutamento/triagem";
import { FichaNaConversa } from "./FichaNaConversa";

type Props = {
  conversa: ConversaDetalhada;
  agora: Date;
  /** Candidaturas em andamento, para ligar a conversa a uma pessoa. */
  candidaturas: { id: string; rotulo: string }[];
  /** Quem está olhando — decide entre "Assumir" e "Soltar". */
  userId: string;
  /** Para quem dá para transferir — quem atende o WhatsApp do setor. */
  pessoas: PessoaDoAtendimento[];
  /** Fechar (volta à lista) e a anterior/próxima da lista, para o ↑↓. */
  navegacao: { fechar: string; anterior: string | null; proxima: string | null };
};

/**
 * Uma conversa do WhatsApp do Recrutamento no painel da caixa de conversas
 * (09/10/2026): as ações de sempre — assumir, transferir, encerrar, devolver
 * ao assistente, ligar à candidatura, responder — com o desenho novo.
 */
export function Conversa({ conversa, agora, candidaturas, userId, pessoas, navegacao }: Props) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [escolhida, setEscolhida] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [desfecho, setDesfecho] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const [paraQuem, setParaQuem] = useState("");

  const situacao = situacaoDaConversa(conversa, agora);
  const resposta = podeResponder(conversa, agora);
  const devolucao = podeDevolverAoRobo(conversa);
  const assumir = podeAssumir({ optedOutAt: conversa.optedOutAt, assignedToId: conversa.responsavel?.id ?? null }, userId);
  const soltar = podeSoltar({ assignedToId: conversa.responsavel?.id ?? null }, userId);
  const encerrar = podeEncerrar(conversa);
  // Para quem dá: todo mundo do atendimento menos quem já está com ela.
  const destinos = pessoas.filter((p) => podeTransferir({ ...conversa, assignedToId: conversa.responsavel?.id ?? null }, p.id).pode);
  const ultimoEncerramento = conversa.encerramentos.at(-1) ?? null;
  const telefone = telefoneLegivel(conversa.waPhone);

  async function correr(fn: () => Promise<AcaoNaConversa>, limparTexto = false) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    if (r && "error" in r) setErro(r.error);
    else if (limparTexto) setTexto("");
    setOcupado(false);
  }

  const comQuem = conversa.responsavel ? (
    conversa.responsavel.id === userId ? (
      "Com você"
    ) : (
      `Com ${conversa.responsavel.nome}`
    )
  ) : conversa.handoffAt && !conversa.optedOutAt ? (
    <span className="text-danger font-medium">Ninguém assumiu</span>
  ) : (
    "Com o assistente"
  );

  // O que sai do topo: os secundários vão para o "…" da barra.
  const temMenu = soltar.pode || devolucao.pode || !!conversa.candidaturaId;
  const menu = temMenu ? (
    <MenuDeMaisAcoes rotulo="Mais ações da conversa" size="md">
      {({ close }) => (
        <>
          {soltar.pode && (
            <ItemDoMenu
              icone={<Hand />}
              disabled={ocupado}
              onClick={() => {
                close();
                void correr(() => soltarConversa(conversa.id));
              }}
            >
              Soltar a conversa
            </ItemDoMenu>
          )}
          {devolucao.pode && (
            <ItemDoMenu
              icone={<Undo2 />}
              disabled={ocupado}
              onClick={() => {
                close();
                void correr(() => devolverAoRobo(conversa.id));
              }}
            >
              Devolver ao assistente
            </ItemDoMenu>
          )}
          {conversa.candidaturaId && (
            <ItemDoMenu
              icone={<Unlink />}
              disabled={ocupado}
              onClick={() => {
                close();
                void correr(() => desvincularCandidatura(conversa.id));
              }}
            >
              Desfazer o vínculo com a candidatura
            </ItemDoMenu>
          )}
        </>
      )}
    </MenuDeMaisAcoes>
  ) : null;

  const acoes = (
    <>
      {assumir.pode && (
        <AcaoRapida icone={<Hand />} tom="marca" disabled={ocupado} onClick={() => correr(() => assumirConversa(conversa.id))}>
          Assumir
        </AcaoRapida>
      )}
      {destinos.length > 0 && (
        <AcaoRapida icone={<Users />} disabled={ocupado} onClick={() => setTransferindo((v) => !v)}>
          Transferir
        </AcaoRapida>
      )}
      {encerrar.pode && (
        <AcaoRapida icone={<XCircle />} disabled={ocupado} onClick={() => setEncerrando((v) => !v)}>
          Encerrar atendimento
        </AcaoRapida>
      )}
      {conversa.ficha && (
        <AcaoRapida icone={<ArrowRight />} href={`/vagas/${conversa.ficha.vagaId}/candidaturas/${conversa.ficha.candidaturaId}`}>
          Abrir candidatura
        </AcaoRapida>
      )}
    </>
  );

  const paineisDeAcao = (
    <div className="flex flex-col gap-3">
      {conversa.handoffReason && (
        <Aviso tom="atencao" icone={<AlertTriangle />}>
          O assistente passou para você: {conversa.handoffReason}
        </Aviso>
      )}
      {erro && <Aviso>{erro}</Aviso>}

      {transferindo && (
        <div className="bg-surface-hover border border-border rounded-md p-3">
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]">
            <CampoForm
              label="Passar esta conversa para"
              htmlFor="transferir-para"
              helper="Nada é enviado ao candidato. A conversa passa a ser de quem recebe, e essa pessoa é avisada no sino."
            >
              <Select id="transferir-para" value={paraQuem} onChange={(e) => setParaQuem(e.target.value)}>
                <option value="">Selecione…</option>
                {destinos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === userId ? `${p.nome} (você)` : p.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <AlinhadoAoCampo>
              <Button
                variant="secondary"
                disabled={ocupado}
                onClick={() => {
                  setTransferindo(false);
                  setParaQuem("");
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={ocupado || !paraQuem}
                onClick={() =>
                  correr(async () => {
                    const r = await transferirConversa(conversa.id, paraQuem);
                    if (r && "success" in r) {
                      setTransferindo(false);
                      setParaQuem("");
                    }
                    return r;
                  })
                }
              >
                Transferir
              </Button>
            </AlinhadoAoCampo>
          </FieldGrid>
        </div>
      )}

      {encerrando && (
        <div className="bg-surface-hover border border-border rounded-md p-3">
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]">
            <CampoForm
              label="Como terminou este atendimento?"
              htmlFor="desfecho"
              helper="Nada é enviado ao candidato. A conversa volta ao assistente, sem responsável, e a próxima mensagem dele abre um novo atendimento."
            >
              <Select id="desfecho" value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
                <option value="">Selecione…</option>
                {DESFECHOS_DA_TELA.map((d) => (
                  <option key={d} value={d}>
                    {DESFECHOS[d]}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <AlinhadoAoCampo>
              <Button
                variant="secondary"
                disabled={ocupado}
                onClick={() => {
                  setEncerrando(false);
                  setDesfecho("");
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={ocupado || !desfecho}
                onClick={() =>
                  correr(async () => {
                    const r = await encerrarAtendimento(conversa.id, desfecho);
                    if (r && "success" in r) {
                      setEncerrando(false);
                      setDesfecho("");
                    }
                    return r;
                  })
                }
              >
                Encerrar
              </Button>
            </AlinhadoAoCampo>
          </FieldGrid>
        </div>
      )}
    </div>
  );

  const temAviso = !!conversa.handoffReason || !!erro || transferindo || encerrando;

  const infos = (
    <LinhasDeInfo
      itens={[
        { icone: <Phone />, rotulo: "Telefone", valor: <span className="tabular-nums">{telefone}</span>, copiar: telefone },
        { icone: <Briefcase />, rotulo: "Vaga", valor: conversa.vaga ?? <span className="text-fg-muted">sem vaga ligada</span> },
        { icone: <UserRound />, rotulo: "Responsável", valor: comQuem },
        {
          icone: <Gauge />,
          rotulo: "Triagem",
          valor: conversa.ficha?.nota ? (
            <span className="tabular-nums">
              {conversa.ficha.nota.score} · {ROTULO_DA_FAIXA[conversa.ficha.nota.faixa]}
            </span>
          ) : (
            <span className="text-fg-muted">{conversa.candidaturaId ? "sem nota ainda" : "—"}</span>
          ),
        },
        {
          icone: <CircleDot />,
          rotulo: "Situação",
          valor: <Selo tom={SITUACAO_TOM[situacao]}>{SITUACAO_LABEL[situacao]}</Selo>,
        },
      ]}
    />
  );

  const abaConversa = (
    <div className="flex flex-col gap-3">
      <RolarParaOFim quantas={conversa.mensagens.length} className="max-h-[min(28rem,55dvh)] flex flex-col gap-2 pr-1">
        {conversa.mensagens.length === 0 ? (
          <p className="text-ui text-fg-muted py-6 text-center">Nenhuma mensagem ainda.</p>
        ) : (
          comMarcasDeEncerramento(conversa, (m) => {
            const minha = m.direction === "SAIDA";
            return (
              <div key={m.id} className={minha ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}>
                <div
                  className={`rounded-2xl px-3.5 py-2 text-ui whitespace-pre-wrap ${
                    minha
                      ? m.status === "BLOQUEADA"
                        ? "bg-warning-bg border border-warning/30 text-fg rounded-br-md"
                        : "bg-brand/10 border border-brand/20 text-fg rounded-br-md"
                      : "bg-surface-2 border border-border text-fg rounded-bl-md"
                  }`}
                >
                  {m.body}
                  {m.anexo && (
                    <a href={`/api/whatsapp/midia/${m.id}`} className="mt-1 flex items-center gap-1 text-fs-2 text-brand hover:underline">
                      <FileText size={12} /> Baixar {m.anexo.nome}
                    </a>
                  )}
                </div>
                <p className={`text-micro text-fg-muted mt-0.5 flex items-center gap-1 ${minha ? "justify-end" : ""}`}>
                  {minha &&
                    (m.doRobo ? (
                      <>
                        <Bot size={10} /> assistente ·
                      </>
                    ) : (
                      <>
                        <User size={10} /> time ·
                      </>
                    ))}
                  {formatInstantDateTime(m.createdAt)}
                  {/* Bloqueada é o rascunho que o robô ia mandar e não mandou —
                      quem assumiu aproveita ou descarta sabendo. */}
                  {m.status === "BLOQUEADA" && <span className="text-warning-fg">· não enviada</span>}
                  {m.status === "FALHOU" && <span className="text-danger">· falhou</span>}
                </p>
                {m.error && <p className={`text-micro ${m.status === "FALHOU" ? "text-danger" : "text-fg-muted"}`}>motivo: {m.error}</p>}
              </div>
            );
          })
        )}
      </RolarParaOFim>

      {situacao === "encerrada" && ultimoEncerramento && (
        <p className="text-fs-2 text-fg-secondary">
          Atendimento encerrado{ultimoEncerramento.por ? ` por ${ultimoEncerramento.por}` : ""} em {formatInstantDateTime(ultimoEncerramento.em)} ·{" "}
          {rotuloDoDesfecho(ultimoEncerramento.desfecho)}. A próxima mensagem do candidato abre um novo atendimento com o assistente.
        </p>
      )}

      {resposta.pode ? (
        <div className="rounded-lg border border-border bg-surface focus-within:border-brand/50 transition-colors">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl+Enter envia; Enter sozinho quebra a linha, como antes.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && texto.trim() && !ocupado) {
                e.preventDefault();
                void correr(() => responderConversa(conversa.id, texto), true);
              }
            }}
            placeholder="Escreva para o candidato…"
            rows={3}
            aria-label="Resposta ao candidato"
            className="border-0 shadow-none focus:ring-0 resize-none"
          />
          <div className="flex flex-wrap items-center justify-end gap-3 px-3 pb-2.5">
            <p className="mr-auto min-w-0 text-micro text-fg-muted">
              {situacao === "encerrada"
                ? "Responder abre um novo atendimento e assume a conversa."
                : "Responder assume a conversa — o assistente para de responder aqui."}{" "}
              Ctrl+Enter envia.
            </p>
            <Button size="sm" disabled={ocupado || !texto.trim()} onClick={() => correr(() => responderConversa(conversa.id, texto), true)}>
              <Send size={14} /> {ocupado ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-ui text-fg-secondary rounded-lg bg-surface-2 px-3 py-2">{resposta.motivo}</p>
      )}
    </div>
  );

  // O vínculo é o que faz o assistente saber de quem está falando. Telefone
  // sozinho é palpite — palpite errado mostra o processo de uma pessoa para
  // outra —, então o robô só liga sozinho quando o candidato confirma o nome
  // (`src/lib/whatsapp/vinculo.ts`). Fora disso, é de gente: aqui.
  const abaCandidatura = conversa.candidaturaId ? (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-fs-2 text-fg-secondary">
        <Link2 size={13} /> Ligada a uma candidatura. Para desfazer, use o “…” no topo.
      </p>
      {conversa.ficha ? <FichaNaConversa ficha={conversa.ficha} /> : <p className="text-ui text-fg-muted">A candidatura não está mais disponível.</p>}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {conversa.vinculoAutomatico === "confirmando" && (
        <p className="text-fs-2 text-fg-muted">O assistente achou uma inscrição com este telefone e pediu o nome completo para confirmar.</p>
      )}
      {conversa.vinculoAutomatico === "nao_confirmou" && (
        <p className="text-fs-2 text-warning-fg">O vínculo automático não confirmou quem é (ou foi desfeito). Só se liga à mão.</p>
      )}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]">
        <CampoForm label="Quem é esta pessoa?" htmlFor="vinculo" helper="O assistente só consulta o processo depois disto.">
          <Select id="vinculo" value={escolhida} onChange={(e) => setEscolhida(e.target.value)}>
            <option value="">Selecione a candidatura…</option>
            {candidaturas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
        </CampoForm>
        <AlinhadoAoCampo>
          <Button variant="secondary" disabled={ocupado || !escolhida} onClick={() => correr(() => vincularCandidatura(conversa.id, escolhida))}>
            Ligar
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
    </div>
  );

  const abaHistorico =
    conversa.encerramentos.length === 0 ? (
      <p className="text-ui text-fg-muted">Nenhum atendimento encerrado nesta conversa ainda.</p>
    ) : (
      <ol className="flex flex-col gap-2">
        {[...conversa.encerramentos].reverse().map((e, i) => (
          <li key={i} className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
            <XCircle size={15} className="text-fg-muted mt-0.5 shrink-0" />
            <div className="min-w-0 text-ui">
              <p className="text-fg">{rotuloDoDesfecho(e.desfecho)}</p>
              <p className="text-micro text-fg-muted">
                {formatInstantDateTime(e.em)}
                {e.por ? ` · por ${e.por}` : " · o candidato pediu para parar"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    );

  const ultima = conversa.mensagens.at(-1)?.createdAt ?? conversa.ultimaMensagemEm;

  return (
    <PainelDeConversa
      barra={
        <BarraDoPainel
          fecharHref={navegacao.fechar}
          anteriorHref={navegacao.anterior}
          proximaHref={navegacao.proxima}
          data={ultima ? `Última mensagem: ${formatInstantDateTime(ultima)}` : null}
          direita={menu}
        />
      }
      etiquetas={[
        <Selo key="s" tom={SITUACAO_TOM[situacao]}>
          {SITUACAO_LABEL[situacao]}
        </Selo>,
        conversa.vaga ? <span key="v">{conversa.vaga}</span> : null,
        <span key="r">{comQuem}</span>,
      ]}
      titulo={conversa.nome ?? telefone}
      subtitulo={conversa.nome ? <span className="tabular-nums">{telefone}</span> : null}
      acoes={acoes}
      aviso={temAviso ? paineisDeAcao : undefined}
      infos={infos}
    >
      <AbasDoPainel
        abas={[
          { chave: "conversa", rotulo: `Conversa (${conversa.mensagens.length})`, conteudo: abaConversa },
          { chave: "candidatura", rotulo: conversa.candidaturaId ? "Candidatura" : "Ligar à candidatura", conteudo: abaCandidatura },
          { chave: "historico", rotulo: `Atendimentos encerrados (${conversa.encerramentos.length})`, conteudo: abaHistorico },
        ]}
      />
    </PainelDeConversa>
  );
}

type Mensagem = ConversaDetalhada["mensagens"][number];

/**
 * As mensagens com uma linha onde cada atendimento terminou: é o que mostra,
 * numa conversa longa, que o "oi" de hoje abriu um atendimento novo.
 */
function comMarcasDeEncerramento(conversa: ConversaDetalhada, mensagem: (m: Mensagem) => ReactNode): ReactNode[] {
  const marcas = conversa.encerramentos;
  const itens: ReactNode[] = [];
  let k = 0;
  const marca = (i: number) => {
    const e = marcas[i]!;
    return (
      <div key={`fim-${i}`} className="flex items-center gap-2 my-1 text-micro text-fg-muted" role="separator">
        <span className="h-px flex-1 bg-border" />
        Atendimento encerrado · {rotuloDoDesfecho(e.desfecho)}
        {e.por ? ` · por ${e.por}` : ""} · {formatInstantDateTime(e.em)}
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  };
  for (const m of conversa.mensagens) {
    while (k < marcas.length && marcas[k]!.em <= m.createdAt) itens.push(marca(k++));
    itens.push(mensagem(m));
  }
  while (k < marcas.length) itens.push(marca(k++));
  return itens;
}
