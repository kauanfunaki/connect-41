"use client";

import { useId, useState, useTransition } from "react";
import { Lock, Undo2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { dadosDaBaixa, registrarPagamento, desfazerBaixa, type DadosDaBaixa, type BaixaDaConta } from "@/lib/financeiro/acoes";

// A janela da baixa (19/10, lote C — pedidos 4 e 6 do BPO). Abre do botão
// Pagar/Receber e do "⋯ › Baixas" de Contas a pagar e a receber. Era um balão
// com a data só; agora pede a conta bancária, juros, multa e desconto, aceita
// valor menor que o saldo (baixa parcial) e lista as baixas que a conta já
// tem, para desfazer uma a uma.

type Carregado = Extract<DadosDaBaixa, { ok: true }>;

const dataBr = (key: string) => key.split("-").reverse().join("/");
const reais = (centavos: number) => formatarReaisDeCentavos(centavos);
/** "1.234,56" — como o campo de valor recebe. */
const noCampo = (centavos: number) => Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ORIGEM: Record<BaixaDaConta["origem"], string> = {
  MANUAL: "baixa manual",
  LANCAMENTO: "no lançamento",
  CONCILIACAO: "pela conciliação",
  TRANSFERENCIA: "transferência",
  OMIE: "pelo Omie",
  MIGRACAO: "anterior a 19/10",
};

/**
 * Como o `useConfirm`: `abrir(entryId)` e o elemento a pôr na tela. Abre na
 * hora, com "Carregando…", e busca saldo, contas bancárias e baixas — que são
 * da empresa da conta, e a tabela mistura empresas.
 */
export function useJanelaDaBaixa(hojeISO: string, aoTerminar?: (aviso: string | null) => void) {
  const [estado, setEstado] = useState<{ entryId: string; dados: DadosDaBaixa | null } | null>(null);

  function carregar(entryId: string) {
    void dadosDaBaixa(entryId).then((dados) =>
      setEstado((atual) => (atual && atual.entryId === entryId ? { entryId, dados } : atual))
    );
  }
  function abrir(entryId: string) {
    setEstado({ entryId, dados: null });
    carregar(entryId);
  }

  const janela = estado ? (
    <Janela
      key={estado.entryId}
      entryId={estado.entryId}
      dados={estado.dados}
      hojeISO={hojeISO}
      onFechar={() => setEstado(null)}
      onPago={(aviso) => {
        setEstado(null);
        aoTerminar?.(aviso);
      }}
      onDesfeito={() => carregar(estado.entryId)}
    />
  ) : null;
  return { abrir, janela };
}

function Janela({
  entryId,
  dados,
  hojeISO,
  onFechar,
  onPago,
  onDesfeito,
}: {
  entryId: string;
  dados: DadosDaBaixa | null;
  hojeISO: string;
  onFechar: () => void;
  onPago: (aviso: string | null) => void;
  onDesfeito: () => void;
}) {
  const [pendente, setPendente] = useState(false);
  const aPagar = dados?.ok ? dados.kind === "PAGAR" : true;
  return (
    <Modal open onClose={() => !pendente && onFechar()} title={aPagar ? "Pagamento" : "Recebimento"} maxWidth="max-w-2xl">
      {dados === null ? (
        <p className="py-6 text-center text-fs-2 text-fg-muted">Carregando…</p>
      ) : !dados.ok ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao" icone={<Lock />}>
            {dados.erro}
          </Aviso>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-helper text-fg-secondary">
            <strong className="text-fg">{dados.contraparteNome}</strong> · valor {reais(dados.valorCentavos)}
            {dados.saldoCentavos < dados.valorCentavos && (
              <>
                {" "}
                · já {aPagar ? "pago" : "recebido"} {reais(dados.valorCentavos - dados.saldoCentavos)} ·{" "}
                <strong className="text-fg">saldo {reais(dados.saldoCentavos)}</strong>
              </>
            )}
          </p>

          {dados.saldoCentavos > 0 &&
            (dados.bloqueio ? (
              <Aviso tom="atencao" icone={<Lock />}>
                {dados.bloqueio}
              </Aviso>
            ) : (
              <FormularioDaBaixa entryId={entryId} dados={dados} hojeISO={hojeISO} aoMudarPendente={setPendente} onPago={onPago} onCancelar={onFechar} />
            ))}

          {dados.baixas.length > 0 && <ListaDeBaixas baixas={dados.baixas} aPagar={aPagar} onDesfeito={onDesfeito} />}

          {dados.saldoCentavos === 0 && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onFechar}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function FormularioDaBaixa({
  entryId,
  dados,
  hojeISO,
  aoMudarPendente,
  onPago,
  onCancelar,
}: {
  entryId: string;
  dados: Carregado;
  hojeISO: string;
  aoMudarPendente: (p: boolean) => void;
  onPago: (aviso: string | null) => void;
  onCancelar: () => void;
}) {
  const id = useId();
  const aPagar = dados.kind === "PAGAR";
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [valor, setValor] = useState(noCampo(dados.saldoCentavos));
  const [juros, setJuros] = useState("");
  const [multa, setMulta] = useState("");
  const [desconto, setDesconto] = useState("");

  // O total ao vivo: o que vai bater com a linha do extrato.
  const lido = (t: string) => (t.trim() === "" ? 0 : centavosDeTexto(t));
  const partes = [lido(valor), lido(juros), lido(multa), lido(desconto)];
  const legivel = partes.every((p) => p !== null);
  const [p, j, m, d] = partes.map((x) => x ?? 0) as [number, number, number, number];
  const total = p + j + m - d;
  const saldoDepois = dados.saldoCentavos - p;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setErro(null);
        aoMudarPendente(true);
        startTransition(async () => {
          const r = await registrarPagamento(form);
          aoMudarPendente(false);
          if ("error" in r) setErro(r.error);
          else onPago(r.quitada ? null : `Baixa parcial registrada — a conta continua em aberto com ${reais(saldoDepois)}.`);
        });
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <FieldGrid>
        <CampoForm label={aPagar ? "Data do pagamento" : "Data do recebimento"} htmlFor={`${id}-data`} required>
          <CampoData id={`${id}-data`} name="data" defaultValue={hojeISO} max={hojeISO} required />
        </CampoForm>
        <CampoForm
          label={aPagar ? "Saiu da conta" : "Entrou na conta"}
          htmlFor={`${id}-conta`}
          helper={dados.contas.length === 0 ? "Nenhuma conta bancária cadastrada nesta empresa (Banco e caixa)." : "Opcional. É a conta que a conciliação procura."}
        >
          <Select id={`${id}-conta`} name="contaBancariaId" defaultValue={dados.contas.length === 1 ? dados.contas[0]!.id : ""} disabled={dados.contas.length === 0}>
            <option value="">Não informada</option>
            {dados.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>

      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
        <CampoForm
          label="Valor da baixa"
          htmlFor={`${id}-valor`}
          required
          helper={legivel && p > 0 && p < dados.saldoCentavos ? `Parcial: fica ${reais(saldoDepois)} em aberto.` : "Do título. Menos que o saldo é baixa parcial."}
        >
          <Input id={`${id}-valor`} name="valor" prefix="R$" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </CampoForm>
        <CampoForm label="Juros" htmlFor={`${id}-juros`}>
          <Input id={`${id}-juros`} name="juros" prefix="R$" inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Multa" htmlFor={`${id}-multa`}>
          <Input id={`${id}-multa`} name="multa" prefix="R$" inputMode="decimal" value={multa} onChange={(e) => setMulta(e.target.value)} placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Desconto" htmlFor={`${id}-desconto`}>
          <Input id={`${id}-desconto`} name="desconto" prefix="R$" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" />
        </CampoForm>
      </FieldGrid>

      <CampoForm label="Observação" htmlFor={`${id}-obs`}>
        <Input id={`${id}-obs`} name="observacao" maxLength={255} placeholder="Ex.: pago com atraso, juros do boleto" />
      </CampoForm>

      <p className="text-ui text-fg-secondary">
        Total {aPagar ? "pago" : "recebido"}:{" "}
        <strong className="text-fg tabular-nums">{legivel && total >= 0 ? reais(total) : "—"}</strong>
        <span className="text-helper text-fg-muted"> · valor + juros + multa − desconto. Juros e multa vão para a categoria de encargos, e o desconto para a de descontos.</span>
      </p>

      <FormFooter
        pending={pendente}
        submitLabel={aPagar ? "Registrar pagamento" : "Registrar recebimento"}
        pendingLabel="Registrando…"
        onCancel={onCancelar}
        erro={erro}
      />
    </form>
  );
}

function ListaDeBaixas({ baixas, aPagar, onDesfeito }: { baixas: BaixaDaConta[]; aPagar: boolean; onDesfeito: () => void }) {
  const { dialog, requestConfirm } = useConfirm();

  function desfazer(b: BaixaDaConta) {
    requestConfirm(
      {
        title: aPagar ? "Desfazer este pagamento?" : "Desfazer este recebimento?",
        description: `A baixa de ${reais(b.caixaCentavos)} em ${dataBr(b.dataKey)} sai, e o valor volta para o saldo em aberto da conta.`,
        confirmLabel: "Desfazer",
        destructive: true,
      },
      async () => {
        const r = await desfazerBaixa(b.id);
        if (r?.error) throw new Error(r.error);
        onDesfeito();
      }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label font-semibold text-fg">{baixas.length === 1 ? "Baixa desta conta" : `As ${baixas.length} baixas desta conta`}</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-ui">
          <thead>
            <tr className="border-b border-border bg-table-header-bg text-micro uppercase tracking-wide text-fg-muted">
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Conta</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 text-right font-medium">Encargos</th>
              <th className="px-3 py-2 text-right font-medium">Desconto</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {baixas.map((b) => (
              <tr key={b.id} className="border-b border-border-soft last:border-b-0 align-top">
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {dataBr(b.dataKey)}
                  <span className="block text-micro text-fg-muted">{ORIGEM[b.origem]}</span>
                </td>
                <td className="px-3 py-2">
                  {b.contaNome ?? <span className="text-fg-muted">—</span>}
                  {b.observacao && <span className="block text-micro text-fg-muted">{b.observacao}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{reais(b.principalCentavos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.jurosCentavos + b.multaCentavos ? reais(b.jurosCentavos + b.multaCentavos) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.descontoCentavos ? reais(b.descontoCentavos) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{reais(b.caixaCentavos)}</td>
                <td className="px-3 py-2 text-right">
                  {b.conciliada ? (
                    <span className="text-micro text-fg-muted whitespace-nowrap" title="Desfaça na conciliação, que devolve a linha do extrato junto.">
                      conciliada
                    </span>
                  ) : (
                    <Button variant="ghost" size="xs" onClick={() => desfazer(b)}>
                      <Undo2 size={12} /> Desfazer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog}
    </div>
  );
}
