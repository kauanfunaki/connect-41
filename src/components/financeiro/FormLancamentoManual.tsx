"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, ChevronDown, FileText, Plus, ScanText, Sparkles, TriangleAlert, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FormFooter } from "@/components/ui/FormFooter";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoData } from "@/components/ui/CampoData";
import { PagamentosDoManual } from "@/components/financeiro/PagamentosDoManual";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { CampoDeAnexos } from "@/components/pendencias/CampoDeAnexos";
import { criarLancamentoManual } from "@/app/(app)/lancamentos/actions";
import { lerBoletoParaLancar } from "@/lib/financeiro/leituraDoBoletoServidor";
import type { LeituraDoBoleto } from "@/lib/financeiro/leituraDoBoleto";
import { CamposDaContraparteNova } from "./ContraparteNova";
import { CampoDeProjeto } from "./CampoDeProjeto";
import { CamposDoRateio } from "./CamposDoRateio";
import { CamposDaRepeticao } from "./CamposDaRepeticao";
import { CamposDoParcelamento } from "./CamposDoParcelamento";
import { CamposDasRetencoes, totalRetido, type ValoresDasRetencoes } from "./CamposDasRetencoes";
import { formatarReaisDeCentavos } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";

type Contraparte = {
  id: string;
  nome: string;
  documento: string | null;
  defaultCategoryId: string | null;
  defaultCostCenterId?: string | null;
};
type Centro = { id: string; nome: string; codigo: string | null };
type Projeto = { id: string; nome: string };
type Categoria = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

const NOVA = "__nova__";

/** O que o "Também" abre (Lançamentos B, 04/11/2026). */
type Extra = "pago" | "repetir" | "parcelar" | "retencoes" | "anexos";
const ROTULO_DO_EXTRA: Record<Extra, (kind: "PAGAR" | "RECEBER") => string> = {
  pago: (k) => (k === "PAGAR" ? "Já está paga" : "Já foi recebida"),
  repetir: () => "Repetir",
  parcelar: () => "Parcelar",
  retencoes: () => "Retenções",
  anexos: () => "Anexos",
};
/** "Mais detalhes" aberto fica lembrado neste navegador (quem usa sempre o centro de custo). */
const CHAVE_DOS_DETALHES = "c41:lancamento:mais-detalhes";
const semAssinatura = () => () => {};
function lerDetalhesLembrados(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DOS_DETALHES) === "1";
  } catch {
    return false;
  }
}

/** O que a leitura do boleto deixou pronto na tela, até a pessoa lançar. */
type Lido = { leitura: LeituraDoBoleto; runId: string | null; arquivo: File };

const valorNoCampo = (centavos: number) => Number(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CONFIRA = "Confira no boleto — a leitura não garantiu este campo.";

export function FormLancamentoManual({
  companyId,
  contrapartes,
  categorias,
  hojeISO,
  competenciaPadrao,
  centros = [],
  projetos = [],
  contasBancarias = [],
  leitorDeBoleto = false,
}: {
  companyId: string;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  /** Centros de custo ativos da empresa. Sem nenhum, o campo não aparece. */
  centros?: Centro[];
  /** Projetos ativos da empresa. Sem nenhum, o campo aparece desabilitado e diz onde cadastrar. */
  projetos?: Projeto[];
  /** Contas bancárias ativas da empresa, para a conta corrente prevista (lote D, 20/10). */
  contasBancarias?: { id: string; nome: string; cartao?: boolean }[];
  /** Hoje em São Paulo, do servidor. */
  hojeISO: string;
  competenciaPadrao: string;
  /** A leitura de boleto pela IA está ligada e o escritório tem chave (lote H2). */
  leitorDeBoleto?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"PAGAR" | "RECEBER">("PAGAR");
  const [contraparte, setContraparte] = useState("");
  const [categoria, setCategoria] = useState("");
  // O rateio (lote D, 20/10) e o valor que ele precisa fechar.
  const [rateando, setRateando] = useState(false);
  const [valorTexto, setValorTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const [repetidas, setRepetidas] = useState(0);
  // O parcelamento (22/10/2026): divide o valor, a partir do vencimento.
  const [parcelas, setParcelas] = useState("");
  const [vencimentoTexto, setVencimentoTexto] = useState("");
  const [parceladas, setParceladas] = useState(0);
  const parcelando = Number(parcelas) >= 2;
  // As retenções na fonte (lote D, 20/10): com elas, o valor é o bruto da nota.
  const [retencoes, setRetencoes] = useState<ValoresDasRetencoes>({});
  const [impostos, setImpostos] = useState(0);
  const [pendente, startTransition] = useTransition();

  // A leitura do boleto. `versao` remonta os campos sem estado próprio para eles
  // pegarem os valores lidos (ou voltarem ao vazio depois de lançar).
  const [lido, setLido] = useState<Lido | null>(null);
  const [versao, setVersao] = useState(0);

  // Os blocos que a pessoa pediu no "Também", e o "Mais detalhes".
  const [extras, setExtras] = useState<ReadonlySet<Extra>>(new Set());
  // Lembrado neste navegador; no servidor (e na hidratação) começa fechado.
  const lembrado = useSyncExternalStore(semAssinatura, lerDetalhesLembrados, () => false);
  const [escolhaDosDetalhes, setMaisDetalhes] = useState<boolean | null>(null);
  const maisDetalhes = escolhaDosDetalhes ?? lembrado;
  function alternarDetalhes() {
    const novo = !maisDetalhes;
    setMaisDetalhes(novo);
    try {
      window.localStorage.setItem(CHAVE_DOS_DETALHES, novo ? "1" : "0");
    } catch {
      // Sem armazenamento (janela anônima): vale só nesta tela.
    }
  }
  /** Liga ou desliga um bloco. Desligar desfaz o que ele tinha. */
  function alternarExtra(e: Extra) {
    const ligado = extras.has(e);
    const novo = new Set(extras);
    if (ligado) novo.delete(e);
    else novo.add(e);
    setExtras(novo);
    if (ligado && e === "parcelar") setParcelas("");
    if (ligado && e === "retencoes") setRetencoes({});
  }

  const doTipo = categorias.filter((c) => c.kind === kind);
  const contasDoTipo = contasBancarias.filter((c) => kind === "PAGAR" || !c.cartao);
  const retido = kind === "PAGAR" ? totalRetido(retencoes) : 0;
  // O padrão não é pré-selecionado: em branco o servidor já herda, e pré-
  // selecionar faria "limpar o campo" parecer "sem centro" quando não é.
  const padraoId = contrapartes.find((c) => c.id === contraparte)?.defaultCostCenterId ?? null;
  const centroPadrao = padraoId ? centros.find((c) => c.id === padraoId) : undefined;
  const leitura = lido?.leitura ?? null;
  const conferir = (c: "valor" | "vencimento" | "fornecedor") => leitura?.conferir.includes(c) ?? false;

  function escolherContraparte(id: string) {
    setContraparte(id);
    // Sugere a categoria herdada, sem sobrescrever escolha já feita — a mesma
    // regra de `categoriaDoLancamento`: a da tela vence.
    const padrao = contrapartes.find((c) => c.id === id)?.defaultCategoryId;
    if (!categoria && padrao && doTipo.some((c) => c.id === padrao)) setCategoria(padrao);
  }

  /** Preenche a tela com o que a IA leu. Boleto é sempre conta a pagar. */
  function aplicarLeitura(novo: Lido, existente: { id: string } | null) {
    setLido(novo);
    setKind("PAGAR");
    const ficha = existente ? contrapartes.find((c) => c.id === existente.id) : undefined;
    const temQuem = novo.leitura.documentoDoBeneficiario || novo.leitura.beneficiario;
    setContraparte(ficha ? ficha.id : temQuem ? NOVA : "");
    const padrao = ficha?.defaultCategoryId;
    setCategoria(padrao && categorias.some((c) => c.id === padrao && c.kind === "PAGAR") ? padrao : "");
    setValorTexto(novo.leitura.valorCentavos ? valorNoCampo(novo.leitura.valorCentavos) : "");
    setVencimentoTexto(novo.leitura.vencimentoKey ?? "");
    if (novo.leitura.emissaoKey || novo.leitura.numeroDocumento) setMaisDetalhes(true);
    setVersao((v) => v + 1);
    setErro(null);
    setSalvo(false);
  }

  function descartarLeitura() {
    setLido(null);
    setContraparte("");
    setCategoria("");
    setValorTexto("");
    setVencimentoTexto("");
    setVersao((v) => v + 1);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    const dados = new FormData(e.currentTarget);
    if (contraparte === NOVA) dados.set("counterpartyId", "");
    // O boleto lido vira anexo da conta, junto com os que a pessoa escolheu.
    if (lido) {
      dados.append("anexos", lido.arquivo);
      if (lido.runId) dados.set("leituraRunId", lido.runId);
    }
    startTransition(async () => {
      const r = await criarLancamentoManual(dados);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setSalvo(true);
      setAguardando(Boolean(r.aguardandoAprovacao));
      setRepetidas(r.repetidas ?? 0);
      setParceladas(r.parcelas ?? 0);
      setParcelas("");
      setVencimentoTexto("");
      setImpostos(r.impostos ?? 0);
      setRetencoes({});
      formRef.current?.reset();
      setContraparte("");
      setCategoria("");
      setRateando(false);
      setValorTexto("");
      setLido(null);
      setExtras(new Set());
      setVersao((v) => v + 1);
    });
  }

  const semCentro = centros.length === 0;
  const nomeDaContraparte = contrapartes.find((c) => c.id === contraparte)?.nome ?? (contraparte === NOVA ? leitura?.beneficiario || "contraparte nova" : null);
  const nomeDaCategoria = rateando ? "rateada" : doTipo.find((c) => c.id === categoria)?.nome ?? null;
  const valorDigitado = centavosDeTexto(valorTexto);
  const chips: Extra[] = kind === "PAGAR" ? ["pago", "repetir", "parcelar", "retencoes", "anexos"] : ["pago", "repetir", "parcelar", "anexos"];
  // O bloco aberto: fundo levemente diferente, título e o ✕ para tirar — um
  // embaixo do outro, só os que foram pedidos.
  const BLOCO = "rounded-md border border-border-soft bg-surface-muted/40 p-3";

  /*
   * Lançamentos B (escolha do Kauan na página de opções de 04/11/2026): o
   * formulário era uma grade de quatro colunas com dezoito campos e quatro
   * blocos, todos à vista. Agora:
   *
   * - em cima, o PDF para a IA ler (como antes);
   * - depois, só o que toda conta tem: tipo, fornecedor, valor, vencimento,
   *   categoria e descrição;
   * - "Também": botões que abrem o bloco quando precisa — já paga, repetir,
   *   parcelar, retenções e anexos; "Ratear" fica no campo da categoria;
   * - "Mais detalhes", recolhido: competência, previsão, centro de custo,
   *   projeto, conta corrente, emissão e nº do documento. Fica no formulário
   *   mesmo fechado (a competência é obrigatória e já vem preenchida), e
   *   lembra aberto neste navegador;
   * - ao lado, um resumo do que vai ser lançado.
   *
   * Pedido do Kauan ao escolher: aberto, também não pode poluir — cada bloco
   * só aparece quando pedido, e some pelo ✕ (desfazendo o que tinha).
   */
  return (
    <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
    <Card className="flex flex-col gap-4 p-4 min-w-0">
      {leitorDeBoleto ? (
        <LerBoleto companyId={companyId} lido={lido} aoLer={aplicarLeitura} aoDescartar={descartarLeitura} />
      ) : (
        <p className="text-helper text-fg-muted">
          A leitura de boleto pela IA está desligada. Um administrador liga em Configurações › Inteligência artificial.
        </p>
      )}

      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="kind" value={kind} />

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-label font-medium text-fg-secondary">Tipo</span>
          <SegmentedControl
            label="Tipo da conta"
            active={kind}
            tone="brand"
            items={[
              { key: "PAGAR", label: "A pagar" },
              { key: "RECEBER", label: "A receber" },
            ]}
            onChange={(k) => {
              setKind(k);
              setCategoria("");
              // Conta a receber não tem retenção: o bloco sai, e o que tinha.
              if (k === "RECEBER" && extras.has("retencoes")) alternarExtra("retencoes");
            }}
          />
        </div>

        <FieldGrid key={versao} columns="sm:grid-cols-2">
          <CampoForm
            label={kind === "PAGAR" ? "Fornecedor" : "Cliente (sacado)"}
            htmlFor="lancamento-contraparte"
            required
            className="sm:col-span-2"
            helper={leitura && conferir("fornecedor") && contraparte !== NOVA ? "A leitura não achou o CNPJ do beneficiário — escolha o fornecedor." : undefined}
          >
            <Select id="lancamento-contraparte" name="counterpartyId" value={contraparte} onChange={(e) => escolherContraparte(e.target.value)} required>
              <option value="" disabled>
                Escolha…
              </option>
              <option value={NOVA}>+ Cadastrar nova contraparte</option>
              {contrapartes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.documento ? ` · ${c.documento}` : ""}
                </option>
              ))}
            </Select>
          </CampoForm>

          {/* CNPJ primeiro (19/10): com ele, a Receita preenche o nome. */}
          {contraparte === NOVA && (
            <CamposDaContraparteNova
              idBase="lancamento-nova"
              companyId={companyId}
              nomePadrao={leitura?.beneficiario ?? ""}
              documentoPadrao={leitura?.documentoDoBeneficiario ?? ""}
              ajudaDoDocumento={leitura && !leitura.documentoDoBeneficiario ? "A leitura não achou o CNPJ — digite o do boleto." : undefined}
              classeDoNome=""
              classeDoAviso="sm:col-span-2"
            />
          )}

          <CampoForm
            label={parcelando ? "Valor total (todas as parcelas)" : retido > 0 ? "Valor bruto (da nota)" : "Valor"}
            htmlFor="lancamento-valor"
            required
            helper={
              leitura && conferir("valor")
                ? CONFIRA
                : retido > 0
                  ? `Líquido a pagar ao fornecedor: ${formatarReaisDeCentavos((centavosDeTexto(valorTexto) ?? 0) - retido)}.`
                  : undefined
            }
          >
            <Input
              id="lancamento-valor"
              name="valor"
              prefix="R$"
              inputMode="decimal"
              placeholder="1.234,56"
              defaultValue={leitura?.valorCentavos ? valorNoCampo(leitura.valorCentavos) : undefined}
              onChange={(e) => setValorTexto(e.target.value)}
              required
            />
          </CampoForm>
          <CampoForm label={parcelando ? "Vencimento da 1ª parcela" : "Vencimento"} htmlFor="lancamento-vencimento" required helper={leitura && conferir("vencimento") ? CONFIRA : undefined}>
            <CampoData
              id="lancamento-vencimento"
              name="vencimento"
              defaultValue={leitura?.vencimentoKey ?? undefined}
              onChange={setVencimentoTexto}
              required
            />
          </CampoForm>

          <input type="hidden" name="comRateio" value={rateando ? "1" : "0"} />
          {rateando ? (
            // A conta dividida em categorias, centros e projetos (lote D, 20/10).
            // `key`: trocar o tipo troca o plano de contas, e as linhas recomeçam.
            <CamposDoRateio
              key={kind}
              className="sm:col-span-2"
              categorias={doTipo}
              centros={centros.map((c) => ({ id: c.id, nome: c.codigo ? `${c.nome} · ${c.codigo}` : c.nome }))}
              projetos={projetos}
              valorTexto={valorTexto}
              categoriaInicial={categoria}
              onDesfazer={() => setRateando(false)}
            />
          ) : (
            <CampoForm
              label="Categoria"
              htmlFor="lancamento-categoria"
              required={kind === "PAGAR"}
              className="sm:col-span-2"
              helper={kind === "PAGAR" ? "Obrigatória em conta a pagar — despesa sem classificação não fecha o DRE." : undefined}
              acao={
                <Button type="button" variant="link" className="text-helper" onClick={() => setRateando(true)}>
                  Ratear
                </Button>
              }
            >
              <Select id="lancamento-categoria" name="categoryId" value={categoria} onChange={(e) => setCategoria(e.target.value)} required={kind === "PAGAR"}>
                <option value="">{kind === "PAGAR" ? "Escolha…" : "Sem categoria"}</option>
                {doTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
          )}

          <CampoForm label="Descrição" htmlFor="lancamento-descricao" className="sm:col-span-2">
            <Input id="lancamento-descricao" name="descricao" maxLength={255} placeholder="Ex.: aluguel de setembro" defaultValue={leitura?.descricao ?? undefined} />
          </CampoForm>
        </FieldGrid>

        {/* "Também": cada botão abre o seu bloco; ligado, mostra o ✓. */}
        <div className="flex flex-col gap-2">
          <p className="c41-rotulo">Também</p>
          <div className="flex flex-wrap gap-2">
            {chips.map((e) => {
              const ligado = extras.has(e);
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => alternarExtra(e)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-fs-2 font-medium transition-colors ${
                    ligado ? "border-brand/40 bg-brand-subtle text-brand" : "border-border bg-surface text-fg-secondary hover:border-brand/30 hover:text-fg"
                  }`}
                >
                  {ligado ? <Check size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
                  {ROTULO_DO_EXTRA[e](kind)}
                </button>
              );
            })}
          </div>
        </div>

        {extras.has("pago") && (
          <BlocoDoExtra titulo={ROTULO_DO_EXTRA.pago(kind)} classe={BLOCO} onTirar={() => alternarExtra("pago")}>
            {/* Com juros, multa, desconto e baixa parcial (lote 7, 28/10/2026). */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PagamentosDoManual kind={kind} hojeISO={hojeISO} />
            </div>
          </BlocoDoExtra>
        )}
        {/* Repetir (lote D): as próximas nascem junto — ver `CamposDaRepeticao`. */}
        {extras.has("repetir") && <CamposDaRepeticao abertoInicial />}
        {/* Parcelar (22/10/2026): o valor dividido em parcelas — ver `CamposDoParcelamento`. */}
        {extras.has("parcelar") && (
          <CamposDoParcelamento abertoInicial parcelas={parcelas} onParcelas={setParcelas} valorTexto={valorTexto} primeiroVencimento={vencimentoTexto} />
        )}
        {/* Retenções na fonte (lote D, 20/10): só na conta a pagar. */}
        {kind === "PAGAR" && extras.has("retencoes") && (
          <CamposDasRetencoes abertoInicial valores={retencoes} onChange={(t, v) => setRetencoes((a) => ({ ...a, [t]: v }))}>
            {retido > 0 && (
              <p className="text-helper text-fg-secondary">
                Bruto {formatarReaisDeCentavos(centavosDeTexto(valorTexto) ?? 0)} − retido {formatarReaisDeCentavos(retido)} ={" "}
                <strong className="text-fg">{formatarReaisDeCentavos((centavosDeTexto(valorTexto) ?? 0) - retido)}</strong> a pagar ao fornecedor. As
                contas dos impostos nascem junto.
                {/* Lote M1 do mercado (23/10/2026): rateio e parcelas são digitados sobre o bruto. */}
                {parcelando && " As parcelas somam o bruto; cada uma fica com a parte dela das retenções e paga o líquido dela."}
                {rateando && " O rateio fecha o bruto; a conta guarda as linhas na proporção do líquido."}
              </p>
            )}
          </CamposDasRetencoes>
        )}
        {/* Anexos (lote H2): o boleto, a nota, o comprovante — ficam na conta. */}
        {extras.has("anexos") && (
          <BlocoDoExtra titulo="Anexos" classe={BLOCO} onTirar={() => alternarExtra("anexos")}>
            <CampoForm
              label="Arquivos"
              htmlFor="lancamento-anexos-0"
              helper={
                lido
                  ? `O boleto lido (${lido.arquivo.name}) já vai anexado. Junte outros, se quiser — até 10 MB no total.`
                  : "PDF, PNG, JPG ou XML — até 10 MB no total."
              }
            >
              <CampoDeAnexos idBase="lancamento-anexos" />
            </CampoForm>
          </BlocoDoExtra>
        )}
        {lido && !extras.has("anexos") && <p className="text-micro text-fg-muted">O boleto lido ({lido.arquivo.name}) vai anexado à conta.</p>}

        {/* "Mais detalhes": recolhido, mas no formulário — a competência é obrigatória. */}
        <div className="rounded-md border border-border">
          <button
            type="button"
            aria-expanded={maisDetalhes}
            aria-controls="lancamento-mais-detalhes"
            onClick={alternarDetalhes}
            className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <ChevronDown size={14} aria-hidden className={`shrink-0 text-fg-muted transition-transform ${maisDetalhes ? "rotate-180" : ""}`} />
            <span className="text-ui font-semibold text-fg">Mais detalhes</span>
            <span className="min-w-0 truncate text-fs-2 text-fg-muted">
              competência, previsão, {semCentro ? "" : "centro de custo, "}projeto, conta corrente, emissão e nº do documento
            </span>
          </button>
          <div id="lancamento-mais-detalhes" className={`${maisDetalhes ? "grid" : "hidden"} gap-4 border-t border-border px-3 py-3 sm:grid-cols-2 lg:grid-cols-3`}>
            <CampoForm label="Competência" htmlFor="lancamento-competencia" required helper="O mês a que a conta pertence — é o que a DRE econômica soma.">
              <CampoMes id="lancamento-competencia" name="competencia" defaultValue={competenciaPadrao} required />
            </CampoForm>
            {/* A data de previsão (lote D, 20/10): o fluxo de caixa projeta por ela. */}
            <CampoForm label="Previsão" htmlFor="lancamento-previsao" helper="Quando deve ser paga de fato. Em branco, o vencimento.">
              <CampoData id="lancamento-previsao" name="previsao" />
            </CampoForm>
            {!semCentro && !rateando && (
              <CampoForm
                label="Centro de custo"
                htmlFor="lancamento-centro"
                helper={centroPadrao ? `Em branco, herda o padrão da contraparte: ${centroPadrao.nome}.` : "Opcional. Um centro por lançamento."}
              >
                <Select id="lancamento-centro" name="costCenterId" defaultValue="">
                  <option value="">{centroPadrao ? `Padrão da contraparte (${centroPadrao.nome})` : "Sem centro de custo"}</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.codigo ? ` · ${c.codigo}` : ""}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
            {!rateando && <CampoDeProjeto id="lancamento-projeto" companyId={companyId} projetos={projetos} />}
            {/* A conta corrente prevista (lote D, 20/10): a baixa já vem com ela. */}
            <CampoForm
              label="Conta corrente"
              htmlFor="lancamento-conta"
              helper={
                contasDoTipo.length === 0
                  ? "Nenhuma conta bancária nesta empresa (Banco e caixa)."
                  : `Opcional. Por onde deve ser ${kind === "PAGAR" ? "paga" : "recebida"} — a baixa já vem com ela.`
              }
            >
              <Select id="lancamento-conta" name="bankAccountId" defaultValue="" disabled={contasDoTipo.length === 0}>
                <option value="">{contasDoTipo.length === 0 ? "Nenhuma conta cadastrada" : "Não prevista"}</option>
                {contasDoTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            {/* Emissão e número (19/10, pedidos do BPO): opcionais, como no Omie. */}
            <CampoForm label="Emissão" htmlFor="lancamento-emissao" helper="Data do documento. Opcional.">
              <CampoData key={`emissao-${versao}`} id="lancamento-emissao" name="emissao" max={hojeISO} defaultValue={leitura?.emissaoKey ?? undefined} />
            </CampoForm>
            <CampoForm label="Nº do documento" htmlFor="lancamento-numero">
              <Input key={`numero-${versao}`} id="lancamento-numero" name="numeroDocumento" maxLength={60} placeholder="Boleto, contrato, título" defaultValue={leitura?.numeroDocumento ?? undefined} />
            </CampoForm>
          </div>
        </div>

        {/* O rodapé padrão (08/10/2026). */}
        <FormFooter
          pending={pendente}
          submitLabel="Lançar"
          pendingLabel="Lançando…"
          erro={erro}
          nota={
            salvo && (
              <span className="inline-flex items-center gap-1.5 text-success-fg">
                <Check size={14} className="flex-shrink-0" /> Lançado{repetidas > 0 ? `, com mais ${repetidas} na série` : ""}
                {parceladas > 0 ? ` em ${parceladas} parcelas` : ""}
                {impostos > 0 ? `, com ${impostos} ${impostos === 1 ? "conta de imposto retido" : "contas de imposto retido"}` : ""}. Ele já aparece nas contas e na DRE.
                {/* Empresa com alçada: a conta nasce aguardando, e a baixa fica travada até alguém aprovar. */}
                {aguardando && " Aguardando aprovação antes da baixa."}
              </span>
            )
          }
        />
      </form>
    </Card>

    {/* O resumo do que vai ser lançado, ao lado (no computador). */}
    <Card as="section" aria-labelledby="resumo-do-lancamento" className="flex flex-col gap-2 p-4 xl:sticky xl:top-4">
      <h2 id="resumo-do-lancamento" className="c41-rotulo">
        Resumo
      </h2>
      <p className="text-2xl font-semibold tabular-nums text-fg leading-tight">{formatarReaisDeCentavos(valorDigitado ?? 0)}</p>
      <p className="text-fs-2 text-fg-muted">
        {kind === "PAGAR" ? "Conta a pagar" : "Conta a receber"}
        {nomeDaContraparte ? ` · ${nomeDaContraparte}` : ""}
      </p>
      <dl className="mt-1 flex flex-col divide-y divide-border-soft text-fs-2">
        <div className="flex justify-between gap-3 py-1.5">
          <dt className="text-fg-secondary">Vencimento</dt>
          <dd className="tabular-nums text-fg">{vencimentoTexto ? vencimentoTexto.split("-").reverse().join("/") : <span className="text-fg-muted">a preencher</span>}</dd>
        </div>
        <div className="flex justify-between gap-3 py-1.5">
          <dt className="text-fg-secondary">Categoria</dt>
          <dd className="text-right text-fg">{nomeDaCategoria ?? <span className="text-fg-muted">{kind === "PAGAR" ? "a escolher" : "sem categoria"}</span>}</dd>
        </div>
        {retido > 0 && (
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Líquido</dt>
            <dd className="tabular-nums text-fg">{formatarReaisDeCentavos((valorDigitado ?? 0) - retido)}</dd>
          </div>
        )}
        {parcelando && (
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Parcelas</dt>
            <dd className="tabular-nums text-fg">{parcelas}</dd>
          </div>
        )}
        {extras.size > 0 && (
          <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-secondary">Também</dt>
            <dd className="text-right text-fg">{[...extras].map((e) => ROTULO_DO_EXTRA[e](kind).toLowerCase()).join(", ")}</dd>
          </div>
        )}
      </dl>
    </Card>
    </div>
  );
}

/** Um bloco aberto pelo "Também", com o título e o ✕ que o tira. */
function BlocoDoExtra({ titulo, classe, onTirar, children }: { titulo: string; classe: string; onTirar: () => void; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-3 ${classe}`} aria-label={titulo}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ui font-semibold text-fg">{titulo}</h3>
        <Button type="button" variant="ghost" size="xs" onClick={onTirar} aria-label={`Tirar: ${titulo}`}>
          <X size={12} aria-hidden /> Tirar
        </Button>
      </div>
      {children}
    </section>
  );
}

/**
 * "Ler boleto": a pessoa escolhe o PDF, a IA lê e a tela se preenche. Fica
 * FORA do `<form>` do lançamento: o PDF escolhido aqui não pode ir no envio
 * duas vezes (aqui e como anexo), e o corpo da action tem 10 MB.
 */
function LerBoleto({
  companyId,
  lido,
  aoLer,
  aoDescartar,
}: {
  companyId: string;
  lido: Lido | null;
  aoLer: (lido: Lido, existente: { id: string } | null) => void;
  aoDescartar: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, startTransition] = useTransition();
  const [escolha, setEscolha] = useState(0);

  function ler() {
    if (!arquivo) return;
    setErro(null);
    const dados = new FormData();
    dados.set("companyId", companyId);
    dados.set("boleto", arquivo);
    startTransition(async () => {
      const r = await lerBoletoParaLancar(dados);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      aoLer({ leitura: r.leitura, runId: r.runId, arquivo }, r.contraparte);
      setArquivo(null);
      setEscolha((v) => v + 1);
    });
  }

  if (lido) {
    const { leitura } = lido;
    return (
      <div className="flex flex-col gap-2">
        <Aviso tom={leitura.avisos.length > 0 ? "atencao" : "info"} icone={leitura.avisos.length > 0 ? <TriangleAlert /> : <Sparkles />}>
          <div className="flex flex-col gap-1.5">
            <p className="text-fg">
              <strong>Lido pela IA</strong> de {lido.arquivo.name}
              {leitura.linhaDigitavel ? " — valor e vencimento conferidos pela linha digitável" : ""}. Confira antes de lançar.
            </p>
            {leitura.linhaDigitavel && <p className="font-mono text-helper text-fg-secondary tabular-nums">{leitura.linhaDigitavel}</p>}
            {leitura.avisos.length > 0 && (
              <ul className="list-disc pl-4 text-fg-secondary">
                {leitura.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </Aviso>
        <Button type="button" variant="ghost" size="xs" className="self-start" onClick={aoDescartar}>
          <X size={12} /> Descartar a leitura e lançar à mão
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-3">
      <div className="flex items-center gap-2 text-fs-2 text-fg">
        <ScanText size={16} className="flex-shrink-0 text-brand" />
        <span>
          <strong>Ler boleto</strong> — a IA lê o PDF e preenche o lançamento. Nada é gravado antes de você conferir e lançar.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <FileDropzoneField key={escolha} name="boleto" accept=".pdf" maxSizeMb={10} compacto onFileChange={setArquivo} />
        </div>
        <Button type="button" variant="secondary" onClick={ler} disabled={!arquivo} loading={lendo} loadingLabel="Lendo…">
          <FileText size={14} /> Ler boleto
        </Button>
      </div>
      {erro && <p className="text-helper text-danger">{erro}</p>}
    </div>
  );
}
