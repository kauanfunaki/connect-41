import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";

type Setor = { value: string; label: string };

/**
 * O campo "Setor" do botão "Filtros". `null` quando a pessoa só enxerga um
 * setor — não há o que escolher.
 */
export function campoDeSetor(setores: Setor[]): CampoDeFiltro | null {
  if (setores.length <= 1) return null;
  return { chave: "setor", rotulo: "Setor", vazioLabel: "Todos os setores", opcoes: setores };
}

/**
 * O setor da Gestão no botão "Filtros".
 *
 * Eram chips de link, um por setor (até 30/09) — o desenho de pílula que a
 * conferência reprovou para filtro: ninguém distinguia do seletor de abas logo
 * acima. O parâmetro continua `setor` na URL, então as abas o carregam junto.
 */
export function FiltroDeSetor({ setores }: { setores: Setor[] }) {
  const campo = campoDeSetor(setores);
  if (!campo) return null;
  return <FiltrosDaTela campos={[campo]} />;
}
