"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
      if (!r.ok) toast.error(r.erro);
    });
  }

  function sair() {
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
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
          data-dica="Parar de trabalhar nesta empresa: as telas por empresa voltam a mostrar todas"
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
      data-dica="As telas por empresa passam a mostrar e gravar só esta empresa, com a matriz e as filiais"
    >
      <Crosshair size={14} aria-hidden />
      Trabalhar nesta empresa
    </Button>
  );
}

/**
 * O botão do aviso de um link de outra empresa (05/11/2026): a empresa só se
 * escolhe na faixa, então o link não troca sozinho — o botão troca. Com
 * `companyId`, passa a trabalhar nela; sem (o link pedia "todas"), sai do foco.
 * O endereço fica o mesmo, e a tela é desenhada de novo.
 */
export function AbrirOQueOLinkPedia({ companyId, rotulo }: { companyId: string | null; rotulo: string }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="xs"
      loading={pendente}
      loadingLabel="Abrindo…"
      onClick={() =>
        iniciar(async () => {
          if (!companyId) {
            await pararDeTrabalharNaEmpresa();
            return;
          }
          const r = await trabalharNaEmpresa(companyId);
          if (!r.ok) return toast.error(r.erro);
          router.refresh();
        })
      }
    >
      {rotulo}
    </Button>
  );
}
