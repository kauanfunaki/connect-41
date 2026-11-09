"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, PenLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import {
  ligarEmpresaAction,
  salvarAgenciaAction,
  salvarContaAction,
  salvarContraparteAction,
  salvarRegraAction,
} from "@/app/(app)/contabil-core/actions";
import { ROTULO_DO_REGIME, ROTULO_DO_TIPO_DE_CONTA } from "@/lib/contabil-core/tela";

// Os formulários de cadastro do Contábil Core (Fase 2, 09/11/2026), todos no mesmo molde: um botão
// abre o modal, o servidor valida (as regras moram em `entradas.ts` e nos serviços) e o erro volta
// ao lado do botão de salvar.

type Retorno = { ok: true } | { error: string };

function Molde({
  titulo,
  novo,
  rotuloDoBotao,
  sucesso,
  salvar,
  children,
}: {
  titulo: string;
  novo: boolean;
  rotuloDoBotao: string;
  sucesso: string;
  salvar: (dados: Record<string, unknown>) => Promise<Retorno>;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function enviar(form: FormData) {
    setErro(null);
    const dados: Record<string, unknown> = {};
    form.forEach((v, k) => (dados[k] = typeof v === "string" ? v : ""));
    startTransition(async () => {
      const r = await salvar(dados);
      if ("error" in r) return setErro(r.error);
      setAberto(false);
      toast.success(sucesso);
      router.refresh();
    });
  }

  return (
    <>
      {novo ? (
        <Button type="button" size="sm" onClick={() => setAberto(true)}>
          <Plus size={14} aria-hidden /> {rotuloDoBotao}
        </Button>
      ) : (
        <Button type="button" size="xs" variant="ghost" onClick={() => setAberto(true)} aria-label={rotuloDoBotao}>
          <PenLine size={14} aria-hidden /> Editar
        </Button>
      )}
      <Modal open={aberto} onClose={() => setAberto(false)} title={titulo} maxWidth="max-w-lg">
        <form action={enviar} className="flex flex-col gap-4">
          {children}
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
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ─── Empresa ──────────────────────────────────────────────────────────────

export function LigarEmpresa({ empresas }: { empresas: (Opcao & { regime: string | null })[] }) {
  const base = useId();
  const [regime, setRegime] = useState("");
  return (
    <Molde
      titulo="Pôr empresa no Contábil Core"
      novo
      rotuloDoBotao="Pôr empresa"
      sucesso="Empresa pronta no Contábil Core. Cadastre o plano de contas e as contas bancárias em Configurações."
      salvar={(d) => ligarEmpresaAction(d)}
    >
      <CampoForm label="Empresa do cadastro" htmlFor={`${base}-empresa`} required helper="Só aparecem as que têm CNPJ e ainda não estão no Contábil Core.">
        <SearchableSelect
          id={`${base}-empresa`}
          name="companyId"
          options={empresas}
          placeholder="Escolha a empresa"
          onChange={(id) => setRegime(empresas.find((e) => e.value === id)?.regime ?? "")}
        />
      </CampoForm>
      <CampoForm label="Regime tributário" htmlFor={`${base}-regime`} required>
        <Select id={`${base}-regime`} name="regime" value={regime} onChange={(e) => setRegime(e.target.value)}>
          <option value="">Escolha…</option>
          {Object.entries(ROTULO_DO_REGIME).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Select>
      </CampoForm>
    </Molde>
  );
}

// ─── Plano de contas ──────────────────────────────────────────────────────

export type ContaDoForm = { id: string; codigo: string; descricao: string; tipo: string; tipoSa: string; contaNumero: number | null; paiId: string | null };

export function FormularioDaConta({ empresaId, conta, contas }: { empresaId: string; conta?: ContaDoForm; contas: Opcao[] }) {
  const base = useId();
  return (
    <Molde
      titulo={conta ? `Conta ${conta.codigo}` : "Nova conta"}
      novo={!conta}
      rotuloDoBotao="Nova conta"
      sucesso="Conta salva."
      salvar={(d) => salvarContaAction(empresaId, conta?.id ?? null, d)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="Código (classificação)" htmlFor={`${base}-cod`} required helper={conta ? "Não muda depois de criado." : "Ex.: 1.1.1.01"}>
          <Input id={`${base}-cod`} name="codigo" defaultValue={conta?.codigo ?? ""} readOnly={!!conta} maxLength={30} autoComplete="off" required />
        </CampoForm>
        <CampoForm label="Código reduzido" htmlFor={`${base}-red`} helper="O número que vai para o Domínio.">
          <Input id={`${base}-red`} name="contaNumero" inputMode="numeric" defaultValue={conta?.contaNumero ?? ""} autoComplete="off" />
        </CampoForm>
      </div>
      <CampoForm label="Descrição" htmlFor={`${base}-desc`} required>
        <Input id={`${base}-desc`} name="descricao" defaultValue={conta?.descricao ?? ""} maxLength={300} autoComplete="off" required />
      </CampoForm>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="Tipo" htmlFor={`${base}-tipo`} required>
          <Select id={`${base}-tipo`} name="tipo" defaultValue={conta?.tipo ?? "despesa"}>
            {Object.entries(ROTULO_DO_TIPO_DE_CONTA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Natureza" htmlFor={`${base}-sa`}>
          <Select id={`${base}-sa`} name="tipoSa" defaultValue={conta?.tipoSa ?? "A"}>
            <option value="A">Analítica (aceita lançamento)</option>
            <option value="S">Sintética (agrupa)</option>
          </Select>
        </CampoForm>
      </div>
      {!conta && (
        <CampoForm label="Conta pai" htmlFor={`${base}-pai`}>
          <SearchableSelect id={`${base}-pai`} name="paiId" options={contas} placeholder="Nenhuma (conta raiz)" vazioLabel="Nenhuma (conta raiz)" />
        </CampoForm>
      )}
    </Molde>
  );
}

// ─── Conta bancária ───────────────────────────────────────────────────────

export type AgenciaDoForm = { id: string; bancoSigla: string; agencia: string; numero: string; digito: string | null; contaContabilId: string | null };

export function FormularioDaAgencia({ empresaId, agencia, contas }: { empresaId: string; agencia?: AgenciaDoForm; contas: Opcao[] }) {
  const base = useId();
  return (
    <Molde
      titulo={agencia ? "Conta bancária" : "Nova conta bancária"}
      novo={!agencia}
      rotuloDoBotao="Nova conta bancária"
      sucesso="Conta bancária salva."
      salvar={(d) => salvarAgenciaAction(empresaId, agencia?.id ?? null, d)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="Banco" htmlFor={`${base}-banco`} required helper="Sigla ou código (SICOOB, 756, ITAU…).">
          <Input id={`${base}-banco`} name="bancoSigla" defaultValue={agencia?.bancoSigla ?? ""} maxLength={20} autoComplete="off" required />
        </CampoForm>
        <CampoForm label="Agência" htmlFor={`${base}-ag`} required>
          <Input id={`${base}-ag`} name="agencia" inputMode="numeric" defaultValue={agencia?.agencia ?? ""} maxLength={10} autoComplete="off" required />
        </CampoForm>
        <CampoForm label="Conta" htmlFor={`${base}-num`} required>
          <Input id={`${base}-num`} name="numero" defaultValue={agencia?.numero ?? ""} maxLength={20} autoComplete="off" required />
        </CampoForm>
        <CampoForm label="Dígito" htmlFor={`${base}-dv`}>
          <Input id={`${base}-dv`} name="digito" defaultValue={agencia?.digito ?? ""} maxLength={5} autoComplete="off" />
        </CampoForm>
      </div>
      <CampoForm
        label="Conta contábil do banco"
        htmlFor={`${base}-conta`}
        helper="Sem ela, o NEO cria uma conta sintética para a contrapartida, e o Domínio não a importa."
      >
        <SearchableSelect id={`${base}-conta`} name="contaContabilId" options={contas} defaultValue={agencia?.contaContabilId ?? ""} placeholder="Escolha a conta" vazioLabel="Sem conta vinculada" />
      </CampoForm>
    </Molde>
  );
}

// ─── Contraparte ──────────────────────────────────────────────────────────

export type ContraparteDoForm = { id: string; tipo: string; documento: string; razaoSocial: string; nomeFantasia: string | null; contaContabilId: string; ativa: boolean };

export function FormularioDaContraparte({ empresaId, contraparte, contas }: { empresaId: string; contraparte?: ContraparteDoForm; contas: Opcao[] }) {
  const base = useId();
  return (
    <Molde
      titulo={contraparte ? contraparte.razaoSocial : "Nova contraparte"}
      novo={!contraparte}
      rotuloDoBotao="Nova contraparte"
      sucesso="Contraparte salva."
      salvar={(d) => salvarContraparteAction(empresaId, contraparte?.id ?? null, { ...d, ativa: d.ativa === "on" })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="CPF ou CNPJ" htmlFor={`${base}-doc`} required helper={contraparte ? "Não muda depois de criado." : undefined}>
          <Input id={`${base}-doc`} name="documento" defaultValue={contraparte?.documento ?? ""} readOnly={!!contraparte} maxLength={18} autoComplete="off" required />
        </CampoForm>
        <CampoForm label="Tipo" htmlFor={`${base}-tipo`} required helper="Débito procura fornecedor; crédito, cliente.">
          <Select id={`${base}-tipo`} name="tipo" defaultValue={contraparte?.tipo ?? "fornecedor"}>
            <option value="fornecedor">Fornecedor</option>
            <option value="cliente">Cliente</option>
            <option value="ambos">Fornecedor e cliente (uma conta só)</option>
          </Select>
        </CampoForm>
      </div>
      <CampoForm label="Razão social" htmlFor={`${base}-razao`} required>
        <Input id={`${base}-razao`} name="razaoSocial" defaultValue={contraparte?.razaoSocial ?? ""} maxLength={300} autoComplete="off" required />
      </CampoForm>
      <CampoForm label="Nome fantasia" htmlFor={`${base}-fant`}>
        <Input id={`${base}-fant`} name="nomeFantasia" defaultValue={contraparte?.nomeFantasia ?? ""} maxLength={300} autoComplete="off" />
      </CampoForm>
      <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} required>
        <SearchableSelect id={`${base}-conta`} name="contaContabilId" options={contas} defaultValue={contraparte?.contaContabilId ?? ""} placeholder="Escolha a conta" />
      </CampoForm>
      <Checkbox name="ativa" defaultChecked={contraparte?.ativa ?? true} label="Ativa (o NEO usa para classificar)" />
    </Molde>
  );
}

// ─── Regra ────────────────────────────────────────────────────────────────

export type RegraDoForm = { id: string; contaId: string; agenciaId: string | null; descricao: string; historico: string; dc: string; manterHistorico: boolean };

export function FormularioDaRegra({
  empresaId,
  regra,
  contas,
  agencias,
  inicial,
}: {
  empresaId: string;
  regra?: RegraDoForm;
  contas: Opcao[];
  agencias: Opcao[];
  inicial?: Partial<RegraDoForm>;
}) {
  const base = useId();
  const v = regra ?? inicial ?? {};
  return (
    <Molde
      titulo={regra ? "Editar regra" : "Nova regra"}
      novo={!regra}
      rotuloDoBotao="Nova regra"
      sucesso="Regra salva. Rode o NEO para aplicá-la às pendências."
      salvar={(d) => salvarRegraAction(empresaId, regra?.id ?? null, d)}
    >
      <CampoForm label="Texto do extrato" htmlFor={`${base}-hist`} required helper="O NEO ignora acento, maiúscula e pontuação; basta o trecho que se repete.">
        <Input id={`${base}-hist`} name="historico" defaultValue={v.historico ?? ""} maxLength={500} autoComplete="off" required />
      </CampoForm>
      <CampoForm label="Histórico do lançamento" htmlFor={`${base}-desc`} required>
        <Input id={`${base}-desc`} name="descricao" defaultValue={v.descricao ?? ""} maxLength={500} autoComplete="off" required />
      </CampoForm>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoForm label="Lado" htmlFor={`${base}-dc`} required>
          <Select id={`${base}-dc`} name="dc" defaultValue={v.dc ?? "D"}>
            <option value="D">Débito (saída do banco)</option>
            <option value="C">Crédito (entrada no banco)</option>
          </Select>
        </CampoForm>
        <CampoForm label="Conta bancária" htmlFor={`${base}-ag`} helper="Vazio: vale para todos os bancos.">
          <SearchableSelect id={`${base}-ag`} name="agenciaId" options={agencias} defaultValue={v.agenciaId ?? ""} placeholder="Todos os bancos" vazioLabel="Todos os bancos" />
        </CampoForm>
      </div>
      <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} required>
        <SearchableSelect id={`${base}-conta`} name="contaId" options={contas} defaultValue={v.contaId ?? ""} placeholder="Escolha a conta" />
      </CampoForm>
      <Checkbox name="manterHistorico" defaultChecked={v.manterHistorico ?? false} label="Usar o histórico do banco no lançamento" />
    </Molde>
  );
}
