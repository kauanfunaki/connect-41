import { notFound } from "next/navigation";
import { Building2, CalendarX, Download, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { ImportarDoRadar } from "@/components/societario/ImportarDoRadar";
import { getAuthContext } from "@/lib/auth/context";
import { canManageSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { previaDoRadar, urlDoRadar } from "@/lib/societario/importar-radar-servidor";
import { formatCnpj } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Trazer as licenças do Radar Societário (28/10/2026): a prévia do que entra,
 * do que fica de fora e por quê, e o botão que grava. Rodar de novo não
 * duplica: cada licença trazida leva a marca do id dela no Radar.
 */
export default async function LicencasDoRadarPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "societario_licencas"))) notFound();
  if (!canManageSector(ctx, (await setoresDoModulo(ctx.tenantId, "societario_licencas")) ?? "societario")) notFound();

  const { url: bruta } = await searchParams;
  const url = urlDoRadar(bruta ?? process.env.RADAR_SOCIETARIO_URL);
  const previa = url ? await previaDoRadar(ctx.tenantId, url) : null;
  const plano = previa?.ok ? previa.plano : null;
  const comTexto = plano?.licencas.filter((l) => l.textoDoVencimento) ?? [];
  const anexos = plano?.licencas.reduce((s, l) => s + l.anexos.length, 0) ?? 0;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Licenças", href: "/licencas" }, { label: "Trazer do Radar" }]} />
      <PageHeader
        title="Trazer do Radar Societário"
        subtitle="As licenças do Radar entram nas Licenças do Connect, com a validade, as observações e os anexos. Primeiro a prévia; nada é gravado até o botão."
        action={plano && url ? <ImportarDoRadar url={url} quantas={plano.licencas.length} /> : undefined}
      />

      <form method="get" action="/licencas/radar" className="mb-6 flex flex-wrap items-center gap-2">
        <Input name="url" defaultValue={url ?? ""} placeholder="https://radar…" aria-label="Endereço do Radar" className="w-96 max-w-full" />
        <Button type="submit" variant="secondary" size="sm">
          Ver prévia
        </Button>
      </form>

      {!url && <Aviso tom="atencao">Informe o endereço do Radar Societário (o mesmo que se abre no navegador).</Aviso>}
      {previa && !previa.ok && <Aviso tom="perigo">{previa.erro}</Aviso>}

      {plano && previa?.ok && (
        <>
          <FaixaDeTotais
            className="mb-6"
            itens={[
              { rotulo: "A trazer", valor: String(plano.licencas.length), detalhe: `de ${previa.empresasNoRadar} empresas ativas no Radar`, icone: <Download /> },
              { rotulo: "Anexos", valor: String(anexos), detalhe: "para Arquivos › Societário", icone: <Paperclip /> },
              { rotulo: "Empresas sem par", valor: String(plano.semEmpresa.length), detalhe: "CNPJ que o Connect não tem", icone: <Building2 /> },
              { rotulo: "Vencimento em texto", valor: String(comTexto.length), detalhe: "entram sem validade", icone: <CalendarX /> },
            ]}
          />
          <p className="mb-6 text-ui text-fg-secondary">
            {plano.jaImportadas > 0 && `${plano.jaImportadas} já foram trazidas antes e ficam como estão. `}
            {plano.naoSeAplica > 0 && `${plano.naoSeAplica} marcadas como "não se aplica" no Radar não entram.`}
          </p>

          {comTexto.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-section font-semibold text-fg">Vencimento em texto: conferir depois</h2>
              <p className="mb-2 text-ui text-fg-muted">No Connect, licença sem validade é &quot;não vence&quot;. O texto do Radar vai para as observações.</p>
              <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">Empresa</th>
                      <th className="py-2 pr-3 font-medium">Licença</th>
                      <th className="py-2 font-medium">No Radar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comTexto.map((l) => (
                      <tr key={l.radarId} className="border-b border-border-soft">
                        <td className="py-2 pr-3">{l.empresa}</td>
                        <td className="py-2 pr-3">{l.kind}</td>
                        <td className="py-2">{l.textoDoVencimento}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {plano.semEmpresa.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-section font-semibold text-fg">Empresas do Radar sem par no Connect</h2>
              <p className="mb-2 text-ui text-fg-muted">As licenças delas ficam de fora. Cadastre a empresa (ou acerte o CNPJ) e veja a prévia de novo.</p>
              <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">Empresa no Radar</th>
                      <th className="py-2 pr-3 font-medium">CNPJ</th>
                      <th className="py-2 font-medium">Licenças</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.semEmpresa.map((e) => (
                      <tr key={`${e.empresa}-${e.cnpj}`} className="border-b border-border-soft">
                        <td className="py-2 pr-3">{e.empresa}</td>
                        <td className="py-2 pr-3 tabular-nums">{e.cnpj ? formatCnpj(e.cnpj) : "sem CNPJ"}</td>
                        <td className="py-2 tabular-nums">{e.licencas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <NotaDeFonte>
        Lê as empresas ativas do Radar e as licenças de cada uma. A empresa é casada pelo CNPJ. O tipo e o complemento do Radar viram o tipo da
        licença (&quot;Vigilância Sanitária — veicular&quot;), e o órgão é ligado quando o tipo aponta para um só órgão do cadastro (Alvará fica
        sem, porque há uma prefeitura por cidade). As licenças trazidas levam nas observações a marca &quot;[Radar #id]&quot;, e por isso rodar de
        novo não duplica. Depois de trazer, desligue os e-mails e o Trello do Radar: o Connect avisa na fila de renovação, com 60 dias de antecedência, no sino.
      </NotaDeFonte>
    </PageContainer>
  );
}
