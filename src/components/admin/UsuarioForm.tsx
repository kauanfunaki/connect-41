"use client";

import { useActionState, useState } from "react";
import type { UsuarioState } from "@/app/(app)/admin/usuarios/actions";
import type { UserRole } from "@/generated/prisma/enums";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

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
  sectorOptions: { value: string; label: string }[];
  defaultValues?: UsuarioDefaultValues;
  isSelf?: boolean;
};

export function UsuarioForm({ action, cancelHref, roleOptions, sectorOptions, defaultValues, isSelf }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);
  const [selectedSectors, setSelectedSectors] = useState(() => new Set(defaultValues?.sectors ?? []));

  function toggleSector(code: string) {
    setSelectedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
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

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
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
              helper={isSelf ? "Você não pode alterar seu próprio papel." : undefined}
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
                    <p className="text-[length:var(--fs-helper)] text-fg-muted">
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

          <div role="group" aria-labelledby="setores-com-acesso" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p id="setores-com-acesso" className="text-[length:var(--fs-label)] font-medium text-fg">
                Setores com acesso
                <span className="text-fg-muted font-normal ml-1.5">
                  ({selectedSectors.size} de {sectorOptions.length})
                </span>
              </p>
              {/* Botões, e não texto azul/cinza (polimento de 30/09). Os cartões
                  de setor logo abaixo continuam: são caixas de marcar do próprio
                  formulário, não filtro de lista. */}
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setSelectedSectors(new Set(sectorOptions.map((s) => s.value)))}
                >
                  Selecionar todos
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setSelectedSectors(new Set())}
                >
                  Limpar
                </Button>
              </div>
            </div>
            <p className="text-[length:var(--fs-helper)] text-fg-muted">
              Escolha só os setores que este usuário precisa acessar — evite marcar todos por padrão, isso deixa a listagem poluída.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {sectorOptions.map((s) => {
                const checked = selectedSectors.has(s.value);
                return (
                  <label
                    key={s.value}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[12px] transition-colors cursor-pointer ${
                      checked
                        ? "border-brand/40 bg-brand/8 text-fg font-medium"
                        : "border-border text-fg-secondary hover:bg-surface-2"
                    }`}
                  >
                    <Checkbox
                      name="sectors"
                      value={s.value}
                      checked={checked}
                      onChange={() => toggleSector(s.value)}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
          </div>
        </FormSection>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button href={cancelHref} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
