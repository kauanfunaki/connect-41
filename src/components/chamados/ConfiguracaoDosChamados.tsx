"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Campo } from "./CamposDoChamado";
import { politica, setoresQueAdministram } from "@/app/(app)/chamados/actions";
import { PRIORIDADES, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";
import { SLA_PADRAO } from "@/lib/chamados/sla";

// "Categorias e formulários" saiu da configuração (26/10/2026): a IA interpreta o
// pedido, pergunta o que faltar e preenche o que importa. As categorias que já
// existem continuam nos chamados, e a lista padrão nasce no primeiro rascunho.
// Saíram também (05/11/2026) a IA alternativa (Groq), porque a triagem é sempre
// a da Ceci, e a lista de setores que abrem chamado: todos abrem.
type Setor = { code: string; label: string };
export type SetoresDaConfiguracao = { todos: Setor[]; administram: string[]; padrao: string; editavel: boolean };
export function ConfiguracaoDosChamados({ politicas, setores }: { politicas: { priority: string; firstResponseMinutes: number; resolutionMinutes: number }[]; setores: SetoresDaConfiguracao }) {
  return <div className="space-y-6">
    <SetoresQueAdministram {...setores} />
    <Card className="p-5 space-y-5"><h2 className="font-semibold text-fg">Políticas de SLA</h2><p className="text-ui text-fg-secondary">Prazos em minutos úteis. Expediente: segunda a quinta, 08h–18h; sexta, 08h–17h, no horário de Brasília. O ciclo começa em Em andamento e pausa nas situações de espera.</p>
      <div className="grid gap-4 md:grid-cols-2">{PRIORIDADES.map(p => <Politica key={p} prioridade={p} inicial={politicas.find(s => s.priority === p) ?? SLA_PADRAO[p]} />)}</div>
    </Card>
  </div>;
}
function Politica({ prioridade, inicial }: { prioridade: (typeof PRIORIDADES)[number]; inicial: { firstResponseMinutes: number; resolutionMinutes: number } }) {
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  return <form className="space-y-3 rounded-md border border-border p-4" onSubmit={e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setErro(""); setOk(false);
    void politica({ priority: prioridade, firstResponseMinutes: Number(f.get("resposta")), resolutionMinutes: Number(f.get("resolucao")) }).then(r => { if (!r.ok) setErro(r.error); else setOk(true); }).catch(() => setErro("Falha ao salvar.")).finally(() => setBusy(false));
  }}><fieldset disabled={busy} className="space-y-3"><h3 className="font-semibold text-fg">{ROTULOS_PRIORIDADE[prioridade]}</h3><Campo label="Primeira resposta (minutos úteis)"><Input name="resposta" type="number" min={1} max={525600} defaultValue={inicial.firstResponseMinutes} required /></Campo><Campo label="Resolução (minutos úteis)"><Input name="resolucao" type="number" min={1} max={525600} defaultValue={inicial.resolutionMinutes} required /></Campo><Button type="submit" variant="secondary" size="sm">Salvar política</Button></fieldset>{erro && <p role="alert" className="text-helper text-danger">{erro}</p>}{ok && <p role="status" className="text-helper text-success-fg">Política salva.</p>}</form>;
}

// Quem administra os chamados (12/11/2026, funcionalidade-640): um ou mais
// setores. Cada um atende a própria fila; o padrão recebe o chamado de quem não
// escolhe. Com dois ou mais, a tela Novo chamado pergunta o setor, com a
// sugestão da IA, e a equipe pode redirecionar.
function SetoresQueAdministram({ todos, administram, padrao: padraoInicial, editavel }: SetoresDaConfiguracao) {
  const router = useRouter();
  const [marcados, setMarcados] = useState(administram), [padrao, setPadrao] = useState(padraoInicial);
  const [busy, setBusy] = useState(false), [erro, setErro] = useState(""), [ok, setOk] = useState(false);
  const nome = (code: string) => todos.find(s => s.code === code)?.label ?? code;
  function alternar(code: string, ligado: boolean) {
    setOk(false);
    const novos = ligado ? [...marcados, code] : marcados.filter(m => m !== code);
    setMarcados(novos);
    if (!novos.includes(padrao)) setPadrao(novos[0] ?? "");
  }
  return <Card as="section" id="setores" aria-labelledby="titulo-setores" className="p-5 space-y-4">
    <div className="space-y-1">
      <h2 id="titulo-setores" className="font-semibold text-fg">Setores que administram os chamados</h2>
      <p className="text-ui text-fg-secondary">Cada setor marcado atende os chamados enviados a ele. Com mais de um, quem abre escolhe o setor, com a sugestão da IA, e a equipe pode redirecionar o chamado.</p>
    </div>
    {editavel ? <form className="space-y-4" onSubmit={e => {
      e.preventDefault(); setBusy(true); setErro(""); setOk(false);
      void setoresQueAdministram({ setores: marcados, padrao }).then(r => { if (!r.ok) setErro(r.error); else { setOk(true); router.refresh(); } }).catch(() => setErro("Falha ao salvar.")).finally(() => setBusy(false));
    }}><fieldset disabled={busy} className="space-y-4">
      <div role="group" aria-label="Setores" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{todos.map(s => <label key={s.code} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-ui text-fg hover:bg-surface-hover">
        <Checkbox checked={marcados.includes(s.code)} onChange={e => alternar(s.code, e.target.checked)} />{s.label}
      </label>)}</div>
      {marcados.length > 1 && <Campo label="Setor padrão (recebe quando quem abre não escolhe)"><Select value={padrao} onChange={e => { setPadrao(e.target.value); setOk(false); }}>{marcados.map(code => <option key={code} value={code}>{nome(code)}</option>)}</Select></Campo>}
      <Button type="submit" variant="secondary" size="sm" disabled={!marcados.length}>Salvar setores</Button>
    </fieldset>
      {!marcados.length && <p className="text-helper text-fg-muted">Marque ao menos um setor.</p>}
      {erro && <p role="alert" className="text-helper text-danger">{erro}</p>}{ok && <p role="status" className="text-helper text-success-fg">Setores salvos. Quem entrou num setor novo precisa sair e entrar de novo para ver a fila.</p>}
    </form> : <p className="text-ui text-fg">{administram.map(nome).join(", ")} <span className="text-fg-secondary">· padrão: {nome(padraoInicial)}. Só o administrador do escritório altera.</span></p>}
  </Card>;
}
