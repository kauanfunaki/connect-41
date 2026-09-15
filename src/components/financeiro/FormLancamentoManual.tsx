"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { criarLancamentoManual } from "@/app/(app)/lancamentos/actions";

type Contraparte = { id: string; nome: string; documento: string | null; defaultCategoryId: string | null };
type Categoria = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

const NOVA = "__nova__";

function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span className="font-medium">{rotulo}</span>
      {children}
      {dica && <span className="text-[11px] text-fg-muted">{dica}</span>}
    </label>
  );
}

export function FormLancamentoManual({
  companyId,
  contrapartes,
  categorias,
  hojeISO,
  competenciaPadrao,
}: {
  companyId: string;
  contrapartes: Contraparte[];
  categorias: Categoria[];
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
  const [pendente, startTransition] = useTransition();

  const doTipo = categorias.filter((c) => c.kind === kind);

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
      formRef.current?.reset();
      setContraparte("");
      setCategoria("");
    });
  }

  return (
    <Card className="p-4">
      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Campo rotulo="Tipo">
            <Select
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
          </Campo>

          <Campo rotulo={kind === "PAGAR" ? "Fornecedor" : "Cliente (sacado)"}>
            <Select name="counterpartyId" value={contraparte} onChange={(e) => escolherContraparte(e.target.value)} required>
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
          </Campo>

          <Campo
            rotulo="Categoria"
            dica={kind === "PAGAR" ? "Obrigatória em conta a pagar — despesa sem classificação não fecha o DRE." : undefined}
          >
            <Select name="categoryId" value={categoria} onChange={(e) => setCategoria(e.target.value)} required={kind === "PAGAR"}>
              <option value="">{kind === "PAGAR" ? "Escolha…" : "Sem categoria"}</option>
              {doTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        {contraparte === NOVA && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Campo rotulo="Nome da nova contraparte">
              <Input name="contraparteNome" maxLength={180} required />
            </Campo>
            <Campo rotulo="CPF ou CNPJ" dica="Opcional. Com documento, a ficha é reaproveitada se já existir.">
              <Input name="contraparteDocumento" inputMode="numeric" />
            </Campo>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Campo rotulo="Competência" dica="O mês a que a conta pertence — é o que a DRE econômica soma.">
            <Input type="month" name="competencia" defaultValue={competenciaPadrao} required />
          </Campo>
          <Campo rotulo="Vencimento">
            <Input type="date" name="vencimento" required />
          </Campo>
          <Campo rotulo="Valor (R$)">
            <Input name="valor" inputMode="decimal" placeholder="1.234,56" required />
          </Campo>
          <Campo rotulo={kind === "PAGAR" ? "Já pago em" : "Já recebido em"} dica="Deixe vazio se ainda está em aberto.">
            <Input type="date" name="pagoEm" max={hojeISO} />
          </Campo>
        </div>

        <Campo rotulo="Descrição">
          <Input name="descricao" maxLength={255} placeholder="Ex.: aluguel de setembro" />
        </Campo>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "Lançando…" : "Lançar"}
          </Button>
          {salvo && (
            <span className="inline-flex items-center gap-1 text-[12px] text-success">
              <Check size={13} /> Lançado. Ele já aparece nas contas e na DRE.
            </span>
          )}
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      </form>
    </Card>
  );
}
