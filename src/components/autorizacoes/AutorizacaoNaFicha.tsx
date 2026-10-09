import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { BotaoDaAutorizacao } from "@/components/autorizacoes/DialogosDaAutorizacao";
import type { AutorizacaoDaEmpresa } from "@/lib/autorizacoes/servidor";
import { andamentoDaAutorizacao, ROTULO_DA_SITUACAO, type Situacao } from "@/lib/autorizacoes/regras";

/** O tom do selo de cada situação — o mesmo na lista e na ficha. */
export const TOM_DA_SITUACAO: Record<Situacao, TomDoSelo> = {
  falta_pedir: "neutro",
  pedida: "marca",
  validar: "atencao",
  caiu: "perigo",
  ativa: "sucesso",
  a_renovar: "atencao",
  vencida: "perigo",
  cancelada: "perigo",
  nao_se_aplica: "neutro",
};

/** A autorização de acesso da raiz desta empresa, na Visão geral da ficha. */
export function AutorizacaoNaFicha({
  dados,
  nome,
  hoje,
  podeEditar,
  serpro = false,
}: {
  dados: AutorizacaoDaEmpresa;
  nome: string;
  hoje: string;
  podeEditar: boolean;
  /** A ligação com o Serpro está pronta: o diálogo oferece conferir lá. */
  serpro?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-section font-semibold text-fg">Autorização de acesso na Receita</h2>
        <Link href="/autorizacoes" className="text-ui text-fg-muted hover:text-brand transition-colors">
          Ver todos os clientes
        </Link>
      </div>
      {dados.semDocumento ? (
        <p className="text-ui text-fg-muted">Sem CNPJ ou CPF válido no cadastro: não há o que autorizar.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Selo tom={TOM_DA_SITUACAO[dados.situacao]}>{ROTULO_DA_SITUACAO[dados.situacao]}</Selo>
          <span className="text-ui text-fg-secondary min-w-0">
            {andamentoDaAutorizacao(dados.situacao, dados.registro, hoje)}
            {dados.mesmaRaiz > 0 && (
              <span className="block text-micro text-fg-muted">
                Vale para a raiz {dados.documento}: {dados.mesmaRaiz === 1 ? "mais 1 empresa cadastrada" : `mais ${dados.mesmaRaiz} empresas cadastradas`}.
              </span>
            )}
          </span>
          {podeEditar && (
            <span className="ml-auto">
              <BotaoDaAutorizacao chave={dados.chave} nome={nome} documento={dados.documento} registro={dados.registro} hoje={hoje} serpro={serpro} />
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
