import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext } from "@/lib/auth/context";
import { getEnabledModuleCodes } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { setorDaTelaDoApoio } from "@/lib/apoio/servidor";
import { SeletorDoSetorDoApoio } from "@/components/apoio/SeletorDoSetorDoApoio";
import { RepositorioDeFluxos } from "@/components/fluxos/RepositorioDeFluxos";
import { MODULO_FLUXOS, podeEditarOsFluxos, podeExcluirDosFluxos, podeVerOsFluxos } from "@/lib/fluxos/regras";
import { lerRepositorio, pessoasDoSetor } from "@/lib/fluxos/servidor";
import { telasParaEscolher } from "@/lib/fluxos/telas";
import {
  criarFluxo,
  criarPastaDeFluxos,
  excluirAnexoDoFluxo,
  excluirFluxo,
  excluirPastaDeFluxos,
  mudarIconeDaPastaDeFluxos,
  renomearPastaDeFluxos,
  salvarVersaoDoFluxo,
} from "./actions";

// O Repositório de fluxos (10/11/2026, pedido do Kauan): no Apoio, ao lado do
// Repositório de senhas e do de manuais, cada setor guarda os fluxogramas e as
// metodologias dele. Organização dos manuais (pastas → fluxos), o desenho
// feito a partir de uma lista de etapas e, na leitura, a etapa ao lado do
// desenho. O setor é o da pessoa — ver `setorDaTelaDoApoio`.
export default async function FluxosPage({ searchParams }: { searchParams: Promise<{ setor?: string; fluxo?: string; versao?: string; editar?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const [pedido, ligados] = await Promise.all([searchParams, getEnabledModuleCodes(ctx.tenantId)]);
  if (!ligados.has(MODULO_FLUXOS)) notFound();
  const apoio = await setorDaTelaDoApoio(ctx, pedido.setor);
  if (!apoio || !podeVerOsFluxos(ctx, apoio.setor)) notFound();
  const setor = apoio.setor;

  const [{ pastas, aberto, versaoAberta }, { labels, options }] = await Promise.all([
    lerRepositorio(ctx.tenantId, setor, { fluxo: pedido.fluxo, versao: pedido.versao }),
    getSectorMaps(ctx.tenantId),
  ]);
  const podeEditar = podeEditarOsFluxos(ctx, setor);
  const pessoas = podeEditar && aberto ? await pessoasDoSetor(ctx.tenantId, setor, aberto.donoId) : [];
  const telas = podeEditar && aberto ? telasParaEscolher(ligados, aberto.etapas.map((e) => e.tela).filter((t): t is string => !!t)).map((t) => ({ href: t.href, rotulo: t.rotulo })) : [];

  // Altura fechada, sem rolagem de página: o cabeçalho fica fixo e a área de
  // trabalho ocupa o que sobra, com as rolagens por dentro (como os manuais).
  return (
    <PageContainer className="h-full flex flex-col">
      <RepositorioDeFluxos
        setor={setor}
        setorRotulo={apoio.rotulo}
        rotulosDosSetores={labels}
        comSetorNoEndereco={!apoio.noSetor && apoio.setores.length > 1}
        pastas={pastas}
        aberto={aberto}
        versaoAberta={versaoAberta}
        editarDeInicio={pedido.editar === "1"}
        podeEditar={podeEditar}
        podeExcluir={podeExcluirDosFluxos(ctx, setor)}
        pessoas={pessoas}
        setores={options.map((o) => ({ codigo: o.value, rotulo: o.label }))}
        telas={telas}
        seletorDoSetor={<SeletorDoSetorDoApoio apoio={apoio} caminho="/fluxos" />}
        acoes={{
          criarPasta: criarPastaDeFluxos.bind(null, setor),
          renomearPasta: renomearPastaDeFluxos,
          mudarIcone: mudarIconeDaPastaDeFluxos,
          excluirPasta: excluirPastaDeFluxos,
          criarFluxo,
          salvarVersao: salvarVersaoDoFluxo,
          excluirFluxo,
          excluirAnexo: excluirAnexoDoFluxo,
        }}
      />
    </PageContainer>
  );
}
