import Link from "next/link";
import { MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import type { RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { CONTRATO_LABEL, MODALIDADE_LABEL, temFiltro, urlDaListaEm, type FiltrosDoPortal } from "@/lib/carreiras/portal";
import { listaDoPortal, opcoesComContagem } from "@/lib/carreiras/apresentacao";
import type { VagaAberta, VagaDetalhada } from "@/lib/carreiras/vagasDoPortal";
import { Moldura41 } from "./Moldura41";
import { CartaoDaVaga } from "./CartaoDaVaga";
import { ChipDeFiltro, type OpcaoDoChip } from "./ChipDeFiltro";
import { PainelDaVaga } from "./PainelDaVaga";
import { TrianguloDaFaixa, TrianguloVazio } from "./Triangulos";

type Lista = ReturnType<typeof listaDoPortal<VagaAberta>>;

/**
 * Todas as vagas, com busca e filtros (15/10/2026). Na tela larga, a lista à
 * esquerda e a vaga escolhida à direita, presa ao rolar — a escolha fica na
 * URL (`?vaga=`), é montada no servidor e pode ser compartilhada. No celular,
 * só a lista: o toque abre a página da vaga.
 */
export function Lista41({
  slug,
  rotas,
  todas,
  lista,
  detalhe,
  agora,
}: {
  slug: string;
  rotas: RotasDoPortal;
  todas: VagaAberta[];
  lista: Lista;
  /** A vaga escolhida, com descrição, requisitos e benefícios (painel ao lado). */
  detalhe: VagaDetalhada | null;
  agora: Date;
}) {
  const { filtros, filtradas, itens, pagina, temMais, escolhida } = lista;
  const filtrando = temFiltro(filtros);
  const url = (f: Partial<FiltrosDoPortal>, vaga?: string | null, p = 1) => urlDaListaEm(rotas.vagas, { ...filtros, ...f }, p, vaga);

  const chip = (chave: "modalidade" | "contrato" | "area" | "cidade", rotulo: string, todos: string) => {
    const opcoes = opcoesComContagem(todas, filtros, chave);
    const atual = filtros[chave];
    if (opcoes.length === 0 && !atual) return null;
    const lista: OpcaoDoChip[] = [
      { rotulo: todos, href: url({ [chave]: "" }), atual: !atual },
      ...opcoes.map((o) => ({ rotulo: o.rotulo, href: url({ [chave]: o.valor }), atual: o.valor.toLowerCase() === String(atual).toLowerCase(), vagas: o.vagas })),
    ];
    const rotuloAtual =
      chave === "modalidade" && filtros.modalidade
        ? MODALIDADE_LABEL[filtros.modalidade]
        : chave === "contrato" && filtros.contrato
          ? CONTRATO_LABEL[filtros.contrato]
          : atual || null;
    return <ChipDeFiltro key={chave} rotulo={rotulo} valor={rotuloAtual} opcoes={lista} />;
  };

  return (
    <Moldura41 rotas={rotas} atual="vagas">
      <section className="t41-faixa" aria-labelledby="lista-titulo">
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo">
          <p className="t41-selo t41-selo--lilas">Todas as vagas</p>
          <h1 id="lista-titulo" className="t41-faixa__titulo">
            Vagas <strong>abertas</strong>
          </h1>
          <form method="get" action={rotas.vagas} role="search" aria-label="Buscar vagas" className="t41-busca-compacta">
            <div className="t41-busca__campo">
              <label htmlFor="lista-q" className="t41-busca__rotulo">
                <Search size={13} aria-hidden="true" /> Cargo ou palavra-chave
              </label>
              <Input id="lista-q" name="q" type="search" defaultValue={filtros.busca} placeholder="Ex.: analista fiscal" maxLength={80} className="t41-campo-nu" autoComplete="off" />
            </div>
            <div className="t41-busca__campo">
              <label htmlFor="lista-local" className="t41-busca__rotulo">
                <MapPin size={13} aria-hidden="true" /> Cidade ou estado
              </label>
              <Input id="lista-local" name="local" type="search" defaultValue={filtros.local} placeholder="Ex.: Curitiba, PR" maxLength={80} className="t41-campo-nu" autoComplete="address-level2" />
            </div>
            {/* Os filtros escolhidos vão junto: buscar não apaga o "Remoto". */}
            {(["cidade", "uf", "area", "modalidade", "contrato", "empresa"] as const).map((k) =>
              filtros[k] ? <input key={k} type="hidden" name={k} value={filtros[k]} /> : null
            )}
            {filtros.ordem === "prazo" && <input type="hidden" name="ordem" value="prazo" />}
            <button type="submit" className="t41-botao t41-botao--primario">
              <Search size={18} aria-hidden="true" /> Buscar
            </button>
          </form>
        </div>
      </section>

      {todas.length > 0 && (
        <div className="t41-filtros">
          <div className="t41-caixa t41-filtros__linha" role="group" aria-label="Filtros">
            {chip("modalidade", "Modelo", "Todos os modelos")}
            {chip("contrato", "Contrato", "Todos os contratos")}
            {chip("area", "Área", "Todas as áreas")}
            {chip("cidade", "Cidade", "Todas as cidades")}
            {filtros.uf && (
              <Link href={url({ uf: "" })} scroll={false} className="t41-chip__botao" style={{ flex: "none", textDecoration: "none" }}>
                Estado: {filtros.uf} <X size={15} aria-hidden="true" />
                <span className="t41-sr">(tirar este filtro)</span>
              </Link>
            )}
            {filtros.empresa && (
              <Link href={url({ empresa: "" })} scroll={false} className="t41-chip__botao" style={{ flex: "none", textDecoration: "none" }}>
                Empresa: {filtros.empresa} <X size={15} aria-hidden="true" />
                <span className="t41-sr">(tirar este filtro)</span>
              </Link>
            )}
            {filtrando && (
              <Link href={rotas.vagas} className="t41-filtros__limpar">
                <X size={15} aria-hidden="true" /> Limpar filtros
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="t41-caixa t41-resultados">
        {todas.length > 0 && (
          <div className="t41-resultados__topo">
            <p className="t41-resultados__contagem t41-num" aria-live="polite">
              <strong>{filtradas.length === 1 ? "1 vaga" : `${filtradas.length} vagas`}</strong>
              {filtrando ? ` de ${todas.length} abertas` : filtradas.length === 1 ? " aberta" : " abertas"}
            </p>
            <ChipDeFiltro
              rotulo="Ordenar"
              valor={filtros.ordem === "prazo" ? "prazo acabando" : "mais recentes"}
              direita
              opcoes={[
                { rotulo: "Mais recentes", href: url({ ordem: "recentes" }, escolhida?.id), atual: filtros.ordem === "recentes" },
                { rotulo: "Prazo acabando", href: url({ ordem: "prazo" }, escolhida?.id), atual: filtros.ordem === "prazo" },
              ]}
            />
          </div>
        )}

        {todas.length === 0 ? (
          <div className="t41-vazio">
            <TrianguloVazio />
            <h2>Nenhuma vaga aberta agora</h2>
            <p>Novas vagas aparecem aqui assim que são publicadas. Volte em breve.</p>
            <div className="t41-vazio__acoes">
              <Link href={rotas.conta} className="t41-botao t41-botao--contorno t41-botao--pequeno">
                Acompanhar minha candidatura
              </Link>
            </div>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="t41-vazio">
            <TrianguloVazio />
            <h2>Nenhuma vaga com esses filtros</h2>
            <p>Tente tirar um filtro, buscar por outra palavra ou por uma cidade próxima.</p>
            <div className="t41-vazio__acoes">
              <Link href={rotas.vagas} className="t41-botao t41-botao--primario t41-botao--pequeno">
                Limpar filtros e ver as {todas.length} vagas
              </Link>
            </div>
          </div>
        ) : (
          <div className="t41-mestre-detalhe">
            <div>
              <ol className="t41-lista" aria-label="Vagas">
                {itens.map((v) => (
                  <li key={v.id}>
                    <CartaoDaVaga
                      vaga={v}
                      slug={slug}
                      agora={agora}
                      href={rotas.vaga(v.id)}
                      hrefNoPainel={url({}, v.id, pagina)}
                      escolhida={escolhida?.id === v.id}
                      compacto
                      titulo="h2"
                    />
                  </li>
                ))}
              </ol>
              {(temMais || pagina > 1) && (
                <div className="t41-mais t41-num">
                  <p>
                    Mostrando {itens.length} de {filtradas.length} vagas
                  </p>
                  {temMais && (
                    <Link href={url({}, escolhida?.id, pagina + 1)} scroll={false} className="t41-botao t41-botao--contorno">
                      Mostrar mais vagas
                    </Link>
                  )}
                </div>
              )}
            </div>
            {detalhe && (
              <div className="t41-so-largo">
                <PainelDaVaga vaga={detalhe} slug={slug} rotas={rotas} agora={agora} />
              </div>
            )}
          </div>
        )}
      </div>
    </Moldura41>
  );
}
