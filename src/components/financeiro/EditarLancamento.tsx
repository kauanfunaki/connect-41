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
import { avisoDasTravas, type CampoEditavel } from "@/lib/financeiro/edicao";
import { CampoDeProjeto } from "./CampoDeProjeto";
import { CamposDoRateio } from "./CamposDoRateio";
import { CamposDasRetencoes, totalRetido, type ValoresDasRetencoes } from "./CamposDasRetencoes";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { TRIBUTO } from "@/lib/financeiro/retencoes";
import { AnexosDaConta, CAMPO_DO_ANEXO_DA_CONTA } from "./AnexosDaConta";

// A janela "Editar lançamento" (19/10, pedido 1 do BPO). Abre do "⋯" de
// Contas a pagar e a receber e da lista de Lançamentos. O que não pode mudar
// aparece travado — sumir com o campo faria a pessoa procurar onde se muda
// aquilo.
//
// Um aviso no alto e cadeado no campo (16/11/2026, melhoria-717, retorno de
// usabilidade do BPO): o motivo ficava embaixo de cada campo travado, e a
// janela chegava a sete frases, com a da conciliação repetida no vencimento e
// no valor. Agora cada motivo aparece uma vez, no alto, com o que não muda e o
// caminho; o campo travado leva um cadeado com o mesmo motivo na dica. O que
// só explicava o campo foi para o "?" do rótulo ou saiu.

type Carregado = Extract<DadosDaEdicao, { ok: true }>;

/** "2026-10-15" → "15/10/2026". */
const dataBr = (key: string) => key.split("-").reverse().join("/");
/** "1.234,56" — como o campo de valor recebe. */
const valorNoCampo = (centavos: number) => Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  // O rateio (lote D, 20/10): muda com a categoria — o que trava uma trava o
  // outro. Travado, as linhas aparecem só para ler (a conta rateada do Omie).
  const podeRatear = !travas.categoria;
  const [rateando, setRateando] = useState(conta.rateio.length > 0);
  const [valorTexto, setValorTexto] = useState(conta.valor);
  // As retenções na fonte (lote D, 20/10), só na conta a pagar.
  const podeReter = conta.kind === "PAGAR" && !travas.retencoes;
  const [retencoes, setRetencoes] = useState<ValoresDasRetencoes>(() =>
    Object.fromEntries(conta.retencoes.map((r) => [r.tributo, valorNoCampo(r.centavos)]))
  );
  const retido = totalRetido(retencoes);
  const situacaoDasRetencoes = Object.fromEntries(
    conta.retencoes.map((r) => [
      r.tributo,
      !r.conta
        ? { texto: "Sem a conta do imposto." }
        : r.conta.cancelada
          ? { texto: "A conta do imposto foi cancelada." }
          : r.conta.temBaixa
            ? { texto: "Conta do imposto paga — desfaça a baixa dela para mudar.", travado: true }
            : { texto: `Conta do imposto em aberto${r.vencimentoKey ? `, vence ${dataBr(r.vencimentoKey)}` : ""}.` },
    ])
  );
  const [pendente, startTransition] = useTransition();
  const aPagar = conta.kind === "PAGAR";

  // O aviso do alto: uma linha por motivo. A conta de imposto diz de qual
  // imposto é — era o que o aviso de baixo dizia, repetindo a trava.
  const aviso = avisoDasTravas(dados.motivos, conta.kind).map((l) =>
    l.chave === "retencao" && conta.deImposto ? { ...l, causa: `Conta do ${TRIBUTO[conta.deImposto].nome} de outra conta` } : l
  );
  /** O motivo do cadeado: o mesmo do aviso, sem a lista de campos. */
  const motivoDe = (c: CampoEditavel) => {
    const linha = aviso.find((l) => l.campos.includes(c));
    return linha ? `${linha.causa}. ${linha.caminho}` : travas[c];
  };
  /** Props de trava de cada campo: desabilitado, e o motivo no cadeado do rótulo. */
  const trava = (c: CampoEditavel) => ({ disabled: !!travas[c], travado: travas[c] ? motivoDe(c) : undefined });

  const tCont = trava("contraparte");
  const tCat = trava("categoria");
  const tComp = trava("competencia");
  const tEmi = trava("emissao");
  const tNum = trava("numeroDocumento");
  const tVenc = trava("vencimento");
  const tPrev = trava("previsao");
  const tValor = trava("valor");
  const tCentro = trava("centro");
  const tConta = trava("conta");
  const semContas = opcoes.contas.length === 0;

  // Conta aprovada que muda de valor ou de fornecedor volta para a aprovação
  // (`aprovacaoDepoisDaEdicao`). Dito uma vez, no aviso do fim, e só do que
  // ainda pode mudar — estava também embaixo do valor.
  const oQueVolta = conta.aprovada && aPagar ? [!tValor.disabled && "o valor", !tCont.disabled && "o fornecedor"].filter(Boolean) : [];

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

      {aviso.length > 0 && (
        <Aviso tom="neutro" icone={<Lock />}>
          <ul className="flex flex-col gap-1.5">
            {aviso.map((l) => (
              <li key={l.chave} className="break-words">
                <strong className="font-medium text-fg">{l.causa}:</strong> {l.naoMuda} {l.caminho}
                {/* A conciliação se desfaz na linha do extrato: o caminho até ela,
                    numa aba nova para não perder o que já foi mudado aqui. */}
                {(l.chave === "conciliada" || l.chave === "paga_e_conciliada") && conta.conciliacaoHref && (
                  <>
                    {" "}
                    <a href={conta.conciliacaoHref} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-brand hover:underline">
                      Abrir a conciliação
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <FieldGrid>
        <CampoForm label={aPagar ? "Fornecedor" : "Cliente (sacado)"} htmlFor={`${id}-contraparte`} required travado={tCont.travado}>
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
            travado={tCat.travado}
          />
        ) : (
          <CampoForm
            label="Categoria"
            htmlFor={`${id}-categoria`}
            required={aPagar}
            travado={tCat.travado}
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
          <CampoForm label="Centro de custo" htmlFor={`${id}-centro`} travado={tCentro.travado}>
            <Select id={`${id}-centro`} name="costCenterId" defaultValue={conta.centroId ?? ""} disabled={tCentro.disabled}>
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
        <CampoForm
          label="Competência"
          htmlFor={`${id}-competencia`}
          required
          dica="O mês a que a conta pertence: é o que a DRE econômica soma."
          travado={tComp.travado}
        >
          <CampoMes id={`${id}-competencia`} name="competencia" defaultValue={conta.competencia} disabled={tComp.disabled} required />
        </CampoForm>
        <CampoForm label="Emissão" htmlFor={`${id}-emissao`} travado={tEmi.travado}>
          <CampoData id={`${id}-emissao`} name="emissao" defaultValue={conta.emissaoKey ?? ""} disabled={tEmi.disabled} />
        </CampoForm>
        <CampoForm label="Nº do documento" htmlFor={`${id}-numero`} travado={tNum.travado}>
          <Input id={`${id}-numero`} name="numeroDocumento" defaultValue={conta.numeroDocumento ?? ""} maxLength={60} disabled={tNum.disabled} />
        </CampoForm>
      </FieldGrid>

      {/* O dinheiro numa linha só: são os três que a baixa e a conciliação
          travam juntos, e os cadeados ficam lado a lado. */}
      <FieldGrid columns="sm:grid-cols-3">
        <CampoForm label="Vencimento" htmlFor={`${id}-vencimento`} required travado={tVenc.travado}>
          <CampoData id={`${id}-vencimento`} name="vencimento" defaultValue={conta.vencimentoKey} disabled={tVenc.disabled} required />
        </CampoForm>
        <CampoForm
          label="Previsão"
          htmlFor={`${id}-previsao`}
          dica={`Quando deve ser ${aPagar ? "paga" : "recebida"} de fato. Em branco, vale o vencimento.`}
          travado={tPrev.travado}
        >
          <CampoData id={`${id}-previsao`} name="previsao" defaultValue={conta.previsaoKey ?? ""} disabled={tPrev.disabled} />
        </CampoForm>
        <CampoForm label="Valor" htmlFor={`${id}-valor`} required travado={tValor.travado}>
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
      </FieldGrid>

      <FieldGrid columns="sm:grid-cols-3">
        <CampoForm
          label="Conta corrente"
          htmlFor={`${id}-conta`}
          dica={`Por onde a conta deve ser ${aPagar ? "paga" : "recebida"}. A baixa já vem com ela.`}
          travado={tConta.travado}
        >
          <Select id={`${id}-conta`} name="bankAccountId" defaultValue={conta.contaId ?? ""} disabled={tConta.disabled || semContas}>
            <option value="">{semContas ? "Nenhuma conta bancária nesta empresa" : "Não prevista"}</option>
            {opcoes.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Descrição" htmlFor={`${id}-descricao`} className="sm:col-span-2">
          <Input id={`${id}-descricao`} name="descricao" defaultValue={conta.descricao ?? ""} maxLength={255} />
        </CampoForm>
      </FieldGrid>

      {podeReter && (
        <>
          <input type="hidden" name="comRetencoes" value="1" />
          <CamposDasRetencoes valores={retencoes} onChange={(t, v) => setRetencoes((a) => ({ ...a, [t]: v }))} situacao={situacaoDasRetencoes}>
            {(retido > 0 || conta.retidoNaNota !== null) && (
              <p className="text-helper text-fg-secondary">
                {retido > 0 && (
                  <>
                    O valor da conta é o líquido, o que vai para o fornecedor. Bruto:{" "}
                    <strong className="text-fg">{formatarReaisDeCentavos((centavosDeTexto(valorTexto) ?? 0) + retido)}</strong>.
                  </>
                )}
                {conta.retidoNaNota !== null &&
                  ` A nota diz ${formatarReaisDeCentavos(conta.retidoNaNota)} retidos${conta.retidoNaNota !== retido ? " (com os descontos, se houver) — confira" : ""}.`}
              </p>
            )}
          </CamposDasRetencoes>
        </>
      )}
      {/* Só quando o aviso do alto não disse: a conta de imposto que vem do
          Omie tem os campos travados pelo Omie, e a linha da retenção não sai. */}
      {conta.deImposto && !aviso.some((l) => l.chave === "retencao") && (
        <Aviso tom="info" icone={<Info />}>
          <span className="text-fg-secondary">
            Conta do {TRIBUTO[conta.deImposto].nome} de outra conta: o valor e o credor mudam na retenção, na edição da conta de origem.
          </span>
        </Aviso>
      )}

      <AnexosDaConta entryId={conta.id} iniciais={dados.anexos} />

      {oQueVolta.length > 0 && (
        <Aviso tom="info" icone={<Info />}>
          <span className="text-fg-secondary">Conta aprovada: mudar {oQueVolta.join(" ou ")} manda a conta de volta para a aprovação.</span>
        </Aviso>
      )}

      <FormFooter pending={pendente} submitLabel="Salvar" pendingLabel="Salvando…" onCancel={onFechar} erro={erro} />
    </form>
  );
}
