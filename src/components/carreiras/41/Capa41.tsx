import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { MARCA_41_CARREIRAS, caminhoDoLogoDaVaga, type RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { SEM_FILTRO, urlDaListaEm } from "@/lib/carreiras/portal";
import { contagensDoPortal, diaEMes, empresasContratando, resumoDoPortal } from "@/lib/carreiras/apresentacao";
import type { VagaAberta } from "@/lib/carreiras/vagasDoPortal";
import { Moldura41 } from "./Moldura41";
import { CartaoDaVaga } from "./CartaoDaVaga";
import { LogoDaEmpresa } from "./LogoDaEmpresa";
import { PedirAcesso41 } from "./AcessoDoCandidato41";
import { ArteDaCapa, TrianguloDaFaixaLilas, TrianguloVazio } from "./Triangulos";

/** Quantas vagas a capa mostra em "Vagas recentes". */
export const VAGAS_NA_CAPA = 6;

const atraso = (ms: number) => ({ "--atraso": `${ms}ms` }) as CSSProperties;
const vagasEm = (n: number) => (n === 1 ? "1 vaga" : `${n} vagas`);

/**
 * A página inicial do 41 Carreiras (15/10/2026). Antes, o endereço abria
 * direto na lista; agora é uma capa: a busca grande sobre o roxo, os atalhos
 * por modelo e contrato, os números de verdade (vagas, empresas, a vaga mais
 * nova), as áreas, as vagas recentes, as empresas contratando, como funciona
 * e o acesso de quem já se candidatou. Tudo calculado das vagas abertas e
 * públicas — número zero não aparece.
 */
export function Capa41({ slug, rotas, vagas, agora }: { slug: string; rotas: RotasDoPortal; vagas: VagaAberta[]; agora: Date }) {
  const resumo = resumoDoPortal(vagas);
  const contagens = contagensDoPortal(vagas);
  const empresas = empresasContratando(vagas);
  const recentes = vagas.slice(0, VAGAS_NA_CAPA);
  const filtro = (f: Partial<typeof SEM_FILTRO>) => urlDaListaEm(rotas.vagas, { ...SEM_FILTRO, ...f });

  return (
    <Moldura41 rotas={rotas} atual="inicio">
      <section className="t41-capa" aria-labelledby="capa-titulo">
        <div className="t41-caixa t41-capa__grade">
          <div>
            <p className="t41-selo t41-selo--lilas t41-surge" style={atraso(0)}>
              Vagas abertas · {MARCA_41_CARREIRAS.recrutamento}
            </p>
            <h1 id="capa-titulo" className="t41-capa__titulo t41-surge" style={atraso(90)}>
              Encontre sua <strong>próxima vaga</strong>
            </h1>
            <p className="t41-capa__texto t41-surge" style={atraso(180)}>
              Vagas em empresas cujos processos seletivos são conduzidos pela {MARCA_41_CARREIRAS.recrutamento}. Candidate-se em
              poucos minutos, aqui mesmo no site — sem criar conta nem senha.
            </p>
          </div>
          <div className="t41-capa__arte">
            <ArteDaCapa />
          </div>
        </div>
      </section>

      <div className="t41-caixa">
        <form method="get" action={rotas.vagas} role="search" aria-label="Buscar vagas" className="t41-busca t41-surge" style={atraso(280)}>
          <div className="t41-busca__campo">
            <label htmlFor="busca-q" className="t41-busca__rotulo">
              <Search size={13} aria-hidden="true" /> Cargo ou palavra-chave
            </label>
            <Input id="busca-q" name="q" type="search" placeholder="Ex.: analista fiscal, auxiliar de DP" maxLength={80} className="t41-campo-nu" autoComplete="off" />
          </div>
          <div className="t41-busca__campo">
            <label htmlFor="busca-local" className="t41-busca__rotulo">
              <MapPin size={13} aria-hidden="true" /> Cidade ou estado
            </label>
            <Input id="busca-local" name="local" type="search" placeholder="Ex.: Curitiba, PR" maxLength={80} className="t41-campo-nu" autoComplete="address-level2" />
          </div>
          <button type="submit" className="t41-botao t41-botao--primario">
            <Search size={18} aria-hidden="true" /> Buscar vagas
          </button>
        </form>

        {(contagens.modalidades.length > 0 || contagens.contratos.length > 0) && (
          <nav className="t41-atalhos t41-surge" style={atraso(360)} aria-label="Atalhos de busca">
            <span className="t41-atalhos__rotulo">Atalhos:</span>
            {contagens.modalidades.map((m) => (
              <Link key={m.valor} href={filtro({ modalidade: m.valor })} className="t41-atalho">
                {m.rotulo} <span className="t41-atalho__n">{m.vagas}</span>
              </Link>
            ))}
            {contagens.contratos.map((c) => (
              <Link key={c.valor} href={filtro({ contrato: c.valor })} className="t41-atalho">
                {c.rotulo} <span className="t41-atalho__n">{c.vagas}</span>
              </Link>
            ))}
          </nav>
        )}

        {resumo && (
          <dl className="t41-numeros t41-surge" style={atraso(440)} aria-label="O portal em números">
            <div className="t41-numero">
              <dt className="t41-numero__rotulo">{resumo.vagas === 1 ? "vaga aberta" : "vagas abertas"}</dt>
              <dd className="t41-numero__valor" style={{ margin: 0 }}>
                {resumo.vagas}
              </dd>
            </div>
            <div className="t41-numero">
              <dt className="t41-numero__rotulo">{resumo.empresas === 1 ? "empresa contratando" : "empresas contratando"}</dt>
              <dd className="t41-numero__valor" style={{ margin: 0 }}>
                {resumo.empresas}
              </dd>
            </div>
            <div className="t41-numero">
              <dt className="t41-numero__rotulo">publicação mais recente</dt>
              <dd className="t41-numero__valor" style={{ margin: 0 }}>
                {diaEMes(resumo.ultimaPublicacao)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {vagas.length === 0 ? (
        <section className="t41-secao">
          <div className="t41-caixa">
            <div className="t41-vazio">
              <TrianguloVazio />
              <h2>Nenhuma vaga aberta agora</h2>
              <p>Novas vagas aparecem aqui assim que são publicadas. Volte em breve — e, se você já se candidatou, acompanhe sua candidatura logo abaixo.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {contagens.areas.length >= 2 && (
            <section className="t41-secao" aria-labelledby="areas-titulo" style={{ paddingBottom: 0 }}>
              <div className="t41-caixa">
                <div className="t41-secao__topo">
                  <div>
                    <p className="t41-selo t41-selo--roxo">Por área</p>
                    <h2 id="areas-titulo" className="t41-titulo-secao">
                      Explore as vagas <em>por área</em>
                    </h2>
                  </div>
                </div>
                <div className="t41-areas">
                  {contagens.areas.map((a) => (
                    <Link key={a.valor} href={filtro({ area: a.valor })} className="t41-area">
                      <span className="t41-area__nome">{a.rotulo}</span>
                      <span className="t41-area__n t41-num">{vagasEm(a.vagas)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="t41-secao" aria-labelledby="recentes-titulo">
            <div className="t41-caixa">
              <div className="t41-secao__topo">
                <div>
                  <p className="t41-selo t41-selo--roxo">Vagas recentes</p>
                  <h2 id="recentes-titulo" className="t41-titulo-secao">
                    Publicadas <em>agora há pouco</em>
                  </h2>
                </div>
                <Link href={rotas.vagas} className="t41-botao t41-botao--contorno">
                  Ver {vagas.length === 1 ? "a vaga aberta" : `todas as ${vagas.length} vagas`} <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
              <div className="t41-grade-vagas">
                {recentes.map((v, i) => (
                  <div key={v.id} className="t41-surge" style={atraso(520 + i * 70)}>
                    <CartaoDaVaga vaga={v} slug={slug} agora={agora} href={rotas.vaga(v.id)} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {empresas.length > 0 && (
            <section id="empresas" className="t41-secao t41-secao--branca" aria-labelledby="empresas-titulo" style={{ scrollMarginTop: 64 }}>
              <div className="t41-caixa">
                <div className="t41-secao__topo">
                  <div>
                    <p className="t41-selo t41-selo--roxo">Empresas contratando</p>
                    <h2 id="empresas-titulo" className="t41-titulo-secao">
                      Quem está <em>contratando</em>
                    </h2>
                  </div>
                </div>
                <div className="t41-empresas">
                  {empresas.map((e) => (
                    <Link key={e.companyId} href={filtro({ empresa: e.nome })} className="t41-empresa">
                      <LogoDaEmpresa src={e.vagaDoLogo ? caminhoDoLogoDaVaga(slug, e.vagaDoLogo) : null} nome={e.nome} />
                      <span style={{ minWidth: 0 }}>
                        <span className="t41-empresa__nome">{e.nome}</span>
                        <span className="t41-empresa__info t41-num">
                          <strong>{e.vagas === 1 ? "1 vaga aberta" : `${e.vagas} vagas abertas`}</strong>
                          {e.local && ` · ${e.local}`}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <section id="como-funciona" className="t41-secao" aria-labelledby="como-titulo" style={{ scrollMarginTop: 64 }}>
        <div className="t41-caixa">
          <div className="t41-secao__topo">
            <div>
              <p className="t41-selo t41-selo--roxo">Como funciona</p>
              <h2 id="como-titulo" className="t41-titulo-secao">
                Da vaga à entrevista, <em>em quatro passos</em>
              </h2>
            </div>
          </div>
          <ol className="t41-passos" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <li className="t41-passo">
              <span className="t41-passo__n" aria-hidden="true">
                01
              </span>
              <h3>Encontre a vaga</h3>
              <p>Busque por cargo, cidade ou área e veja o que a vaga pede, onde é e como é o contrato.</p>
            </li>
            <li className="t41-passo">
              <span className="t41-passo__n" aria-hidden="true">
                02
              </span>
              <h3>Candidate-se em poucos minutos</h3>
              <p>Seus dados, o currículo em PDF (se quiser) e três perguntas rápidas. Sem criar conta nem senha.</p>
            </li>
            <li className="t41-passo">
              <span className="t41-passo__n" aria-hidden="true">
                03
              </span>
              <h3>Acompanhe pelo e-mail</h3>
              <p>Peça um link de acesso com o e-mail da inscrição e veja em que etapa está cada candidatura.</p>
            </li>
            <li className="t41-passo">
              <span className="t41-passo__n" aria-hidden="true">
                04
              </span>
              <h3>Entrevistas e testes na sua conta</h3>
              <p>Se o seu perfil avançar, a equipe entra em contato — e a entrevista marcada ou o teste para responder aparecem na sua conta.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="t41-faixa-lilas" aria-labelledby="acompanhe-titulo">
        <TrianguloDaFaixaLilas />
        <div className="t41-caixa t41-faixa-lilas__grade">
          <div>
            <p className="t41-selo t41-selo--roxo">Já se candidatou?</p>
            <h2 id="acompanhe-titulo" style={{ marginTop: 12 }}>
              Acompanhe sua candidatura
            </h2>
            <p>Informe o e-mail usado na inscrição. Enviamos um link de acesso, que vale por 30 minutos — sem senha.</p>
          </div>
          <div className="t41-acesso__cartao" style={{ position: "relative" }}>
            <PedirAcesso41 slug={slug} id="email-capa" />
          </div>
        </div>
      </section>
    </Moldura41>
  );
}
