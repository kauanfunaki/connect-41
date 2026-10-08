"use client";

import { useState, useTransition } from "react";
import { Plus, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { useToast } from "@/components/ui/Toast";
import { salvarAlcada, alternarAlcada } from "@/app/(app)/aprovacoes/actions";

/**
 * "Nova alçada" no cabeçalho da tela, com o cadastro numa janela (escolha 5A
 * do Kauan, 08/10/2026). Era um cartão "Nova alçada" aberto no topo da aba,
 * com o formulário numa linha só.
 *
 * A empresa vem do filtro (GET), e não de um select aqui, porque a lista de
 * usuários depende dela (só os do grupo da empresa) — e montar essa
 * dependência no navegador exigiria mandar os usuários de todos os grupos
 * para a tela. Sem empresa escolhida, a janela diz onde escolher. Salvar de
 * novo para o mesmo usuário atualiza o teto e reativa.
 */
export function NovaAlcada({
  companyId,
  usuarios,
}: {
  companyId: string | null;
  usuarios: { id: string; nome: string; email: string }[];
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const fechar = () => !pendente && setAberto(false);

  return (
    <>
      <Button
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        <Plus size={14} /> Nova alçada
      </Button>
      <Modal open={aberto} onClose={fechar} title="Nova alçada" maxWidth="max-w-lg">
        <div className="flex flex-col gap-4">
          <p className="text-helper text-fg-secondary">
            O usuário do portal aprova contas a pagar desta empresa até o teto. A coordenação aprova sem teto. Com ao menos
            uma alçada ativa, toda conta a pagar lançada em aberto na empresa nasce aguardando aprovação.
          </p>
          {!companyId || usuarios.length === 0 ? (
            <>
              <p className="text-helper text-fg-muted">
                {!companyId
                  ? "Escolha a empresa no filtro da aba Alçadas para cadastrar."
                  : "Nenhum usuário ativo do portal no grupo desta empresa. Cadastre o acesso do cliente antes."}
              </p>
              <div className="flex justify-end pt-4 mt-2 border-t border-border">
                <Button variant="secondary" onClick={fechar}>
                  Fechar
                </Button>
              </div>
            </>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                setErro(null);
                startTransition(async () => {
                  const r = await salvarAlcada(dados);
                  if ("error" in r) {
                    setErro(r.error);
                    return;
                  }
                  setAberto(false);
                  toast.success("Alçada salva.");
                });
              }}
            >
              <input type="hidden" name="companyId" value={companyId} />
              <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_11rem]">
                <CampoForm label="Usuário do portal" htmlFor="alcada-usuario" required>
                  <Select id="alcada-usuario" name="portalUserId" required defaultValue="">
                    <option value="" disabled>
                      Escolha
                    </option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome} · {u.email}
                      </option>
                    ))}
                  </Select>
                </CampoForm>
                <CampoForm label="Teto" htmlFor="alcada-teto" required>
                  <Input id="alcada-teto" name="maxAmount" prefix="R$" inputMode="decimal" placeholder="5.000,00" required />
                </CampoForm>
              </FieldGrid>
              <FormFooter pending={pendente} submitLabel="Salvar alçada" onCancel={fechar} erro={erro} />
            </form>
          )}
        </div>
      </Modal>
    </>
  );
}

/**
 * Desativar ou reativar a alçada, no menu "⋯" da linha (08/10/2026) — a regra
 * de 30/09 (`AcoesDeLinha`): o que tira da operação fica longe de um clique
 * acidental. "Desativar" estava solto na linha e sem confirmação; agora pede,
 * porque desativar a última alçada da empresa faz as contas pararem de nascer
 * aguardando aprovação.
 */
export function AlternarAlcada({ id, ativa }: { id: string; ativa: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  function alternar() {
    setErro(null);
    startTransition(async () => {
      const r = await alternarAlcada(id, !ativa);
      setErro("error" in r ? r.error : null);
    });
  }

  return (
    <span className="inline-flex flex-col items-start">
      <MenuDeMaisAcoes rotulo="Mais ações" aria-label="Ações da alçada" width={200}>
        {({ close }) => (
          <ItemDoMenu
            icone={ativa ? <PowerOff /> : <Power />}
            danger={ativa}
            disabled={pendente}
            onClick={() => {
              close();
              if (!ativa) return alternar();
              requestConfirm(
                {
                  title: "Desativar esta alçada?",
                  description:
                    "O usuário deixa de aprovar as contas desta empresa. Sem outra alçada ativa, a conta a pagar nova deixa de nascer aguardando aprovação.",
                  confirmLabel: "Desativar",
                  destructive: true,
                },
                async () => {
                  const r = await alternarAlcada(id, false);
                  if ("error" in r) throw new Error(r.error);
                }
              );
            }}
          >
            {ativa ? "Desativar alçada" : "Reativar alçada"}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {erro && (
        <span role="alert" className="text-micro text-danger">
          {erro}
        </span>
      )}
      {dialog}
    </span>
  );
}
