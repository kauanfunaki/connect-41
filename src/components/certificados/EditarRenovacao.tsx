"use client";

import { useId, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { useToast } from "@/components/ui/Toast";
import { ROTULO_DA_RENOVACAO, STATUS_DA_RENOVACAO, type PagaQuem } from "@/lib/certificados/usos";
import { salvarRenovacao } from "@/app/(app)/certificados/actions";

type Props = {
  id: string;
  titular: string;
  vencimento: string;
  /** O que está gravado (pode ser nulo: a tela mostra "A pedir" sozinha). */
  status: string | null;
  responsavelId: string | null;
  custoCentavos: number | null;
  pagaQuem: string | null;
  equipe: { id: string; name: string }[];
  /** O conteúdo do botão: a situação e o responsável, como a coluna mostra. */
  children: React.ReactNode;
};

const reais = (c: number | null) => (c === null ? "" : Number(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * A renovação de um certificado (05/11/2026): em que pé está, quem cuida,
 * quanto custa e quem paga. O custo e o "quem paga" são a parte que o
 * Financeiro lê — a tela é compartilhada com ele pelo "Também em".
 * A célula inteira da coluna "Renovação" é o botão que abre isto.
 */
export function EditarRenovacao({ id, titular, vencimento, status, responsavelId, custoCentavos, pagaQuem, equipe, children }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paga, setPaga] = useState<PagaQuem | null>((pagaQuem as PagaQuem | null) ?? null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const base = useId();

  function salvar(form: FormData) {
    setErro(null);
    startTransition(async () => {
      const r = await salvarRenovacao(id, {
        status: String(form.get("status") ?? ""),
        responsavelId: String(form.get("responsavelId") ?? ""),
        custo: String(form.get("custo") ?? ""),
        pagaQuem: paga ?? "",
      });
      if ("error" in r) setErro(r.error);
      else {
        toast.success("Renovação salva.");
        setAberto(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro(null);
          setPaga((pagaQuem as PagaQuem | null) ?? null);
          setAberto(true);
        }}
        aria-label={`Editar a renovação do certificado de ${titular}`}
        className="-mx-1.5 -my-1 flex min-h-8 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors"
      >
        {children}
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Renovação do certificado" maxWidth="max-w-lg">
        <form action={salvar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-muted">
            {titular} · vence em {vencimento}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Situação" htmlFor={`${base}-status`}>
              <Select id={`${base}-status`} name="status" defaultValue={status ?? ""}>
                <option value="">Ninguém mexeu ainda</option>
                {STATUS_DA_RENOVACAO.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_DA_RENOVACAO[s]}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Responsável" htmlFor={`${base}-resp`}>
              <Select id={`${base}-resp`} name="responsavelId" defaultValue={responsavelId ?? ""}>
                <option value="">Sem responsável</option>
                {equipe.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Custo da renovação" htmlFor={`${base}-custo`} helper="Em reais, como 190 ou 1.140,00.">
              <Input id={`${base}-custo`} name="custo" prefix="R$" inputMode="decimal" defaultValue={reais(custoCentavos)} autoComplete="off" />
            </CampoForm>
          </div>
          <RadioGroup<PagaQuem>
            legenda="Quem paga"
            variante="linha"
            valor={paga}
            onChange={setPaga}
            opcoes={[
              { valor: "CLIENTE", rotulo: "O cliente" },
              { valor: "ESCRITORIO", rotulo: "A 41" },
            ]}
          />
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
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
