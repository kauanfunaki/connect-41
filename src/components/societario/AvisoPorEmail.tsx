"use client";

import { useActionState, useState, useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { enviarTesteDoAvisoPorEmail, salvarAvisoPorEmail, type AvisoPorEmailState } from "@/app/(app)/licencas/actions";

type Props = {
  ligado: boolean;
  emails: string[];
  /** O tenant tem SMTP: sem ele, nada sai. */
  smtp: boolean;
  /** O módulo de Certidões está ligado: só então elas entram no e-mail. */
  comCertidoes: boolean;
};

/**
 * "Avisos por e-mail" em Licenças (12/11/2026): o e-mail diário de vencimentos
 * que o Radar Societário mandava. A lista de endereços e o liga/desliga ficam
 * aqui; o envio é do agendador, uma vez por dia, a partir das 7h.
 */
export function AvisoPorEmail({ ligado, emails, smtp, comCertidoes }: Props) {
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [estado, salvar, salvando] = useActionState(async (anterior: AvisoPorEmailState, form: FormData) => {
    const r = await salvarAvisoPorEmail(anterior, form);
    if (r && "success" in r) {
      toast.success("Avisos por e-mail salvos.");
      setAberta(false);
    }
    return r;
  }, null);
  const [testando, startTeste] = useTransition();
  const [erroDoTeste, setErroDoTeste] = useState<string | null>(null);

  function testar() {
    setErroDoTeste(null);
    startTeste(async () => {
      const r = await enviarTesteDoAvisoPorEmail().catch(() => ({ error: "Não deu para enviar agora. Tente de novo." }) as const);
      if ("error" in r) setErroDoTeste(r.error);
      else toast.success(r.texto);
    });
  }

  const resumo = ligado && emails.length > 0 ? `Ligado · ${emails.length} ${emails.length === 1 ? "e-mail" : "e-mails"}` : "Desligado";

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberta(true)} title={`Avisos por e-mail: ${resumo}`}>
        <Mail size={14} /> Avisos por e-mail
      </Button>
      <Modal open={aberta} onClose={() => !salvando && !testando && setAberta(false)} title="Avisos de vencimento por e-mail" maxWidth="max-w-xl">
        <form action={salvar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-secondary">
            Um e-mail por dia, a partir das 7h, com uma tabela do que pede atenção. Cada documento entra uma vez por marco — o que já foi avisado não
            se repete no dia seguinte.
          </p>
          <ul className="flex flex-col gap-1 rounded-md border border-border-soft px-3 py-2 text-fs-2 text-fg">
            <li>
              <strong>Licenças:</strong> a 90, 60 e 30 dias do vencimento e quando vencem (até 30 dias depois).
            </li>
            <li>
              <strong>Certidões:</strong>{" "}
              {comCertidoes
                ? "quando saem positivas, quando faltam 15 dias e quando vencem."
                : "entram quando o módulo de Certidões estiver ligado."}
            </li>
          </ul>

          <Switch name="ligado" defaultChecked={ligado} rotulo="Enviar o e-mail diário" />

          <CampoForm
            label="Quem recebe"
            htmlFor="aviso-emails"
            helper="Um e-mail por linha, ou separados por vírgula. Cada endereço recebe o seu e-mail."
          >
            <Textarea id="aviso-emails" name="emails" rows={4} defaultValue={emails.join("\n")} placeholder="societario@escritorio.com.br" />
          </CampoForm>

          {!smtp && (
            <Aviso tom="atencao">
              O escritório não tem SMTP configurado: nada sai até um administrador configurar em Configurações › Empresa.
            </Aviso>
          )}
          {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}
          {erroDoTeste && <Aviso>{erroDoTeste}</Aviso>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={testar}
              disabled={!smtp || emails.length === 0 || salvando}
              loading={testando}
              loadingLabel="Enviando…"
              title={emails.length === 0 ? "Salve a lista antes de enviar o teste." : "Manda agora, para a lista salva, tudo o que está na janela hoje. Não marca nada como avisado."}
            >
              <Send size={14} /> Enviar teste
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setAberta(false)} disabled={salvando || testando}>
                Cancelar
              </Button>
              <Button type="submit" loading={salvando} loadingLabel="Salvando…" disabled={testando}>
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
