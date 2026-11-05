"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, CreditCard, Plus } from "lucide-react";
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
 * faturas mais recentes de cada um, com as compras.
 *
 * Aba própria desde 04/11/2026 (Pagar/Receber A, página de opções): cada
 * cartão é um cartão de verdade, com a fatura em aberto em destaque e o limite
 * usado em barra; as faturas ficam embaixo, com as compras recolhidas.
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-helper text-fg-muted">
            A conta paga no cartão entra na fatura do ciclo: em “Pagar”, escolha o cartão em “Saiu da conta” — ou, ao lançar, em “Conta corrente” com “Já
            pago em”. A despesa entra na DRE no dia da compra; a fatura é uma conta a pagar ao cartão, fora da DRE.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setEditando("novo")}>
            <Plus size={14} /> Novo cartão
          </Button>
        </div>
        {cartoes.length === 0 ? (
          <p className="text-fs-2 text-fg-muted">Nenhum cartão cadastrado nesta empresa.</p>
        ) : (
          <>
            <p className="text-label font-semibold text-fg">
              Cartões de crédito{" "}
              <span className="font-normal text-fg-muted tabular-nums">{aPagar > 0 ? `${reais(aPagar)} em faturas a pagar` : "nenhuma fatura a pagar"}</span>
            </p>
            <ul className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]">
              {cartoes.map((c) => (
                <CartaoVisual key={c.id} cartao={c} onEditar={() => setEditando(c)} />
              ))}
            </ul>
          </>
        )}
      </div>
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

/**
 * Um cartão: a faixa na cor da marca com o nome, o final, a fatura em aberto e
 * o limite usado; embaixo, as faturas. Compacto — sem o respiro do desenho.
 */
function CartaoVisual({ cartao: c, onEditar }: { cartao: CartaoDaEmpresa; onEditar: () => void }) {
  const aberta = c.faturas.find((f) => f.situacao === "Aberta") ?? c.faturas.find((f) => f.situacao !== "Paga") ?? null;
  const usado = c.faturas.filter((f) => f.situacao !== "Paga").reduce((s, f) => s + f.valorCentavos, 0);
  const pct = c.limiteCentavos ? Math.min(100, Math.round((usado / c.limiteCentavos) * 100)) : null;
  const final = finalDoCartao(c.accountNumber);
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
      <div className={`flex flex-col gap-1.5 px-3 py-2.5 text-on-brand ${c.ativo ? "bg-brand-solid" : "bg-fg-muted"}`}>
        <div className="flex items-center gap-2">
          <CreditCard size={14} aria-hidden className="shrink-0 opacity-80" />
          <span className="min-w-0 truncate text-fs-2 font-semibold">{c.nome}</span>
          {final && <span className="ml-auto font-mono text-micro opacity-85">•••• {final}</span>}
        </div>
        <span className="text-micro opacity-85">
          {aberta ? `Fatura de ${mesDoCiclo(aberta.ciclo)} · ${aberta.situacao.toLowerCase()} · vence ${dataBr(aberta.vencimentoKey)}` : "Nenhuma fatura em aberto"}
          {!c.ativo && " · inativo"}
        </span>
        <span className="text-xl font-semibold tabular-nums leading-tight">{reais(aberta?.valorCentavos ?? 0)}</span>
        {pct !== null && (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/25" role="meter" aria-label="Limite usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className="text-micro opacity-85 tabular-nums">
              {reais(usado)} de {reais(c.limiteCentavos!)} do limite · {pct}%
            </span>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro text-fg-muted">
            {c.fechamento && c.vencimento ? `Fecha dia ${c.fechamento} · vence dia ${c.vencimento}` : "Sem os dias da fatura"}
          </span>
          <Button size="xs" variant="ghost" onClick={onEditar}>
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
    </li>
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
              <span className="min-w-0 truncate text-fg-secondary" data-dica={`${dataBr(p.dataKey)} · ${p.contraparteNome}${p.descricao ? ` — ${p.descricao}` : ""}`}>
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
