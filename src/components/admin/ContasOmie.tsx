"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { salvarContaOmieAction, testarContaOmieAction } from "@/app/(app)/admin/integracoes/omie-actions";
import type { ContaOmieNaTela } from "@/lib/integracoes/omie/contas";
import type { Saude } from "@/lib/integracoes/execucao";

const SAUDE: Record<Saude, { rotulo: string; variante: "success" | "warning" | "danger" | "info" }> = {
  nunca_rodou: { rotulo: "Não testada", variante: "info" },
  ok: { rotulo: "Conectada", variante: "success" },
  com_erro: { rotulo: "Com erro", variante: "danger" },
  desligada: { rotulo: "Desligada", variante: "info" },
  parada: { rotulo: "Parada", variante: "warning" },
};

function FormConta({ empresas, inicial, onFim }: { empresas: { id: string; nome: string }[]; inicial?: { companyId: string; appKey: string }; onFim: () => void }) {
  const [companyId, setCompanyId] = useState(inicial?.companyId ?? "");
  const [appKey, setAppKey] = useState(inicial?.appKey ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="grid gap-3 md:grid-cols-3 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await salvarContaOmieAction({ companyId, appKey, appSecret });
          if ("error" in r) setErro(r.error);
          else onFim();
        });
      }}
    >
      {inicial ? (
        <input type="hidden" name="companyId" value={companyId} />
      ) : (
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">Empresa</span>
          <SearchableSelect
            name="companyId"
            options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
            placeholder="Buscar empresa…"
            onChange={setCompanyId}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
        <span className="font-medium">App Key</span>
        <Input value={appKey} onChange={(e) => setAppKey(e.target.value)} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
        <span className="font-medium">App Secret</span>
        <Input
          type="password"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          autoComplete="new-password"
          placeholder={inicial ? "Em branco mantém o atual" : ""}
        />
      </label>
      <div className="md:col-span-3 flex items-center gap-2">
        <Button type="submit" size="sm" loading={pendente} disabled={pendente}>
          Salvar
        </Button>
        <Button variant="linkMuted" size="xs" onClick={onFim}>
          Cancelar
        </Button>
        {erro && <span className="text-[12px] text-danger">{erro}</span>}
      </div>
    </form>
  );
}

/**
 * Uma conta do Omie por empresa cliente. A 41 opera o Omie dos clientes do BPO;
 * cada empresa tem App Key e App Secret próprios (no Omie, em Configurações ›
 * Aplicativos). Login e senha do Omie não servem para a API.
 */
export function ContasOmie({ contas, empresas }: { contas: ContaOmieNaTela[]; empresas: { id: string; nome: string }[] }) {
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [teste, setTeste] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [testando, setTestando] = useState<string | null>(null);
  const semConta = empresas.filter((e) => !contas.some((c) => c.companyId === e.id));

  async function testar(companyId: string) {
    setTestando(companyId);
    const r = await testarContaOmieAction(companyId);
    setTeste((t) => ({ ...t, [companyId]: "error" in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensagem ?? "Conectado." } }));
    setTestando(null);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-fg">Omie por empresa</h3>
          <p className="text-[12px] text-fg-muted mt-0.5 max-w-[680px]">
            Uma conta do Omie para cada empresa cliente do BPO. A App Key e o App Secret ficam no Omie da empresa, em
            Configurações › Aplicativos — login e senha não servem para a API. &ldquo;Testar&rdquo; lê os dados da empresa
            no Omie e confere o CNPJ, para pegar chave colada na empresa errada.
          </p>
        </div>
        {!novo && (
          <Button size="sm" onClick={() => setNovo(true)}>
            <Plus size={13} /> Adicionar empresa
          </Button>
        )}
      </div>

      {novo && (
        <div className="mb-4 rounded-md border border-border p-3">
          <FormConta empresas={semConta} onFim={() => setNovo(false)} />
        </div>
      )}

      {contas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhuma empresa com conta do Omie cadastrada ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">App Key</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) =>
                editando === c.companyId ? (
                  <tr key={c.companyId} className="border-b border-border-soft">
                    <td colSpan={4} className="py-3">
                      <p className="text-[12px] font-medium mb-2">{c.empresa}</p>
                      <FormConta empresas={[]} inicial={{ companyId: c.companyId, appKey: c.appKey }} onFim={() => setEditando(null)} />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.companyId} className="border-b border-border-soft align-top">
                    <td className="py-2.5 pr-3 font-medium">{c.empresa}</td>
                    <td className="py-2.5 pr-3 text-fg-secondary tnum">{c.appKey || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={SAUDE[c.saude].variante}>{SAUDE[c.saude].rotulo}</Badge>
                      {teste[c.companyId] ? (
                        <span className={`block text-[11px] mt-1 ${teste[c.companyId].ok ? "text-success" : "text-danger"}`}>{teste[c.companyId].texto}</span>
                      ) : (
                        c.lastError && <span className="block text-[11px] mt-1 text-danger">{c.lastError}</span>
                      )}
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <Button variant="secondary" size="xs" loading={testando === c.companyId} disabled={testando !== null} onClick={() => testar(c.companyId)}>
                        Testar
                      </Button>
                      <Button variant="linkMuted" size="xs" onClick={() => setEditando(c.companyId)}>
                        Trocar chave
                      </Button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
