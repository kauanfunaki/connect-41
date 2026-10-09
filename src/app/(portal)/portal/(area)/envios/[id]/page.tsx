import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { SignatureForm } from "@/components/documentosCliente/SignatureForm";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { clientIp } from "@/lib/rateLimit";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";
import { abrirEnvioDoCliente } from "@/lib/envios/consultas";
import { rotaDoArquivoNoPortal } from "@/lib/envios/regras";
import { formatInstantDateTime, formatInstantDateTimeComSegundos } from "@/lib/format";
import { aceitarEnvio } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Um documento do escritório aberto pelo cliente (08/10/2026). Abrir é o que
 * conta como leitura — a mesma régua da página do link por e-mail, que
 * registra a visita com data, IP e navegador na linha de destinatário da
 * pessoa (criada aqui na primeira vez). Envio de outra empresa responde 404,
 * igual a um que não existe.
 */
export default async function PortalEnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has("portal_solicitacoes")) notFound();

  const { id } = await params;
  const h = await headers();
  const envio = await abrirEnvioDoCliente(
    { tenantId: cliente.tenantId, companyIds: cliente.companyIds },
    cliente.usuario.email,
    id,
    { ipAddress: clientIp({ headers: h }), userAgent: h.get("user-agent") }
  );
  if (!envio) notFound();

  return (
    <PageContainer>
      {/* Destino fixo: quem chega pelo Início ou por um link não tem para onde voltar no histórico. */}
      <BackButton href="/portal/envios" rotulo="Documentos do escritório" className="mb-3" />
      <PageHeader
        title={envio.titulo}
        subtitle={<>{envio.empresaNome} · {formatInstantDateTime(envio.publicadoEm)}</>}
        meta={
          envio.pedeAceite ? (
            envio.aceite ? <Selo tom="sucesso">Aceito</Selo> : <Selo tom="atencao">Aguardando seu aceite</Selo>
          ) : undefined
        }
      />

      {/* Texto de leitura, como no comunicado: até 72 caracteres por linha e no
          tamanho de leitura, num cartão que acompanha a largura do texto. O HTML
          é o do editor, sanitizado de novo na saída (defesa em profundidade). */}
      <Card className="p-5 max-w-3xl">
        <div
          className="max-w-[72ch] text-body text-fg leading-relaxed break-words [&_a]:text-brand [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-fs-7 [&_h1]:font-semibold [&_h2]:text-fs-6 [&_h2]:font-semibold [&_h3]:text-fs-4 [&_h3]:font-semibold"
          dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(envio.corpoHtml) }}
        />
      </Card>

      {/* `nativo` (um `<a>` simples): o Button com href vira <Link>, e o
          prefetch chamaria a rota do arquivo — que registra o download — sem
          ninguém ter clicado. */}
      {envio.anexo && (
        <Button href={rotaDoArquivoNoPortal(envio.id)} nativo size="lg" variant="secondary" className="max-w-full mt-4">
          <Download size={16} className="flex-shrink-0" />
          <span className="truncate">Baixar anexo{envio.anexo.nome ? `: ${envio.anexo.nome}` : ""}</span>
        </Button>
      )}

      {envio.pedeAceite && (
        <div className="max-w-3xl">
          {envio.aceite ? (
            <Aviso tom="sucesso" className="mt-5">
              <p className="font-semibold">Aceite registrado</p>
              <p className="text-fs-2 text-fg-muted mt-1">
                {envio.aceite.meu ? "Você deu o aceite" : `Aceite dado por ${envio.aceite.nome ?? "—"}`} em{" "}
                {formatInstantDateTimeComSegundos(envio.aceite.em)}
                {envio.aceite.meu && envio.aceite.nome ? `, como ${envio.aceite.nome}` : ""}.
              </p>
            </Aviso>
          ) : (
            <SignatureForm acao={aceitarEnvio.bind(null, envio.id)} documentTitle={envio.titulo} nomePadrao={cliente.usuario.name} />
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="text-fs-2 text-fg-muted">Dúvida sobre este documento?</p>
        <Button href="/portal/solicitacoes/nova" variant="secondary" size="sm">
          Nova solicitação
        </Button>
      </div>
    </PageContainer>
  );
}
