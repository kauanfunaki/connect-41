"use client";

import { useActionState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import type { EstadoDaTrocaDeSenha, EstadoDoLinkDeSenha } from "@/app/(portal)/portal/(area)/conta/actions";
import { DICA_DA_SENHA } from "@/lib/portal/senha";

type Props = {
  email: string;
  trocar: (anterior: EstadoDaTrocaDeSenha, form: FormData) => Promise<EstadoDaTrocaDeSenha>;
  enviarLink: () => Promise<EstadoDoLinkDeSenha>;
};

/**
 * O bloco "Senha" de Minha conta (08/10/2026): a troca com a senha atual e,
 * embaixo, o link por e-mail para quem não a sabe — quem entra com o Google e
 * nunca criou uma, ou quem esqueceu. O sistema não distingue os dois casos
 * (ver `conta/actions.ts`), então a tela oferece os dois caminhos.
 *
 * Coluna estreita (`max-w-md`): três campos de senha esticados na largura da
 * tela pareciam um formulário de cadastro, e no celular dá na mesma.
 */
export function SenhaDaConta({ email, trocar, enviarLink }: Props) {
  const [troca, trocarAction, trocando] = useActionState(trocar, null);
  const [link, linkAction, enviando] = useActionState(enviarLink, null);

  return (
    <div className="flex flex-col gap-5">
      <form action={trocarAction} className="flex flex-col gap-4 max-w-md">
        <CampoForm label="Senha atual" htmlFor="senha-atual" required>
          <CampoDeSenha id="senha-atual" name="atual" autoComplete="current-password" required />
        </CampoForm>
        <CampoForm label="Nova senha" htmlFor="senha-nova" helper={DICA_DA_SENHA} required>
          <CampoDeSenha id="senha-nova" name="senha" autoComplete="new-password" required />
        </CampoForm>
        <CampoForm label="Confirme a nova senha" htmlFor="senha-confirmacao" required>
          <CampoDeSenha id="senha-confirmacao" name="confirmacao" autoComplete="new-password" required />
        </CampoForm>

        {troca && "erro" in troca && <Aviso>{troca.erro}</Aviso>}
        {troca && "ok" in troca && (
          <div role="status">
            <Aviso tom="sucesso">Senha alterada. Use a nova na próxima vez que entrar.</Aviso>
          </div>
        )}

        <div>
          <Button type="submit" loading={trocando}>
            Salvar senha
          </Button>
        </div>
      </form>

      <div className="flex flex-col items-start gap-2 border-t border-border pt-4">
        <p className="text-label font-medium text-fg">Não sabe a senha atual?</p>
        <p className="text-helper text-fg-muted max-w-[72ch]">
          Se você entra com o Google e nunca criou uma senha, ou se esqueceu a atual, mandamos um link para{" "}
          <span className="font-medium text-fg break-all">{email}</span>. Por ele você cria a senha nova, sem precisar da atual.
        </p>
        <form action={linkAction}>
          <Button type="submit" variant="secondary" loading={enviando} loadingLabel="Enviando…">
            Enviar link para criar senha
          </Button>
        </form>
        {link && "erro" in link && <Aviso>{link.erro}</Aviso>}
        {link && "enviadoPara" in link && (
          <div role="status">
            <Aviso tom="sucesso">
              Enviamos o link para {link.enviadoPara}. Ele vale por uma hora; confira também o spam.
            </Aviso>
          </div>
        )}
      </div>
    </div>
  );
}
