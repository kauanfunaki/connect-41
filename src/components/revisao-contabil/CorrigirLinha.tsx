"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { CAMPOS_DA_CORRECAO, ROTULO_DO_CAMPO } from "@/lib/revisao-contabil/regras-da-tela";
import { corrigirLeituraAction } from "@/app/(app)/revisao-contabil/actions";

type Campo = (typeof CAMPOS_DA_CORRECAO)[number];

type Props = {
  fechamentoId: string;
  documentoId: string;
  linha: number;
  conta: string;
  /** O que o motor leu, em centavos. */
  lido: Record<Campo, number>;
  /** A correção gravada, em centavos, por campo. */
  corrigido: Partial<Record<Campo, number>>;
};

const reais = (c: number | undefined) => (c === undefined ? "" : Number(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * Corrige a leitura de uma linha do balancete, como o "Editar extração" do
 * original: o documento continua como foi lido, e a correção vale nas
 * próximas análises. Campo vazio volta ao valor lido.
 */
export function CorrigirLinha({ fechamentoId, documentoId, linha, conta, lido, corrigido }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const base = useId();
  const temCorrecao = Object.keys(corrigido).length > 0;

  function salvar(form: FormData) {
    setErro(null);
    const valores = Object.fromEntries(CAMPOS_DA_CORRECAO.map((k) => [k, String(form.get(k) ?? "")]));
    startTransition(async () => {
      const r = await corrigirLeituraAction(fechamentoId, documentoId, linha, valores);
      if ("error" in r) return setErro(r.error);
      toast.success("Correção de leitura registrada. Execute a análise de novo.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant={temCorrecao ? "secondary" : "ghost"} size="xs" onClick={() => setAberto(true)}>
        {temCorrecao ? "Corrigida" : "Corrigir"}
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Corrigir a leitura" maxWidth="max-w-lg">
        <form action={salvar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-muted">
            {conta} · linha {linha + 1}. Deixe vazio o que foi lido certo.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {CAMPOS_DA_CORRECAO.map((k) => (
              <CampoForm key={k} label={ROTULO_DO_CAMPO[k]} htmlFor={`${base}-${k}`} helper={`Lido: ${reais(lido[k])}`}>
                <Input id={`${base}-${k}`} name={k} prefix="R$" inputMode="decimal" defaultValue={reais(corrigido[k])} autoComplete="off" />
              </CampoForm>
            ))}
          </div>
          {erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" loading={pendente} disabled={pendente}>
              Salvar correção
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
