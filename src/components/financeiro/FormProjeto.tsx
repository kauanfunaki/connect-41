"use client";

import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { CampoForm } from "@/components/ui/CampoForm";
import { Modal } from "@/components/ui/Modal";
import { criarProjeto, atualizarProjeto } from "@/app/(app)/cadastros-financeiros/actions";
import { FormFooter } from "@/components/ui/FormFooter";

// Modal, como o centro de custo da mesma tela (ver FormCentroDeCusto). Projeto
// é só nome — o Omie também não tem mais que isso.

export function NovoProjeto({ companyId }: { companyId: string }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <Button
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        <Plus size={14} /> Novo projeto
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Novo projeto" maxWidth="max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await criarProjeto(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
            <Input id={`${id}-nome`} name="nome" maxLength={120} required placeholder="Ex.: Obra Batel, Feira de março, Contrato Prefeitura" />
          </CampoForm>
          <FormFooter pending={pendente} submitLabel="Cadastrar" onCancel={() => setAberto(false)} erro={erro} />
        </form>
      </Modal>
    </>
  );
}

export function EditarProjeto({ projeto }: { projeto: { id: string; nome: string; ativo: boolean } }) {
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
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Editar projeto" maxWidth="max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await atualizarProjeto(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="id" value={projeto.id} />
          <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
            <Input id={`${id}-nome`} name="nome" defaultValue={projeto.nome} maxLength={120} required />
          </CampoForm>
          {/* Inativar e não apagar: o que já foi lançado no projeto continua nele. */}
          <CampoForm label="Situação" htmlFor={`${id}-ativo`}>
            <div className="flex min-h-9 items-center">
              <Switch id={`${id}-ativo`} name="ativo" value="1" valorDesligado="0" defaultChecked={projeto.ativo} rotulo="Ativo" />
            </div>
          </CampoForm>
          <FormFooter pending={pendente} submitLabel="Salvar" onCancel={() => setAberto(false)} erro={erro} />
        </form>
      </Modal>
    </>
  );
}
