"use client";

// Os controles da DCTFWeb do mês (17/11/2026, funcionalidade-734): o ajuste da
// rotina, as empresas que entram e o "Rodar agora", que gasta — por isso pede
// confirmação com o custo estimado.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Switch } from "@/components/ui/Switch";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { useToast } from "@/components/ui/Toast";
import { formatCnpj } from "@/lib/format";
import { marcarEmpresasAction, rodarAgoraAction, salvarAjusteAction } from "@/app/(app)/autorizacoes/dctfweb/actions";

type Resultado = { ok: true; texto: string } | { ok: false; erro: string };

function useAcao() {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const rodar = (acao: () => Promise<Resultado>, depois?: () => void) =>
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.texto);
      depois?.();
      router.refresh();
    });
  return { pendente, rodar };
}

export function AjusteDaRotina({ ligada, diaSemEvento, teto }: { ligada: boolean; diaSemEvento: number; teto: string }) {
  const { pendente, rodar } = useAcao();
  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        rodar(() => salvarAjusteAction(form));
      }}
    >
      <Switch name="ligada" value="on" defaultChecked={ligada} rotulo="Rodar sozinha todo mês" />
      <label className="flex flex-col gap-1 text-ui">
        <span className="text-fg-muted">Tentar sem o evento a partir do dia</span>
        <Input compact name="diaSemEvento" type="number" min={1} max={28} defaultValue={diaSemEvento} className="w-24" />
      </label>
      <label className="flex flex-col gap-1 text-ui">
        <span className="text-fg-muted">Teto da rotina no mês (R$)</span>
        <Input compact name="teto" defaultValue={teto} placeholder="só o da conexão" className="w-40" />
      </label>
      <Button type="submit" variant="secondary" size="sm" loading={pendente}>
        Salvar
      </Button>
    </form>
  );
}

export function IncluirEmpresas({ empresas }: { empresas: { id: string; nome: string; cnpj: string }[] }) {
  const { pendente, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return empresas.filter((e) => !q || e.nome.toLowerCase().includes(q) || (digitos && e.cnpj.includes(digitos))).slice(0, 200);
  }, [busca, empresas]);
  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)} disabled={!empresas.length}>
        <Plus size={14} /> Incluir empresas
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Incluir empresas na DCTFWeb do mês" maxWidth="max-w-xl">
        <div className="flex flex-col gap-3">
          <CampoDeBusca value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CNPJ" aria-label="Buscar empresa" />
          <div className="flex items-center justify-between text-ui text-fg-muted">
            <span>
              {marcadas.size} de {empresas.length} marcadas · só empresas com CNPJ
            </span>
            <button type="button" className="text-brand underline" onClick={() => setMarcadas(new Set([...marcadas, ...visiveis.map((e) => e.id)]))}>
              Marcar as da lista
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border-soft">
            {visiveis.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-3 px-3 py-2 text-ui cursor-pointer">
                  <Checkbox checked={marcadas.has(e.id)} onChange={() => alternar(e.id)} />
                  <span className="flex-1">{e.nome}</span>
                  <span className="tabular-nums text-fg-muted">{formatCnpj(e.cnpj)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              loading={pendente}
              disabled={!marcadas.size}
              onClick={() =>
                rodar(
                  () => marcarEmpresasAction([...marcadas], true),
                  () => {
                    setMarcadas(new Set());
                    setAberto(false);
                  }
                )
              }
            >
              Incluir {marcadas.size || ""}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function TirarEmpresa({ companyId, nome }: { companyId: string; nome: string }) {
  const { pendente, rodar } = useAcao();
  return (
    <Button variant="ghost" size="xs" loading={pendente} aria-label={`Tirar ${nome} da DCTFWeb do mês`} onClick={() => rodar(() => marcarEmpresasAction([companyId], false))}>
      <X size={12} /> Tirar
    </Button>
  );
}

/** O "Rodar agora" (todas) e o "Tentar de novo" (uma), com o custo máximo na confirmação. */
export function RodarAgora({
  competencia,
  rotuloDaCompetencia,
  companyId = null,
  empresas,
  custoMaximo,
}: {
  competencia: string;
  rotuloDaCompetencia: string;
  companyId?: string | null;
  empresas: number;
  custoMaximo: string;
}) {
  const { pendente, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  const uma = !!companyId;
  return (
    <>
      <Button variant={uma ? "ghost" : "primary"} size={uma ? "xs" : "sm"} onClick={() => setAberto(true)} disabled={!empresas}>
        {uma ? (
          <>
            <RotateCcw size={12} /> Tentar de novo
          </>
        ) : (
          <>
            <Play size={14} /> Rodar agora
          </>
        )}
      </Button>
      <ConfirmDialog
        open={aberto}
        title={uma ? "Tentar de novo esta empresa?" : `Baixar a DCTFWeb de ${rotuloDaCompetencia}?`}
        description={`${uma ? "A empresa vai" : `${empresas} ${empresas === 1 ? "empresa vai" : "empresas vão"}`} para a fila do Serpro na competência ${rotuloDaCompetencia}. Cada chamada é cobrada: até ${custoMaximo} se todas tiverem declaração (recibo + DARF). O que já foi baixado não é pedido de novo.`}
        confirmLabel={uma ? "Tentar de novo" : "Rodar agora"}
        pendingLabel="Chamando o Serpro…"
        pending={pendente}
        onCancel={() => setAberto(false)}
        onConfirm={() => rodar(() => rodarAgoraAction(competencia, companyId), () => setAberto(false))}
      />
    </>
  );
}
