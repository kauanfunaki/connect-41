"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { FormFooter } from "@/components/ui/FormFooter";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoMes } from "@/components/ui/CampoMes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { criarLancamentoManual } from "@/app/(app)/lancamentos/actions";

type Contraparte = {
  id: string;
  nome: string;
  documento: string | null;
  defaultCategoryId: string | null;
  defaultCostCenterId?: string | null;
};
type Centro = { id: string; nome: string; codigo: string | null };
type Categoria = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

const NOVA = "__nova__";

export function FormLancamentoManual({
  companyId,
  contrapartes,
  categorias,
  hojeISO,
  competenciaPadrao,
  centros = [],
}: {
  companyId: string;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  /** Centros de custo ativos da empresa. Sem nenhum, o campo não aparece. */
  centros?: Centro[];
  /** Hoje em São Paulo, do servidor. */
  hojeISO: string;
  competenciaPadrao: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"PAGAR" | "RECEBER">("PAGAR");
  const [contraparte, setContraparte] = useState("");
  const [categoria, setCategoria] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const [pendente, startTransition] = useTransition();

  const doTipo = categorias.filter((c) => c.kind === kind);
  // O padrão não é pré-selecionado: em branco o servidor já herda, e pré-
  // selecionar faria "limpar o campo" parecer "sem centro" quando não é.
  const padraoId = contrapartes.find((c) => c.id === contraparte)?.defaultCostCenterId ?? null;
  const centroPadrao = padraoId ? centros.find((c) => c.id === padraoId) : undefined;

  function escolherContraparte(id: string) {
    setContraparte(id);
    // Sugere a categoria herdada, sem sobrescrever escolha já feita — a mesma
    // regra de `categoriaDoLancamento`: a da tela vence.
    const padrao = contrapartes.find((c) => c.id === id)?.defaultCategoryId;
    if (!categoria && padrao && doTipo.some((c) => c.id === padrao)) setCategoria(padrao);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvo(false);
    const dados = new FormData(e.currentTarget);
    if (contraparte === NOVA) dados.set("counterpartyId", "");
    startTransition(async () => {
      const r = await criarLancamentoManual(dados);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setSalvo(true);
      setAguardando(Boolean(r.aguardandoAprovacao));
      formRef.current?.reset();
      setContraparte("");
      setCategoria("");
    });
  }

  // Uma grade só, de quatro colunas, para os campos caírem alinhados de uma
  // linha para a outra. Antes eram quatro grades (3, 3, 3 e 4 colunas), e o
  // centro de custo ficava sozinho numa linha de três.
  const semCentro = centros.length === 0;
  return (
    <Card className="p-4">
      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />

        <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
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

          {contraparte === NOVA && (
            <>
              <CampoForm label="Nome da nova contraparte" htmlFor="lancamento-nova-nome" required className="sm:col-span-2">
                <Input id="lancamento-nova-nome" name="contraparteNome" maxLength={180} required />
              </CampoForm>
              <CampoForm
                label="CPF ou CNPJ"
                htmlFor="lancamento-nova-documento"
                helper="Opcional. Com documento, a ficha é reaproveitada se já existir."
                className="lg:col-span-2"
              >
                <Input id="lancamento-nova-documento" name="contraparteDocumento" inputMode="numeric" />
              </CampoForm>
            </>
          )}

          <CampoForm
            label="Competência"
            htmlFor="lancamento-competencia"
            required
            helper="O mês a que a conta pertence — é o que a DRE econômica soma."
          >
            <CampoMes id="lancamento-competencia" name="competencia" defaultValue={competenciaPadrao} required />
          </CampoForm>
          <CampoForm label="Vencimento" htmlFor="lancamento-vencimento" required>
            <CampoData id="lancamento-vencimento" name="vencimento" required />
          </CampoForm>
          <CampoForm label="Valor" htmlFor="lancamento-valor" required>
            <Input id="lancamento-valor" name="valor" prefix="R$" inputMode="decimal" placeholder="1.234,56" required />
          </CampoForm>
          <CampoForm label={kind === "PAGAR" ? "Já pago em" : "Já recebido em"} htmlFor="lancamento-pago-em" helper="Deixe vazio se ainda está em aberto.">
            <CampoData id="lancamento-pago-em" name="pagoEm" max={hojeISO} />
          </CampoForm>

          <CampoForm label="Descrição" htmlFor="lancamento-descricao" className="sm:col-span-2 lg:col-span-4">
            <Input id="lancamento-descricao" name="descricao" maxLength={255} placeholder="Ex.: aluguel de setembro" />
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
                <Check size={14} className="flex-shrink-0" /> Lançado. Ele já aparece nas contas e na DRE.
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
