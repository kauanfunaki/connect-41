"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/Checkbox";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Campo } from "./CamposDoChamado";
import { politica, fallbackIa, setores as gravarSetores } from "@/app/(app)/chamados/actions";
import { PRIORIDADES, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";
import { SLA_PADRAO } from "@/lib/chamados/sla";

function Marcar({ children, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <label className="flex items-center gap-2 text-ui text-fg-secondary"><Checkbox {...props} />{children}</label>; }
export function SetoresDosChamados({ setores, selecionados, responsavel }: { setores: { code: string; label: string }[]; selecionados: string[]; responsavel: string }) {
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  return <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Quem pode abrir chamados</h2><p className="text-ui text-fg-secondary">O setor responsável é <strong>{responsavel}</strong>. Para alterá-lo, use o seletor de setor em Módulos. Os setores abaixo podem solicitar atendimento; a equipe responsável acompanha a fila inteira.</p><form onSubmit={e => {
    e.preventDefault(); const escolhidos = new FormData(e.currentTarget).getAll("setor"); setBusy(true); setErro(""); setOk(false);
    void gravarSetores(escolhidos).then(r => { if (!r.ok) setErro(r.error); else setOk(true); }).catch(() => setErro("Falha ao salvar. Tente novamente.")).finally(() => setBusy(false));
  }} className="space-y-4"><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">{setores.map(s => <Marcar key={s.code} name="setor" value={s.code} defaultChecked={selecionados.includes(s.code)}>{s.label}</Marcar>)}</fieldset><p className="text-helper text-fg-muted">Sem setores selecionados, apenas administradores abrem chamados. Remover um setor preserva o acompanhamento dos chamados anteriores.</p><Button type="submit" loading={busy}>Salvar setores</Button></form>{erro && <p role="alert" className="text-ui text-danger">{erro}</p>}{ok && <p role="status" className="text-ui text-success-fg">Setores salvos.</p>}</Card>;
}

// "Categorias e formulários" saiu da configuração (26/10/2026): a IA interpreta o
// pedido, pergunta o que faltar e preenche o que importa. As categorias que já
// existem continuam nos chamados, e a lista padrão nasce no primeiro rascunho.
type Fallback = { configurado: boolean; enabled: boolean; podeConfigurar: boolean; lastRunAt: Date | null; lastError: string | null };
export function ConfiguracaoDosChamados({ politicas, fallback }: { politicas: { priority: string; firstResponseMinutes: number; resolutionMinutes: number }[]; fallback: Fallback }) {
  return <div className="space-y-6">
    <FallbackDosChamados estado={fallback} />
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
