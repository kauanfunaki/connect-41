"use client";

import { useActionState } from "react";
import type { UsuarioState } from "@/app/(app)/admin/usuarios/actions";
import type { UserRole } from "@/generated/prisma/enums";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { SeletorDeSetores } from "@/components/ui/SeletorDeSetores";
import { Aviso } from "@/components/ui/Aviso";

export type UsuarioDefaultValues = {
  id?: string;
  name?: string;
  email?: string;
  role?: UserRole;
  sectors?: string[];
  active?: boolean;
};

type Props = {
  action: (prev: UsuarioState, form: FormData) => Promise<UsuarioState>;
  cancelHref: string;
  roleOptions: { value: UserRole; label: string }[];
  /** Os setores ativos, com a cor (a bolinha do seletor). */
  sectorOptions: { value: string; label: string; color?: string }[];
  defaultValues?: UsuarioDefaultValues;
  isSelf?: boolean;
  /**
   * Campos escondidos a mais. A aba Acesso da ficha da pessoa (lote 8,
   * 28/10/2026) manda `personId` e `voltarPara`, para a conta nascer ligada
   * à pessoa e o formulário voltar à ficha.
   */
  extras?: Record<string, string>;
};

export function UsuarioForm({ action, cancelHref, roleOptions, sectorOptions, defaultValues, isSelf, extras }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);
  // Campos <select>/<input> com `disabled` não são enviados no FormData — quando o próprio
  // usuário está editando seu registro, travamos as opções (papel único, ativo forçado) em
  // vez de desabilitar, para o valor continuar sendo submetido e bater com a regra do servidor.
  const roleOptionsForSelect =
    isSelf && defaultValues?.role
      ? roleOptions.filter((r) => r.value === defaultValues.role)
      : roleOptions;

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}
      {extras && Object.entries(extras).map(([nome, valor]) => <input key={nome} type="hidden" name={nome} value={valor} />)}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      {/* Duas seções — quem é a pessoa e o que ela acessa. Eram sete blocos
          soltos, com a senha esticada na largura toda e o "Status" como rótulo
          de uma caixa de marcar que já tinha o próprio texto. */}
      <div>
        <FormSection title="Conta">
          <FieldGrid>
            <CampoForm label="Nome" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={defaultValues?.name ?? ""}
                placeholder="Nome completo"
              />
            </CampoForm>
            <CampoForm label="E-mail" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={defaultValues?.email ?? ""}
                placeholder="nome@41contabil.com.br"
              />
            </CampoForm>
            <CampoForm label={isEdit ? "Nova senha" : "Senha"} htmlFor="password" required={!isEdit}>
              <Input
                id="password"
                name="password"
                type="password"
                required={!isEdit}
                minLength={8}
                placeholder={isEdit ? "Deixe em branco para manter a atual" : "Mínimo 8 caracteres"}
              />
            </CampoForm>
          </FieldGrid>
        </FormSection>

        <FormSection title="Acesso">
          <FieldGrid>
            <CampoForm
              label="Papel"
              htmlFor="role"
              required
              travado={isSelf ? "Você não pode alterar seu próprio papel." : undefined}
            >
              <Select
                id="role"
                name="role"
                required
                defaultValue={defaultValues?.role ?? "SECTOR_USER"}
              >
                {roleOptionsForSelect.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </CampoForm>

            {isEdit && (
              <AlinhadoAoCampo>
                {isSelf ? (
                  <>
                    <input type="hidden" name="active" value="on" />
                    <p className="text-helper text-fg-muted">
                      Ativo (você não pode desativar sua própria conta)
                    </p>
                  </>
                ) : (
                  <Checkbox
                    id="active"
                    name="active"
                    defaultChecked={defaultValues?.active ?? true}
                    label="Usuário ativo"
                  />
                )}
              </AlinhadoAoCampo>
            )}
          </FieldGrid>

          {/* O seletor de setores padrão (25/11/2026, melhoria-812): era uma
              grade de caixas sem a cor do setor, com "Selecionar todos"/"Limpar".
              Cada marcado continua indo como `sectors` no FormData. */}
          <SeletorDeSetores
            rotulo="Setores com acesso"
            name="sectors"
            opcoes={sectorOptions.map((s) => ({ value: s.value, label: s.label, cor: s.color }))}
            valorInicial={defaultValues?.sectors ?? []}
            className="sm:max-w-md"
          />
        </FormSection>
      </div>

      <FormFooter
        pending={isPending}
        cancelHref={cancelHref}
      />
    </form>
  );
}
