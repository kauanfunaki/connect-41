"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { REFERENCIAS, ROTULO_DA_REFERENCIA, type ItemDoReapontamento } from "@/lib/contabil-core/cadastro/reapontamento";

// "Corrigir conta do razão" (Bloco D, Fase D0, 26/11/2026): o botão, a confirmação e o relatório do
// reapontamento da conta sintética (`AgenciasTab.tsx` do contabil-front). Fica atrás de confirmação porque
// REESCREVE registros contábeis já gravados; o relatório diz, por conta bancária, o que foi movido e por que
// uma sintética ficou.

const URL_DA_ROTA = "/api/contabil-core/agencias/reapontar-contas-sinteticas";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function CorrigirContaDoRazao({ empresaId }: { empresaId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState<ItemDoReapontamento[] | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function corrigir() {
    setErro(null);
    startTransition(async () => {
      const resp = await fetch(URL_DA_ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: empresaId }),
        cache: "no-store",
      }).catch(() => null);
      const corpo = (await resp?.json().catch(() => null)) as { relatorio?: ItemDoReapontamento[]; error?: string } | null;
      if (!resp?.ok || !Array.isArray(corpo?.relatorio)) {
        setErro(typeof corpo?.error === "string" ? corpo.error : "Não deu para falar com o servidor. Tente de novo.");
        return;
      }
      setConfirmar(false);
      if (corpo.relatorio.length === 0) {
        toast.show("Nada a corrigir: nenhuma conta bancária com conta contábil sintética pendente.", "info");
        return;
      }
      setRelatorio(corpo.relatorio);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setConfirmar(true)}>
        <Wrench size={14} aria-hidden /> Corrigir conta do razão
      </Button>
      <ConfirmDialog
        open={confirmar}
        title="Corrigir a conta bancária do razão"
        confirmLabel="Corrigir agora"
        pendingLabel="Corrigindo…"
        pending={pendente}
        error={erro}
        onConfirm={corrigir}
        onCancel={() => {
          setConfirmar(false);
          setErro(null);
        }}
        largura="max-w-lg"
      >
        <div className="flex flex-col gap-2 text-sm text-fg-muted">
          <p>
            Quando uma conta bancária fica <strong className="text-fg">sem conta do plano de contas</strong>, o NEO cria uma conta sintética (
            <code className="text-xs">1.1.B.…</code>) para a contrapartida bancária. Ela não tem código reduzido, e é o código reduzido que o
            arquivo do Domínio usa: esses lançamentos saem num formato que o Domínio não importa.
          </p>
          <p>
            Vincular a conta contábil à conta bancária resolve os lançamentos <strong className="text-fg">novos</strong>. Esta ação corrige os que{" "}
            <strong className="text-fg">já estão gravados</strong>: move os lançamentos e as decisões do NEO da conta sintética para a conta vinculada e
            desativa a sintética.
          </p>
          <Aviso tom="atencao">
            Isso <strong>reescreve registros contábeis já lançados</strong>. Se a conta sintética ainda for usada por outra coisa (uma regra, por
            exemplo), ela é mantida e aparece no relatório.
          </Aviso>
        </div>
      </ConfirmDialog>
      <Modal open={relatorio !== null} onClose={() => setRelatorio(null)} title="Contas corrigidas" maxWidth="max-w-lg">
        <div className="flex flex-col gap-3">
          {relatorio?.map((r) => (
            <div key={r.contaSintetica} className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium">{r.agencia}</p>
              <p className="font-mono text-xs text-fg-muted">{r.contaSintetica}</p>
              <p className="mt-1">
                {plural(r.registrosMovidos, "lançamento movido no razão", "lançamentos movidos no razão")}
                {r.decisoesMovidas ? ` · ${plural(r.decisoesMovidas, "decisão do NEO", "decisões do NEO")}` : ""}
              </p>
              {r.sinteticaDesativada ? (
                <p className="mt-1 text-xs text-fg-muted">A conta sintética foi desativada.</p>
              ) : (
                <p className="mt-1 text-xs text-warning-fg">
                  A conta sintética foi mantida porque ainda é usada por:{" "}
                  {REFERENCIAS.filter((k) => r.referenciasRestantes[k])
                    .map((k) => `${ROTULO_DA_REFERENCIA[k]} (${r.referenciasRestantes[k]})`)
                    .join(", ")}
                  .
                </p>
              )}
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" onClick={() => setRelatorio(null)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
