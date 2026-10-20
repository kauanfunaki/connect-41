"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, CreditCard, Plus } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { useToast } from "@/components/ui/Toast";
import { formatarReaisDeCentavos } from "@/lib/format";
import { finalDoCartao, mesDoCiclo, BANCO_NAO_INFORMADO } from "@/lib/financeiro/cartao";
import { salvarCartao } from "@/lib/financeiro/cartaoAcoes";
import type { CartaoDaEmpresa, FaturaDoCartao } from "@/lib/financeiro/cartaoServidor";

const reais = (c: number) => formatarReaisDeCentavos(c);
const dataBr = (k: string) => k.split("-").reverse().join("/");

/**
 * Os cartões de crédito da empresa (lote D, 20/10 — a conta corrente do tipo
 * cartão do Omie): o cadastro, com os dias de fechamento e vencimento, e as
 * faturas mais recentes de cada um, com as compras. Um bloco que começa
 * fechado (a regra do Kauan, 08/10), com o que há a pagar na linha.
 *
 * Comprar no cartão é pagar a conta por ele: "Saiu da conta" na baixa, ou
 * "Conta corrente" com "Já pago em" ao lançar.
 */
export function CartoesDaEmpresa({ companyId, cartoes }: { companyId: string; cartoes: CartaoDaEmpresa[] }) {
  const [editando, setEditando] = useState<CartaoDaEmpresa | "novo" | null>(null);
  const toast = useToast();
  const aPagar = cartoes.flatMap((c) => c.faturas).filter((f) => f.situacao !== "Paga").reduce((s, f) => s + f.valorCentavos, 0);

  return (
    <>
      <BlocoRecolhivel
        titulo="Cartões de crédito"
        resumo={cartoes.length === 0 ? "Nenhum cadastrado" : aPagar > 0 ? `${reais(aPagar)} em faturas a pagar` : "Nenhuma fatura a pagar"}
        className="mb-4 bg-surface"
        espacoDaAcao="pr-40"
        acao={
          <Button size="xs" variant="secondary" onClick={() => setEditando("novo")}>
            <Plus size={12} /> Novo cartão
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <p className="text-helper text-fg-muted">
            A conta paga no cartão entra na fatura do ciclo: em “Pagar”, escolha o cartão em “Saiu da conta” — ou, ao lançar, escolha-o em “Conta corrente” com
            “Já pago em”. A despesa entra na DRE no dia da compra. A fatura é uma conta a pagar ao cartão, fora da DRE, e o dinheiro sai do banco quando ela é paga.
          </p>
          {cartoes.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <CreditCard size={14} className="flex-shrink-0 text-fg-muted" />
                  <span className="min-w-0">
                    <span className="text-fs-2 font-medium text-fg">{c.nome}</span>
                    <span className="block text-micro text-fg-muted">
                      {c.accountNumber}
                      {c.fechamento && c.vencimento ? ` · fecha dia ${c.fechamento} · vence dia ${c.vencimento}` : " · sem os dias da fatura"}
                      {!c.ativo && " · inativo"}
                    </span>
                  </span>
                </span>
                <Button size="xs" variant="ghost" onClick={() => setEditando(c)}>
                  Editar
                </Button>
              </div>
              {c.faturas.length === 0 ? (
                <p className="text-micro text-fg-muted">Nenhuma compra ainda.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border-soft">
                  {c.faturas.map((f) => (
                    <LinhaDaFatura key={f.id} fatura={f} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </BlocoRecolhivel>
      {editando && (
        <JanelaDoCartao
          companyId={companyId}
          cartao={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onFeito={(novo) => {
            setEditando(null);
            toast.success(novo ? "Cartão cadastrado." : "Cartão salvo.");
          }}
        />
      )}
    </>
  );
}

/** A fatura numa linha; as compras abrem embaixo (começam fechadas). */
function LinhaDaFatura({ fatura: f }: { fatura: FaturaDoCartao }) {
  const [aberta, setAberta] = useState(false);
  const Seta = aberta ? ChevronDown : ChevronRight;
  return (
    <li className="py-1.5 text-fs-2">
      <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setAberta((a) => !a)} aria-expanded={aberta}>
        <span className="flex min-w-0 items-center gap-1.5">
          <Seta size={12} className="flex-shrink-0 text-fg-muted" />
          <span className="text-fg">Fatura de {mesDoCiclo(f.ciclo)}</span>
          <span className="text-micro text-fg-muted">
            · {f.situacao.toLowerCase()} · vence {dataBr(f.vencimentoKey)} · {f.compras.length} {f.compras.length === 1 ? "compra" : "compras"}
          </span>
        </span>
        <span className="tabular-nums font-medium text-fg">{reais(f.valorCentavos)}</span>
      </button>
      {aberta && (
        <ul className="mt-1 flex flex-col gap-0.5 pl-5">
          {f.compras.map((p) => (
            <li key={p.paymentId} className="flex items-center justify-between gap-3 text-micro">
              <span className="min-w-0 truncate text-fg-secondary">
                {dataBr(p.dataKey)} · {p.contraparteNome}
                {p.descricao && ` — ${p.descricao}`}
              </span>
              <span className="tabular-nums text-fg-secondary">{reais(p.centavos)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function JanelaDoCartao({
  companyId,
  cartao,
  onFechar,
  onFeito,
}: {
  companyId: string;
  cartao: CartaoDaEmpresa | null;
  onFechar: () => void;
  onFeito: (novo: boolean) => void;
}) {
  const id = useId();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <Modal open onClose={() => !pendente && onFechar()} title={cartao ? "Editar cartão de crédito" : "Novo cartão de crédito"} maxWidth="max-w-xl">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await salvarCartao(form);
            if ("error" in r) setErro(r.error);
            else onFeito(!cartao);
          });
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        {cartao && <input type="hidden" name="id" value={cartao.id} />}
        <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_140px]">
          <CampoForm label="Nome do cartão" htmlFor={`${id}-nome`} required helper="Como a equipe chama o cartão — é também o credor da fatura.">
            <Input id={`${id}-nome`} name="nome" maxLength={80} defaultValue={cartao?.nome} placeholder="Itaú Visa empresarial" required />
          </CampoForm>
          <CampoForm label="Final do cartão" htmlFor={`${id}-final`} required helper="Os 4 últimos números.">
            <Input
              id={`${id}-final`}
              name="final"
              inputMode="numeric"
              maxLength={4}
              defaultValue={cartao ? finalDoCartao(cartao.accountNumber) : ""}
              placeholder="1234"
              required
            />
          </CampoForm>
        </FieldGrid>
        <FieldGrid columns="sm:grid-cols-3">
          <CampoForm label="Fecha no dia" htmlFor={`${id}-fechamento`} required helper="A compra deste dia em diante entra na fatura seguinte.">
            <Input id={`${id}-fechamento`} name="fechamento" inputMode="numeric" maxLength={2} defaultValue={cartao?.fechamento ?? ""} placeholder="25" required />
          </CampoForm>
          <CampoForm label="Vence no dia" htmlFor={`${id}-vencimento`} required>
            <Input id={`${id}-vencimento`} name="vencimento" inputMode="numeric" maxLength={2} defaultValue={cartao?.vencimento ?? ""} placeholder="5" required />
          </CampoForm>
          <CampoForm label="Banco (COMPE)" htmlFor={`${id}-banco`} helper="Opcional. Quem emitiu.">
            <Input
              id={`${id}-banco`}
              name="banco"
              inputMode="numeric"
              maxLength={4}
              defaultValue={cartao && cartao.bankCode !== BANCO_NAO_INFORMADO ? cartao.bankCode : ""}
              placeholder="341"
            />
          </CampoForm>
        </FieldGrid>
        {cartao && (
          <FieldGrid columns="sm:grid-cols-[200px]">
            <CampoForm label="Situação" htmlFor={`${id}-ativo`} helper="Inativo não aparece para pagar; as faturas ficam.">
              <Select id={`${id}-ativo`} name="ativo" defaultValue={cartao.ativo ? "1" : "0"}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </Select>
            </CampoForm>
          </FieldGrid>
        )}
        {cartao && (
          <p className="text-helper text-fg-muted">Mudar os dias vale para as próximas compras: a que já está numa fatura fica nela.</p>
        )}
        <FormFooter pending={pendente} submitLabel={cartao ? "Salvar" : "Cadastrar cartão"} pendingLabel="Salvando…" onCancel={onFechar} erro={erro} />
      </form>
    </Modal>
  );
}
