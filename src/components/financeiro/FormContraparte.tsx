"use client";

import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { criarContraparte, atualizarContraparte } from "@/app/(app)/cadastros-financeiros/actions";
import { FormFooter } from "@/components/ui/FormFooter";

type Categoria = { id: string; nome: string };
/** Centros ativos da empresa — o que se pode escolher como padrão. */
type Centro = { id: string; nome: string };

// Cadastro e edição num modal, como a conta bancária da conciliação. Até 30/09
// o cadastro abria um cartão no meio da barra de filtros e a edição empilhava
// seis campos sem rótulo dentro da célula da tabela — só o placeholder dizia
// o que era cada um, e ele some quando o campo tem valor.

/** Rodapé dos dois modais: erro à esquerda, Cancelar e o primário à direita. */
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

export function NovaContraparte({ companyId, categorias, centros = [] }: { companyId: string; categorias: Categoria[]; centros?: Centro[] }) {
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
        <Plus size={13} /> Novo cadastro
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Novo cadastro" maxWidth="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await criarContraparte(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_200px]">
            <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
              <Input id={`${id}-nome`} name="nome" maxLength={180} required />
            </CampoForm>
            <CampoForm label="CPF ou CNPJ" htmlFor={`${id}-documento`}>
              <Input id={`${id}-documento`} name="documento" inputMode="numeric" />
            </CampoForm>
          </FieldGrid>
          <CampoForm label="E-mail" htmlFor={`${id}-email`} helper="Para onde vão os lembretes da régua de cobrança.">
            <Input id={`${id}-email`} name="email" type="email" maxLength={180} />
          </CampoForm>
          <FieldGrid>
            <CampoForm
              label="Categoria padrão"
              htmlFor={`${id}-categoria`}
              helper="Vale para contas a pagar."
              className={centros.length > 0 ? "" : "sm:col-span-2"}
            >
              <Select id={`${id}-categoria`} name="defaultCategoryId" defaultValue="">
                <option value="">Nenhuma</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            {centros.length > 0 && (
              <CampoForm label="Centro de custo padrão" htmlFor={`${id}-centro`}>
                <Select id={`${id}-centro`} name="defaultCostCenterId" defaultValue="">
                  <option value="">Nenhum</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
          </FieldGrid>
          <Rodape erro={erro} pendente={pendente} rotulo="Cadastrar" onCancelar={() => setAberto(false)} />
        </form>
      </Modal>
    </>
  );
}

export function EditarContraparte({
  contraparte,
  categorias,
  centros = [],
}: {
  contraparte: {
    id: string;
    nome: string;
    documento: string | null;
    email: string | null;
    defaultCategoryId: string | null;
    ativo: boolean;
    defaultCostCenterId?: string | null;
    /** Nome do centro padrão atual — aparece mesmo se ele foi inativado. */
    centroPadraoNome?: string | null;
  };
  categorias: Categoria[];
  centros?: Centro[];
}) {
  // O centro atual continua na lista mesmo inativo: salvar a ficha por outro
  // motivo não pode apagar o padrão sem a pessoa ter escolhido isso.
  const opcoesDeCentro =
    contraparte.defaultCostCenterId && !centros.some((c) => c.id === contraparte.defaultCostCenterId)
      ? [...centros, { id: contraparte.defaultCostCenterId, nome: `${contraparte.centroPadraoNome ?? "Centro atual"} (inativo)` }]
      : centros;
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
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Editar cadastro" maxWidth="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await atualizarContraparte(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="id" value={contraparte.id} />
          <FieldGrid columns={contraparte.documento ? "sm:grid-cols-1" : "sm:grid-cols-[minmax(0,1fr)_200px]"}>
            <CampoForm label="Nome" htmlFor={`${id}-nome`} required>
              <Input id={`${id}-nome`} name="nome" defaultValue={contraparte.nome} maxLength={180} required />
            </CampoForm>
            {/* Documento só se preenche: trocar o CNPJ de ficha com histórico
                desfaria o casamento com as notas — ver `atualizarContraparte`. */}
            {!contraparte.documento && (
              <CampoForm label="CPF ou CNPJ" htmlFor={`${id}-documento`}>
                <Input id={`${id}-documento`} name="documento" inputMode="numeric" />
              </CampoForm>
            )}
          </FieldGrid>
          <CampoForm label="E-mail" htmlFor={`${id}-email`} helper="Para onde vão os lembretes da régua de cobrança.">
            <Input id={`${id}-email`} name="email" type="email" defaultValue={contraparte.email ?? ""} maxLength={180} />
          </CampoForm>
          <FieldGrid>
            <CampoForm
              label="Categoria padrão"
              htmlFor={`${id}-categoria`}
              helper="Vale para contas a pagar."
              className={opcoesDeCentro.length > 0 ? "" : "sm:col-span-2"}
            >
              <Select id={`${id}-categoria`} name="defaultCategoryId" defaultValue={contraparte.defaultCategoryId ?? ""}>
                <option value="">Sem categoria padrão</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            {opcoesDeCentro.length > 0 && (
              <CampoForm label="Centro de custo padrão" htmlFor={`${id}-centro`}>
                <Select id={`${id}-centro`} name="defaultCostCenterId" defaultValue={contraparte.defaultCostCenterId ?? ""}>
                  <option value="">Sem centro de custo padrão</option>
                  {opcoesDeCentro.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
          </FieldGrid>
          <CampoForm label="Situação" htmlFor={`${id}-ativo`}>
            <Select id={`${id}-ativo`} name="ativo" defaultValue={contraparte.ativo ? "1" : "0"} className="sm:max-w-[200px]">
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
