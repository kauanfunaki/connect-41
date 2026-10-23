"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { PRIORIDADES, ROTULOS_PRIORIDADE, type Categoria, type DadosDoChamado } from "@/lib/chamados/regras";
import { caminhoDaCategoria } from "@/lib/chamados/catalogo";

export type CategoriaDaTela = Categoria & { id: string };
export function nomeDaCategoria(categorias: CategoriaDaTela[], id: string): string {
  return caminhoDaCategoria(categorias, id);
}
export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-ui text-fg-secondary"><span className="font-semibold">{label}</span>{children}</label>;
}
export function CamposDoChamado({ dados, onChange, categorias, setores, origemFixa = false, somenteCategoria = false, ocultarCategoria = false }: {
  dados: DadosDoChamado; onChange: (d: DadosDoChamado) => void; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[]; origemFixa?: boolean; somenteCategoria?: boolean; ocultarCategoria?: boolean;
}) {
  const categoria = categorias.find(c => c.id === dados.categoryId);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const mudar = (p: Partial<DadosDoChamado>) => onChange({ ...dados, ...p });
  const ativas = categorias.filter(c => c.active || c.id === dados.categoryId);
  const raizDe = (id: string) => {
    let atual = categorias.find(c => c.id === id), raiz = atual;
    const vistos = new Set<string>();
    while (atual?.parentId && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      const pai = categorias.find(c => c.id === atual!.parentId);
      if (!pai) break;
      raiz = pai; atual = pai;
    }
    return raiz;
  };
  const raizes = categorias.filter(c => !c.parentId);
  const grupos = raizes.map(raiz => {
    const folhas = ativas.filter(c => c.id !== raiz.id && raizDe(c.id)?.id === raiz.id && !ativas.some(filho => filho.parentId === c.id));
    const opcoes = folhas.length ? folhas : ativas.some(c => c.id === raiz.id) ? [raiz] : [];
    const filtradas = opcoes.filter(opcao => `${nomeDaCategoria(categorias, opcao.id)} ${raiz.name}`.toLocaleLowerCase("pt-BR").includes(buscaCategoria.trim().toLocaleLowerCase("pt-BR")));
    return { raiz, opcoes: filtradas };
  }).filter(grupo => grupo.opcoes.length);
  function selecionarCategoria(id: string) {
    const nova = categorias.find(c => c.id === id), template = nova?.descriptionTemplate ?? "";
    mudar({ categoryId: id, description: !dados.description.trim() ? template : nova?.templateApplyMode === "append" && template ? `${dados.description}\n\n${template}` : dados.description });
  }
  const painelCategoria = <section id="categoria-chamado" tabIndex={-1} aria-labelledby="titulo-categoria-chamado" className="overflow-hidden rounded-lg border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="border-b border-border bg-surface-hover/50 px-4 py-3">
        <h3 id="titulo-categoria-chamado" className="text-ui font-semibold text-fg">Selecione a categoria do chamado</h3>
        <p className="mt-1 text-helper text-fg-secondary">Escolha o tipo de serviço para direcionar o chamado corretamente.</p>
      </div>
      <div className="space-y-4 p-4">
        <Input aria-label="Buscar categoria" placeholder="Buscar categoria..." value={buscaCategoria} onChange={e => setBuscaCategoria(e.target.value)} />
        {grupos.length ? grupos.map(({ raiz, opcoes }) => <Accordion key={raiz.id} abertoInicial chevron="fim" className="group" classeDoCabecalho="mb-2 w-full items-center text-helper font-semibold uppercase tracking-wide text-fg-secondary" classeDoConteudo="pt-1" titulo={<span className="flex w-full items-center gap-3"><span className="shrink-0 rounded border border-brand/20 bg-brand/8 px-2 py-1 text-brand">{raiz.name.slice(0, 1)}</span><span>{raiz.name}</span><span className="h-px flex-1 bg-border" /></span>}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{opcoes.map(opcao => <button key={opcao.id} type="button" aria-pressed={dados.categoryId === opcao.id} onClick={() => selecionarCategoria(opcao.id)} className={`min-h-10 rounded-md border px-3 py-2 text-left text-ui font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dados.categoryId === opcao.id ? "border-brand bg-brand/8 text-brand" : "border-border-strong text-fg hover:bg-surface-hover"}`}>{opcao.name}</button>)}</div>
        </Accordion>) : <p className="py-3 text-ui text-fg-muted">Nenhuma categoria encontrada.</p>}
        {categoria && <p className="text-helper text-fg-secondary">Selecionada: <span className="font-semibold text-fg">{nomeDaCategoria(categorias, categoria.id)}</span></p>}
      </div>
    </section>;
  if (somenteCategoria) return painelCategoria;
  return <div className="space-y-5">
    {!ocultarCategoria && painelCategoria}
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo label="Setor solicitante"><Select required value={dados.requesterSectorCode} disabled={origemFixa} onChange={e => mudar({ requesterSectorCode: e.target.value })}><option value="">Selecione o setor</option>{setores.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</Select></Campo>
    </div>
    <Campo label="Título"><Input required minLength={3} maxLength={255} value={dados.title} onChange={e => mudar({ title: e.target.value })} placeholder="O que você precisa?" /></Campo>
    <Campo label="Descrição"><Textarea required rows={6} maxLength={15000} value={dados.description} onChange={e => mudar({ description: e.target.value })} placeholder="Descreva o pedido, o sistema ou recurso envolvido e o que aconteceu." /></Campo>
    {categoria?.formSchema.length ? <div className="grid gap-4 sm:grid-cols-2">{categoria.formSchema.map(f => <Campo key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
      {f.type === "textarea" ? <Textarea required={f.required} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })} maxLength={f.rules.maxLen ?? 10000} minLength={f.rules.minLen} placeholder={f.placeholder} />
        : f.type === "select" ? <Select required={f.required} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })}><option value="">Selecione</option>{f.options.map(o => <option key={o}>{o}</option>)}</Select>
        : <Input required={f.required} type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"} min={f.rules.min} max={f.rules.max} maxLength={f.rules.maxLen ?? 10000} minLength={f.rules.minLen} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })} placeholder={f.placeholder} />}
      {f.helpText && <span className="text-helper text-fg-muted">{f.helpText}</span>}
    </Campo>)}</div> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo label="Prioridade"><Select value={dados.priority} onChange={e => mudar({ priority: e.target.value as DadosDoChamado["priority"] })}>{PRIORIDADES.map(p => <option key={p} value={p}>{ROTULOS_PRIORIDADE[p]}</option>)}</Select></Campo>
      <Campo label="Tags (separadas por vírgula)"><Input defaultValue={dados.tags.join(", ")} maxLength={1000} onChange={e => mudar({ tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })} /></Campo>
    </div>
  </div>;
}
