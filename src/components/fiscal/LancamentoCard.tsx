"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";

type Categoria = { id: string; name: string };
type Centro = { id: string; nome: string };

type Lancamento = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  dueDateLabel: string;
  amountLabel: string;
  categoria: string | null;
  contraparte: string;
  centroDeCusto?: string | null;
};

type Props = {
  lancamento: Lancamento | null;
  /** `null` quando o documento não pode virar lançamento — traz o porquê. */
  impedimento: string | null;
  direcao: "PAGAR" | "RECEBER" | "INDEFINIDA";
  vencimentoPresumidoIso: string;
  categorias: Categoria[];
  /** Centros de custo ativos da empresa do documento. Sem nenhum, o campo não aparece. */
  centros?: Centro[];
  podeDecidir: boolean;
  lancarAction: (
    documentoId: string,
    opcoes: { categoriaId?: string | null; vencimento?: string | null; centroDeCustoId?: string | null }
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

// Cancelado saiu de cena: neutro (07/10/2026), o `neutral` do Badge.
const STATUS_VARIANTE = {
  PROVISORIO: "warning",
  CONFERIDO: "info",
  PAGO: "success",
  CANCELADO: "neutral",
} as const;

export function LancamentoCard({
  lancamento,
  impedimento,
  direcao,
  vencimentoPresumidoIso,
  categorias,
  centros = [],
  podeDecidir,
  lancarAction,
  estornarAction,
  documentoId,
}: Props) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [vencimento, setVencimento] = useState(vencimentoPresumidoIso);
  const [centroId, setCentroId] = useState("");

  function lancar() {
    setErro(null);
    startTransition(async () => {
      const r = await lancarAction(documentoId, { categoriaId: categoriaId || null, vencimento, centroDeCustoId: centroId || null });
      if ("error" in r) setErro(r.error);
    });
  }

  return (
    <Card className="p-5 mt-4">
      <h2 className="text-section font-semibold text-fg mb-1">Lançamento</h2>

      {lancamento ? (
        <>
          <p className="text-helper text-fg-muted mb-4">
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
            <Selo tom={tomDaVariante(STATUS_VARIANTE[lancamento.status])}>{STATUS_LABEL[lancamento.status]}</Selo>
          </div>
          {/* Rótulo em cima e valor embaixo, como as fichas "Documento" e
              "Partes" logo acima — era rótulo à esquerda e valor empurrado
              para a direita, com fio embaixo, o único desenho diferente da
              página. */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <ItemDaFicha rotulo="Valor" valor={lancamento.amountLabel} numerico />
            <ItemDaFicha rotulo="Vencimento" valor={lancamento.dueDateLabel} numerico />
            <ItemDaFicha rotulo="Contraparte" valor={lancamento.contraparte} />
            <ItemDaFicha rotulo="Categoria" valor={lancamento.categoria ?? "—"} />
            {lancamento.centroDeCusto !== undefined && (
              <ItemDaFicha rotulo="Centro de custo" valor={lancamento.centroDeCusto ?? "—"} />
            )}
          </dl>

          {podeDecidir && (
            <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-border">
              {/* Com confirmação (achado do polimento de 30/09): o estorno apaga o
                  título do financeiro num clique, e o botão fica onde a mão vai. */}
              <ConfirmActionButton
                action={async () => {
                  const r = await estornarAction(documentoId);
                  return "error" in r ? r : null;
                }}
                label="Estornar lançamento"
                title="Estornar o lançamento?"
                description="O título sai do financeiro e o documento volta para Pendente. Dá para lançar de novo depois."
                confirmLabel="Estornar"
                successMessage="Lançamento estornado."
                destructive
                size="md"
              />
            </div>
          )}
        </>
      ) : impedimento ? (
        <p className="text-helper text-fg-secondary">{impedimento}</p>
      ) : !podeDecidir ? (
        <p className="text-helper text-fg-muted">
          Este documento ainda não virou lançamento. Só a coordenação do fiscal lança.
        </p>
      ) : (
        <>
          <p className="text-helper text-fg-muted mb-4">
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
              <CampoData
                id="vencimento"
               
                value={vencimento}
                onChange={(v) => setVencimento(v)}
              />
            </CampoForm>
            {centros.length > 0 && (
              <CampoForm
                label="Centro de custo"
                htmlFor="centro-de-custo"
                helper="Opcional. Em branco, vale o centro padrão da contraparte, se houver."
              >
                <Select id="centro-de-custo" value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                  <option value="">Padrão da contraparte / sem centro</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
          </FieldGrid>
          <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-border">
            <Button type="button" onClick={lancar} disabled={pendente}>
              {pendente ? "Lançando…" : "Lançar"}
            </Button>
          </div>
        </>
      )}

      {erro && <p className="text-helper text-danger mt-3">{erro}</p>}
    </Card>
  );
}

/** Um par rótulo/valor da ficha, no desenho do `InfoRow` das fichas vizinhas. */
function ItemDaFicha({ rotulo, valor, numerico = false }: { rotulo: string; valor: string; numerico?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-helper text-fg-muted mb-0.5">{rotulo}</dt>
      <dd className={`text-body text-fg truncate ${numerico ? "tnum" : ""}`}>{valor}</dd>
    </div>
  );
}
