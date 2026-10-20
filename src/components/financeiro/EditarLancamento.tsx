"use client";

import { useId, useState, useTransition } from "react";
import { Info, Lock, Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { dadosParaEditar, editarLancamento, type DadosDaEdicao } from "@/lib/financeiro/edicaoServidor";
import type { CampoEditavel } from "@/lib/financeiro/edicao";
import { CampoDeProjeto } from "./CampoDeProjeto";
import { CamposDoRateio } from "./CamposDoRateio";
import { AnexosDaConta, CAMPO_DO_ANEXO_DA_CONTA } from "./AnexosDaConta";

// A janela "Editar lançamento" (19/10, pedido 1 do BPO). Abre do "⋯" de
// Contas a pagar e a receber e da lista de Lançamentos. O que não pode mudar
// aparece travado, com o motivo embaixo — sumir com o campo faria a pessoa
// procurar onde se muda aquilo.

type Carregado = Extract<DadosDaEdicao, { ok: true }>;

/** "2026-10-15" → "15/10/2026". */
const dataBr = (key: string) => key.split("-").reverse().join("/");

const ORIGEM: Record<Carregado["conta"]["origem"], string> = {
  manual: "lançamento manual",
  nota: "veio de nota fiscal",
  omie: "veio do Omie",
};

/**
 * A janela como o `useConfirm`: o hook devolve `abrir(entryId)` e o elemento a
 * pôr na tela. Abre na hora, com "Carregando…", e busca a conta com as travas
 * e as listas — que dependem da empresa da conta, e por isso não vêm prontas
 * da tabela, que mistura empresas.
 */
export function useEdicaoDeLancamento(aoSalvar?: (aviso: string | null) => void) {
  const [estado, setEstado] = useState<{ entryId: string; dados: DadosDaEdicao | null } | null>(null);

  function abrir(entryId: string) {
    setEstado({ entryId, dados: null });
    void dadosParaEditar(entryId).then((dados) =>
      // Outra conta aberta no meio da busca: a resposta velha não entra.
      setEstado((atual) => (atual && atual.entryId === entryId ? { entryId, dados } : atual))
    );
  }

  const janela = estado ? (
    <JanelaDeEdicao
      key={estado.entryId}
      dados={estado.dados}
      onFechar={() => setEstado(null)}
      onSalvo={(aviso) => {
        setEstado(null);
        aoSalvar?.(aviso);
      }}
    />
  ) : null;
  return { abrir, janela };
}

/** O botão "Editar" da lista de Lançamentos, no tamanho do "Cancelar" ao lado. */
export function BotaoEditarLancamento({ entryId }: { entryId: string }) {
  const { abrir, janela } = useEdicaoDeLancamento();
  return (
    <>
      <Button variant="secondary" size="xs" onClick={() => abrir(entryId)}>
        <Pencil size={12} /> Editar
      </Button>
      {janela}
    </>
  );
}

function JanelaDeEdicao({
  dados,
  onFechar,
  onSalvo,
}: {
  dados: DadosDaEdicao | null;
  onFechar: () => void;
  onSalvo: (aviso: string | null) => void;
}) {
  const [pendente, setPendente] = useState(false);
  return (
    <Modal open onClose={() => !pendente && onFechar()} title="Editar lançamento" maxWidth="max-w-2xl">
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
  onSalvo: (aviso: string | null) => void;
  aoMudarPendente: (p: boolean) => void;
}) {
  const id = useId();
  const { conta, travas, opcoes } = dados;
  const [erro, setErro] = useState<string | null>(null);
  // O rateio (lote D, 20/10): muda com a categoria — o que trava uma trava o outro.
  const podeRatear = !travas.categoria;
  const [rateando, setRateando] = useState(conta.rateio.length > 0);
  const [valorTexto, setValorTexto] = useState(conta.valor);
  const [pendente, startTransition] = useTransition();
  const aPagar = conta.kind === "PAGAR";

  /** Props de trava de cada campo: desabilitado e o motivo no lugar do texto de apoio. */
  const trava = (c: CampoEditavel, helper?: string) => ({ disabled: !!travas[c], helper: travas[c] ?? helper });

  const tCont = trava("contraparte");
  const tCat = trava("categoria", aPagar ? "Obrigatória em conta a pagar." : undefined);
  const tComp = trava("competencia", "O mês que a DRE econômica soma.");
  const tEmi = trava("emissao");
  const tNum = trava("numeroDocumento");
  const tVenc = trava("vencimento");
  const tPrev = trava("previsao", "Quando deve ser paga de fato. Em branco, o vencimento.");
  const tValor = trava("valor", conta.aprovada && aPagar ? "Conta aprovada: mudar o valor manda de volta para a aprovação." : undefined);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        // O anexo sobe sozinho ao ser escolhido; não vai de novo no "Salvar".
        form.delete(CAMPO_DO_ANEXO_DA_CONTA);
        setErro(null);
        aoMudarPendente(true);
        startTransition(async () => {
          const r = await editarLancamento(form);
          aoMudarPendente(false);
          if ("error" in r) setErro(r.error);
          else onSalvo(r.aviso ?? null);
        });
      }}
    >
      <input type="hidden" name="entryId" value={conta.id} />
      <input type="hidden" name="versao" value={conta.versao} />

      <p className="text-helper text-fg-secondary">
        <strong className="text-fg">{conta.empresaNome}</strong> · {aPagar ? "conta a pagar" : "conta a receber"} · {ORIGEM[conta.origem]}
        {conta.pagoEmKey && ` · ${aPagar ? "paga" : "recebida"} em ${dataBr(conta.pagoEmKey)}`}
      </p>

      <FieldGrid>
        <CampoForm label={aPagar ? "Fornecedor" : "Cliente (sacado)"} htmlFor={`${id}-contraparte`} required helper={tCont.helper}>
          <Select id={`${id}-contraparte`} name="counterpartyId" defaultValue={conta.contraparteId} disabled={tCont.disabled} required>
            {opcoes.contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.documento ? ` · ${c.documento}` : ""}
              </option>
            ))}
          </Select>
        </CampoForm>
        {podeRatear && <input type="hidden" name="comRateio" value={rateando ? "1" : "0"} />}
        {rateando ? (
          <CamposDoRateio
            className="sm:col-span-2"
            categorias={opcoes.categorias}
            centros={opcoes.centros}
            projetos={opcoes.projetos}
            valorTexto={valorTexto}
            iniciais={conta.rateio}
            categoriaInicial={conta.categoriaId ?? undefined}
            onDesfazer={() => setRateando(false)}
          />
        ) : (
          <CampoForm
            label="Categoria"
            htmlFor={`${id}-categoria`}
            required={aPagar}
            helper={tCat.helper}
            acao={
              podeRatear ? (
                <Button type="button" variant="link" className="text-helper" onClick={() => setRateando(true)}>
                  Ratear
                </Button>
              ) : undefined
            }
          >
            <Select id={`${id}-categoria`} name="categoryId" defaultValue={conta.categoriaId ?? ""} disabled={tCat.disabled} required={aPagar}>
              <option value="">{aPagar ? "Escolha…" : "Sem categoria"}</option>
              {opcoes.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>
        )}
        {!rateando && (opcoes.centros.length > 0 || conta.centroId) && (
          <CampoForm label="Centro de custo" htmlFor={`${id}-centro`}>
            <Select id={`${id}-centro`} name="costCenterId" defaultValue={conta.centroId ?? ""}>
              <option value="">Sem centro de custo</option>
              {opcoes.centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>
        )}
        {!rateando && (
          <CampoDeProjeto id={`${id}-projeto`} companyId={conta.empresaId} projetos={opcoes.projetos} defaultValue={conta.projetoId ?? ""} />
        )}
      </FieldGrid>

      <FieldGrid columns="sm:grid-cols-3">
        <CampoForm label="Competência" htmlFor={`${id}-competencia`} required helper={tComp.helper}>
          <CampoMes id={`${id}-competencia`} name="competencia" defaultValue={conta.competencia} disabled={tComp.disabled} required />
        </CampoForm>
        <CampoForm label="Emissão" htmlFor={`${id}-emissao`} helper={tEmi.helper}>
          <CampoData id={`${id}-emissao`} name="emissao" defaultValue={conta.emissaoKey ?? ""} disabled={tEmi.disabled} />
        </CampoForm>
        <CampoForm label="Nº do documento" htmlFor={`${id}-numero`} helper={tNum.helper}>
          <Input id={`${id}-numero`} name="numeroDocumento" defaultValue={conta.numeroDocumento ?? ""} maxLength={60} disabled={tNum.disabled} />
        </CampoForm>
      </FieldGrid>

      <FieldGrid>
        <CampoForm label="Vencimento" htmlFor={`${id}-vencimento`} required helper={tVenc.helper}>
          <CampoData id={`${id}-vencimento`} name="vencimento" defaultValue={conta.vencimentoKey} disabled={tVenc.disabled} required />
        </CampoForm>
        <CampoForm label="Previsão" htmlFor={`${id}-previsao`} helper={tPrev.helper}>
          <CampoData id={`${id}-previsao`} name="previsao" defaultValue={conta.previsaoKey ?? ""} disabled={tPrev.disabled} />
        </CampoForm>
        <CampoForm label="Valor" htmlFor={`${id}-valor`} required helper={tValor.helper}>
          <Input
            id={`${id}-valor`}
            name="valor"
            prefix="R$"
            inputMode="decimal"
            defaultValue={conta.valor}
            onChange={(e) => setValorTexto(e.target.value)}
            disabled={tValor.disabled}
            required
          />
        </CampoForm>
        <CampoForm
          label="Conta corrente"
          htmlFor={`${id}-conta`}
          helper={opcoes.contas.length === 0 ? "Nenhuma conta bancária nesta empresa." : "A prevista — a baixa já vem com ela."}
        >
          <Select id={`${id}-conta`} name="bankAccountId" defaultValue={conta.contaId ?? ""} disabled={opcoes.contas.length === 0}>
            <option value="">Não prevista</option>
            {opcoes.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>

      <CampoForm label="Descrição" htmlFor={`${id}-descricao`}>
        <Input id={`${id}-descricao`} name="descricao" defaultValue={conta.descricao ?? ""} maxLength={255} />
      </CampoForm>

      <AnexosDaConta entryId={conta.id} iniciais={dados.anexos} />

      {conta.aprovada && aPagar && !travas.contraparte && (
        <Aviso tom="info" icone={<Info />}>
          <span className="text-fg-secondary">Conta aprovada: mudar o valor ou o fornecedor manda a conta de volta para a aprovação.</span>
        </Aviso>
      )}

      <FormFooter pending={pendente} submitLabel="Salvar" pendingLabel="Salvando…" onCancel={onFechar} erro={erro} />
    </form>
  );
}
