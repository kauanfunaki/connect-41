"use client";

import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import {
  criarCategoriaDaEmpresa,
  atualizarCategoriaDaEmpresa,
  esconderDoPadraoNaEmpresa,
  linhaDaDreNaEmpresa,
} from "@/app/(app)/cadastros-financeiros/actions";
import { FormFooter } from "@/components/ui/FormFooter";

export type OpcaoDeLinha = { code: string; label: string };

function OpcoesDeLinha({ linhas, vazio }: { linhas: OpcaoDeLinha[]; vazio: string }) {
  return (
    <>
      <option value="">{vazio}</option>
      {linhas.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </>
  );
}

// Cadastro e edição em modal, como contrapartes e centros de custo (ver
// FormContraparte): a edição dentro da célula empilhava campos sem rótulo.
function Rodape({ erro, pendente, rotulo, onCancelar }: { erro: string | null; pendente: boolean; rotulo: string; onCancelar: () => void }) {
  return (
    <FormFooter
      pending={pendente}
      submitLabel={rotulo}
      onCancel={onCancelar}
      erro={erro}
    />
  );
}

export function NovaCategoriaDaEmpresa({ companyId, linhas, grupos }: { companyId: string; linhas: OpcaoDeLinha[]; grupos: string[] }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      {/* No cabeçalho da tela, no tamanho dos outros botões de criar (escolha
          5A, 08/10/2026): era "Categoria só desta empresa", ao lado do parágrafo. */}
      <Button
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        <Plus size={14} /> Nova categoria
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Nova categoria só desta empresa" maxWidth="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await criarCategoriaDaEmpresa(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
            <Input id={`${id}-nome`} name="nome" maxLength={120} required placeholder="Ex.: Serviço de terceiro - Galvanização" />
          </CampoForm>
          <FieldGrid>
            <CampoForm label="Tipo" htmlFor={`${id}-tipo`} required>
              <Select id={`${id}-tipo`} name="kind" required defaultValue="PAGAR">
                <option value="PAGAR">Despesa (a pagar)</option>
                <option value="RECEBER">Receita (a receber)</option>
              </Select>
            </CampoForm>
            <CampoForm label="Grupo do plano" htmlFor={`${id}-grupo`}>
              <Input id={`${id}-grupo`} name="grupoDoPlano" list={`${id}-grupos`} maxLength={120} placeholder="Ex.: CMV / CSV" />
              <datalist id={`${id}-grupos`}>
                {grupos.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </CampoForm>
          </FieldGrid>
          <CampoForm label="Linha da DRE" htmlFor={`${id}-linha`}>
            <Select id={`${id}-linha`} name="linhaDre" defaultValue="">
              <OpcoesDeLinha linhas={linhas} vazio="Ainda não classificada" />
            </Select>
          </CampoForm>
          <Rodape erro={erro} pendente={pendente} rotulo="Cadastrar" onCancelar={() => setAberto(false)} />
        </form>
      </Modal>
    </>
  );
}

/**
 * A linha da DRE de uma categoria nesta empresa, trocada direto na lista. Na
 * do padrão, "Como no padrão" desfaz a exceção.
 */
export function LinhaDaDre({
  companyId,
  categoryId,
  valor,
  linhas,
  rotuloDoPadrao,
  desabilitado,
}: {
  companyId: string;
  categoryId: string;
  valor: string;
  linhas: OpcaoDeLinha[];
  /** Só nas categorias do padrão: o que vale quando a empresa não muda. */
  rotuloDoPadrao?: string;
  desabilitado?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-0.5 min-w-[200px]">
      <Select
        compact
        aria-label="Linha da DRE"
        defaultValue={valor}
        disabled={desabilitado || pendente}
        onChange={(e) => {
          const novo = e.target.value;
          setErro(null);
          startTransition(async () => {
            const r = await linhaDaDreNaEmpresa(companyId, categoryId, novo);
            if ("error" in r) setErro(r.error);
          });
        }}
      >
        <OpcoesDeLinha linhas={linhas} vazio={rotuloDoPadrao ? `Como no padrão (${rotuloDoPadrao})` : "Ainda não classificada"} />
      </Select>
      {erro && <span className="text-micro text-danger">{erro}</span>}
    </div>
  );
}

export function EsconderDoPadrao({ companyId, categoryId, oculta }: { companyId: string; categoryId: string; oculta: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="xs"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await esconderDoPadraoNaEmpresa(companyId, categoryId, !oculta);
            if ("error" in r) setErro(r.error);
          })
        }
      >
        {oculta ? "Usar nesta empresa" : "Não usar nesta empresa"}
      </Button>
      {erro && <span className="text-micro text-danger">{erro}</span>}
    </span>
  );
}

export function EditarCategoriaDaEmpresa({
  categoria,
  linhas,
}: {
  categoria: { id: string; nome: string; grupo: string | null; linha: string; ativa: boolean };
  linhas: OpcaoDeLinha[];
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        Editar
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Editar categoria" maxWidth="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await atualizarCategoriaDaEmpresa(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="id" value={categoria.id} />
          <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
            <Input id={`${id}-nome`} name="nome" defaultValue={categoria.nome} maxLength={120} required />
          </CampoForm>
          <FieldGrid>
            <CampoForm label="Grupo do plano" htmlFor={`${id}-grupo`}>
              <Input id={`${id}-grupo`} name="grupoDoPlano" defaultValue={categoria.grupo ?? ""} maxLength={120} />
            </CampoForm>
            <CampoForm label="Situação" htmlFor={`${id}-ativa`} helper="Inativa some dos seletores e continua nos relatórios.">
              <Select id={`${id}-ativa`} name="ativa" defaultValue={categoria.ativa ? "sim" : "nao"}>
                <option value="sim">Ativa</option>
                <option value="nao">Inativa</option>
              </Select>
            </CampoForm>
          </FieldGrid>
          <CampoForm label="Linha da DRE" htmlFor={`${id}-linha`}>
            <Select id={`${id}-linha`} name="linhaDre" defaultValue={categoria.linha}>
              <OpcoesDeLinha linhas={linhas} vazio="Ainda não classificada" />
            </Select>
          </CampoForm>
          <Rodape erro={erro} pendente={pendente} rotulo="Salvar" onCancelar={() => setAberto(false)} />
        </form>
      </Modal>
    </>
  );
}
