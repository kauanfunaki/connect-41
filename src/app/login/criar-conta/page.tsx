import { AuthShell } from "@/components/login/AuthShell";
import { AccessRequestForm } from "@/components/login/AccessRequestForm";
import { solicitarAcesso } from "./actions";

export default function CriarContaPage() {
  return (
    <AuthShell subtitle="Vamos abrir um chamado para liberar seu acesso">
      <AccessRequestForm
        action={solicitarAcesso}
        showTelefone
        mensagemPlaceholder="Ex: setor, cargo ou motivo do acesso"
        submitLabel="Solicitar acesso"
        submitLabelPending="Enviando…"
        successTitle="Chamado aberto"
        successMessage="Sua solicitação foi registrada no Hub da 41 Tech. Assim que seu acesso for liberado, você recebe um e-mail."
      />
    </AuthShell>
  );
}
