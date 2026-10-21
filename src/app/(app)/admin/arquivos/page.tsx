import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors, getAllSectors } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModeloDePastas, NovaPastaNoModelo } from "@/components/arquivos/ModeloDePastas";
import { PastaDeRedeAdmin } from "@/components/arquivos/PastaDeRedeAdmin";
import { Aviso } from "@/components/ui/Aviso";
import { modeloDoEscritorio } from "@/lib/drive/servidor";
import { empresasDaPastaDeRede } from "@/lib/drive/pastaDeRedeServidor";
import { FALTA_ATUALIZAR_O_BANCO_DA_REDE } from "@/lib/drive/pastaDeRede";
import { definirPastaDeRedeDaEmpresa } from "./actions";

/** O modelo de pastas dos Arquivos (09/10/2026): o que toda empresa ganha ao abrir os Arquivos dela. */
export default async function ModeloDePastasPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const [modelo, ativos, todos, daRede] = await Promise.all([
    modeloDoEscritorio(ctx.tenantId),
    getActiveSectors(ctx.tenantId),
    getAllSectors(ctx.tenantId),
    empresasDaPastaDeRede(ctx.tenantId),
  ]);
  const rotulo = new Map(todos.map((s) => [s.code, s.label]));
  const setores = ativos.map((s) => ({ code: s.code, label: s.label }));

  return (
    <PageContainer>
      <PageHeader
        title="Modelo de pastas"
        subtitle="As pastas que toda empresa ganha nos Arquivos. Mudar nome ou setor vale na hora para todas; pasta nova chega a cada empresa na próxima vez que alguém abrir os Arquivos dela."
        action={<NovaPastaNoModelo setores={setores} />}
      />
      <ModeloDePastas
        pastas={modelo.map((m) => ({
          id: m.id,
          nome: m.name,
          setor: m.sectorCode,
          setorRotulo: m.sectorCode ? rotulo.get(m.sectorCode) ?? m.sectorCode : null,
          compartilhada: m.sharedWithPortal,
          ativa: m.active,
        }))}
        setores={setores}
      />

      {/* A pasta de rede (21/10/2026): o mesmo modelo, agora também na rede.
          Roteiro em docs/PASTA-DE-REDE.md. */}
      <section className="mt-10 space-y-3" aria-labelledby="pasta-de-rede">
        <div>
          <h2 id="pasta-de-rede" className="font-display text-card-title font-semibold text-fg">
            Pasta de rede
          </h2>
          <p className="mt-1 text-fs-2 text-fg-muted">
            O robô do escritório traz para os Arquivos o que a equipe põe na pasta da empresa na rede, nas pastas deste modelo:{" "}
            <span className="font-mono text-fs-1">CNPJ - Nome/Fiscal/2026/arquivo.pdf</span>. Só entra o que é das empresas ligadas aqui.
          </p>
        </div>
        {daRede === null ? (
          <Aviso tom="atencao">{FALTA_ATUALIZAR_O_BANCO_DA_REDE}</Aviso>
        ) : (
          <PastaDeRedeAdmin empresas={daRede} definirAction={definirPastaDeRedeDaEmpresa} somenteLeitura={ctx.subscriptionReadOnly} />
        )}
      </section>
    </PageContainer>
  );
}
