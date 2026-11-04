"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeletorDeCor, PALETA_DO_CONNECT } from "@/components/ui/SeletorDeCor";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { SkeletonBlocks } from "@/components/shared/SkeletonParts";
import { githubFetch } from "@/lib/github/browser";
import type { TimeDoPainel } from "@/lib/github/cores";
import type { PessoaDosTimes, TimesView } from "@/lib/github/times";
import { DeveloperAvatar, DeveloperName } from "./GithubOverview";
import styles from "./GithubContributions.module.css";

const API = "/api/github/times";

// Aba Times (04/11/2026), só do coordenador do Tech. Cada mudança salva na hora:
// a tela muda primeiro e, se o servidor recusar, volta ao que está gravado.
export function GithubTimes() {
  const [data, setData] = useState<TimesView | null>(null), [error, setError] = useState<string | null>(null);
  const { requestConfirm, dialog } = useConfirm();
  const toast = useToast();
  const refresh = useCallback(async (signal?: AbortSignal) => setData(await githubFetch<TimesView>(API, undefined, signal)), []);
  useEffect(() => {
    // Fora do corpo do efeito, como em Integrações: a leitura atualiza o estado ao voltar.
    const controller = new AbortController(), timer = window.setTimeout(() => { void refresh(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); }); }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [refresh]);

  async function salvar(acao: Record<string, unknown>, otimista?: (atual: TimesView) => TimesView, feito?: string) {
    if (otimista) setData(atual => atual && otimista(atual));
    try { await githubFetch(API, acao); if (feito) toast.success(feito); if (!otimista) await refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Não foi possível salvar."); await refresh().catch(() => undefined); }
  }
  const mudarPessoa = (pessoa: PessoaDosTimes, mudanca: { time?: string | null; cor?: string | null }) => salvar(
    { action: "definirPessoa", externalId: pessoa.externalId, login: pessoa.login, ...(mudanca.time !== undefined ? { timeId: mudanca.time } : {}), ...(mudanca.cor !== undefined ? { cor: mudanca.cor } : {}) },
    atual => ({ ...atual, pessoas: atual.pessoas.map(item => item.externalId !== pessoa.externalId ? item : {
      ...item, ...(mudanca.time !== undefined ? { time: mudanca.time } : {}), ...(mudanca.cor ? { cor: mudanca.cor, corPropria: true } : {}) }) }));

  if (!data) return error ? <Aviso>{error}</Aviso> : <div aria-busy><span className="sr-only" role="status">Carregando times…</span><SkeletonBlocks blocos={2} /></div>;
  const semTime = data.pessoas.filter(pessoa => !pessoa.time || !data.times.some(time => time.id === pessoa.time));
  return <div className="space-y-5">
    <NovoTime proximaCor={PALETA_DO_CONNECT[data.times.length % PALETA_DO_CONNECT.length]!} onCriar={(nome, cor) => salvar({ action: "criarTime", nome, cor }, undefined, `Time ${nome} criado.`)} />
    {!data.times.length && <EmptyState icon={<UsersRound />} title="Nenhum time ainda" description="Crie o primeiro time e escolha as pessoas que fazem parte dele. A cor do time aparece no calendário quando você escolhe Cor por time." />}
    <div className="grid gap-4 lg:grid-cols-2">
      {data.times.map(time => <CartaoDoTime key={time.id} time={time} times={data.times} pessoas={data.pessoas}
        onEditar={mudanca => salvar({ action: "editarTime", id: time.id, ...mudanca }, atual => ({ ...atual, times: atual.times.map(item => item.id === time.id ? { ...item, ...mudanca } : item) }))}
        onExcluir={() => requestConfirm({ title: `Excluir o time ${time.nome}?`, description: "As pessoas dele ficam sem time, com as cores que já têm. As contribuições não mudam.", confirmLabel: "Excluir time", destructive: true },
          () => salvar({ action: "excluirTime", id: time.id }, undefined, "Time excluído."))}
        onPessoa={mudarPessoa} />)}
    </div>
    <section className={`${styles.panel} p-5`} aria-labelledby="github-sem-time">
      <h2 id="github-sem-time" className="text-ui font-semibold text-fg">Sem time <span className="font-normal text-fg-muted">· {semTime.length}</span></h2>
      <p className="mt-1 text-helper text-fg-muted">Clique na cor para trocar a de cada pessoa. Ela vale em Cor por pessoa.</p>
      <div className="mt-3 divide-y divide-border">
        {semTime.length ? semTime.map(pessoa => <LinhaDaPessoa key={pessoa.externalId} pessoa={pessoa} times={data.times} onPessoa={mudarPessoa}
          onDeixar={pessoa.tracked && pessoa.userId ? () => salvar({ action: "deixarDeAcompanhar", userId: pessoa.userId, generation: data.generation }, undefined, `${pessoa.login} não é mais acompanhado.`) : undefined} />)
          : <p className="py-3 text-helper text-fg-muted">Todas as pessoas estão em algum time.</p>}
      </div>
      {data.conectado && <Acompanhar onAcompanhar={login => salvar({ action: "acompanhar", login, generation: data.generation }, undefined, `${login} acompanhado.`)} />}
    </section>
    {dialog}
  </div>;
}

function NovoTime({ proximaCor, onCriar }: { proximaCor: string; onCriar: (nome: string, cor: string) => Promise<void> }) {
  const [aberto, setAberto] = useState(false), [nome, setNome] = useState(""), [cor, setCor] = useState(proximaCor), [salvando, setSalvando] = useState(false);
  if (!aberto) return <Button onClick={() => { setCor(proximaCor); setAberto(true); }}><Plus size={16} /> Novo time</Button>;
  return <form className={`${styles.panel} space-y-3 p-5`} onSubmit={event => { event.preventDefault(); setSalvando(true);
    void onCriar(nome.trim(), cor).finally(() => { setSalvando(false); setNome(""); setAberto(false); }); }}>
    <label className="block space-y-1 text-ui text-fg-secondary"><span>Nome do time</span>
      <Input autoFocus required maxLength={80} value={nome} onChange={event => setNome(event.target.value)} placeholder="Ex.: Desenvolvimento, Suporte" /></label>
    <div className="space-y-1 text-ui text-fg-secondary"><span>Cor</span><SeletorDeCor valor={cor} onChange={setCor} aria-label="Cor do novo time" /></div>
    <div className="flex gap-2"><Button type="submit" loading={salvando} loadingLabel="Criando…" disabled={!nome.trim()}>Criar time</Button>
      <Button type="button" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button></div>
  </form>;
}

function CartaoDoTime({ time, times, pessoas, onEditar, onExcluir, onPessoa }: { time: TimeDoPainel; times: TimeDoPainel[]; pessoas: PessoaDosTimes[];
  onEditar: (mudanca: { nome?: string; cor?: string }) => void; onExcluir: () => void; onPessoa: (pessoa: PessoaDosTimes, mudanca: { time?: string | null; cor?: string | null }) => void }) {
  const [nome, setNome] = useState(time.nome);
  const membros = pessoas.filter(pessoa => pessoa.time === time.id), outras = pessoas.filter(pessoa => pessoa.time !== time.id);
  const renomear = () => { const novo = nome.trim(); if (novo && novo !== time.nome) onEditar({ nome: novo }); else setNome(time.nome); };
  return <section className={`${styles.panel} p-5`} style={{ borderTop: `4px solid ${time.cor}` }} aria-label={`Time ${time.nome}`}>
    <div className="flex items-center gap-3">
      <SeletorDeCor modo="botao" valor={time.cor} onChange={cor => onEditar({ cor })} aria-label={`Cor do time ${time.nome}`} />
      <Input aria-label="Nome do time" maxLength={80} value={nome} className="min-w-0 flex-1 font-semibold" onChange={event => setNome(event.target.value)}
        onBlur={renomear} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setNome(time.nome); }} />
      <IconButton title={`Excluir o time ${time.nome}`} onClick={onExcluir}><Trash2 size={16} /></IconButton>
    </div>
    <p className="mt-2 text-helper text-fg-muted">{membros.length} {membros.length === 1 ? "pessoa" : "pessoas"}</p>
    <div className="mt-2 divide-y divide-border">
      {membros.map(pessoa => <LinhaDaPessoa key={pessoa.externalId} pessoa={pessoa} times={times} onPessoa={onPessoa} noTime={time.nome} />)}
    </div>
    {outras.length > 0 && <div className="mt-3 flex items-center gap-2"><UserPlus size={16} className="shrink-0 text-fg-muted" aria-hidden />
      <Select compact aria-label={`Adicionar pessoa ao time ${time.nome}`} value="" className="min-w-0 flex-1"
        onChange={event => { const pessoa = outras.find(item => item.externalId === event.target.value); if (pessoa) onPessoa(pessoa, { time: time.id }); }}>
        <option value="">Adicionar pessoa…</option>
        {outras.map(pessoa => <option key={pessoa.externalId} value={pessoa.externalId}>{pessoa.name ? `${pessoa.name} (${pessoa.login})` : pessoa.login}{pessoa.time ? ` · em ${times.find(item => item.id === pessoa.time)?.nome ?? "outro time"}` : ""}</option>)}
      </Select></div>}
  </section>;
}

// A cor da pessoa e quem é. Fora dos times, o seletor põe num time; dentro do cartão
// de um time (`noTime`), o × tira dele — para trocar, "Adicionar pessoa" no outro time.
function LinhaDaPessoa({ pessoa, times, onPessoa, onDeixar, noTime }: { pessoa: PessoaDosTimes; times: TimeDoPainel[];
  onPessoa: (pessoa: PessoaDosTimes, mudanca: { time?: string | null; cor?: string | null }) => void; onDeixar?: () => void; noTime?: string }) {
  return <div className="flex flex-wrap items-center gap-3 py-2">
    <SeletorDeCor modo="botao" valor={pessoa.cor} onChange={cor => onPessoa(pessoa, { cor })} aria-label={`Cor de ${pessoa.name ?? pessoa.login}`} />
    <DeveloperAvatar login={pessoa.login} />
    <span className="min-w-0 flex-1 truncate text-ui text-fg"><DeveloperName login={pessoa.login} name={pessoa.name} />
      {!pessoa.corPropria && !noTime && <span className="ml-2 text-helper text-fg-muted">cor automática</span>}</span>
    {noTime ? <IconButton size="sm" title={`Tirar ${pessoa.name ?? pessoa.login} do time ${noTime}`} onClick={() => onPessoa(pessoa, { time: null })}><X size={14} /></IconButton>
      : <Select compact aria-label={`Time de ${pessoa.name ?? pessoa.login}`} value={pessoa.time ?? ""} className="w-40"
        onChange={event => onPessoa(pessoa, { time: event.target.value || null })}>
        <option value="">Sem time</option>
        {times.map(time => <option key={time.id} value={time.id}>{time.nome}</option>)}
      </Select>}
    {onDeixar && <Button size="sm" variant="ghost" onClick={onDeixar}>Deixar de acompanhar</Button>}
  </div>;
}

// Quem ainda não contribuiu nem vinculou a conta entra aqui pelo login do GitHub.
function Acompanhar({ onAcompanhar }: { onAcompanhar: (login: string) => Promise<void> }) {
  const [login, setLogin] = useState(""), [salvando, setSalvando] = useState(false);
  return <form className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); setSalvando(true);
    void onAcompanhar(login.trim()).finally(() => { setSalvando(false); setLogin(""); }); }}>
    <label htmlFor="github-acompanhar" className="text-ui text-fg-secondary">Falta alguém?</label>
    <Input id="github-acompanhar" required value={login} onChange={event => setLogin(event.target.value)} placeholder="Login no GitHub" className="min-w-0 flex-1 basis-48" />
    <Button type="submit" variant="secondary" loading={salvando} loadingLabel="Buscando…">Acompanhar</Button>
  </form>;
}
