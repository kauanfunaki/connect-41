"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Info, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Selo } from "@/components/ui/Selo";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoHora } from "@/components/ui/CampoHora";
import { useToast } from "@/components/ui/Toast";
import {
  criarDesfechoAction,
  editarDesfechoAction,
  removerMensagemPadraoAction,
  reordenarDesfechosAction,
  salvarConfiguracaoAction,
  salvarMensagemPadraoAction,
  salvarModeloAction,
  removerModeloAction,
  type Resultado,
} from "@/app/(app)/atendimento/actions";

type Conexao = { id: string; rotulo: string; ligada: boolean; erro: string | null };
type Config = {
  integrationId: string | null;
  diasDaSemana: number[];
  abreAs: string;
  fechaAs: string;
  boasVindas: string;
  foraDoHorario: string;
  respostasAutomaticas: boolean;
  diasParaReabrir: number;
  setores: string[];
  ceciLigada: boolean;
};
type Setor = { code: string; label: string; cor: string };
type Desfecho = { id: string; label: string; ativo: boolean; ordem: number };
type Modelo = { id: string; rotulo: string; nomeNaMeta: string; idioma: string; texto: string; ativo: boolean };
type Mensagem = { id: string; titulo: string; sectorCode: string | null; texto: string; ativo: boolean };

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function useAcao() {
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return {
    ocupado,
    rodar(acao: () => Promise<Resultado>, sucesso?: string, depois?: () => void) {
      iniciar(async () => {
        const r = await acao();
        if (!r.ok) toast.error(r.erro);
        else {
          if (sucesso) toast.success(sucesso);
          depois?.();
          router.refresh();
        }
      });
    },
  };
}

/** Uma seção: o rótulo à esquerda e o conteúdo à direita (as seções em duas colunas do Connect). */
function Bloco({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-wrap gap-6 py-5 border-t border-border first:border-t-0">
      <div className="basis-56 grow max-w-72 flex flex-col gap-1">
        <h2 className="text-card-title font-semibold text-fg">{titulo}</h2>
        <p className="text-ui text-fg-muted">{texto}</p>
      </div>
      <div className="basis-[26rem] grow-[999] min-w-0 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function ConfiguracoesDoAtendimento(p: {
  triagem: string;
  conexoes: Conexao[];
  config: Config;
  setores: Setor[];
  desfechos: Desfecho[];
  mensagens: Mensagem[];
  modelos: Modelo[];
}) {
  const [c, setC] = useState<Config>(p.config);
  const { ocupado, rodar } = useAcao();
  const mudar = (x: Partial<Config>) => setC((a) => ({ ...a, ...x }));

  return (
    <div className="max-w-5xl flex flex-col">
      <Bloco titulo="Número" texto="A conexão do WhatsApp do escritório. Cadastre em Integrações e escolha aqui.">
        {p.conexoes.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-ui">
            <span className="flex-1">Nenhuma conexão do Atendimento ainda.</span>
            <Button href="/admin/integracoes?integracao=whatsapp_atendimento" variant="secondary" size="sm">
              Abrir Integrações
            </Button>
          </div>
        ) : (
          <Select aria-label="Conexão do número" value={c.integrationId ?? ""} onChange={(e) => mudar({ integrationId: e.target.value || null })}>
            <option value="">Qualquer conexão ligada do Atendimento</option>
            {p.conexoes.map((x) => (
              <option key={x.id} value={x.id} disabled={!x.ligada}>
                {x.rotulo}
                {x.ligada ? "" : " (desligada)"}
              </option>
            ))}
          </Select>
        )}
        {p.conexoes.some((x) => x.erro) && <p className="text-micro text-danger">Último erro: {p.conexoes.find((x) => x.erro)!.erro}</p>}
      </Bloco>

      <Bloco titulo="Entrada" texto="Toda conversa nova chega na triagem.">
        <p className="flex gap-2 text-ui text-fg-secondary">
          <Info size={16} className="text-brand shrink-0 mt-0.5" aria-hidden />
          Toda conversa nova chega na triagem da {p.triagem}. Quando um setor pede para passar a conversa a outro, o pedido vai para a {p.triagem} aprovar; “A definir” deixa a
          {` ${p.triagem}`} escolher.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <label htmlFor="atd-reabrir">Volta para a mesma pessoa até</label>
          <Input id="atd-reabrir" type="number" min={0} max={60} value={c.diasParaReabrir} onChange={(e) => mudar({ diasParaReabrir: Number(e.target.value) })} className="w-20" />
          <span>dias depois de encerrada</span>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <Checkbox
            id="atd-ceci"
            checked={c.ceciLigada}
            onChange={(e) => mudar({ ceciLigada: e.target.checked })}
            label="Ceci registra uma sugestão de setor em cada triagem"
            helper="Ninguém vê a sugestão na conversa. Ela fica guardada ao lado do setor que a triagem escolheu, para medir se a Ceci está aprendendo. A medição chega numa próxima versão."
          />
        </div>
      </Bloco>

      <Bloco titulo="Setores que atendem" texto="Aparecem no “Encaminhar”. Quem é do setor recebe os avisos.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {p.setores.map((s) => (
            <div key={s.code} className="rounded-lg border border-border bg-surface px-3 py-2">
              <Checkbox
                id={`atd-setor-${s.code}`}
                checked={c.setores.includes(s.code)}
                onChange={(e) => mudar({ setores: e.target.checked ? [...c.setores, s.code] : c.setores.filter((x) => x !== s.code) })}
                label={
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} aria-hidden />
                    {s.label}
                  </span>
                }
              />
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Horário e mensagens automáticas" texto="Saem assinadas como “Atendimento 41” para quem escreve pela primeira vez.">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Dias de atendimento</legend>
          {DIAS.map((rot, i) => (
            <label key={rot} className={`inline-flex items-center justify-center h-9 px-3 rounded-md border text-ui cursor-pointer ${c.diasDaSemana.includes(i) ? "border-brand bg-brand/10 text-brand font-semibold" : "border-border text-fg-secondary"}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={c.diasDaSemana.includes(i)}
                onChange={(e) => mudar({ diasDaSemana: e.target.checked ? [...c.diasDaSemana, i] : c.diasDaSemana.filter((x) => x !== i) })}
              />
              {rot}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1 text-ui font-semibold">
            <label htmlFor="atd-abre">Abre</label>
            <CampoHora id="atd-abre" value={c.abreAs} onChange={(v) => mudar({ abreAs: v })} />
          </div>
          <div className="flex flex-col gap-1 text-ui font-semibold">
            <label htmlFor="atd-fecha">Fecha</label>
            <CampoHora id="atd-fecha" value={c.fechaAs} onChange={(v) => mudar({ fechaAs: v })} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <Checkbox
            id="atd-automaticas"
            checked={c.respostasAutomaticas}
            onChange={(e) => mudar({ respostasAutomaticas: e.target.checked })}
            label="Mandar respostas automáticas"
            helper="Desligado, o Connect não manda nada sozinho: nem boas-vindas, nem fora do horário, nem a confirmação de quem pede para parar. As conversas chegam e ficam na triagem do mesmo jeito."
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-ui font-semibold">
            Boas-vindas
            <Textarea rows={3} value={c.boasVindas} onChange={(e) => mudar({ boasVindas: e.target.value })} placeholder="Olá! Recebemos sua mensagem. Em instantes alguém da equipe responde por aqui." />
          </label>
          <label className="flex flex-col gap-1 text-ui font-semibold">
            Fora do horário
            <Textarea rows={3} value={c.foraDoHorario} onChange={(e) => mudar({ foraDoHorario: e.target.value })} placeholder="Nosso atendimento é de segunda a sexta, das 8h às 18h. Respondemos assim que abrirmos." />
          </label>
        </div>
        <p className="text-micro text-fg-muted">Só saem com as respostas automáticas ligadas. Texto vazio = não manda nada.</p>
      </Bloco>

      <div className="flex justify-end py-4 border-t border-border">
        <Button loading={ocupado} onClick={() => rodar(() => salvarConfiguracaoAction(c), "Configurações salvas.")}>
          Salvar configurações
        </Button>
      </div>

      <Desfechos desfechos={p.desfechos} />
      <MensagensPadrao mensagens={p.mensagens} setores={p.setores} />
      <ModelosDaMeta modelos={p.modelos} />
    </div>
  );
}

function Desfechos({ desfechos }: { desfechos: Desfecho[] }) {
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<{ id: string; label: string } | null>(null);
  const { ocupado, rodar } = useAcao();
  const ids = desfechos.map((d) => d.id);
  const mover = (i: number, delta: number) => {
    const n = [...ids];
    const j = i + delta;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    rodar(() => reordenarDesfechosAction(n));
  };
  const botao = "inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-40";

  return (
    <Bloco titulo="Desfechos" texto="As opções do “Encerrar atendimento”. “Outro” fica sempre por último e pede para escrever.">
      <ul className="flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
        {desfechos.map((d, i) => (
          <li key={d.id} className="flex items-center gap-2 min-h-11 px-3 border-t border-border first:border-t-0">
            {editando?.id === d.id ? (
              <form
                className="flex-1 flex items-center gap-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  rodar(() => editarDesfechoAction(d.id, { label: editando.label }), "Desfecho salvo.", () => setEditando(null));
                }}
              >
                <Input aria-label="Nome do desfecho" value={editando.label} onChange={(e) => setEditando({ id: d.id, label: e.target.value })} maxLength={60} className="flex-1" autoFocus />
                <Button size="sm" type="submit" loading={ocupado}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <>
                <span className={`flex-1 text-ui ${d.ativo ? "text-fg" : "text-fg-muted line-through"}`}>{d.label}</span>
                {!d.ativo && <Selo tom="neutro">Desligado</Selo>}
                <button type="button" className={botao} aria-label={`Subir ${d.label}`} disabled={i === 0 || ocupado} onClick={() => mover(i, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button type="button" className={botao} aria-label={`Descer ${d.label}`} disabled={i === desfechos.length - 1 || ocupado} onClick={() => mover(i, 1)}>
                  <ArrowDown size={15} />
                </button>
                <button type="button" className={botao} aria-label={`Editar ${d.label}`} onClick={() => setEditando({ id: d.id, label: d.label })}>
                  <Pencil size={15} />
                </button>
                <Button size="xs" variant="ghost" onClick={() => rodar(() => editarDesfechoAction(d.id, { ativo: !d.ativo }))}>
                  {d.ativo ? "Desligar" : "Ligar"}
                </Button>
              </>
            )}
          </li>
        ))}
        <li className="flex items-center gap-2 min-h-11 px-3 border-t border-border bg-surface-2 text-ui text-fg-secondary">
          <Lock size={15} aria-hidden /> <span className="flex-1">Outro (a pessoa escreve)</span>
          <span className="text-micro text-fg-muted">sempre por último</span>
        </li>
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => criarDesfechoAction(novo), "Desfecho criado.", () => setNovo(""));
        }}
      >
        <Input aria-label="Novo desfecho" placeholder="Novo desfecho, por exemplo “Reunião marcada”" value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={60} className="flex-1" />
        <Button type="submit" variant="secondary" disabled={!novo.trim()} loading={ocupado}>
          <Plus size={14} /> Adicionar
        </Button>
      </form>
    </Bloco>
  );
}

const CAMPOS = ["{nome do contato}", "{empresa}", "{seu nome}", "{seu setor}"];

function MensagensPadrao({ mensagens, setores }: { mensagens: Mensagem[]; setores: Setor[] }) {
  const vazia: Mensagem = { id: "", titulo: "", sectorCode: null, texto: "", ativo: true };
  const [form, setForm] = useState<Mensagem>(vazia);
  const { ocupado, rodar } = useAcao();
  const nomeDoSetor = (code: string | null) => (code ? (setores.find((s) => s.code === code)?.label ?? code) : "Todos");

  return (
    <Bloco titulo="Mensagens padrão" texto="Textos prontos que a equipe usa na conversa, para todos os setores ou só para um. Valem dentro da janela de 24 h.">
      {mensagens.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-x-auto">
          <table className="w-full min-w-[34rem] text-ui">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Para</th>
                <th className="px-3 py-2">Texto</th>
                <th className="px-3 py-2 w-24">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mensagens.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {m.titulo}
                    {!m.ativo && <span className="text-fg-muted"> (desligada)</span>}
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">{nomeDoSetor(m.sectorCode)}</td>
                  <td className="px-3 py-2 text-fg-secondary max-w-[28rem] truncate">{m.texto}</td>
                  <td className="px-1 py-1 whitespace-nowrap">
                    <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-hover" aria-label={`Editar ${m.titulo}`} onClick={() => setForm(m)}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-md text-danger hover:bg-danger/8" aria-label={`Remover ${m.titulo}`} onClick={() => rodar(() => removerMensagemPadraoAction(m.id), "Mensagem removida.")}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarMensagemPadraoAction({ ...form, id: form.id || null }), form.id ? "Mensagem salva." : "Mensagem criada.", () => setForm(vazia));
        }}
      >
        <b className="text-ui">{form.id ? "Editar mensagem padrão" : "Nova mensagem padrão"}</b>
        <div className="flex flex-wrap gap-3">
          <label className="flex-[2_1_14rem] flex flex-col gap-1 text-ui font-semibold">
            Título
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} maxLength={80} />
          </label>
          <label className="flex-[1_1_10rem] flex flex-col gap-1 text-ui font-semibold">
            Para
            <Select value={form.sectorCode ?? ""} onChange={(e) => setForm({ ...form, sectorCode: e.target.value || null })}>
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-ui font-semibold">
          Texto
          <Textarea rows={3} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5 text-micro text-fg-muted">
          Inserir:
          {CAMPOS.map((campo) => (
            <button key={campo} type="button" className="h-7 px-2 rounded-full border border-border-strong text-fg hover:bg-surface-hover" onClick={() => setForm({ ...form, texto: `${form.texto}${form.texto && !form.texto.endsWith(" ") ? " " : ""}${campo}` })}>
              {campo}
            </button>
          ))}
        </div>
        <Checkbox id="atd-mensagem-ligada" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} label="Ligada" />
        <div className="flex justify-end gap-2">
          {form.id && (
            <Button variant="ghost" onClick={() => setForm(vazia)}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={ocupado} disabled={!form.titulo.trim() || !form.texto.trim()}>
            {form.id ? "Salvar mensagem" : "Criar mensagem"}
          </Button>
        </div>
      </form>
    </Bloco>
  );
}

function ModelosDaMeta({ modelos }: { modelos: Modelo[] }) {
  const vazio: Modelo = { id: "", rotulo: "", nomeNaMeta: "", idioma: "pt_BR", texto: "", ativo: true };
  const [form, setForm] = useState<Modelo>(vazio);
  const { ocupado, rodar } = useAcao();
  return (
    <Bloco
      titulo="Modelos da Meta"
      texto="Usados no “Retomar conversa”, depois de 24 h sem mensagem do cliente. Cadastre igual ao aprovado na Meta; o {{1}} recebe a assinatura de quem manda."
    >
      {modelos.length > 0 && (
        <ul className="flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-start gap-3 px-3 py-2.5 border-t border-border first:border-t-0">
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-ui font-medium">
                  {m.rotulo} {!m.ativo && <span className="text-fg-muted font-normal">(desligado)</span>}
                </span>
                <span className="text-micro text-fg-muted">
                  {m.nomeNaMeta} · {m.idioma}
                </span>
                <span className="text-micro text-fg-secondary truncate">{m.texto}</span>
              </div>
              <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-hover" aria-label={"Editar " + m.rotulo} onClick={() => setForm(m)}>
                <Pencil size={15} />
              </button>
              <button type="button" className="inline-flex items-center justify-center w-8 h-8 rounded-md text-danger hover:bg-danger/8" aria-label={"Remover " + m.rotulo} onClick={() => rodar(() => removerModeloAction(m.id), "Modelo removido.")}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarModeloAction({ ...form, id: form.id || null }), form.id ? "Modelo salvo." : "Modelo cadastrado.", () => setForm(vazio));
        }}
      >
        <b className="text-ui">{form.id ? "Editar modelo" : "Novo modelo"}</b>
        <div className="flex flex-wrap gap-3">
          <label className="flex-[2_1_12rem] flex flex-col gap-1 text-ui font-semibold">
            Nome na tela
            <Input value={form.rotulo} onChange={(e) => setForm({ ...form, rotulo: e.target.value })} maxLength={80} placeholder="Continuar o atendimento" />
          </label>
          <label className="flex-[2_1_12rem] flex flex-col gap-1 text-ui font-semibold">
            Nome na Meta
            <Input value={form.nomeNaMeta} onChange={(e) => setForm({ ...form, nomeNaMeta: e.target.value })} maxLength={120} placeholder="retomar_atendimento" />
          </label>
          <label className="flex-[1_1_6rem] flex flex-col gap-1 text-ui font-semibold">
            Idioma
            <Input value={form.idioma} onChange={(e) => setForm({ ...form, idioma: e.target.value })} maxLength={10} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-ui font-semibold">
          Texto aprovado
          <Textarea rows={3} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} placeholder="*{{1}}*&#10;Olá! Ainda precisamos de {{2}} para seguir com o seu atendimento. Pode responder por aqui?" />
        </label>
        <Checkbox id="atd-modelo-ligado" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} label="Ligado" />
        <div className="flex justify-end gap-2">
          {form.id && (
            <Button variant="ghost" onClick={() => setForm(vazio)}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={ocupado} disabled={!form.rotulo.trim() || !form.nomeNaMeta.trim() || !form.texto.trim()}>
            {form.id ? "Salvar modelo" : "Cadastrar modelo"}
          </Button>
        </div>
      </form>
    </Bloco>
  );
}
