"use client";

import { useTransition } from "react";
import { Crosshair, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { pararDeTrabalharNaEmpresa, trabalharNaEmpresa } from "@/app/(app)/foco-actions";

/**
 * "Trabalhar nesta empresa", na ficha (15/10/2026): a partir daí as telas do
 * BPO mostram e gravam só ela (com a matriz e as filiais), até trocar ou sair
 * pela faixa do topo. Na empresa que já está em foco, o selo e o "Sair".
 */
export function TrabalharNestaEmpresa({ companyId, emFoco }: { companyId: string; emFoco: boolean }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();

  function entrar() {
    iniciar(async () => {
      const r = await trabalharNaEmpresa(companyId);
      if (r.ok) toast.success(`Pronto: as telas do BPO agora mostram e gravam só ${r.descricao}.`);
      else toast.error(r.erro);
    });
  }

  function sair() {
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
      toast.success("As telas do BPO voltaram a mostrar todas as empresas.");
    });
  }

  if (emFoco) {
    return (
      <span className={`inline-flex items-center gap-1 transition-opacity ${pendente ? "opacity-60" : ""}`}>
        <Selo tom="marca">Trabalhando nesta empresa</Selo>
        <Button
          variant="ghost"
          size="sm"
          onClick={sair}
          disabled={pendente}
          data-dica="Parar de trabalhar nesta empresa: as telas do BPO voltam a mostrar todas"
        >
          <LogOut size={14} aria-hidden />
          Sair
        </Button>
      </span>
    );
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={entrar}
      loading={pendente}
      loadingLabel="Abrindo…"
      data-dica="As telas do BPO passam a mostrar e gravar só esta empresa, com a matriz e as filiais"
    >
      <Crosshair size={14} aria-hidden />
      Trabalhar nesta empresa
    </Button>
  );
}

/**
 * O botão do aviso de endereço fora do foco: sai do foco e fica no mesmo
 * endereço, que então abre a empresa que ele pedia.
 */
export function SairDoFocoEAbrir({ rotulo }: { rotulo: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      variant="secondary"
      size="xs"
      loading={pendente}
      loadingLabel="Abrindo…"
      onClick={() =>
        iniciar(async () => {
          await pararDeTrabalharNaEmpresa();
        })
      }
    >
      {rotulo}
    </Button>
  );
}
