"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Campo } from "./CamposDoChamado";
import { politica } from "@/app/(app)/chamados/actions";
import { PRIORIDADES, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";
import { SLA_PADRAO } from "@/lib/chamados/sla";

// "Categorias e formulários" saiu da configuração (26/10/2026): a IA interpreta o
// pedido, pergunta o que faltar e preenche o que importa. As categorias que já
// existem continuam nos chamados, e a lista padrão nasce no primeiro rascunho.
// Saíram também (05/11/2026) a IA alternativa (Groq), porque a triagem é sempre
// a da Ceci, e a lista de setores que abrem chamado: todos abrem.
export function ConfiguracaoDosChamados({ politicas }: { politicas: { priority: string; firstResponseMinutes: number; resolutionMinutes: number }[] }) {
  return <div className="space-y-6">
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
