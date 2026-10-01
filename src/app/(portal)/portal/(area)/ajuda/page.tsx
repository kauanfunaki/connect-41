import { redirect } from "next/navigation";
import { Bell, Building2, Inbox, KeyRound, Megaphone, MessagesSquare, Plus, Smartphone, Wallet } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { Button } from "@/components/ui/Button";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { iconeDaTela } from "@/components/portal/iconeDaTela";
import { CentralDeAjuda, type PassoDaAjuda, type TelaDaAjuda } from "@/components/ajuda/CentralDeAjuda";
import { getPortalSession } from "@/lib/auth/portal";
import { getEnabledModuleCodes } from "@/lib/modules";
import { passosDoPortal, type IconeDoPasso } from "@/lib/portal/ajuda";
import { telasVisiveis } from "@/lib/portal/telas";
import { alcanceDoCliente } from "@/app/(portal)/alcance";

export const dynamic = "force-dynamic";

// Os ícones dos passos: os das telas do menu quando o passo é sobre uma tela,
// e um próprio quando é sobre o portal como um todo.
const ICONES: Record<IconeDoPasso, React.ReactNode> = {
  celular: <Smartphone />,
  solicitacao: <Inbox />,
  comunicado: <Megaphone />,
  sino: <Bell />,
  empresas: <Building2 />,
  pendencia: <ModuleIcon code="bpo_pendencias" />,
  aprovar: <ModuleIcon code="bpo_aprovacoes" />,
  conversa: <ModuleIcon code="bpo_comunicacao" />,
  processo: <ModuleIcon code="societario_processos" />,
  financeiro: <Wallet />,
  documentos: <ModuleIcon code="fiscal_documentos" />,
  senha: <KeyRound />,
};

/**
 * Ajuda do portal (01/10) — o primeiro item do "a fazer" quando BPO e portal
 * viraram prioridade máxima, para os clientes que entram no teste de 05/10.
 *
 * Mesma central do Connect (`CentralDeAjuda`), com os passos do cliente e sem
 * setores. Passos e telas seguem os módulos ligados, pela mesma régua do menu:
 * o cliente nunca lê sobre uma tela que não tem.
 */
export default async function AjudaDoPortalPage() {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const [ligados, alcance] = await Promise.all([getEnabledModuleCodes(sessao.tenantId), alcanceDoCliente(sessao)]);
  const modulos = new Set(ligados);
  const variasEmpresas = alcance.tipo === "EMPRESAS" && alcance.companyIds.length > 1;

  const passos: PassoDaAjuda[] = passosDoPortal(modulos, { variasEmpresas }).map((p) => ({ ...p, icone: ICONES[p.icone] }));
  const telas: TelaDaAjuda[] = telasVisiveis(modulos).map((t) => ({
    chave: t.href,
    titulo: t.rotulo,
    caminho: t.href,
    descricao: t.descricao,
    icone: iconeDaTela(t),
  }));
  // Com as solicitações ligadas, o caminho para falar com a 41 é uma solicitação nova.
  const temSolicitacoes = modulos.has("portal_solicitacoes");
  const temConversa = !temSolicitacoes && modulos.has("bpo_comunicacao");

  return (
    <PageContainer>
      <PortalCabecalho titulo="Ajuda" descricao="Como fazer cada coisa no portal." somenteLeitura={false} />
      <CentralDeAjuda
        gerais={telas}
        setores={[]}
        passos={passos}
        tituloDasTelas="Telas do portal"
        introducao="Procure um assunto ou o nome de uma tela. Aqui está o que dá para fazer no portal, passo a passo."
        exemploDeBusca="Ex.: aprovar pagamento, senha, celular…"
        focarBusca={false}
        rodape={
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5 shadow-[var(--c41-shadow-xs)]">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-[14px] font-semibold text-fg">Não achou o que procurava?</p>
              <p className="mt-0.5 text-[length:var(--fs-helper)] text-fg-muted">
                {temSolicitacoes
                  ? "Abra uma solicitação. A equipe certa recebe na hora e responde por lá."
                  : temConversa
                    ? "Escreva para a equipe da 41 pela Conversa. Ela é avisada na hora e responde por lá."
                    : "Fale com o seu contato na 41."}
              </p>
            </div>
            {temSolicitacoes && (
              <Button href="/portal/solicitacoes/nova" variant="secondary" size="sm">
                <Plus size={14} /> Nova solicitação
              </Button>
            )}
            {temConversa && (
              <Button href="/portal/comunicacao" variant="secondary" size="sm">
                <MessagesSquare size={14} /> Abrir a Conversa
              </Button>
            )}
          </section>
        }
      />
    </PageContainer>
  );
}
