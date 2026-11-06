"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { ESTADOS_DO_ACHADO } from "@/lib/revisao-contabil/regras-da-tela";
import { salvarAcompanhamentoAction } from "@/app/(app)/revisao-contabil/actions";

type Props = {
  fechamentoId: string;
  execucaoId: string;
  achadoId: string;
  titulo: string;
  responsavel: string;
  estado: string;
  nota: string;
};

/**
 * O acompanhamento de um achado: quem cuida, em que pé está e a anotação.
 * Vale para a execução mostrada; uma execução nova começa do zero, porque os
 * achados são renumerados (como no original).
 */
export function AcompanharAchado({ fechamentoId, execucaoId, achadoId, titulo, responsavel, estado, nota }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const base = useId();

  function salvar(form: FormData) {
    setErro(null);
    startTransition(async () => {
      const r = await salvarAcompanhamentoAction(fechamentoId, execucaoId, achadoId, {
        responsavel: String(form.get("responsavel") ?? ""),
        estado: String(form.get("estado") ?? ""),
        nota: String(form.get("nota") ?? ""),
      });
      if ("error" in r) return setErro(r.error);
      toast.success("Acompanhamento salvo.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="xs" onClick={() => setAberto(true)}>
        Acompanhar
      </Button>
      <SlideOver open={aberto} onClose={() => setAberto(false)} title={`${achadoId} · acompanhamento`}>
        <form action={salvar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-muted">{titulo}</p>
          <CampoForm label="Responsável" htmlFor={`${base}-resp`}>
            <Input id={`${base}-resp`} name="responsavel" maxLength={120} defaultValue={responsavel} autoComplete="off" />
          </CampoForm>
          <CampoForm label="Estado" htmlFor={`${base}-estado`}>
            <Select id={`${base}-estado`} name="estado" defaultValue={(ESTADOS_DO_ACHADO as readonly string[]).includes(estado) ? estado : "Aberto"}>
              {ESTADOS_DO_ACHADO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Anotação" htmlFor={`${base}-nota`} helper="Entra no relatório, na pendência.">
            <Textarea id={`${base}-nota`} name="nota" rows={6} maxLength={5000} defaultValue={nota} placeholder="O que foi pedido, a quem, e o que falta." />
          </CampoForm>
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
              Salvar acompanhamento
            </Button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}
