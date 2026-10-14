import Link from "next/link";
import { ArrowDown, ArrowLeft, CalendarClock, Clock, Hourglass, MapPin } from "lucide-react";
import { MARCA_41_CARREIRAS, caminhoDoLogoDaVaga, type RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { CONTRATO_LABEL, MODALIDADE_LABEL, hojeEmBrasilia } from "@/lib/carreiras/portal";
import { dataCompleta, haQuantoTempo, linksDeCompartilhamento, localLegivel, seloDoPrazo } from "@/lib/carreiras/apresentacao";
import type { VagaDetalhada } from "@/lib/carreiras/vagasDoPortal";
import { Moldura41 } from "./Moldura41";
import { LogoDaEmpresa } from "./LogoDaEmpresa";
import { FatosDaVaga, SecoesDaVaga } from "./SecoesDaVaga";
import { CandidaturaEmPassos } from "./CandidaturaEmPassos";
import { Compartilhar } from "./Compartilhar";
import { BarraCandidatar } from "./BarraCandidatar";
import { TrianguloDaFaixa } from "./Triangulos";

/**
 * A página da vaga no 41 Carreiras (15/10/2026). Antes era "um retângulo com
 * muito texto sem formatação e um formulário no fim"; agora: a faixa roxa com
 * a empresa e o título, os fatos com ícones, a descrição formatada, os
 * requisitos (obrigatórios × desejáveis), os benefícios, quem conduz o
 * processo, a candidatura em passos — e, ao lado (tela larga), o cartão preso
 * com "Candidatar-se", o prazo e o compartilhar; no celular, a barra presa
 * embaixo.
 */
export function PaginaDaVaga41({
  vaga,
  slug,
  rotas,
  agora,
  carimbo,
  urlPublica,
  jsonLd,
}: {
  vaga: VagaDetalhada;
  slug: string;
  rotas: RotasDoPortal;
  agora: Date;
  carimbo: string;
  /** O endereço canônico da vaga (para compartilhar); null sem endereço público configurado. */
  urlPublica: string | null;
  jsonLd: string;
}) {
  const local = localLegivel(vaga.cidade, vaga.uf);
  const selo = seloDoPrazo(vaga.applicationDeadline, agora);
  const prazo = vaga.applicationDeadline ? `Inscrições até ${dataCompleta(vaga.applicationDeadline)}` : null;
  const compartilhar = urlPublica ? { url: urlPublica, ...linksDeCompartilhamento(urlPublica, vaga.title, vaga.empresa) } : null;

  return (
    <Moldura41 rotas={rotas} atual="vagas">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <section className="t41-faixa" aria-labelledby="vaga-titulo">
        <TrianguloDaFaixa />
        <div className="t41-caixa t41-faixa__conteudo" style={{ paddingBottom: 60 }}>
          <Link href={rotas.vagas} className="t41-faixa__voltar">
            <ArrowLeft size={16} aria-hidden="true" /> Todas as vagas
          </Link>
          <div className="t41-vaga-cabeca">
            <LogoDaEmpresa src={vaga.temLogo ? caminhoDoLogoDaVaga(slug, vaga.id) : null} nome={vaga.empresa} grande />
            <div style={{ minWidth: 0 }}>
              <p className="t41-selo t41-selo--lilas">{vaga.empresa}</p>
              <h1 id="vaga-titulo" className="t41-faixa__titulo t41-surge" style={{ fontWeight: 400 }}>
                {vaga.title}
              </h1>
              <p className="t41-vaga-meta">
                {local && (
                  <span>
                    <MapPin size={15} aria-hidden="true" /> {local}
                  </span>
                )}
                {vaga.workMode && <span>{MODALIDADE_LABEL[vaga.workMode]}</span>}
                {vaga.contractType && <span>{CONTRATO_LABEL[vaga.contractType]}</span>}
                <span>
                  <Clock size={15} aria-hidden="true" /> Publicada {haQuantoTempo(vaga.openedAt, agora)}
                </span>
                {selo && (
                  <span className="t41-etiqueta t41-etiqueta--prazo t41-num">
                    <Hourglass size={13} aria-hidden="true" /> {selo.texto}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="t41-caixa">
        <div className="t41-vaga-grade">
          <div style={{ minWidth: 0 }}>
            <FatosDaVaga vaga={vaga} />
            <SecoesDaVaga vaga={vaga} />

            <section id="candidatura" className="t41-candidatura" aria-label="Candidatura">
              <CandidaturaEmPassos
                slug={slug}
                vagaId={vaga.id}
                carimbo={carimbo}
                tituloDaVaga={vaga.title}
                empresa={vaga.empresa}
                conduzidoPor={MARCA_41_CARREIRAS.recrutamento}
                contaHref={rotas.conta}
                privacidadeHref={rotas.privacidade}
                politicaHref={MARCA_41_CARREIRAS.politicaDePrivacidade}
                vagasHref={rotas.vagas}
              />
            </section>

            {compartilhar && (
              <div className="t41-so-estreito" style={{ marginTop: 32 }}>
                <Compartilhar {...compartilhar} />
              </div>
            )}
          </div>

          <aside className="t41-lateral" aria-label="Candidatar-se">
            <div className="t41-lateral__cartao">
              <a href="#candidatura" className="t41-botao t41-botao--primario t41-botao--largo">
                Candidatar-se <ArrowDown size={17} aria-hidden="true" />
              </a>
              <p className="t41-lateral__linha t41-num">
                <CalendarClock size={16} aria-hidden="true" />
                {prazo ? <strong>{prazo}</strong> : <strong>Inscrições abertas</strong>}
              </p>
              <p className="t41-lateral__linha t41-num">
                <Clock size={16} aria-hidden="true" /> Publicada em {dataCompleta(hojeEmBrasilia(vaga.openedAt))}
              </p>
              <p className="t41-lateral__linha" style={{ fontSize: 14 }}>
                Leva poucos minutos e não precisa criar conta.
              </p>
              {compartilhar && <Compartilhar {...compartilhar} />}
            </div>
          </aside>
        </div>
      </div>

      <BarraCandidatar titulo={vaga.title} prazo={prazo} />
      <div className="t41-respiro-barra" aria-hidden="true" />
    </Moldura41>
  );
}

