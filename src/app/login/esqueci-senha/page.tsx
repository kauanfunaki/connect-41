import { AuthShell } from "@/components/login/AuthShell";
import { AccessRequestForm } from "@/components/login/AccessRequestForm";
import { solicitarRedefinicaoSenha } from "./actions";

export default function EsqueciSenhaPage() {
  return (
    <AuthShell subtitle="Vamos abrir um chamado para redefinir sua senha">
      <AccessRequestForm
        action={solicitarRedefinicaoSenha}
        mensagemPlaceholder="Ex: não recebo mais o e-mail de recuperação"
        submitLabel="Solicitar redefinição"
        submitLabelPending="Enviando…"
        successTitle="Chamado aberto"
        successMessage="Sua solicitação foi registrada no Hub da 41 Tech. O time responsável vai te retornar em breve."
      />
    </AuthShell>
  );
}
