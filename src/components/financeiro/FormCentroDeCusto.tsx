"use client";

import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { criarCentroDeCusto, atualizarCentroDeCusto } from "@/app/(app)/cadastros-financeiros/actions";
import { FormFooter } from "@/components/ui/FormFooter";

// Modal, como o cadastro de contrapartes da mesma tela (ver FormContraparte):
// a edição dentro da célula empilhava os campos sem rótulo.

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

export function NovoCentroDeCusto({ companyId }: { companyId: string }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        <Plus size={13} /> Novo centro de custo
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Novo centro de custo" maxWidth="max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await criarCentroDeCusto(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_140px]">
            <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
              <Input id={`${id}-nome`} name="nome" maxLength={120} required placeholder="Ex.: Loja Centro, Obra 12, Projeto X" />
            </CampoForm>
            <CampoForm label="Código" htmlFor={`${id}-codigo`} helper="Opcional.">
              <Input id={`${id}-codigo`} name="codigo" maxLength={30} placeholder="LJ-01" />
            </CampoForm>
          </FieldGrid>
          <Rodape erro={erro} pendente={pendente} rotulo="Cadastrar" onCancelar={() => setAberto(false)} />
        </form>
      </Modal>
    </>
  );
}

export function EditarCentroDeCusto({ centro }: { centro: { id: string; nome: string; codigo: string | null; ativo: boolean } }) {
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
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Editar centro de custo" maxWidth="max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await atualizarCentroDeCusto(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="id" value={centro.id} />
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_140px]">
            <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
              <Input id={`${id}-nome`} name="nome" defaultValue={centro.nome} maxLength={120} required />
            </CampoForm>
            <CampoForm label="Código" htmlFor={`${id}-codigo`}>
              <Input id={`${id}-codigo`} name="codigo" defaultValue={centro.codigo ?? ""} maxLength={30} />
            </CampoForm>
          </FieldGrid>
          {/* Inativar e não apagar: o que já foi lançado no centro continua nele. */}
          <CampoForm label="Situação" htmlFor={`${id}-ativo`}>
            <Select id={`${id}-ativo`} name="ativo" defaultValue={centro.ativo ? "1" : "0"} className="sm:max-w-[200px]">
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </Select>
          </CampoForm>
          <Rodape erro={erro} pendente={pendente} rotulo="Salvar" onCancelar={() => setAberto(false)} />
        </form>
      </Modal>
    </>
  );
}
