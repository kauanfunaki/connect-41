"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, PenLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { ENQUADRAMENTOS, FINALIDADE_PADRAO, REGIMES, regimeSugerido } from "@/lib/revisao-contabil/regras-da-tela";
import { criarFechamentoAction, editarFechamentoAction } from "@/app/(app)/revisao-contabil/actions";

type Empresa = EmpresaParaEscolher & { taxRegimeKind?: string | null };

type Props =
  | { modo: "novo"; empresas: Empresa[] }
  | {
      modo: "editar";
      id: string;
      companyId: string;
      nomeDaEmpresa: string;
      inicio: string;
      fim: string;
      regime: string;
      enquadramento: string;
      finalidade: string;
    };

/**
 * Abrir ou editar um fechamento (05/11/2026): empresa, período, regime,
 * enquadramento e finalidade, como no cadastro do original. Na edição a empresa
 * fica: os documentos enviados são dela.
 */
export function FormularioDoFechamento(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [regime, setRegime] = useState(props.modo === "editar" ? props.regime : "Não informado");
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const base = useId();
  const editando = props.modo === "editar";

  function escolherEmpresa(id: string) {
    if (props.modo !== "novo") return;
    setRegime(regimeSugerido(props.empresas.find((e) => e.id === id)?.taxRegimeKind));
  }

  function salvar(form: FormData) {
    setErro(null);
    const dados = {
      companyId: editando ? props.companyId : String(form.get("companyId") ?? ""),
      inicio: String(form.get("inicio") ?? ""),
      fim: String(form.get("fim") ?? ""),
      regime,
      enquadramento: String(form.get("enquadramento") ?? ""),
      finalidade: String(form.get("finalidade") ?? ""),
    };
    startTransition(async () => {
      if (props.modo === "editar") {
        const r = await editarFechamentoAction(props.id, dados);
        if ("error" in r) return setErro(r.error);
        toast.success("Fechamento salvo. Execute a análise de novo para o relatório valer.");
        setAberto(false);
        router.refresh();
      } else {
        const r = await criarFechamentoAction(dados);
        if ("error" in r) return setErro(r.error);
        setAberto(false);
        router.push(`/revisao-contabil/${r.id}`);
      }
    });
  }

  return (
    <>
      {editando ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(true)}>
          <PenLine size={14} aria-hidden /> Editar fechamento
        </Button>
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <Plus size={16} aria-hidden /> Novo fechamento
        </Button>
      )}
      <Modal open={aberto} onClose={() => setAberto(false)} title={editando ? "Editar fechamento" : "Novo fechamento"} maxWidth="max-w-lg">
        <form action={salvar} className="flex flex-col gap-4">
          {props.modo === "editar" ? (
            <p className="text-helper text-fg-muted">{props.nomeDaEmpresa}</p>
          ) : (
            <CampoForm label="Empresa" htmlFor={`${base}-empresa`} required helper="Só aparecem empresas com CNPJ no cadastro.">
              <SearchableSelect
                id={`${base}-empresa`}
                name="companyId"
                options={opcoesDeEmpresa(props.empresas)}
                placeholder="Escolha a empresa"
                onChange={escolherEmpresa}
              />
            </CampoForm>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Início do período" htmlFor={`${base}-inicio`} required>
              <CampoData id={`${base}-inicio`} name="inicio" defaultValue={editando ? props.inicio : ""} required />
            </CampoForm>
            <CampoForm label="Fim do período" htmlFor={`${base}-fim`} required>
              <CampoData id={`${base}-fim`} name="fim" defaultValue={editando ? props.fim : ""} required />
            </CampoForm>
          </div>
          <CampoForm
            label="Regime tributário declarado"
            htmlFor={`${base}-regime`}
            required
            helper="Vem do cadastro da empresa quando ele diz. Mudança de regime no meio do período pede fechamentos separados."
          >
            <Select id={`${base}-regime`} name="regime" value={regime} onChange={(e) => setRegime(e.target.value)}>
              {REGIMES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Enquadramento contábil" htmlFor={`${base}-enq`}>
            <Select id={`${base}-enq`} name="enquadramento" defaultValue={editando ? props.enquadramento : "A confirmar"}>
              {ENQUADRAMENTOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Finalidade" htmlFor={`${base}-fin`}>
            <Input id={`${base}-fin`} name="finalidade" maxLength={120} defaultValue={editando ? props.finalidade : FINALIDADE_PADRAO} autoComplete="off" />
          </CampoForm>
          {erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" loading={pendente} disabled={pendente}>
              {editando ? "Salvar" : "Abrir fechamento"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
