"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/Checkbox";
import { Accordion } from "@/components/ui/Accordion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Campo, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import { categoria, politica, fallbackIa, setores as gravarSetores } from "@/app/(app)/chamados/actions";
import { categoriaSchema, PRIORIDADES, ROTULOS_PRIORIDADE, type Categoria } from "@/lib/chamados/regras";
import { SLA_PADRAO } from "@/lib/chamados/sla";

function Marcar({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <label className="flex items-center gap-2 text-ui text-fg-secondary"><Checkbox {...props} />{children}</label>; }
const chave = () => crypto.randomUUID().replaceAll("-", "");
export function SetoresDosChamados({ setores, selecionados, responsavel }: { setores: { code: string; label: string }[]; selecionados: string[]; responsavel: string }) {
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  return <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Quem pode abrir chamados</h2><p className="text-ui text-fg-secondary">O setor responsável é <strong>{responsavel}</strong>. Para alterá-lo, use o seletor de setor em Módulos. Os setores abaixo podem solicitar atendimento; a equipe responsável acompanha a fila inteira.</p><form onSubmit={e => {
    e.preventDefault(); const escolhidos = new FormData(e.currentTarget).getAll("setor"); setBusy(true); setErro(""); setOk(false);
    void gravarSetores(escolhidos).then(r => { if (!r.ok) setErro(r.error); else setOk(true); }).catch(() => setErro("Falha ao salvar. Tente novamente.")).finally(() => setBusy(false));
  }} className="space-y-4"><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{setores.map(s => <Marcar key={s.code} name="setor" value={s.code} defaultChecked={selecionados.includes(s.code)}>{s.label}</Marcar>)}</fieldset><p className="text-helper text-fg-muted">Sem setores selecionados, apenas administradores abrem chamados. Remover um setor preserva o acompanhamento dos chamados anteriores.</p><Button type="submit" loading={busy}>Salvar setores</Button></form>{erro && <p role="alert" className="text-ui text-danger">{erro}</p>}{ok && <p role="status" className="text-ui text-success-fg">Setores salvos.</p>}</Card>;
}

type Fallback = { configurado: boolean; enabled: boolean; podeConfigurar: boolean; lastRunAt: Date | null; lastError: string | null };
export function ConfiguracaoDosChamados({ categorias, usuarios, politicas, fallback }: { categorias: CategoriaDaTela[]; usuarios: { id: string; name: string }[]; politicas: { priority: string; firstResponseMinutes: number; resolutionMinutes: number }[]; fallback: Fallback }) {
  const [escolhida, setEscolhida] = useState<string>("nova"), [versao, setVersao] = useState(0);
  return <div className="space-y-6">
    <FallbackDosChamados estado={fallback} />
    <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Categorias e formulários</h2><Campo label="Editar categoria"><Select value={escolhida} onChange={e => setEscolhida(e.target.value)}><option value="nova">Criar nova categoria</option>{categorias.map(c => <option key={c.id} value={c.id}>{nomeDaCategoria(categorias, c.id)}{c.active ? "" : " (desativada)"}</option>)}</Select></Campo>
      <EditorCategoria key={`${escolhida}:${versao}`} inicial={categorias.find(c => c.id === escolhida)} categorias={categorias} usuarios={usuarios} aoSalvar={() => { setEscolhida("nova"); setVersao(v => v + 1); }} />
    </Card>
    <Card className="p-5 space-y-5"><h2 className="font-semibold text-fg">Políticas de SLA</h2><p className="text-ui text-fg-secondary">Prazos em minutos úteis. Expediente: segunda a quinta, 08h–18h; sexta, 08h–17h, no horário de Brasília. O ciclo começa em Em andamento e pausa nas situações de espera.</p>
      <div className="grid gap-4 md:grid-cols-2">{PRIORIDADES.map(p => <Politica key={p} prioridade={p} inicial={politicas.find(s => s.priority === p) ?? SLA_PADRAO[p]} />)}</div>
    </Card>
  </div>;
}
function FallbackDosChamados({ estado }: { estado: Fallback }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState(""), [enabled, setEnabled] = useState(estado.enabled);
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  return <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">IA alternativa para chamados</h2>
    <p className="text-ui text-fg-secondary">Se a IA principal falhar, a Groq pode classificar e revisar o texto do chamado. O plano gratuito tem limites de uso. Crie uma chave em <a className="text-brand underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq → API Keys</a> e salve abaixo. Mantenha o agente Triagem de chamados habilitado.</p>
    <p className="text-helper text-fg-muted">{estado.configurado ? "Chave salva e protegida. Deixe em branco para mantê-la." : "Nenhuma chave alternativa cadastrada."} Anexos ficam disponíveis para a equipe; o fallback lê somente o texto.</p>
    {estado.lastError && <p className="text-helper text-warning">{estado.lastError}</p>}
    {estado.podeConfigurar && <form className="space-y-3" onSubmit={e => { e.preventDefault(); setBusy(true); setErro(""); setOk(false); void fallbackIa({ apiKey, enabled }).then(r => { if (!r.ok) setErro(r.error); else { setApiKey(""); setOk(true); router.refresh(); } }).catch(() => setErro("Falha ao salvar a configuração.")).finally(() => setBusy(false)); }}>
      <fieldset disabled={busy} className="space-y-3"><Campo label="Chave da Groq"><Input type="password" autoComplete="new-password" maxLength={500} value={apiKey} onChange={e => setApiKey(e.target.value)} required={!estado.configurado} /></Campo><Marcar checked={enabled} onChange={e => setEnabled(e.target.checked)}>Usar Groq quando a IA principal estiver indisponível</Marcar><Button type="submit" variant="secondary" loading={busy}>Salvar IA alternativa</Button></fieldset>
    </form>}
    {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}{ok && <p role="status" className="text-ui text-success-fg">IA alternativa salva.</p>}
  </Card>;
}
function Politica({ prioridade, inicial }: { prioridade: (typeof PRIORIDADES)[number]; inicial: { firstResponseMinutes: number; resolutionMinutes: number } }) {
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  return <form className="space-y-3 rounded-md border border-border p-4" onSubmit={e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setErro(""); setOk(false);
    void politica({ priority: prioridade, firstResponseMinutes: Number(f.get("resposta")), resolutionMinutes: Number(f.get("resolucao")) }).then(r => { if (!r.ok) setErro(r.error); else setOk(true); }).catch(() => setErro("Falha ao salvar.")).finally(() => setBusy(false));
  }}><fieldset disabled={busy} className="space-y-3"><h3 className="font-semibold text-fg">{ROTULOS_PRIORIDADE[prioridade]}</h3><Campo label="Primeira resposta (minutos úteis)"><Input name="resposta" type="number" min={1} max={525600} defaultValue={inicial.firstResponseMinutes} required /></Campo><Campo label="Resolução (minutos úteis)"><Input name="resolucao" type="number" min={1} max={525600} defaultValue={inicial.resolutionMinutes} required /></Campo><Button type="submit" variant="secondary" size="sm">Salvar política</Button></fieldset>{erro && <p role="alert" className="text-helper text-danger">{erro}</p>}{ok && <p role="status" className="text-helper text-success-fg">Política salva.</p>}</form>;
}
function EditorCategoria({ inicial, categorias, usuarios, aoSalvar }: { inicial?: CategoriaDaTela; categorias: CategoriaDaTela[]; usuarios: { id: string; name: string }[]; aoSalvar: () => void }) {
  const [c, setC] = useState<Categoria>(() => inicial ?? categoriaSchema.parse({ name: "Nova categoria" }));
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""); const router = useRouter();
  const mudar = (p: Partial<Categoria>) => setC({ ...c, ...p });
  const formatos = [{ label: "PDF", mime: "application/pdf" }, { label: "Imagens", mime: "image/*" }, { label: "Word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, { label: "Planilhas", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, { label: "Texto", mime: "text/plain" }, { label: "CSV", mime: "text/csv" }];
  return <form className="space-y-5" onSubmit={e => {
    e.preventDefault(); setBusy(true); setErro(""); void categoria(c).then(r => { if (!r.ok) setErro(r.error); else { aoSalvar(); router.refresh(); } }).catch(() => setErro("Não foi possível salvar a categoria.")).finally(() => setBusy(false));
  }}><fieldset disabled={busy} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2"><Campo label="Nome da categoria"><Input required maxLength={120} value={c.name} onChange={e => mudar({ name: e.target.value })} /></Campo><Campo label="Categoria pai"><Select value={c.parentId ?? ""} onChange={e => mudar({ parentId: e.target.value || null })}><option value="">Categoria principal</option>{categorias.filter(p => p.id !== c.id).map(p => <option key={p.id} value={p.id}>{nomeDaCategoria(categorias, p.id)}</option>)}</Select></Campo></div>
    <Marcar checked={c.active} onChange={e => mudar({ active: e.target.checked })}>Categoria ativa para novas aberturas</Marcar>
    <Campo label="Modelo de descrição"><Textarea rows={4} maxLength={15000} value={c.descriptionTemplate} onChange={e => mudar({ descriptionTemplate: e.target.value })} /></Campo>
    <Campo label="Aplicar o modelo"><Select value={c.templateApplyMode} onChange={e => mudar({ templateApplyMode: e.target.value as Categoria["templateApplyMode"] })}><option value="replace_if_empty">Quando a descrição estiver vazia</option><option value="append">Acrescentar ao escolher a categoria</option></Select></Campo>
    <section className="space-y-3"><h3 className="font-semibold text-fg">Campos do formulário</h3>{c.formSchema.map((f, i) => <div key={i} className="space-y-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2"><Campo label="Rótulo do campo"><Input required value={f.label} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, label: e.target.value } : x) })} /></Campo><Campo label="Tipo de campo"><Select value={f.type} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, type: e.target.value as typeof x.type } : x) })}><option value="text">Texto curto</option><option value="textarea">Texto longo</option><option value="email">E-mail</option><option value="number">Número</option><option value="select">Lista de opções</option></Select></Campo></div>
      <Marcar checked={f.required} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, required: e.target.checked } : x) })}>Preenchimento obrigatório</Marcar>
      {f.type === "select" && <Campo label="Opções (uma por linha)"><Textarea required value={f.options.join("\n")} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, options: e.target.value.split("\n") } : x) })} /></Campo>}
      <Accordion titulo="Orientações e limites" classeDoCabecalho="text-helper text-brand"><div className="mt-3 grid gap-3 sm:grid-cols-2"><Campo label="Exemplo de preenchimento"><Input value={f.placeholder} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, placeholder: e.target.value } : x) })} /></Campo><Campo label="Orientação"><Input value={f.helpText} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, helpText: e.target.value } : x) })} /></Campo>{(f.type === "number" ? ["min", "max"] as const : ["minLen", "maxLen"] as const).map(limite => <Campo key={limite} label={limite === "min" ? "Valor mínimo" : limite === "max" ? "Valor máximo" : limite === "minLen" ? "Mínimo de caracteres" : "Máximo de caracteres"}><Input type="number" value={f.rules[limite] ?? ""} onChange={e => mudar({ formSchema: c.formSchema.map((x, n) => n === i ? { ...x, rules: { ...x.rules, [limite]: e.target.value === "" ? undefined : Number(e.target.value) } } : x) })} /></Campo>)}</div></Accordion>
      <Button variant="ghost" size="xs" onClick={() => mudar({ formSchema: c.formSchema.filter((_, n) => n !== i) })}>Retirar campo</Button>
    </div>)}<Button variant="secondary" size="sm" onClick={() => mudar({ formSchema: [...c.formSchema, { key: chave(), label: "Novo campo", type: "text", required: false, options: [], placeholder: "", helpText: "", rules: {} }] })} disabled={c.formSchema.length >= 30}>Adicionar campo</Button></section>
    <section className="space-y-3"><h3 className="font-semibold text-fg">Evidências e anexos</h3>{c.requiredAttachments.map((a, i) => <div key={a.key} className="space-y-3 rounded-md border border-border p-3"><Campo label="Nome da evidência"><Input required value={a.label} onChange={e => mudar({ requiredAttachments: c.requiredAttachments.map((x, n) => n === i ? { ...x, label: e.target.value } : x) })} /></Campo><Marcar checked={a.required} onChange={e => mudar({ requiredAttachments: c.requiredAttachments.map((x, n) => n === i ? { ...x, required: e.target.checked } : x) })}>Anexo obrigatório</Marcar><p className="text-helper text-fg-secondary">Formatos permitidos (vazio aceita todos os formatos do módulo)</p><div className="flex flex-wrap gap-3">{formatos.map(f => <Marcar key={f.mime} checked={a.mime.includes(f.mime)} onChange={e => mudar({ requiredAttachments: c.requiredAttachments.map((x, n) => n === i ? { ...x, mime: e.target.checked ? [...x.mime, f.mime] : x.mime.filter(m => m !== f.mime) } : x) })}>{f.label}</Marcar>)}</div><Button variant="ghost" size="xs" onClick={() => mudar({ requiredAttachments: c.requiredAttachments.filter((_, n) => n !== i) })}>Retirar exigência</Button></div>)}<Button variant="secondary" size="sm" disabled={c.requiredAttachments.length >= 5} onClick={() => mudar({ requiredAttachments: [...c.requiredAttachments, { key: chave(), label: "Nova evidência", required: true, mime: [] }] })}>Adicionar evidência</Button></section>
    <section className="space-y-3"><h3 className="font-semibold text-fg">Checklist da equipe</h3>{c.checklistTemplate.map((item, i) => <div key={item.key} className="flex gap-2"><Input aria-label={`Item ${i + 1} do checklist`} required value={item.label} onChange={e => mudar({ checklistTemplate: c.checklistTemplate.map((x, n) => n === i ? { ...x, label: e.target.value } : x) })} /><Button size="xs" variant="ghost" onClick={() => mudar({ checklistTemplate: c.checklistTemplate.filter((_, n) => n !== i) })}>Retirar</Button></div>)}<Button variant="secondary" size="sm" disabled={c.checklistTemplate.length >= 40} onClick={() => mudar({ checklistTemplate: [...c.checklistTemplate, { key: chave(), label: "Novo item" }] })}>Adicionar item</Button></section>
    <Marcar checked={c.requiresApproval} onChange={e => mudar({ requiresApproval: e.target.checked })}>Exigir aprovação antes de iniciar atendimento</Marcar>
    {c.requiresApproval && <div className="space-y-3"><Campo label="Quem aprova"><Select value={c.approvalMode} onChange={e => mudar({ approvalMode: e.target.value as Categoria["approvalMode"] })}><option value="REQUESTER_COORDINATOR">Gestor do setor solicitante ou administrador</option><option value="SPECIFIC_USERS">Pessoas selecionadas</option></Select></Campo>{c.approvalMode === "SPECIFIC_USERS" && <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">{usuarios.map(u => <Marcar key={u.id} checked={c.approvalUserIds.includes(u.id)} onChange={e => mudar({ approvalUserIds: e.target.checked ? [...c.approvalUserIds, u.id] : c.approvalUserIds.filter(id => id !== u.id) })}>{u.name}</Marcar>)}</div>}<p className="text-helper text-fg-muted">O solicitante não aprova a própria abertura. Deve existir outro aprovador ativo.</p></div>}
    <Button type="submit">{inicial ? "Salvar categoria" : "Criar categoria"}</Button>
  </fieldset>{erro && <p role="alert" className="text-ui text-danger">{erro}</p>}</form>;
}
