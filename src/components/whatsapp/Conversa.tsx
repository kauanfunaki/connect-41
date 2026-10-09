"use client";

import { useState, type ReactNode } from "react";
import { Bot, User, AlertTriangle, Link2, Unlink, FileText } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
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
import { FichaNaConversa } from "./FichaNaConversa";
import { Aviso } from "@/components/ui/Aviso";

type Props = {
  conversa: ConversaDetalhada;
  agora: Date;
  /** Candidaturas em andamento, para ligar a conversa a uma pessoa. */
  candidaturas: { id: string; rotulo: string }[];
  /** Quem está olhando — decide entre "Assumir" e "Soltar". */
  userId: string;
  /** Para quem dá para transferir — quem atende o WhatsApp do setor. */
  pessoas: PessoaDoAtendimento[];
};

export function Conversa({ conversa, agora, candidaturas, userId, pessoas }: Props) {
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

  function fecharPainel() {
    setEncerrando(false);
    setDesfecho("");
  }

  async function correr(fn: () => Promise<AcaoNaConversa>, limparTexto = false) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    if (r && "error" in r) setErro(r.error);
    else if (limparTexto) setTexto("");
    setOcupado(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-card-title font-semibold text-fg">
                {conversa.nome ?? telefoneLegivel(conversa.waPhone)}
              </h2>
              <Selo tom={SITUACAO_TOM[situacao]}>{SITUACAO_LABEL[situacao]}</Selo>
            </div>
            <p className="text-fs-2 text-fg-muted mt-0.5">
              {telefoneLegivel(conversa.waPhone)}
              {conversa.vaga && ` · ${conversa.vaga}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conversa.responsavel ? (
              <span className="text-fs-2 text-fg-secondary">
                {conversa.responsavel.id === userId ? "Com você" : `Com ${conversa.responsavel.nome}`}
              </span>
            ) : (
              conversa.handoffAt &&
              !conversa.optedOutAt && <span className="text-fs-2 text-danger font-medium">Ninguém assumiu</span>
            )}
            {assumir.pode && (
              <Button size="sm" disabled={ocupado} onClick={() => correr(() => assumirConversa(conversa.id))}>
                Assumir
              </Button>
            )}
            {/* "Soltar" e o "Cancelar" do encerramento eram texto cinza, e o
                "desfazer" do vínculo, texto azul (30/09): botão não é link. Só
                o desenho mudou — as ações são as mesmas. */}
            {soltar.pode && (
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => correr(() => soltarConversa(conversa.id))}>
                Soltar
              </Button>
            )}
            {devolucao.pode && (
              <Button
                variant="secondary"
                size="sm"
                disabled={ocupado}
                onClick={() => correr(() => devolverAoRobo(conversa.id))}
              >
                Devolver ao assistente
              </Button>
            )}
            {destinos.length > 0 && !transferindo && (
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => setTransferindo(true)}>
                Transferir
              </Button>
            )}
            {encerrar.pode && !encerrando && (
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => setEncerrando(true)}>
                Encerrar atendimento
              </Button>
            )}
          </div>
        </div>

        {conversa.handoffReason && (
          <Aviso tom="atencao" icone={<AlertTriangle />}>
            O assistente passou para você: {conversa.handoffReason}
          </Aviso>
        )}

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

        {/* O select (h-9) e os botões na mesma altura: os botões eram `sm`
            (h-8) presos no fundo da linha, e o rótulo era um texto de 11px à
            mão. O aviso virou o texto de ajuda do campo. */}
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
                <Button variant="secondary" disabled={ocupado} onClick={fecharPainel}>
                  Cancelar
                </Button>
                <Button
                  disabled={ocupado || !desfecho}
                  onClick={() =>
                    correr(async () => {
                      const r = await encerrarAtendimento(conversa.id, desfecho);
                      if (r && "success" in r) fecharPainel();
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

        {situacao === "encerrada" && ultimoEncerramento && (
          <p className="text-fs-2 text-fg-secondary">
            Atendimento encerrado{ultimoEncerramento.por ? ` por ${ultimoEncerramento.por}` : ""} em{" "}
            {formatInstantDateTime(ultimoEncerramento.em)} · {rotuloDoDesfecho(ultimoEncerramento.desfecho)}. A próxima
            mensagem do candidato abre um novo atendimento com o assistente.
          </p>
        )}

        {/* O vínculo é o que faz o assistente saber de quem está falando.
            Telefone sozinho é palpite — palpite errado mostra o processo de
            uma pessoa para outra —, então o robô só liga sozinho quando o
            candidato confirma o nome (`src/lib/whatsapp/vinculo.ts`). Fora
            disso, é de gente: aqui. */}
        {conversa.candidaturaId ? (
          <div className="flex flex-wrap items-center gap-2 text-fs-2 text-fg-secondary">
            <Link2 size={13} />
            Ligada a uma candidatura.
            <Button
              variant="secondary"
              size="xs"
              disabled={ocupado}
              onClick={() => correr(() => desvincularCandidatura(conversa.id))}
            >
              <Unlink size={11} /> desfazer
            </Button>
            {conversa.ficha && <FichaNaConversa ficha={conversa.ficha} />}
          </div>
        ) : (
          <>
          {conversa.vinculoAutomatico === "confirmando" && (
            <p className="text-fs-2 text-fg-muted">
              O assistente achou uma inscrição com este telefone e pediu o nome completo para confirmar.
            </p>
          )}
          {conversa.vinculoAutomatico === "nao_confirmou" && (
            <p className="text-fs-2 text-warning-fg">
              O vínculo automático não confirmou quem é (ou foi desfeito). Só se liga à mão.
            </p>
          )}
          {/* Rótulo curto e a explicação no texto de ajuda: a frase inteira
              como rótulo quebrava em duas linhas no celular. */}
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]">
            <CampoForm label="Quem é esta pessoa?" htmlFor="vinculo" helper="O assistente só consulta o processo depois disto.">
              <Select
                id="vinculo"
                value={escolhida}
                onChange={(e) => setEscolhida(e.target.value)}
              >
                <option value="">Selecione a candidatura…</option>
                {candidaturas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <AlinhadoAoCampo>
              <Button
                variant="secondary"
                disabled={ocupado || !escolhida}
                onClick={() => correr(() => vincularCandidatura(conversa.id, escolhida))}
              >
                Ligar
              </Button>
            </AlinhadoAoCampo>
          </FieldGrid>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto">
          {comMarcasDeEncerramento(conversa, (m) => {
            const minha = m.direction === "SAIDA";
            return (
              <div key={m.id} className={minha ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}>
                <div
                  className={`rounded-lg px-3 py-2 text-ui whitespace-pre-wrap ${
                    minha
                      ? m.status === "BLOQUEADA"
                        ? "bg-warning-bg border border-warning/30 text-fg"
                        : "bg-brand/10 border border-brand/20 text-fg"
                      : "bg-surface-hover border border-border text-fg"
                  }`}
                >
                  {m.body}
                  {m.anexo && (
                    <a
                      href={`/api/whatsapp/midia/${m.id}`}
                      className="mt-1 flex items-center gap-1 text-fs-2 text-brand hover:underline"
                    >
                      <FileText size={12} /> Baixar {m.anexo.nome}
                    </a>
                  )}
                </div>
                <p className="text-micro text-fg-muted mt-0.5 flex items-center gap-1">
                  {minha &&
                    (m.doRobo ? (
                      <>
                        <Bot size={10} /> assistente
                      </>
                    ) : (
                      <>
                        <User size={10} /> time
                      </>
                    ))}
                  {formatInstantDateTime(m.createdAt)}
                  {/* Bloqueada é o rascunho que o robô ia mandar e não mandou.
                      Mostrar é o que permite a quem assumiu aproveitar ou
                      descartar com conhecimento de causa. */}
                  {m.status === "BLOQUEADA" && <span className="text-warning-fg">· não enviada</span>}
                  {m.status === "FALHOU" && <span className="text-danger">· falhou</span>}
                </p>
                {/* O motivo aparece também na falha de envio: é justamente o
                    caso em que quem olha precisa saber o que o provedor
                    respondeu, e o log do container nem sempre está à mão. */}
                {m.error && (
                  <p className={`text-micro ${m.status === "FALHOU" ? "text-danger" : "text-fg-muted"}`}>
                    motivo: {m.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        {erro && (
          <Aviso>
            {erro}
          </Aviso>
        )}
        {resposta.pode ? (
          <>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva para o candidato…"
              rows={3}
              aria-label="Resposta ao candidato"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <p className="mr-auto min-w-0 text-micro text-fg-muted">
                {situacao === "encerrada"
                  ? "Responder abre um novo atendimento e assume a conversa."
                  : "Responder assume a conversa — o assistente para de responder aqui."}
              </p>
              <Button
                disabled={ocupado || !texto.trim()}
                onClick={() => correr(() => responderConversa(conversa.id, texto), true)}
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-ui text-fg-secondary">{resposta.motivo}</p>
        )}
      </Card>
    </div>
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
