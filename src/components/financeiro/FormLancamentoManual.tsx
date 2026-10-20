"use client";

import { useRef, useState, useTransition } from "react";
import { Check, FileText, ScanText, Sparkles, TriangleAlert, X } from "lucide-react";
import { FormFooter } from "@/components/ui/FormFooter";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoData } from "@/components/ui/CampoData";
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
import { CamposDaRepeticao } from "./CamposDaRepeticao";

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
  contasBancarias?: { id: string; nome: string }[];
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
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const [repetidas, setRepetidas] = useState(0);
  const [pendente, startTransition] = useTransition();

  // A leitura do boleto. `versao` remonta os campos sem estado próprio para eles
  // pegarem os valores lidos (ou voltarem ao vazio depois de lançar).
  const [lido, setLido] = useState<Lido | null>(null);
  const [versao, setVersao] = useState(0);

  const doTipo = categorias.filter((c) => c.kind === kind);
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
    setVersao((v) => v + 1);
    setErro(null);
    setSalvo(false);
  }

  function descartarLeitura() {
    setLido(null);
    setContraparte("");
    setCategoria("");
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
      formRef.current?.reset();
      setContraparte("");
      setCategoria("");
      setLido(null);
      setVersao((v) => v + 1);
    });
  }

  // Uma grade só, de quatro colunas, para os campos caírem alinhados de uma
  // linha para a outra. Antes eram quatro grades (3, 3, 3 e 4 colunas), e o
  // centro de custo ficava sozinho numa linha de três.
  const semCentro = centros.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-4">
      {leitorDeBoleto ? (
        <LerBoleto companyId={companyId} lido={lido} aoLer={aplicarLeitura} aoDescartar={descartarLeitura} />
      ) : (
        <p className="text-helper text-fg-muted">
          A leitura de boleto pela IA está desligada. Um administrador liga em Configurações › Inteligência artificial.
        </p>
      )}

      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />

        <FieldGrid key={versao} columns="sm:grid-cols-2 lg:grid-cols-4">
          <CampoForm label="Tipo" htmlFor="lancamento-tipo" required>
            <Select
              id="lancamento-tipo"
              name="kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as "PAGAR" | "RECEBER");
                setCategoria("");
              }}
            >
              <option value="PAGAR">Conta a pagar</option>
              <option value="RECEBER">Conta a receber</option>
            </Select>
          </CampoForm>

          <CampoForm
            label={kind === "PAGAR" ? "Fornecedor" : "Cliente (sacado)"}
            htmlFor="lancamento-contraparte"
            required
            className={semCentro ? "lg:col-span-2" : ""}
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

          <CampoForm
            label="Categoria"
            htmlFor="lancamento-categoria"
            required={kind === "PAGAR"}
            helper={kind === "PAGAR" ? "Obrigatória em conta a pagar — despesa sem classificação não fecha o DRE." : undefined}
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

          {!semCentro && (
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

          {/* CNPJ primeiro (19/10): com ele, a Receita preenche o nome. */}
          {contraparte === NOVA && (
            <CamposDaContraparteNova
              idBase="lancamento-nova"
              companyId={companyId}
              nomePadrao={leitura?.beneficiario ?? ""}
              documentoPadrao={leitura?.documentoDoBeneficiario ?? ""}
              ajudaDoDocumento={leitura && !leitura.documentoDoBeneficiario ? "A leitura não achou o CNPJ — digite o do boleto." : undefined}
              classeDoNome="lg:col-span-3"
              classeDoAviso="sm:col-span-2 lg:col-span-4"
            />
          )}

          <CampoForm
            label="Competência"
            htmlFor="lancamento-competencia"
            required
            helper="O mês a que a conta pertence — é o que a DRE econômica soma."
          >
            <CampoMes id="lancamento-competencia" name="competencia" defaultValue={competenciaPadrao} required />
          </CampoForm>
          <CampoForm label="Vencimento" htmlFor="lancamento-vencimento" required helper={leitura && conferir("vencimento") ? CONFIRA : undefined}>
            <CampoData id="lancamento-vencimento" name="vencimento" defaultValue={leitura?.vencimentoKey ?? undefined} required />
          </CampoForm>
          {/* A data de previsão (lote D, 20/10): o fluxo de caixa projeta por ela. */}
          <CampoForm label="Previsão" htmlFor="lancamento-previsao" helper="Quando deve ser paga de fato. Em branco, o vencimento.">
            <CampoData id="lancamento-previsao" name="previsao" />
          </CampoForm>
          <CampoForm label="Valor" htmlFor="lancamento-valor" required helper={leitura && conferir("valor") ? CONFIRA : undefined}>
            <Input
              id="lancamento-valor"
              name="valor"
              prefix="R$"
              inputMode="decimal"
              placeholder="1.234,56"
              defaultValue={leitura?.valorCentavos ? valorNoCampo(leitura.valorCentavos) : undefined}
              required
            />
          </CampoForm>
          <CampoForm label={kind === "PAGAR" ? "Já pago em" : "Já recebido em"} htmlFor="lancamento-pago-em" helper="Deixe vazio se ainda está em aberto.">
            <CampoData id="lancamento-pago-em" name="pagoEm" max={hojeISO} />
          </CampoForm>

          {/* Emissão, número e projeto (19/10, pedidos do BPO): opcionais, como no Omie. */}
          <CampoForm label="Emissão" htmlFor="lancamento-emissao" helper="Data do documento. Opcional.">
            <CampoData id="lancamento-emissao" name="emissao" max={hojeISO} defaultValue={leitura?.emissaoKey ?? undefined} />
          </CampoForm>
          <CampoForm label="Nº do documento" htmlFor="lancamento-numero">
            <Input id="lancamento-numero" name="numeroDocumento" maxLength={60} placeholder="Boleto, contrato, título" defaultValue={leitura?.numeroDocumento ?? undefined} />
          </CampoForm>
          <CampoDeProjeto id="lancamento-projeto" companyId={companyId} projetos={projetos} />
          {/* A conta corrente prevista (lote D, 20/10): a baixa já vem com ela. */}
          <CampoForm
            label="Conta corrente"
            htmlFor="lancamento-conta"
            helper={
              contasBancarias.length === 0
                ? "Nenhuma conta bancária nesta empresa (Banco e caixa)."
                : `Opcional. Por onde deve ser ${kind === "PAGAR" ? "paga" : "recebida"} — a baixa já vem com ela.`
            }
          >
            <Select id="lancamento-conta" name="bankAccountId" defaultValue="" disabled={contasBancarias.length === 0}>
              <option value="">{contasBancarias.length === 0 ? "Nenhuma conta cadastrada" : "Não prevista"}</option>
              {contasBancarias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>

          <CampoForm label="Descrição" htmlFor="lancamento-descricao" className="lg:col-span-3">
            <Input id="lancamento-descricao" name="descricao" maxLength={255} placeholder="Ex.: aluguel de setembro" defaultValue={leitura?.descricao ?? undefined} />
          </CampoForm>

          {/* Repetir (lote D): as próximas nascem junto — ver `CamposDaRepeticao`. */}
          <CamposDaRepeticao className="sm:col-span-2 lg:col-span-4" />

          {/* Anexos (lote H2): o boleto, a nota, o comprovante — ficam na conta. */}
          <CampoForm
            label="Anexos"
            htmlFor="lancamento-anexos-0"
            className="sm:col-span-2 lg:col-span-4"
            helper={
              lido
                ? `O boleto lido (${lido.arquivo.name}) já vai anexado. Junte outros, se quiser — até 10 MB no total.`
                : "Opcional. PDF, PNG, JPG ou XML — até 10 MB no total."
            }
          >
            <CampoDeAnexos idBase="lancamento-anexos" />
          </CampoForm>
        </FieldGrid>

        {/* O rodapé padrão (08/10/2026): era escrito à mão, com o erro em 12px
            e "Lançando…" num ternário. */}
        <FormFooter
          pending={pendente}
          submitLabel="Lançar"
          pendingLabel="Lançando…"
          erro={erro}
          nota={
            salvo && (
              <span className="inline-flex items-center gap-1.5 text-success-fg">
                <Check size={14} className="flex-shrink-0" /> Lançado{repetidas > 0 ? `, com mais ${repetidas} na série` : ""}. Ele já aparece nas contas e na DRE.
                {/* Empresa com alçada: a conta nasce aguardando, e a baixa fica travada até alguém aprovar. */}
                {aguardando && " Aguardando aprovação antes da baixa."}
              </span>
            )
          }
        />
      </form>
    </Card>
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
