"use client";

import { useId, useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { salvarEncargosDaEmpresa } from "@/app/(app)/fornecedores-e-sacados/actions";

// Juros e multa pelo atraso (22/10/2026): os três percentuais da regra — na
// aba "Juros e multa" da empresa e na ficha do fornecedor ou cliente. A conta
// é a de src/lib/financeiro/baixa/encargos.ts.

export type EncargosNoCampo = { multa: string; juros: string; desconto: string };

/**
 * Os três campos. `prefixo` dá o nome no formulário (`<prefixo>Multa`…), para
 * a ficha da contraparte não confundir com outro campo dela.
 */
export function CamposDosEncargos({ valores, prefixo = "", desabilitado = false }: { valores: EncargosNoCampo; prefixo?: string; desabilitado?: boolean }) {
  const id = useId();
  const nome = (c: string) => (prefixo ? `${prefixo}${c.charAt(0).toUpperCase()}${c.slice(1)}` : c);
  return (
    <FieldGrid columns="sm:grid-cols-3">
      <CampoForm label="Multa" htmlFor={`${id}-multa`} helper="Uma vez, no pagamento depois do vencimento.">
        <Input id={`${id}-multa`} name={nome("multa")} inputMode="decimal" suffix="%" defaultValue={valores.multa} placeholder="Ex.: 2" disabled={desabilitado} />
      </CampoForm>
      <CampoForm label="Juros ao mês" htmlFor={`${id}-juros`} helper="Simples, por dia corrido de atraso (mês de 30 dias).">
        <Input id={`${id}-juros`} name={nome("juros")} inputMode="decimal" suffix="%" defaultValue={valores.juros} placeholder="Ex.: 1" disabled={desabilitado} />
      </CampoForm>
      <CampoForm label="Desconto" htmlFor={`${id}-desconto`} helper="Opcional, no pagamento até o vencimento.">
        <Input id={`${id}-desconto`} name={nome("desconto")} inputMode="decimal" suffix="%" defaultValue={valores.desconto} placeholder="Ex.: 5" disabled={desabilitado} />
      </CampoForm>
    </FieldGrid>
  );
}

/** O resumo da ficha recolhida: "Multa 2% · juros 1% a.m." ou "Segue a da empresa". */
export function resumoDosEncargos(v: EncargosNoCampo): string {
  const partes = [v.multa && `Multa ${v.multa}%`, v.juros && `juros ${v.juros}% a.m.`, v.desconto && `desconto ${v.desconto}%`].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Segue a da empresa";
}

/** A regra da empresa, na aba "Juros e multa" de Fornecedores e sacados. */
export function FormEncargosDaEmpresa({ companyId, valores, podeEditar }: { companyId: string; valores: EncargosNoCampo; podeEditar: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        setSalvo(false);
        startTransition(async () => {
          const r = await salvarEncargosDaEmpresa(dados);
          if ("error" in r) setErro(r.error);
          else setSalvo(true);
        });
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <CamposDosEncargos valores={valores} desabilitado={!podeEditar} />
      {podeEditar && (
        <>
          {salvo && <p className="text-helper text-success-fg">Regra salva. A próxima baixa já vem calculada por ela.</p>}
          <FormFooter pending={pendente} submitLabel="Salvar regra" erro={erro} />
        </>
      )}
    </form>
  );
}
