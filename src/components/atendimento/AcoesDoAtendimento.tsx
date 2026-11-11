"use client";

// Os painéis das ações da conversa: encaminhar (direto ou por pedido), o
// contato, encerrar e transferir, e a faixa do pedido de encaminhamento.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import type { DetalheDoAtendimento } from "@/lib/atendimento/consultas";
import { DESFECHO_OUTRO } from "@/lib/atendimento/regras";
import {
  buscarEmpresasAction,
  decidirPedidoAction,
  encaminharAction,
  encerrarAction,
  pedirEncaminhamentoAction,
  transferirAction,
  vincularContatoAction,
  type Resultado,
} from "@/app/(app)/atendimento/actions";

/** Valor do seletor que quer dizer "não sei o setor". */
const A_DEFINIR = "__a_definir__";

function useAcao(aoTerminar: () => void) {
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  function rodar(acao: () => Promise<Resultado>, sucesso: string) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      toast.success(sucesso);
      aoTerminar();
      router.refresh();
    });
  }
  return { ocupado, erro, rodar };
}

function Campo({ rotulo, htmlFor, ajuda, children }: { rotulo: string; htmlFor?: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-ui font-semibold text-fg">
        {rotulo}
      </label>
      {children}
      {ajuda && <p className="text-micro text-fg-muted">{ajuda}</p>}
    </div>
  );
}

function Erro({ erro }: { erro: string | null }) {
  return erro ? (
    <p role="alert" className="text-ui text-danger">
      {erro}
    </p>
  ) : null;
}

const Ponto = ({ cor }: { cor: string }) => <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cor }} aria-hidden />;

// ─── Encaminhar ──────────────────────────────────────────────────────────────

export function PainelDeEncaminhar({ d, aberto, aoFechar }: { d: DetalheDoAtendimento; aberto: boolean; aoFechar: () => void }) {
  const direto = d.pode.encaminharDireto;
  const opcoes = d.setores.filter((s) => s.code !== d.ciclo.setor?.code);
  // Nenhum setor marcado de saída: quem encaminha escolhe, em vez de mandar
  // para o primeiro da lista por descuido.
  const [setor, setSetor] = useState<string>("");
  const [pessoa, setPessoa] = useState("");
  const [nota, setNota] = useState("");
  const [avisar, setAvisar] = useState(true);
  /** O texto ao cliente, quando a pessoa mexeu nele; sem mexer, vale o padrão do setor escolhido. */
  const [mensagemEditada, setMensagemEditada] = useState<string | null>(null);
  const { ocupado, erro, rodar } = useAcao(aoFechar);

  const rotuloDoSetor = opcoes.find((s) => s.code === setor)?.label ?? "";
  const mensagem = mensagemEditada ?? (rotuloDoSetor ? `Vou passar para o setor ${rotuloDoSetor}, que cuida disso. Já já falam com você por aqui.` : "");
  const pessoas = direto && setor ? (d.pessoasPorSetor[setor] ?? []) : [];

  function escolherSetor(code: string) {
    setSetor(code);
    setPessoa("");
    setMensagemEditada(null);
  }

  function confirmar() {
    if (direto) {
      rodar(
        () => encaminharAction({ cicloId: d.ciclo.id, sectorCode: setor, paraUserId: pessoa || null, nota, avisarCliente: avisar && d.janela.ok ? mensagem : null }),
        `Encaminhada ao ${rotuloDoSetor}.`
      );
    } else {
      rodar(
        () => pedirEncaminhamentoAction({ cicloId: d.ciclo.id, paraSector: setor === A_DEFINIR || !setor ? null : setor, motivo: nota, avisarCliente: avisar }),
        "Pedido enviado à triagem."
      );
    }
  }

  return (
    <SlideOver open={aberto} onClose={aoFechar} title={direto ? "Encaminhar ao setor" : "Encaminhar a outro setor"} width="max-w-lg">
      <div className="flex flex-col gap-5">
        {!direto && (
          <div className="flex gap-2.5 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-3 text-ui">
            <Info size={16} className="text-brand shrink-0 mt-0.5" aria-hidden />
            <p>
              <b>A {d.setorDaTriagem.label} aprova antes.</b> Até ela aprovar, a conversa continua com você. Se não souber para onde vai, escolha “A definir”.
            </p>
          </div>
        )}

        <RadioGroup
          legenda="Para qual setor"
          name="atd-setor"
          valor={setor || null}
          onChange={escolherSetor}
          colunas="grid-cols-2"
          opcoes={[
            ...opcoes.map((s) => ({ valor: s.code, rotulo: s.label, icone: <Ponto cor={s.cor} /> })),
            ...(direto ? [] : [{ valor: A_DEFINIR, rotulo: "A definir", descricao: `Não sei qual setor. A ${d.setorDaTriagem.label} escolhe.` }]),
          ]}
        />

        {direto && setor && (
          <Campo rotulo="Para uma pessoa (opcional)" htmlFor="atd-pessoa" ajuda="Sem pessoa, a conversa fica em “Sem responsável” até alguém do setor assumir.">
            <Select id="atd-pessoa" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Ninguém: avisar o setor inteiro</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        <Campo
          rotulo={direto ? "Nota interna" : "Motivo (nota interna)"}
          htmlFor="atd-nota"
          ajuda={direto ? "Só a equipe vê. Vai junto do aviso ao setor." : "Só a equipe vê. A triagem lê antes de aprovar."}
        >
          <Textarea id="atd-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>

        <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
          <Checkbox
            id="atd-avisar"
            checked={avisar}
            onChange={(e) => setAvisar(e.target.checked)}
            label={direto ? "Avisar o cliente que a conversa mudou de setor" : "Avisar o cliente quando a triagem aprovar"}
          />
          {direto &&
            avisar &&
            (d.janela.ok ? (
              <Textarea aria-label="Mensagem ao cliente" rows={2} value={mensagem} onChange={(e) => setMensagemEditada(e.target.value)} />
            ) : (
              <p className="text-micro text-fg-muted">{d.janela.motivo}</p>
            ))}
        </div>

        {!direto && <p className="text-micro text-fg-muted">Quando é a própria triagem que encaminha, a conversa vai direto para o setor, sem pedido.</p>}

        <Erro erro={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={ocupado} loadingLabel="Enviando…" disabled={!setor || (!direto && !nota.trim())}>
            {direto ? `Encaminhar${rotuloDoSetor ? ` ao ${rotuloDoSetor}` : ""}` : "Pedir encaminhamento"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}

// ─── Pedido de encaminhamento ────────────────────────────────────────────────

export function FaixaDoPedido({ d, podeDecidir }: { d: DetalheDoAtendimento; podeDecidir: boolean }) {
  const p = d.pedido!;
  const [setor, setSetor] = useState(p.paraCode ?? "");
  const [nota, setNota] = useState("");
  const [decidindo, setDecidindo] = useState(false);
  const { ocupado, erro, rodar } = useAcao(() => setDecidindo(false));
  return (
    <div className="rounded-lg border border-warning/50 bg-warning/10 px-3.5 py-3 flex flex-col gap-2 text-ui">
      <p>
        <b>Pedido de encaminhamento.</b> {p.por} ({p.de}) pede para passar a conversa {p.para ? `ao ${p.para}` : "a outro setor (a definir)"}.
      </p>
      <p className="text-fg-secondary">“{p.motivo}”</p>
      {podeDecidir &&
        (decidindo ? (
          <div className="flex flex-col gap-2">
            {!p.paraCode && (
              <Select aria-label="Setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
                <option value="">Escolha o setor</option>
                {d.setores
                  .filter((s) => s.code !== d.ciclo.setor?.code)
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
              </Select>
            )}
            <Input aria-label="Nota (opcional)" placeholder="Nota para quem pediu (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
            <Erro erro={erro} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => rodar(() => decidirPedidoAction({ pedidoId: p.id, aprovar: true, sectorCode: setor || null, nota }), "Pedido aprovado.")} loading={ocupado} disabled={!setor}>
                Aprovar
              </Button>
              <Button size="sm" variant="danger" onClick={() => rodar(() => decidirPedidoAction({ pedidoId: p.id, aprovar: false, sectorCode: null, nota }), "Pedido recusado.")} disabled={ocupado}>
                Recusar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDecidindo(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={() => setDecidindo(true)}>
              Decidir
            </Button>
          </div>
        ))}
      {!podeDecidir && <p className="text-micro text-fg-muted">Esperando a {d.setorDaTriagem.label} decidir.</p>}
    </div>
  );
}

// ─── Contato ─────────────────────────────────────────────────────────────────

type Empresa = Awaited<ReturnType<typeof buscarEmpresasAction>>[number];

export function PainelDoContato({ d, aberto, aoFechar }: { d: DetalheDoAtendimento; aberto: boolean; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<"CLIENTE" | "NOVO">(d.contato.tipo === "NOVO" ? "NOVO" : "CLIENTE");
  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<{ termo: string; lista: Empresa[] }>({ termo: "", lista: [] });
  const [escolhida, setEscolhida] = useState<string>(d.contato.empresa?.id ?? "");
  const [nome, setNome] = useState(d.contato.nome ?? d.contato.nomeNoWhatsapp ?? "");
  const [interesse, setInteresse] = useState(d.contato.interesse ?? "Abrir empresa");
  const { ocupado, erro, rodar } = useAcao(aoFechar);

  const buscando = tipo === "CLIENTE" && termo.trim().length >= 2;
  useEffect(() => {
    if (!buscando) return;
    const pedido = termo;
    const t = window.setTimeout(async () => setAchadas({ termo: pedido, lista: await buscarEmpresasAction(pedido) }), 300);
    return () => window.clearTimeout(t);
  }, [termo, buscando]);
  const lista = buscando && achadas.termo === termo ? achadas.lista : [];

  const atual = d.contato.empresa ? { ...d.contato.empresa, temPortal: d.contato.temPortal } : null;
  const empresas = [...(atual && !lista.some((a) => a.id === atual.id) ? [atual] : []), ...lista];

  return (
    <SlideOver open={aberto} onClose={aoFechar} title="Quem é este contato?" width="max-w-lg">
      <div className="flex flex-col gap-5">
        <p className="text-ui text-fg-secondary">
          {d.contato.telefone}
          {d.contato.nomeNoWhatsapp ? ` · “${d.contato.nomeNoWhatsapp}” no WhatsApp` : ""}
        </p>

        <RadioGroup
          legenda="É de um cliente?"
          name="atd-tipo"
          valor={tipo}
          onChange={(v) => setTipo(v as "CLIENTE" | "NOVO")}
          opcoes={[
            { valor: "CLIENTE", rotulo: "Sim, ligar a uma empresa", descricao: "O telefone fica guardado; da próxima vez o Connect reconhece sozinho." },
            { valor: "NOVO", rotulo: "Não, é um contato novo", descricao: "Ainda não é cliente. Fica marcado até virar cliente." },
          ]}
        />

        {tipo === "CLIENTE" ? (
          <div className="flex flex-col gap-3">
            <Campo rotulo="Empresa" htmlFor="atd-busca-empresa">
              <Input id="atd-busca-empresa" placeholder="Nome ou CNPJ" value={termo} onChange={(e) => setTermo(e.target.value)} />
            </Campo>
            {empresas.length > 0 && (
              <RadioGroup
                aria-label="Empresas encontradas"
                name="atd-empresa"
                valor={escolhida || null}
                onChange={setEscolhida}
                opcoes={empresas.map((e) => ({
                  valor: e.id,
                  rotulo: (
                    <span className="flex items-center gap-2">
                      <span className="truncate">{e.nome}</span>
                      <Selo tom={e.temPortal ? "sucesso" : "atencao"}>{e.temPortal ? "Tem portal" : "Sem portal"}</Selo>
                    </span>
                  ),
                  descricao: e.cnpj ?? undefined,
                }))}
              />
            )}
            {buscando && achadas.termo === termo && lista.length === 0 && <p className="text-micro text-fg-muted">Nenhuma empresa com esse nome ou CNPJ.</p>}
            <p className="text-micro text-fg-muted">O convite para o portal chega no próximo passo do Atendimento; por enquanto, crie o acesso pela ficha da empresa.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nome" htmlFor="atd-nome">
              <Input id="atd-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo rotulo="Interesse" htmlFor="atd-interesse">
              <Select id="atd-interesse" value={interesse} onChange={(e) => setInteresse(e.target.value)}>
                <option>Abrir empresa</option>
                <option>Trocar de contador</option>
                <option>Outro assunto</option>
              </Select>
            </Campo>
          </div>
        )}

        <Erro erro={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            loading={ocupado}
            disabled={tipo === "CLIENTE" ? !escolhida : !nome.trim()}
            onClick={() =>
              rodar(
                () =>
                  tipo === "CLIENTE"
                    ? vincularContatoAction({ cicloId: d.ciclo.id, tipo: "CLIENTE", companyId: escolhida })
                    : vincularContatoAction({ cicloId: d.ciclo.id, tipo: "NOVO", nome, interesse }),
                "Contato atualizado."
              )
            }
          >
            {tipo === "CLIENTE" ? "Ligar à empresa" : "Salvar contato novo"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}

// ─── Encerrar ────────────────────────────────────────────────────────────────

export function JanelaDeEncerrar({ d, aberta, aoFechar }: { d: DetalheDoAtendimento; aberta: boolean; aoFechar: () => void }) {
  const [desfecho, setDesfecho] = useState(d.desfechos[0]?.id ?? DESFECHO_OUTRO);
  const [outro, setOutro] = useState("");
  const [resumo, setResumo] = useState("");
  const [despedir, setDespedir] = useState(d.janela.ok);
  const nome = (d.contato.nome ?? d.contato.nomeNoWhatsapp ?? "").split(/\s+/)[0];
  const [despedida, setDespedida] = useState(`${nome ? `${nome}, vou` : "Vou"} encerrar por aqui. Se precisar de mais alguma coisa, é só mandar mensagem neste número.`);
  const { ocupado, erro, rodar } = useAcao(aoFechar);

  return (
    <Modal open={aberta} onClose={aoFechar} title="Encerrar atendimento" maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        <Campo rotulo="Desfecho" htmlFor="atd-desfecho" ajuda="A lista vem das configurações do Atendimento. Escolha “Outro” para escrever um que não está nela.">
          <Select id="atd-desfecho" value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
            {d.desfechos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
            <option value={DESFECHO_OUTRO}>Outro</option>
          </Select>
        </Campo>
        {desfecho === DESFECHO_OUTRO && (
          <Campo rotulo="Qual foi o desfecho?" htmlFor="atd-desfecho-outro">
            <Input id="atd-desfecho-outro" value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="Escreva em poucas palavras" maxLength={120} />
          </Campo>
        )}
        <Campo rotulo="Resumo (opcional)" htmlFor="atd-resumo" ajuda="Fica no histórico do atendimento.">
          <Textarea id="atd-resumo" rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} />
        </Campo>
        <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3.5">
          <Checkbox id="atd-despedida" checked={despedir} disabled={!d.janela.ok} onChange={(e) => setDespedir(e.target.checked)} label="Mandar uma mensagem de despedida" />
          {d.janela.ok ? (
            despedir && <Textarea aria-label="Mensagem de despedida" rows={2} value={despedida} onChange={(e) => setDespedida(e.target.value)} />
          ) : (
            <p className="text-micro text-fg-muted">{d.janela.motivo}</p>
          )}
        </div>
        <Erro erro={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={aoFechar}>
            Voltar à conversa
          </Button>
          <Button
            loading={ocupado}
            loadingLabel="Encerrando…"
            disabled={desfecho === DESFECHO_OUTRO && !outro.trim()}
            onClick={() =>
              rodar(() => encerrarAction({ cicloId: d.ciclo.id, desfechoId: desfecho, desfechoOutro: outro, resumo, despedida: despedir && d.janela.ok ? despedida : null }), "Atendimento encerrado.")
            }
          >
            Encerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Transferir ──────────────────────────────────────────────────────────────

export function JanelaDeTransferir({ d, aberta, aoFechar }: { d: DetalheDoAtendimento; aberta: boolean; aoFechar: () => void }) {
  const [para, setPara] = useState(d.pessoasDoSetor[0]?.id ?? "");
  const { ocupado, erro, rodar } = useAcao(aoFechar);
  const setor = d.ciclo.setor?.label ?? d.setorDaTriagem.label;
  return (
    <Modal open={aberta} onClose={aoFechar} title="Transferir conversa" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <Campo rotulo={`Para quem do ${setor}`} htmlFor="atd-transferir" ajuda="Para outro setor, use Encaminhar.">
          <Select id="atd-transferir" value={para} onChange={(e) => setPara(e.target.value)}>
            {d.pessoasDoSetor.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </Campo>
        <p className="flex items-center gap-1.5 text-micro text-fg-muted">
          <Lock size={12} aria-hidden /> A pessoa recebe um aviso e passa a assinar as respostas.
        </p>
        <Erro erro={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button loading={ocupado} disabled={!para} onClick={() => rodar(() => transferirAction(d.ciclo.id, para), "Conversa transferida.")}>
            Transferir
          </Button>
        </div>
      </div>
    </Modal>
  );
}
