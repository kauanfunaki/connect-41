"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
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
    return <p className="text-[12px] text-fg-muted">Nenhum usuário ativo do portal no grupo desta empresa. Cadastre o acesso do cliente antes.</p>;
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
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
      <div className="w-72 max-w-full">
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
      </div>
      <div className="w-44">
        <CampoForm label="Teto (R$)" htmlFor="alcada-teto" required>
          <Input id="alcada-teto" name="maxAmount" inputMode="decimal" placeholder="5.000,00" required />
        </CampoForm>
      </div>
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar alçada"}
      </Button>
      {salvo && <span className="text-[12px] text-success">Salvo.</span>}
      {erro && <span className="text-[12px] text-danger">{erro}</span>}
    </form>
  );
}

export function AlternarAlcada({ id, ativa }: { id: string; ativa: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start">
      <Button
        variant="linkMuted"
        className="text-[11px]"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await alternarAlcada(id, !ativa);
            setErro("error" in r ? r.error : null);
          })
        }
      >
        {ativa ? "Desativar" : "Reativar"}
      </Button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </span>
  );
}
