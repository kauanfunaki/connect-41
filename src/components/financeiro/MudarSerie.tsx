"use client";

import { useId, useState, useTransition } from "react";
import { Info, Lock, Repeat } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { dadosDaMudancaDaSerie, mudarSerieDaquiEmDiante, type DadosDaMudancaDaSerie } from "@/lib/financeiro/mudancaDaSerieServidor";

type Carregado = Extract<DadosDaMudancaDaSerie, { ok: true }>;

/**
 * "Mudar daqui em diante" (22/10/2026), ao lado de "Editar" na lista de
 * Lançamentos, na conta que tem próximas na série — da repetição ou do
 * parcelamento. O aluguel reajustado: o valor novo vale para esta conta e
 * para as próximas em aberto; as pagas e as anteriores ficam como estão. Na
 * série que cria contas com o tempo, as que nascerem depois já vêm com a
 * mudança. Abre na hora, com "Carregando…", e busca a conta e as categorias
 * da empresa dela, como a janela "Editar".
 */
export function BotaoMudarSerie({ entryId }: { entryId: string }) {
  const [dados, setDados] = useState<DadosDaMudancaDaSerie | null | undefined>(undefined);
  const toast = useToast();

  function abrir() {
    setDados(null);
    void dadosDaMudancaDaSerie(entryId).then(setDados);
  }

  return (
    <>
      <Button variant="secondary" size="xs" onClick={abrir} title="Mudar esta conta e as próximas da série">
        <Repeat size={12} /> Daqui em diante
      </Button>
      {dados !== undefined && (
        <Janela
          dados={dados}
          onFechar={() => setDados(undefined)}
          onSalvo={(mensagem) => {
            setDados(undefined);
            toast.success(mensagem);
          }}
        />
      )}
    </>
  );
}

function Janela({ dados, onFechar, onSalvo }: { dados: DadosDaMudancaDaSerie | null; onFechar: () => void; onSalvo: (mensagem: string) => void }) {
  const [pendente, setPendente] = useState(false);
  return (
    <Modal open onClose={() => !pendente && onFechar()} title="Mudar a série daqui em diante" maxWidth="max-w-xl">
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
        <Formulario dados={dados} onFechar={onFechar} onSalvo={onSalvo} aoMudarPendente={setPendente} />
      )}
    </Modal>
  );
}

function Formulario({
  dados,
  onFechar,
  onSalvo,
  aoMudarPendente,
}: {
  dados: Carregado;
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
  aoMudarPendente: (p: boolean) => void;
}) {
  const id = useId();
  const { conta, categorias } = dados;
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const atual = categorias.find((c) => c.id === conta.categoriaId)?.nome;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setErro(null);
        aoMudarPendente(true);
        startTransition(async () => {
          const r = await mudarSerieDaquiEmDiante(form);
          aoMudarPendente(false);
          if ("error" in r) {
            setErro(r.error);
            return;
          }
          const partes = [
            `${r.mudaram} ${r.mudaram === 1 ? "conta mudou" : "contas mudaram"}`,
            r.ficaram > 0 ? `${r.ficaram} ${r.ficaram === 1 ? "ficou como estava" : "ficaram como estavam"} (paga, com baixa ou travada)` : null,
          ].filter(Boolean);
          onSalvo(`${partes.join("; ")}.${r.aviso ? ` ${r.aviso}` : ""}`);
        });
      }}
    >
      <input type="hidden" name="entryId" value={conta.id} />
      <p className="text-helper text-fg-secondary">
        <strong className="text-fg">{conta.contraparte}</strong> · {conta.kind === "PAGAR" ? "conta a pagar" : "conta a receber"} · {conta.posicao} na série · R$ {conta.valor}
      </p>
      <Aviso tom="info" icone={<Info />}>
        <span className="text-fg-secondary">
          Vale para esta conta e as próximas da série em aberto — {dados.emAberto} {dados.emAberto === 1 ? "conta" : "contas"} hoje. As anteriores,
          as pagas e as com baixa ficam como estão.
          {dados.nascemSozinhas && " As que ainda vão nascer com o tempo já vêm com a mudança."} Em branco, cada conta mantém o que tem.
        </span>
      </Aviso>

      <FieldGrid>
        <CampoForm
          label="Valor novo"
          htmlFor={`${id}-valor`}
          helper={conta.kind === "PAGAR" ? "Conta aprovada que muda de valor volta para a aprovação." : undefined}
        >
          <Input id={`${id}-valor`} name="valor" prefix="R$" inputMode="decimal" placeholder={`Manter (${conta.valor})`} />
        </CampoForm>
        <CampoForm
          label="Dia do vencimento"
          htmlFor={`${id}-dia`}
          helper={dados.dia.pode ? `Hoje, dia ${conta.dia}. No mês sem esse dia, o último; fim de semana e feriado se ajustam como a série.` : dados.dia.motivo}
        >
          <CampoNumero id={`${id}-dia`} name="dia" min={1} max={31} placeholder="Manter" disabled={!dados.dia.pode} />
        </CampoForm>
        <CampoForm label="Categoria" htmlFor={`${id}-categoria`}>
          <Select id={`${id}-categoria`} name="categoryId" defaultValue="">
            <option value="">{atual ? `Manter (${atual})` : "Manter a de cada conta"}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Descrição" htmlFor={`${id}-descricao`}>
          <Input id={`${id}-descricao`} name="descricao" maxLength={255} placeholder={conta.descricao ? `Manter (${conta.descricao})` : "Manter"} />
        </CampoForm>
      </FieldGrid>

      <FormFooter pending={pendente} submitLabel="Mudar daqui em diante" pendingLabel="Mudando…" onCancel={onFechar} erro={erro} />
    </form>
  );
}
