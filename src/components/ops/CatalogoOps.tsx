"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, ExternalLink, FolderGit2, Globe, Pencil, Plus, Search, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import type { CatalogoOps as Catalogo, ItemDoCatalogo } from "@/lib/ops/catalogo";

// Sites e Apps do Ops Center (28/10/2026). O cadastro é o que a triagem dos
// chamados lê para apontar "isso já existe" e quem responde por ele, então a
// descrição pede o que o item faz, nas palavras de quem vai pedir.

type Tipo = "sites" | "apps";
const TEXTOS = {
  sites: { singular: "site", novo: "Novo site", vazio: "Nenhum site cadastrado", icone: Globe, endpoint: "/api/ops/sites" },
  apps: { singular: "app", novo: "Novo app", vazio: "Nenhum app cadastrado", icone: AppWindow, endpoint: "/api/ops/apps" },
};
const emBranco = { name: "", url: "", repository: "", ownerId: "", description: "", isActive: true };
const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).map(p => p[0]).filter((_, i, partes) => i === 0 || i === partes.length - 1).join("").toLocaleUpperCase("pt-BR");

export function CatalogoOps({ tipo, podeGerir }: { tipo: Tipo; podeGerir: boolean }) {
  const toast = useToast(), t = TEXTOS[tipo], Icone = t.icone;
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null), [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [edicao, setEdicao] = useState<ItemDoCatalogo | "novo" | null>(null), [form, setForm] = useState(emBranco);
  const [ocupado, setOcupado] = useState(false), [erroAcao, setErroAcao] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/ops/catalogo", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const json = await r.json(); if (!r.ok) throw new Error(json.error || "Não foi possível carregar.");
      setCatalogo(json); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar."); }
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void carregar(), 0); return () => window.clearTimeout(t); }, [carregar]);

  function editar(item: ItemDoCatalogo | "novo") {
    setErroAcao(""); setEdicao(item);
    setForm(item === "novo" ? emBranco : { name: item.name, url: item.url ?? "", repository: item.repository ?? "", ownerId: item.ownerId ?? "", description: item.description ?? "", isActive: item.isActive });
  }
  async function salvar() {
    setOcupado(true); setErroAcao("");
    try {
      const novo = edicao === "novo", corpo = { name: form.name, url: form.url, ownerId: form.ownerId, description: form.description, isActive: form.isActive, ...(tipo === "apps" ? { repository: form.repository } : {}), ...(!novo && edicao ? { version: edicao.version } : {}) };
      const r = await fetch(novo ? t.endpoint : `${t.endpoint}/${edicao!.id}`, { method: novo ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15000) });
      const json = await r.json(); if (!r.ok) throw new Error(json.error || "Não foi possível salvar.");
      setEdicao(null); toast.success(tipo === "sites" ? "Site salvo." : "App salvo."); await carregar();
    } catch (e) { setErroAcao(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setOcupado(false); }
  }

  const itens = catalogo?.[tipo] ?? [];
  const termo = busca.toLocaleLowerCase("pt-BR").trim();
  const visiveis = itens.filter(i => !termo || [i.name, i.description, i.ownerName, i.url, i.repository].some(v => v?.toLocaleLowerCase("pt-BR").includes(termo)));
  const mudar = (campo: keyof typeof emBranco, valor: string | boolean) => setForm(f => ({ ...f, [campo]: valor }));

  return <section aria-label={tipo === "sites" ? "Sites" : "Apps"}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="block min-w-48 flex-1 sm:max-w-sm"><span className="sr-only">Buscar {t.singular}</span><Input compact type="search" icon={<Search size={16} />} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, descrição ou responsável…" /></label>
      <span className="text-helper text-fg-muted" role="status">{catalogo ? `${visiveis.length} de ${itens.length}` : ""}</span>
      {podeGerir && <Button size="sm" className="ml-auto" onClick={() => editar("novo")}><Plus size={14} /> {t.novo}</Button>}
    </div>
    {erro && <Aviso className="mb-4">{erro} <Button variant="link" onClick={() => void carregar()}>Tentar novamente</Button></Aviso>}
    {!catalogo ? (!erro && <Card className="p-8 text-center text-fg-secondary" role="status">Carregando…</Card>)
      : !itens.length ? <Card><EmptyState icon={<Icone />} title={t.vazio} description={`Cadastre o ${t.singular} com uma descrição do que ele faz: é ela que a triagem dos chamados usa para avisar que algo já existe.`} action={podeGerir ? <Button onClick={() => editar("novo")}><Plus size={14} /> {t.novo}</Button> : undefined} /></Card>
      : !visiveis.length ? <Card><EmptyState icon={<Search />} title="Nada encontrado" description="Tente outra busca." action={<Button variant="secondary" onClick={() => setBusca("")}>Limpar busca</Button>} /></Card>
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visiveis.map(i => <Card role="article" key={i.id} className={`flex min-w-0 flex-col p-5 ${i.isActive ? "" : "opacity-70"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand"><Icone size={18} /></span>
            <div className="min-w-0">
              <h3 className="break-words text-section-title font-semibold leading-snug text-fg">{i.name}</h3>
              {!i.isActive && <p className="text-helper text-fg-muted">Desativado</p>}
            </div>
          </div>
          {podeGerir && <Button size="icon" variant="secondary" aria-label={`Editar ${i.name}`} title={`Editar ${t.singular}`} onClick={() => editar(i)}><Pencil size={15} /></Button>}
        </div>
        <p className="mb-4 flex-1 break-words text-ui leading-relaxed text-fg-secondary">{i.description || "Sem descrição cadastrada."}</p>
        <div className="mb-4 space-y-1.5 text-helper">
          {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 text-brand hover:underline"><ExternalLink size={13} className="shrink-0" /><span className="truncate">{i.url.replace(/^https?:\/\//, "")}</span></a>}
          {i.repository && <a href={`https://github.com/${i.repository}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 text-fg-secondary hover:text-brand hover:underline"><FolderGit2 size={13} className="shrink-0" /><span className="truncate">{i.repository}</span></a>}
        </div>
        <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-helper font-semibold text-brand">{i.ownerName ? iniciais(i.ownerName) : <UserRound size={15} />}</span>
          <div className="min-w-0"><p className="text-helper text-fg-muted">Responsável</p><p className="break-words text-ui font-medium text-fg-secondary">{i.ownerName || "Sem responsável"}</p></div>
        </div>
      </Card>)}</div>}

    <Modal open={!!edicao} onClose={() => { if (!ocupado) setEdicao(null); }} title={edicao === "novo" ? t.novo : `Editar ${t.singular}`} maxWidth="max-w-xl">
      <form className="mt-3 space-y-4" onSubmit={e => { e.preventDefault(); void salvar(); }}>
        <CampoForm label="Nome" htmlFor="catalogo-nome" required><Input id="catalogo-nome" required maxLength={120} value={form.name} onChange={e => mudar("name", e.target.value)} /></CampoForm>
        {tipo === "apps" && <CampoForm label="Repositório no GitHub" htmlFor="catalogo-repo" helper={catalogo?.repositorios.length ? "Os repositórios selecionados na integração do GitHub." : "Nenhum repositório selecionado na integração do GitHub."}>
          <Select id="catalogo-repo" value={form.repository} onChange={e => mudar("repository", e.target.value)}><option value="">Sem repositório</option>{form.repository && !catalogo?.repositorios.includes(form.repository) && <option value={form.repository}>{form.repository}</option>}{catalogo?.repositorios.map(r => <option key={r} value={r}>{r}</option>)}</Select>
        </CampoForm>}
        <CampoForm label={tipo === "sites" ? "Endereço" : "Endereço do app"} htmlFor="catalogo-url" required={tipo === "sites"} helper={tipo === "apps" ? "Opcional: onde o app está no ar." : undefined}><Input id="catalogo-url" type="url" required={tipo === "sites"} maxLength={500} placeholder="https://" value={form.url} onChange={e => mudar("url", e.target.value)} /></CampoForm>
        <CampoForm label="Responsável" htmlFor="catalogo-dono"><Select id="catalogo-dono" value={form.ownerId} onChange={e => mudar("ownerId", e.target.value)}><option value="">Sem responsável</option>{form.ownerId && !catalogo?.owners.some(u => u.id === form.ownerId) && <option value={form.ownerId}>Responsável indisponível, selecione outro</option>}{catalogo?.owners.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></CampoForm>
        <CampoForm label="O que faz" htmlFor="catalogo-descricao" helper="Escreva como alguém de outro setor pediria: a triagem dos chamados compara os pedidos com este texto."><Textarea id="catalogo-descricao" rows={4} maxLength={2000} value={form.description} onChange={e => mudar("description", e.target.value)} /></CampoForm>
        <Checkbox label="Ativo" checked={form.isActive} onChange={e => mudar("isActive", e.target.checked)} />
        {erroAcao && <p role="alert" className="text-ui text-danger">{erroAcao}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={ocupado} onClick={() => setEdicao(null)}>Cancelar</Button><Button type="submit" loading={ocupado}>Salvar {t.singular}</Button></div>
      </form>
    </Modal>
  </section>;
}
