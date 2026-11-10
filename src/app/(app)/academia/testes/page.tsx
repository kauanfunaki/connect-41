import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { CartaoDoTeste } from "@/components/academia/CartaoDoTeste";
import { abrirAcademia, resumoDaAcademia } from "@/lib/academia/servidor";
import { TESTES, motivoSemTeste } from "@/lib/academia/regras";

/**
 * Os testes da Academia (10/11/2026): cada um valendo (uma tentativa por dia
 * em cada nível) ou em treino livre (sem limite, fora do ranking).
 */
export default async function TestesDaAcademiaPage() {
  const { ctx, podeAdministrar, podeFazer } = await abrirAcademia();
  const resumo = await resumoDaAcademia(ctx);
  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="testes" podeAdministrar={podeAdministrar} />
      {!podeFazer && <Aviso tom="info" className="mb-4">{motivoSemTeste(ctx)}</Aviso>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TESTES.map((t) => (
          <CartaoDoTeste key={t} resumo={resumo.testes[t]} podeFazer={podeFazer} />
        ))}
      </div>
      <section aria-labelledby="regras-titulo" className="mt-6 max-w-3xl">
        <h2 id="regras-titulo" className="mb-2 text-body font-semibold text-fg">
          Como funciona
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ui text-fg-secondary">
          <li>Valendo: uma tentativa por dia em cada nível (Fácil, Médio e Difícil) de cada teste. Ela conta assim que o texto ou as questões aparecem, mesmo se você sair no meio.</li>
          <li>Treino livre: os mesmos testes, quantas vezes quiser. Nada vai para o ranking.</li>
          <li>Na digitação, o relógio de 60 segundos começa na primeira tecla. Colar não vale, e o texto que ficar sem digitar desconta da precisão.</li>
          <li>O ranking do mês fica com o melhor resultado de cada pessoa. O pódio de um mês encerrado baixa o certificado de destaque na aba Ranking.</li>
          <li>Nada daqui entra em avaliação de desempenho.</li>
        </ul>
      </section>
    </PageContainer>
  );
}
