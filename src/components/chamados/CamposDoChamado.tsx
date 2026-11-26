"use client";

import { useId } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import type { Categoria, DadosDoChamado } from "@/lib/chamados/regras";
import { caminhoDaCategoria, categoriasDaEdicao } from "@/lib/chamados/catalogo";
import { formatarNumero } from "@/lib/format";
import { SeletorDePrioridade } from "./SeletorDePrioridade";
import { CampoDeCategoria } from "./CampoDeCategoria";
import { CampoDeTags } from "./CampoDeTags";

export type CategoriaDaTela = Categoria & { id: string };
export function nomeDaCategoria(categorias: CategoriaDaTela[], id: string): string {
  return caminhoDaCategoria(categorias, id);
}
/** O limite da descrição no `dadosSchema` (lib/chamados/regras.ts). */
export const LIMITE_DA_DESCRICAO = 15000;

// O rótulo no desenho do `CampoForm` (14px, médio, na cor do texto), o único do
// app desde 30/09 — aqui era 13px negrito cinza, e o chamado destoava das outras
// telas (auditoria de UX, 30/10/2026). Fica o `<label>` em volta do controle:
// a ligação com o campo vem de graça, sem `id`. Com `htmlFor`, o rótulo aponta
// para o controle (26/11/2026): o `Select` tem um `<select>` escondido antes do
// gatilho, e o `<label>` em volta ligaria o rótulo a ele, e não ao gatilho.
export function Campo({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const rotulo = <span className="text-label font-medium leading-5 text-fg">{label}</span>;
  if (htmlFor) return <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={htmlFor}>{rotulo}</label>{children}</div>;
  return <label className="flex min-w-0 flex-col gap-1.5">{rotulo}{children}</label>;
}

/**
 * A categoria com a regra do modelo da descrição: com a descrição vazia, o
 * modelo da nova categoria entra no lugar; com `append`, vai no fim.
 */
export function comCategoria(dados: DadosDoChamado, categorias: CategoriaDaTela[], id: string): DadosDoChamado {
  const nova = categorias.find(c => c.id === id), template = nova?.descriptionTemplate ?? "";
  return { ...dados, categoryId: id, description: !dados.description.trim() ? template : nova?.templateApplyMode === "append" && template ? `${dados.description}\n\n${template}` : dados.description };
}

/**
 * O campo de categoria do "Editar dados" e do "Trocar categoria" (26/11/2026,
 * melhoria-809): o `CampoDeCategoria` com as ativas sem filha, e a atual mesmo
 * inativa — as mesmas opções da grade de botões que ele substitui.
 */
export function CategoriaDoChamado({ dados, onChange, categorias, id }: { dados: DadosDoChamado; onChange: (d: DadosDoChamado) => void; categorias: CategoriaDaTela[]; id?: string }) {
  const proprio = useId(), campo = id ?? `${proprio}categoria`;
  return <Campo label="Categoria" htmlFor={campo}>
    <CampoDeCategoria id={campo} required categorias={categorias} escolhiveis={categoriasDaEdicao(categorias, dados.categoryId)}
      value={dados.categoryId} onChange={categoryId => onChange(comCategoria(dados, categorias, categoryId))} />
  </Campo>;
}

/**
 * Os campos do chamado. Uma coluna (26/11/2026, melhoria-809): categoria,
 * título, descrição com o contador, os campos que a categoria pede, e
 * prioridade e tags lado a lado. O setor solicitante vem antes, a não ser que
 * a tela o mostre só para leitura (`ocultarSetor`, o "Editar dados").
 */
export function CamposDoChamado({ dados, onChange, categorias, setores, ocultarSetor = false, ocultarCategoria = false, ocultarTitulo = false, ocultarTags = false, abertura = false }: {
  dados: DadosDoChamado; onChange: (d: DadosDoChamado) => void; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[]; ocultarSetor?: boolean; ocultarCategoria?: boolean; ocultarTitulo?: boolean; ocultarTags?: boolean;
  /** Tela de abertura: prioridade ao lado do setor e descrição mais alta. */
  abertura?: boolean;
}) {
  const ids = useId();
  const categoria = categorias.find(c => c.id === dados.categoryId);
  const mudar = (p: Partial<DadosDoChamado>) => onChange({ ...dados, ...p });
  const tamanho = dados.description.length, perto = tamanho > LIMITE_DA_DESCRICAO * 0.9;
  return <div className="space-y-5">
    {!ocultarSetor && <div className="grid gap-4 sm:grid-cols-2">
      <Campo label="Setor solicitante"><Select required value={dados.requesterSectorCode} onChange={e => mudar({ requesterSectorCode: e.target.value })}><option value="">Selecione o setor</option>{setores.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</Select></Campo>
      {/* Na abertura (28/10/2026) a prioridade sobe para o lado do setor, e a descrição ganha a altura. */}
      {abertura && <SeletorDePrioridade value={dados.priority} onChange={priority => mudar({ priority })} />}
    </div>}
    {!ocultarCategoria && <CategoriaDoChamado dados={dados} onChange={onChange} categorias={categorias} id={`${ids}categoria`} />}
    {!ocultarTitulo && <Campo label="Título"><Input required minLength={3} maxLength={255} value={dados.title} onChange={e => mudar({ title: e.target.value })} placeholder="O que você precisa?" /></Campo>}
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${ids}descricao`} className="text-label font-medium leading-5 text-fg">Descrição</label>
      <Textarea id={`${ids}descricao`} required rows={8} className={abertura ? "xl:min-h-80" : "min-h-48"} maxLength={LIMITE_DA_DESCRICAO} aria-describedby={`${ids}contador`}
        value={dados.description} onChange={e => mudar({ description: e.target.value })} placeholder="Descreva o pedido, o sistema ou recurso envolvido e o que aconteceu." />
      {/* O contador (26/11/2026, melhoria-809): quanto do limite já foi; perto do fim, em cor de atenção. */}
      <span id={`${ids}contador`} className={`self-end text-helper tabular-nums ${perto ? "font-medium text-warning-fg" : "text-fg-muted"}`}>
        {formatarNumero(tamanho, 0)} / {formatarNumero(LIMITE_DA_DESCRICAO, 0)}<span className="sr-only"> caracteres</span>
      </span>
    </div>
    {categoria?.formSchema.length ? <div className="grid gap-4 sm:grid-cols-2">{categoria.formSchema.map(f => <Campo key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
      {f.type === "textarea" ? <Textarea required={f.required} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })} maxLength={f.rules.maxLen ?? 10000} minLength={f.rules.minLen} placeholder={f.placeholder} />
        : f.type === "select" ? <Select required={f.required} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })}><option value="">Selecione</option>{f.options.map(o => <option key={o}>{o}</option>)}</Select>
        : <Input required={f.required} type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"} min={f.rules.min} max={f.rules.max} maxLength={f.rules.maxLen ?? 10000} minLength={f.rules.minLen} value={dados.requestData[f.key] ?? ""} onChange={e => mudar({ requestData: { ...dados.requestData, [f.key]: e.target.value } })} placeholder={f.placeholder} />}
      {f.helpText && <span className="text-helper text-fg-muted">{f.helpText}</span>}
    </Campo>)}</div> : null}
    {!abertura && <div className="grid items-start gap-4 sm:grid-cols-2">
      <SeletorDePrioridade value={dados.priority} onChange={priority => mudar({ priority })} />
      {!ocultarTags && <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${ids}tags`} className="text-label font-medium leading-5 text-fg">Tags</label>
        <CampoDeTags id={`${ids}tags`} valor={dados.tags} onChange={tags => mudar({ tags })} />
      </div>}
    </div>}
  </div>;
}
