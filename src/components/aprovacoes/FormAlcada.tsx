"use client";

import { useState, useTransition } from "react";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { salvarAlcada, alternarAlcada } from "@/app/(app)/aprovacoes/actions";

/**
 * Cadastro de alçada para a empresa já escolhida no filtro.
 *
 * A empresa vem do GET, e não de um select aqui, porque a lista de usuários
 * depende dela (só os do grupo da empresa) — e montar essa dependência no
 * navegador exigiria mandar os usuários de todos os grupos para a tela.
 * Salvar de novo para o mesmo usuário atualiza o teto e reativa.
 */
export function FormAlcada({ companyId, usuarios }: { companyId: string; usuarios: { id: string; nome: string; email: string }[] }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  if (usuarios.length === 0) {
    return <p className="text-helper text-fg-muted">Nenhum usuário ativo do portal no grupo desta empresa. Cadastre o acesso do cliente antes.</p>;
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        setSalvo(false);
        startTransition(async () => {
          const r = await salvarAlcada(dados);
          if ("error" in r) setErro(r.error);
          else setSalvo(true);
        });
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      {/* Grade com o botão em AlinhadoAoCampo: era flex com items-end, e o
          botão de 32px ficava 4px mais baixo que os campos de 36px. */}
      <FieldGrid columns="md:grid-cols-[minmax(0,22rem)_12rem_auto]">
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
        {/* Na linha dos campos, e não no `FormFooter`: o formulário é uma
            linha só. O "Salvando…" vem do `loading` do botão (08/10/2026). */}
        <AlinhadoAoCampo>
          <Button type="submit" loading={pendente}>
            Salvar alçada
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {salvo && <p className="text-helper text-success">Salvo.</p>}
      {erro && (
        <p role="alert" className="text-helper font-medium text-danger">
          {erro}
        </p>
      )}
    </form>
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
