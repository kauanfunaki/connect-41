"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";

type Categoria = { id: string; name: string };

type Lancamento = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  dueDateLabel: string;
  amountLabel: string;
  categoria: string | null;
  contraparte: string;
};

type Props = {
  lancamento: Lancamento | null;
  /** `null` quando o documento não pode virar lançamento — traz o porquê. */
  impedimento: string | null;
  direcao: "PAGAR" | "RECEBER" | "INDEFINIDA";
  vencimentoPresumidoIso: string;
  categorias: Categoria[];
  podeDecidir: boolean;
  lancarAction: (
    documentoId: string,
    opcoes: { categoriaId?: string | null; vencimento?: string | null }
  ) => Promise<{ error: string } | { ok: true; entryId: string }>;
  estornarAction: (documentoId: string) => Promise<{ error: string } | { ok: true }>;
  documentoId: string;
};

const STATUS_LABEL = {
  PROVISORIO: "Provisório",
  CONFERIDO: "Conferido",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
} as const;

const STATUS_VARIANTE = {
  PROVISORIO: "warning",
  CONFERIDO: "info",
  PAGO: "success",
  CANCELADO: "danger",
} as const;

export function LancamentoCard({
  lancamento,
  impedimento,
  direcao,
  vencimentoPresumidoIso,
  categorias,
  podeDecidir,
  lancarAction,
  estornarAction,
  documentoId,
}: Props) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [vencimento, setVencimento] = useState(vencimentoPresumidoIso);

  function lancar() {
    setErro(null);
    startTransition(async () => {
      const r = await lancarAction(documentoId, { categoriaId: categoriaId || null, vencimento });
      if ("error" in r) setErro(r.error);
    });
  }

  function estornar() {
    setErro(null);
    startTransition(async () => {
      const r = await estornarAction(documentoId);
      if ("error" in r) setErro(r.error);
    });
  }

  return (
    <Card className="p-5 mt-4">
      <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Lançamento</h2>

      {lancamento ? (
        <>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
            {/* "Provisório" só significa alguma coisa se a tela disser o que
                falta: nasce a conferir, e alguém precisa olhar. */}
            {lancamento.status === "PROVISORIO"
              ? "Nasceu deste documento e ainda não foi conferido por ninguém."
              : "Originado deste documento."}
          </p>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Badge variant={lancamento.kind === "PAGAR" ? "warning" : "success"}>
              {lancamento.kind === "PAGAR" ? "A pagar" : "A receber"}
            </Badge>
            <Badge variant={STATUS_VARIANTE[lancamento.status]}>{STATUS_LABEL[lancamento.status]}</Badge>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[length:var(--fs-ui)]">
            <div className="flex justify-between gap-4 border-b border-border py-1.5">
              <dt className="text-fg-muted">Valor</dt>
              <dd className="text-fg tnum">{lancamento.amountLabel}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1.5">
              <dt className="text-fg-muted">Vencimento</dt>
              <dd className="text-fg tnum">{lancamento.dueDateLabel}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1.5">
              <dt className="text-fg-muted">Contraparte</dt>
              <dd className="text-fg truncate">{lancamento.contraparte}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1.5">
              <dt className="text-fg-muted">Categoria</dt>
              <dd className="text-fg truncate">{lancamento.categoria ?? "—"}</dd>
            </div>
          </dl>

          {podeDecidir && (
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={estornar} disabled={pendente}>
                {pendente ? "Estornando…" : "Estornar lançamento"}
              </Button>
            </div>
          )}
        </>
      ) : impedimento ? (
        <p className="text-[length:var(--fs-helper)] text-fg-secondary">{impedimento}</p>
      ) : !podeDecidir ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted">
          Este documento ainda não virou lançamento. Só a coordenação do fiscal lança.
        </p>
      ) : (
        <>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
            Vira conta <span className="font-medium text-fg">{direcao === "PAGAR" ? "a pagar" : "a receber"}</span> da
            empresa. Nasce como <span className="font-medium text-fg">provisório</span> — alguém confere depois.
          </p>
          <FieldGrid>
            <CampoForm
              label="Categoria"
              htmlFor="categoria"
              helper={
                direcao === "PAGAR"
                  ? "Obrigatória: despesa sem classificação não fecha o DRE. Fica como padrão desta contraparte."
                  : "Opcional no recebimento."
              }
            >
              <Select id="categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">{direcao === "PAGAR" ? "Escolha…" : "Sem categoria"}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm
              label="Vencimento"
              htmlFor="vencimento"
              helper="Presumido em 30 dias — a nota não traz vencimento, ele vive na duplicata."
            >
              <Input
                id="vencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </CampoForm>
          </FieldGrid>
          <div className="mt-4">
            <Button type="button" onClick={lancar} disabled={pendente}>
              {pendente ? "Lançando…" : "Lançar"}
            </Button>
          </div>
        </>
      )}

      {erro && <p className="text-[length:var(--fs-helper)] text-danger mt-3">{erro}</p>}
    </Card>
  );
}
