import { AccessRequestForm } from 'connect-41';

async function solicitarAcesso(prev: unknown) {
  return prev;
}

export function Default() {
  return (
    <div style={{ maxWidth: 380, padding: 24 }}>
      <AccessRequestForm
        action={solicitarAcesso as never}
        showTelefone
        mensagemPlaceholder="Ex: sou da equipe fiscal, preciso de acesso ao Connect 41"
        submitLabel="Solicitar acesso"
        submitLabelPending="Enviando…"
        successTitle="Solicitação enviada!"
        successMessage="Um administrador vai analisar seu pedido e você receberá um e-mail quando for aprovado."
      />
    </div>
  );
}
