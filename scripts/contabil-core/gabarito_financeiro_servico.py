"""Gabarito da conferência do financeiro (Fase B4, 12/11/2026).

Plugin do pytest: roda os testes de integração do original (dev41tech/contabil-core) da conferência
do financeiro (`FinanceiroService`, `src/domain/conciliacao_bancaria/financeiro.py`) e grava, para
cada chamada de `criar`, `adicionar_documento`, `vincular` e `vincular_sugestoes`, a entrada das partes
puras (o que o serviço leu do banco, o que recebeu, o que os leitores devolveram, as sugestões e os
ids que gerou) e a saída exata: o snapshot gravado, o hash do extrato, o documento, o vínculo, a
auditoria ou a recusa (tipo, código e frase). Depois acrescenta casos inventados, com semente fixa,
para cada ramo, e chamadas diretas de `_nome`, `_valor`, `_banco_compativel` e dos validadores
pydantic. O porte em TypeScript repete tudo em `src/lib/contabil-core/conciliacao/financeiro.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a
entrada gravada (já sanitizada): empresa, conta bancária, conta contábil, lotes e transações,
análise, documentos já enviados e vínculos. Os leitores (`validar_conteudo`, `ler_financeiro`,
`ler_sispag`, `ler_razao`, `ler_extrato_detalhado`) são trocados pela saída gravada, para o gabarito
não depender do porte deles (que tem gabarito próprio); as sugestões também (`sugerir`). Os bytes do
arquivo não são gravados: o banco montado recebe bytes de enchimento com o mesmo tamanho. Os ids
novos saem da lista gravada. As chamadas da suíte também rodam assim com a entrada SEM sanitizar (e
os bytes de verdade), e o resultado tem de ser igual ao da suíte de verdade (senão o plugin aborta).

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, os
CNPJs que não são de exemplo viram fictícios começando com 9 e a razão social vira um nome fictício.

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/conciliacao/gabarito \\
        python -W ignore -m pytest -q -p gabarito_financeiro_servico tests/integration/test_conciliacao_financeiro.py
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import itertools
import json
import os
import random
import types
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from gabarito_cruzamento import sanitizar_texto
from gabarito_revisao import _escrever_partes, _instante, _razao_banco, _razao_banco_obj

EMPRESA_FICTICIA = "EMPRESA EXEMPLO LTDA"
AGENCIA_ID = uuid.UUID(int=0xA6E)
# Um caso da suíte maior que isto (os testes de limite com 600 mil caracteres) fica de fora; os
# inventados cobrem o mesmo ramo com limites pequenos.
_MAX_CASO = 600_000

_ORIGINAL: dict = {}
_EM_CURSO: dict = {"ids": None, "fila": None, "auditoria": None, "montado": None, "leituras": None, "sugestoes": None, "lidas": 0, "tipo_doc": None}
_LEITOR = {"FINANCEIRO": "ler_financeiro", "SISPAG": "ler_sispag", "RAZAO": "ler_razao", "EXTRATO_DETALHADO": "ler_extrato_detalhado"}
_DA_SUITE: list[tuple[str, dict, dict]] = []
_SEQUENCIA = itertools.count(1)
_GRANDES = {"n": 0}
casos: dict[str, dict] = {}


# ─── Codificação ─────────────────────────────────────────────────────────────

def _d(v) -> str | None:
    return v.isoformat() if v is not None else None


def _erro(exc) -> dict:
    from src.core.errors import AppError

    if isinstance(exc, AppError):
        return {"erro": {"tipo": type(exc).__name__, "codigo": exc.code, "mensagem": exc.message}}
    # Os leitores: a rota do original os convertia em ValidationError com a mesma frase.
    return {"erro": {"tipo": "Leitura", "codigo": "VALIDATION_ERROR", "mensagem": str(exc)}}


def _limites() -> dict:
    F = _ORIGINAL["F"]
    s = F.get_settings()
    return {
        "max_linhas": s.conciliacao_revisao_max_linhas,
        "max_fontes": s.conciliacao_revisao_max_fontes,
        "max_documentos_mb": s.conciliacao_financeiro_max_documentos_mb,
        "max_snapshot_mb": s.conciliacao_financeiro_max_snapshot_mb,
        "max_valor": str(F.MAX_VALOR),
    }


def _linha_fin(l) -> dict:
    return {
        "data": l.data.isoformat(), "valor": str(l.valor), "historico": l.historico, "favorecido": l.favorecido,
        "documento": l.documento, "categoria": l.categoria, "parcela": l.parcela, "banco": l.banco,
        "referencia": l.referencia, "observacao": l.observacao, "documento_favorecido": l.documento_favorecido,
    }


def _linha_fin_obj(d: dict):
    from src.domain.conciliacao_bancaria.financeiro_documentos import LinhaFinanceiro

    return LinhaFinanceiro(**{**d, "data": date.fromisoformat(d["data"]), "valor": Decimal(d["valor"])})


def _leitura(tipo: str, nome: str, r) -> dict | None:
    """O que um leitor devolveu, em JSON (`nome` é a função chamada)."""
    if nome == "validar_conteudo":
        return None
    if nome == "ler_financeiro":
        return {
            "linhas": [_linha_fin(l) for l in r.linhas], "banco": r.banco, "avisos": list(r.avisos), "cnpj": r.cnpj,
            "titulos_abertos": [_linha_fin(l) for l in r.titulos_abertos],
        }
    if nome == "ler_sispag":
        return {
            "conta": r.conta, "cnpj": r.cnpj,
            "pagamentos": [
                {"data": p.data.isoformat(), "valor": str(p.valor), "tipo": p.tipo, "favorecido": p.favorecido,
                 "documento": p.documento, "efetuado": p.efetuado}
                for p in r.pagamentos
            ],
        }
    if nome == "ler_razao":
        return _razao_banco(r)
    if nome == "ler_extrato_detalhado":
        return {
            "nome": r.nome, "agencia": r.agencia, "conta": r.conta, "periodo_inicio": _d(r.periodo_inicio),
            "periodo_fim": _d(r.periodo_fim), "saldo_anterior": str(r.saldo_anterior), "saldo_final": str(r.saldo_final),
            "dias_conferidos": r.dias_conferidos,
            "movimentos": [
                {"data": m.data.isoformat(), "valor": str(m.valor), "lancamento": m.lancamento, "razao_social": m.razao_social,
                 "documento": m.documento, "linha": m.linha, "resgate_aplicacao": m.resgate_aplicacao}
                for m in r.movimentos
            ],
        }
    raise AssertionError(nome)


def _leitura_obj(nome: str, d):
    from src.domain.conciliacao_bancaria.extrato_detalhado import ExtratoDetalhado, MovimentoDetalhado
    from src.domain.conciliacao_bancaria.financeiro_documentos import DocumentoFinanceiro
    from src.domain.conciliacao_bancaria.sispag import ConsultaSispag, PagamentoSispag

    if nome == "validar_conteudo":
        return None
    if nome == "ler_financeiro":
        return DocumentoFinanceiro(
            linhas=[_linha_fin_obj(l) for l in d["linhas"]], banco=d["banco"], avisos=list(d["avisos"]), cnpj=d["cnpj"],
            titulos_abertos=[_linha_fin_obj(l) for l in d["titulos_abertos"]],
        )
    if nome == "ler_sispag":
        return ConsultaSispag(
            conta=d["conta"], cnpj=d["cnpj"],
            pagamentos=[PagamentoSispag(**{**p, "data": date.fromisoformat(p["data"]), "valor": Decimal(p["valor"])}) for p in d["pagamentos"]],
        )
    if nome == "ler_razao":
        return _razao_banco_obj(d)
    if nome == "ler_extrato_detalhado":
        return ExtratoDetalhado(
            nome=d["nome"], agencia=d["agencia"], conta=d["conta"],
            periodo_inicio=date.fromisoformat(d["periodo_inicio"]) if d["periodo_inicio"] else None,
            periodo_fim=date.fromisoformat(d["periodo_fim"]) if d["periodo_fim"] else None,
            saldo_anterior=Decimal(d["saldo_anterior"]), saldo_final=Decimal(d["saldo_final"]), dias_conferidos=d["dias_conferidos"],
            movimentos=[MovimentoDetalhado(**{**m, "data": date.fromisoformat(m["data"]), "valor": Decimal(m["valor"])}) for m in d["movimentos"]],
        )
    raise AssertionError(nome)


def _excecao_de_leitura(erro: dict):
    from src.domain.conciliacao_bancaria.extrato_detalhado import ExtratoDetalhadoInvalido
    from src.domain.conciliacao_bancaria.financeiro_documentos import FinanceiroInvalido
    from src.domain.conciliacao_bancaria.razao import RazaoInvalido
    from src.domain.conciliacao_bancaria.sispag import SispagInvalido

    classes = {c.__name__: c for c in (ExtratoDetalhadoInvalido, FinanceiroInvalido, RazaoInvalido, SispagInvalido)}
    return classes[erro["classe"]](erro["mensagem"])


def _enchimento(tamanho: int, semente: str) -> bytes:
    base = hashlib.sha256(semente.encode()).hexdigest().encode()
    return (base * (tamanho // len(base) + 1))[:tamanho]


def _auditoria(registros: list) -> list:
    saida = []
    for acao, dados in registros:
        dados = json.loads(json.dumps(dados, default=str))
        dados.pop("vinculo_id", None)
        if "agencia_id" in dados:
            dados["agencia_id"] = "<agencia>"
        saida.append({"acao": acao, "dados": dados})
    return saida


# ─── Sanitização ─────────────────────────────────────────────────────────────

def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


_TEXTOS_LINHA = ("historico", "favorecido", "documento", "documento_favorecido", "categoria", "parcela", "referencia", "observacao")


def _sanitizar_snapshot(snap: dict) -> dict:
    novo = copy.deepcopy(snap)
    for f in novo["fontes"]:
        f["nome_arquivo"] = _s(f["nome_arquivo"])
        f["avisos"] = [_s(a) for a in f["avisos"]]
    for l in novo["linhas"] + novo.get("titulos_abertos", []):
        for c in _TEXTOS_LINHA:
            l[c] = _s(l[c])
    novo["avisos"] = [_s(a) for a in novo["avisos"]]
    return novo


def _sanitizar_leitura(nome: str, d):
    if d is None:
        return None
    d = copy.deepcopy(d)
    if nome == "ler_financeiro":
        for l in d["linhas"] + d["titulos_abertos"]:
            for c in _TEXTOS_LINHA:
                l[c] = _s(l[c])
        d["avisos"] = [_s(a) for a in d["avisos"]]
        d["cnpj"] = _s(d["cnpj"])
    elif nome == "ler_sispag":
        d["cnpj"] = _s(d["cnpj"])
        for p in d["pagamentos"]:
            for c in ("tipo", "favorecido", "documento"):
                p[c] = _s(p[c])
    elif nome == "ler_razao":
        d["empresa"] = EMPRESA_FICTICIA if d["empresa"] else ""
        d["cnpj"] = _s(d["cnpj"])
        d["conta_descricao"] = _s(d["conta_descricao"])
        d["lancamentos"] = [[dt, _s(lote), _s(h), _s(cp), v] for dt, lote, h, cp, v in d["lancamentos"]]
    elif nome == "ler_extrato_detalhado":
        d["nome"] = _s(d["nome"])
        for m in d["movimentos"]:
            for c in ("lancamento", "razao_social", "documento"):
                m[c] = _s(m[c])
    return d


def _sanitizar(tipo: str, e: dict, n: int) -> dict:
    e = copy.deepcopy(e)
    e.pop("_conteudo", None)
    if "empresa" in e:
        e["empresa"] = {"cnpj": _s(e["empresa"]["cnpj"]), "razao_social": EMPRESA_FICTICIA}
    if "analise" in e:
        e["analise"]["snapshot"] = _sanitizar_snapshot(e["analise"]["snapshot"])
    if tipo == "criar":
        e["transacoes"] = [{**t, "historico": _s(t["historico"])} for t in e["transacoes"]]
    if tipo == "documento":
        e["nome_arquivo"] = _s(e["nome_arquivo"])
        e["leituras"] = [
            {"funcao": l["funcao"], **({"erro": {**l["erro"], "mensagem": _s(l["erro"]["mensagem"])}} if "erro" in l
                                      else {"ok": _sanitizar_leitura(l["funcao"], l["ok"])})}
            for l in e["leituras"]
        ]
        e["semente"] = f"suite-{n}"
        e["hash_arquivo"] = hashlib.sha256(_enchimento(e["tamanho"], e["semente"])).hexdigest()
    if tipo in ("vinculo", "lote"):
        e["dados"]["observacao"] = _s(e["dados"]["observacao"])
    return e


# ─── O banco montado com a entrada ──────────────────────────────────────────

class _Montado:
    """Um SQLite em memória com o esquema do original, uma sessão por caso (desfeita no fim)."""

    async def abrir(self):
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        registrar_funcoes_sqlite(self.engine)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def fechar(self):
        await self.engine.dispose()

    async def rodar(self, tipo: str, e: dict) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            try:
                return await _executar(db, tipo, e)
            finally:
                await db.rollback()


def _agencia_padrao() -> dict:
    return {"banco_sigla": "ITAU", "agencia": "7285", "numero": "12287", "digito": "0", "conta_contabil": None, "tem_conta_contabil": False}


async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Empresa, PlanoConta, Tenant, Usuario

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    usuario = Usuario(tenant_id=tenant.id, email="gabarito@exemplo.com", nome="Pessoa do Gabarito", senha_hash="x", role="admin")
    emp = e.get("empresa") or {"cnpj": "12.345.678/0001-95", "razao_social": EMPRESA_FICTICIA}
    empresa = Empresa(tenant_id=tenant.id, razao_social=emp["razao_social"], cnpj=emp["cnpj"], regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social="OUTRA EMPRESA", cnpj="11.111.111/0001-11", regime_tributario="simples_nacional")
    db.add_all([usuario, empresa, outra])
    await db.flush()
    a = e.get("agencia") or _agencia_padrao()
    conta_id = None
    if a["tem_conta_contabil"]:
        conta_id = uuid.UUID(int=(0xC0A7 << 112) + 1)
        c = a["conta_contabil"]
        if c is not None:
            db.add(PlanoConta(
                id=conta_id, empresa_id=empresa.id if c["da_empresa"] else outra.id, codigo=c["codigo"],
                conta_numero=c["conta_numero"], descricao="BANCO", tipo="ativo",
            ))
    db.add(AgenciaBancaria(
        id=AGENCIA_ID, empresa_id=empresa.id, banco_sigla=a["banco_sigla"], agencia=a["agencia"], numero=a["numero"],
        digito=a["digito"], ativa=True, conta_contabil_id=conta_id,
    ))
    await db.flush()
    return tenant, usuario, empresa


async def _gravar_extrato(db, empresa, transacoes: list[dict]):
    from src.db.models import ExtratoImportacao, Transacao

    lotes = {}
    for t in transacoes:
        if t["importacao_id"] and t["importacao_id"] not in lotes:
            lotes[t["importacao_id"]] = ExtratoImportacao(
                id=uuid.UUID(t["importacao_id"]), empresa_id=empresa.id, agencia_id=AGENCIA_ID,
                nome_arquivo="lote.ofx", hash_arquivo=hashlib.sha256(t["importacao_id"].encode()).hexdigest(),
                created_at=datetime.fromisoformat(t["lote_em"]).replace(tzinfo=UTC),
            )
    db.add_all(lotes.values())
    await db.flush()
    db.add_all([
        Transacao(
            id=uuid.UUID(t["id"]), empresa_id=empresa.id, agencia_id=AGENCIA_ID, data=date.fromisoformat(t["data"]),
            valor=Decimal(t["valor"]), saldo_apos=Decimal(t["saldo_apos"]) if t["saldo_apos"] is not None else None,
            historico=t["historico"], ordem=t["ordem"], dc=t["dc"],
            importacao_id=uuid.UUID(t["importacao_id"]) if t["importacao_id"] else None,
            hash_dedup=hashlib.sha256(t["id"].encode()).hexdigest(),
        )
        for t in transacoes
    ])
    await db.flush()


async def _analise_montada(db, tenant, usuario, empresa, e: dict):
    from src.db.models import FinanceiroAnalise

    F = _ORIGINAL["F"]
    a = e["analise"]
    analise = FinanceiroAnalise(
        tenant_id=tenant.id, empresa_id=empresa.id, agencia_id=AGENCIA_ID, criado_por=usuario.id, titulo="Conferência",
        conta_bancaria="ITAU 7285 12287 0", periodo_inicio=date.fromisoformat(a["periodo_inicio"]),
        periodo_fim=date.fromisoformat(a["periodo_fim"]),
        # Sem transações no banco montado, a identidade atual é a da lista vazia.
        extrato_hash=F.FinanceiroService._identidade_extrato([]) if e.get("extrato_valido", True) else "0" * 64,
        versao=a["versao"], snapshot=copy.deepcopy(a["snapshot"]),
    )
    db.add(analise)
    await db.flush()
    return analise


def _vinculo(v) -> dict:
    return {
        "tipo_comparacao": v.tipo_comparacao, "financeiro_ids": list(v.financeiro_ids), "comparacao_ids": list(v.comparacao_ids),
        "total_financeiro": str(v.total_financeiro), "total_comparacao": str(v.total_comparacao), "diferenca": str(v.diferenca),
        "observacao": v.observacao, "estado": v.estado,
    }


async def _executar(db, tipo: str, e: dict) -> dict:
    from sqlalchemy import select

    from src.core.errors import AppError
    from src.db.models import FinanceiroAnalise, FinanceiroDocumento, FinanceiroVinculo
    from src.schemas.conciliacao_financeiro import AnaliseCreate, FinanceiroSugestoesLote, FinanceiroVinculoCreate

    F = _ORIGINAL["F"]
    tenant, usuario, empresa = await _base(db, e)
    servico = F.FinanceiroService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=usuario.id)
    limites = e["limites"]
    configuracao = _ORIGINAL["get_settings"]().model_copy(update={
        "conciliacao_revisao_max_linhas": limites["max_linhas"],
        "conciliacao_revisao_max_fontes": limites["max_fontes"],
        "conciliacao_financeiro_max_documentos_mb": limites["max_documentos_mb"],
        "conciliacao_financeiro_max_snapshot_mb": limites["max_snapshot_mb"],
    })
    trocas = {"get_settings": lambda: configuracao, "MAX_VALOR": Decimal(limites["max_valor"])}
    antes = {k: getattr(F, k) for k in trocas}
    obter = F.FinanceiroService.obter

    async def obter_sem_resposta(self, analise_id):  # a resposta da rota não é o que se grava
        return types.SimpleNamespace(id=analise_id)

    for k, v in trocas.items():
        setattr(F, k, v)
    F.FinanceiroService.obter = obter_sem_resposta
    ids_usados: list[str] = []
    lidas: list[str] = []
    _EM_CURSO.update(montado=e, fila=list(e.get("ids", [])), ids=ids_usados, auditoria=[], leituras=list(e.get("leituras", [])),
                     lidas=0, tipo_doc=e.get("tipo"))
    try:
        if tipo == "criar":
            await _gravar_extrato(db, empresa, e["transacoes"])
            lidas = [str(t.id) for t in await servico._transacoes(types.SimpleNamespace(
                agencia_id=AGENCIA_ID, periodo_inicio=date.fromisoformat(e["periodo_inicio"]), periodo_fim=date.fromisoformat(e["periodo_fim"])))]
            await servico.criar(AnaliseCreate(agencia_id=AGENCIA_ID, periodo_inicio=e["periodo_inicio"], periodo_fim=e["periodo_fim"], titulo="Gabarito"))
            a = (await db.execute(select(FinanceiroAnalise).where(FinanceiroAnalise.empresa_id == empresa.id))).scalar_one()
            saida = {"snapshot": a.snapshot, "extrato_hash": a.extrato_hash, "conta_bancaria": a.conta_bancaria, "versao": a.versao}
        elif tipo == "documento":
            analise = await _analise_montada(db, tenant, usuario, empresa, e)
            conteudo = e["_conteudo"] if "_conteudo" in e else _enchimento(e["tamanho"], e["semente"])
            h = hashlib.sha256(conteudo).hexdigest()
            if e["hash_existe"] or e["tamanho_atual"]:
                db.add(FinanceiroDocumento(
                    tenant_id=tenant.id, empresa_id=empresa.id, analise_id=analise.id, tipo="FINANCEIRO", nome_arquivo="anterior.xlsx",
                    hash_arquivo=h if e["hash_existe"] else "e" * 64, media_type="application/pdf",
                    tamanho=max(e["tamanho_atual"], 1), conteudo=b"x",
                ))
                await db.flush()
            ja = {d for d in (await db.execute(select(FinanceiroDocumento.id))).scalars()}
            await servico.adicionar_documento(
                analise.id, versao=e["versao"], tipo=e["tipo"], conteudo=conteudo, nome_arquivo=e["nome_arquivo"],
                confirmar_empresa=e["confirmar_empresa"],
            )
            a = (await db.execute(select(FinanceiroAnalise).where(FinanceiroAnalise.id == analise.id)
                                  .execution_options(populate_existing=True))).scalar_one()
            (d,) = [d for d in (await db.execute(select(FinanceiroDocumento))).scalars() if d.id not in ja]
            saida = {
                "versao": a.versao, "snapshot": a.snapshot,
                "documento": {"id": str(d.id), "nome_arquivo": d.nome_arquivo, "tipo": d.tipo, "hash": d.hash_arquivo, "media_type": d.media_type, "tamanho": d.tamanho},
            }
        elif tipo in ("vinculo", "lote"):
            analise = await _analise_montada(db, tenant, usuario, empresa, e)
            base = datetime(2025, 3, 1, tzinfo=UTC)
            for n, v in enumerate(e["vinculos"]):
                db.add(FinanceiroVinculo(
                    tenant_id=tenant.id, empresa_id=empresa.id, analise_id=analise.id, tipo_comparacao=v["tipo_comparacao"],
                    financeiro_ids=v["financeiro_ids"], comparacao_ids=v["comparacao_ids"], total_financeiro=Decimal("1"),
                    total_comparacao=Decimal("1"), diferenca=Decimal("0"), observacao="", estado=v["estado"], usuario_id=usuario.id,
                    responsavel="Pessoa do Gabarito", created_at=base + timedelta(seconds=n),
                ))
            await db.flush()
            ja = {v.id for v in await servico._vinculos(analise.id)}
            if tipo == "vinculo":
                await servico.vincular(analise.id, FinanceiroVinculoCreate.model_validate(e["dados"]))
            else:
                await servico.vincular_sugestoes(analise.id, FinanceiroSugestoesLote.model_validate(e["dados"]))
            novos = {v.id: v for v in await servico._vinculos(analise.id) if v.id not in ja}
            ordem = [uuid.UUID(str(dados["vinculo_id"])) for _, dados in _EM_CURSO["auditoria"]]
            saida = {
                "vinculos": [_vinculo(novos[i]) for i in ordem],
                "versao": (await db.get(FinanceiroAnalise, analise.id, populate_existing=True)).versao,
            }
        else:
            raise AssertionError(tipo)
        saida["auditoria"] = _auditoria(_EM_CURSO["auditoria"])
    except AppError as exc:
        saida = _erro(exc)
    except Exception as exc:
        if type(exc).__name__ not in ("FinanceiroInvalido", "SispagInvalido", "RazaoInvalido", "ExtratoDetalhadoInvalido"):
            raise
        saida = _erro(exc)
    finally:
        for k, v in antes.items():
            setattr(F, k, v)
        F.FinanceiroService.obter = obter
        _EM_CURSO.update(montado=None, fila=None, ids=None, auditoria=None, leituras=None)
    saida["_ids"] = ids_usados
    saida["_lidas"] = lidas
    return saida


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

async def _ler_extrato(servico, agencia_id, inicio, fim) -> list[dict]:
    """O que `_transacoes` lê, com o instante do lote (para conferir a ordem)."""
    from sqlalchemy import select

    from src.db.models import ExtratoImportacao

    lidas = await servico._transacoes(types.SimpleNamespace(agencia_id=agencia_id, periodo_inicio=inicio, periodo_fim=fim))
    lotes = {}
    for t in lidas:
        if t.importacao_id and t.importacao_id not in lotes:
            lotes[t.importacao_id] = (await servico.db.execute(
                select(ExtratoImportacao.created_at).where(ExtratoImportacao.id == t.importacao_id)
            )).scalar_one()
    return [
        {
            "id": str(t.id), "data": t.data.isoformat(), "valor": str(t.valor), "dc": t.dc, "historico": t.historico,
            "saldo_apos": str(t.saldo_apos) if t.saldo_apos is not None else None, "ordem": t.ordem,
            "importacao_id": str(t.importacao_id) if t.importacao_id else None,
            "lote_em": _instante(lotes[t.importacao_id]) if t.importacao_id else None,
        }
        for t in lidas
    ]


def _agencia(agencia, conta, empresa_id) -> dict:
    return {
        "banco_sigla": agencia.banco_sigla, "agencia": agencia.agencia, "numero": agencia.numero, "digito": agencia.digito,
        "tem_conta_contabil": bool(agencia.conta_contabil_id),
        "conta_contabil": (
            {"codigo": conta.codigo, "conta_numero": conta.conta_numero, "da_empresa": conta.empresa_id == empresa_id} if conta else None
        ),
    }


def _sugestoes_min(r) -> dict:
    return {
        "versao": r["versao"],
        "items": [{"id": s["id"], "financeiro_ids": list(s["financeiro_ids"]), "comparacao_ids": list(s["comparacao_ids"]), "criterio": s["criterio"]}
                  for s in r["items"]],
    }


def pytest_configure(config):  # noqa: ARG001
    import starlette.concurrency as concorrencia

    from src.core.errors import AppError
    from src.domain.conciliacao_bancaria import financeiro as F

    if getattr(F, "__gabarito__", False):
        return
    F.__gabarito__ = True
    _ORIGINAL.update(F=F, get_settings=F.get_settings)
    Servico = F.FinanceiroService
    uuid4, registrar, em_thread = F.uuid4, F.registrar_auditoria, concorrencia.run_in_threadpool
    criar, documento, vincular, lote, sugestoes = (
        Servico.criar, Servico.adicionar_documento, Servico.vincular, Servico.vincular_sugestoes, Servico.sugestoes,
    )
    leitores = ("FinanceiroInvalido", "SispagInvalido", "RazaoInvalido", "ExtratoDetalhadoInvalido")

    def gerar_id():
        if _EM_CURSO["fila"]:
            novo = uuid.UUID(_EM_CURSO["fila"].pop(0))
        elif _EM_CURSO["montado"] is not None:
            novo = uuid.UUID(int=(0xC0DE << 64) + next(_SEQUENCIA))
        else:
            novo = uuid4()
        if _EM_CURSO["ids"] is not None:
            _EM_CURSO["ids"].append(str(novo))
        return novo

    async def auditar(db, **kw):
        if _EM_CURSO["auditoria"] is not None:
            _EM_CURSO["auditoria"].append((kw["acao"], copy.deepcopy(kw.get("dados_depois"))))
        return await registrar(db, **kw)

    async def thread(fn, *args, **kw):
        """Os leitores passam por aqui: na suíte, anota o que devolveram; no banco montado, devolve o anotado."""
        leituras = _EM_CURSO["leituras"]
        if leituras is None:
            return await em_thread(fn, *args, **kw)
        # A primeira chamada é `validar_conteudo`; a segunda, o leitor do tipo (mesmo quando o teste o
        # trocou, como `documento_grande`).
        nome = "validar_conteudo" if _EM_CURSO["lidas"] == 0 else _LEITOR[_EM_CURSO["tipo_doc"]]
        _EM_CURSO["lidas"] += 1
        if _EM_CURSO["montado"] is not None:
            gravada = leituras.pop(0)
            if gravada["funcao"] != nome:
                raise AssertionError(f"leitura fora de ordem: {gravada['funcao']} × {nome}")
            if "erro" in gravada:
                raise _excecao_de_leitura(gravada["erro"])
            return _leitura_obj(gravada["funcao"], gravada["ok"])
        try:
            r = await em_thread(fn, *args, **kw)
        except Exception as exc:
            if type(exc).__name__ in leitores:
                leituras.append({"funcao": nome, "erro": {"classe": type(exc).__name__, "mensagem": str(exc)}})
            else:
                leituras.append({"funcao": nome, "erro": {"classe": "Outro", "mensagem": repr(exc)}})
            raise
        leituras.append({"funcao": nome, "ok": _leitura("", nome, r)})
        return r

    async def chamar(fn, *args, **kw):
        """A chamada original, com os ids e a auditoria anotados; devolve (resposta, erro, ids, auditoria, exceção)."""
        ids, auditoria = [], []
        _EM_CURSO.update(ids=ids, auditoria=auditoria)
        try:
            return await fn(*args, **kw), None, ids, auditoria, None
        except AppError as exc:
            return None, _erro(exc), ids, auditoria, exc
        except Exception as exc:
            if type(exc).__name__ in leitores:
                return None, _erro(exc), ids, auditoria, exc
            raise
        finally:
            _EM_CURSO.update(ids=None, auditoria=None)

    async def gravar_criar(self, dados):
        if _EM_CURSO["montado"] is not None:
            return await criar(self, dados)
        from sqlalchemy import select

        from src.db.models import FinanceiroAnalise

        try:
            agencia = await self._agencia(dados.agencia_id)
        except AppError:
            return await criar(self, dados)
        entrada = {
            "agencia": _agencia(agencia, None, self.empresa_id) | {"tem_conta_contabil": False, "conta_contabil": None},
            "periodo_inicio": _d(dados.periodo_inicio), "periodo_fim": _d(dados.periodo_fim),
            "transacoes": await _ler_extrato(self, agencia.id, dados.periodo_inicio, dados.periodo_fim),
            "limites": _limites(),
        }
        resposta, erro, ids, auditoria, exc = await chamar(criar, self, dados)
        entrada["ids"] = ids
        if erro is not None:
            _DA_SUITE.append(("criar", entrada, erro))
            raise exc
        a = (await self.db.execute(select(FinanceiroAnalise).where(FinanceiroAnalise.id == resposta.id))).scalar_one()
        _DA_SUITE.append(("criar", entrada, {
            "snapshot": copy.deepcopy(a.snapshot), "extrato_hash": a.extrato_hash, "conta_bancaria": a.conta_bancaria,
            "versao": a.versao, "auditoria": _auditoria(auditoria),
        }))
        return resposta

    async def gravar_documento(self, id, *, versao, tipo, conteudo, nome_arquivo, confirmar_empresa):
        kw = dict(versao=versao, tipo=tipo, conteudo=conteudo, nome_arquivo=nome_arquivo, confirmar_empresa=confirmar_empresa)
        if _EM_CURSO["montado"] is not None:
            return await documento(self, id, **kw)
        from sqlalchemy import select

        from src.db.models import FinanceiroAnalise, FinanceiroDocumento, PlanoConta

        try:
            analise = await self._obter(id)
            emp = await self._empresa()
            agencia = await self._agencia(analise.agencia_id)
        except AppError:
            return await documento(self, id, **kw)
        conta = await self.db.get(PlanoConta, agencia.conta_contabil_id) if agencia.conta_contabil_id else None
        anteriores = (await self.db.execute(
            select(FinanceiroDocumento.hash_arquivo, FinanceiroDocumento.tamanho).where(
                FinanceiroDocumento.analise_id == id, *self._escopo(FinanceiroDocumento))
        )).all()
        h = hashlib.sha256(conteudo).hexdigest()
        entrada = {
            "empresa": {"cnpj": emp.cnpj, "razao_social": emp.razao_social},
            "agencia": _agencia(agencia, conta, self.empresa_id),
            "analise": {"versao": analise.versao, "periodo_inicio": _d(analise.periodo_inicio), "periodo_fim": _d(analise.periodo_fim),
                        "snapshot": copy.deepcopy(analise.snapshot)},
            "versao": versao, "tipo": tipo, "nome_arquivo": nome_arquivo, "confirmar_empresa": confirmar_empresa,
            "hash_existe": any(x.hash_arquivo == h for x in anteriores), "tamanho_atual": sum(x.tamanho for x in anteriores),
            "tamanho": len(conteudo), "hash_arquivo": h, "limites": _limites(), "_conteudo": conteudo,
        }
        leituras: list = []
        _EM_CURSO.update(leituras=leituras, lidas=0, tipo_doc=tipo)
        try:
            resposta, erro, ids, auditoria, exc = await chamar(documento, self, id, **kw)
        finally:
            _EM_CURSO["leituras"] = None
        entrada.update(leituras=leituras, ids=ids)
        if any("erro" in l and l["erro"]["classe"] == "Outro" for l in leituras):
            pass  # erro inesperado de leitor (500 no original): fora do gabarito
        elif erro is not None:
            _DA_SUITE.append(("documento", entrada, erro))
        else:
            a = (await self.db.execute(select(FinanceiroAnalise).where(FinanceiroAnalise.id == id)
                                       .execution_options(populate_existing=True))).scalar_one()
            d = (await self.db.execute(select(FinanceiroDocumento).where(FinanceiroDocumento.id == uuid.UUID(ids[0])))).scalar_one()
            _DA_SUITE.append(("documento", entrada, {
                "versao": a.versao, "snapshot": copy.deepcopy(a.snapshot),
                "documento": {"id": str(d.id), "nome_arquivo": d.nome_arquivo, "tipo": d.tipo, "hash": d.hash_arquivo,
                              "media_type": d.media_type, "tamanho": d.tamanho},
                "auditoria": _auditoria(auditoria),
            }))
        if erro is not None:
            raise exc  # a exceção do leitor volta como estava, para a rota convertê-la
        return resposta

    async def gravar_vinculo(self, id, dados, *, _lote=False):
        fn = lote if _lote else vincular
        if _EM_CURSO["montado"] is not None:
            return await fn(self, id, dados)
        from sqlalchemy import select

        from src.db.models import FinanceiroAnalise

        try:
            analise = await self._obter(id)
        except AppError:
            return await fn(self, id, dados)
        anteriores = await self._vinculos(id)
        entrada = {
            "analise": {"versao": analise.versao, "periodo_inicio": _d(analise.periodo_inicio), "periodo_fim": _d(analise.periodo_fim),
                        "snapshot": copy.deepcopy(analise.snapshot)},
            "extrato_valido": await self._extrato_valido(analise),
            "vinculos": [{"estado": v.estado, "tipo_comparacao": v.tipo_comparacao, "financeiro_ids": list(v.financeiro_ids),
                          "comparacao_ids": list(v.comparacao_ids)} for v in anteriores],
            "dados": dados.model_dump(mode="json"),
            "limites": _limites(),
        }
        _EM_CURSO["sugestoes"] = {}
        try:
            resposta, erro, _, auditoria, exc = await chamar(fn, self, id, dados)
            entrada["sugestoes"] = _EM_CURSO["sugestoes"]
        finally:
            _EM_CURSO["sugestoes"] = None
        tipo = "lote" if _lote else "vinculo"
        if erro is not None:
            _DA_SUITE.append((tipo, entrada, erro))
            raise exc
        ja = {v.id for v in anteriores}
        novos = {v.id: v for v in await self._vinculos(id) if v.id not in ja}
        ordem = [uuid.UUID(str(dados_a["vinculo_id"])) for _, dados_a in auditoria]
        a = (await self.db.execute(select(FinanceiroAnalise).where(FinanceiroAnalise.id == id)
                                   .execution_options(populate_existing=True))).scalar_one()
        _DA_SUITE.append((tipo, entrada, {"vinculos": [_vinculo(novos[i]) for i in ordem], "versao": a.versao, "auditoria": _auditoria(auditoria)}))
        return resposta

    async def gravar_lote(self, id, dados):
        return await gravar_vinculo(self, id, dados, _lote=True)

    async def gravar_sugestoes(self, id, tipo):
        montado = _EM_CURSO["montado"]
        if montado is not None:
            gravada = montado["sugestoes"].get(tipo)
            if gravada is None:
                raise AssertionError(f"sugestões de {tipo} não gravadas")
            if "erro" in gravada:
                e = gravada["erro"]
                raise _excecoes()[e["tipo"]](message=e["mensagem"], code=e["codigo"])
            return gravada
        anotar = _EM_CURSO["sugestoes"]
        if anotar is None:
            return await sugestoes(self, id, tipo)
        try:
            r = await sugestoes(self, id, tipo)
        except AppError as exc:
            anotar[tipo] = _erro(exc)
            raise
        anotar[tipo] = _sugestoes_min(r)
        return r

    F.uuid4 = gerar_id
    F.registrar_auditoria = auditar
    concorrencia.run_in_threadpool = thread
    Servico.criar = gravar_criar
    Servico.adicionar_documento = gravar_documento
    Servico.vincular = gravar_vinculo
    Servico.vincular_sugestoes = gravar_lote
    Servico.sugestoes = gravar_sugestoes


def _excecoes() -> dict:
    from src.core.errors import ConflictError, NotFoundError, ValidationError

    return {"ValidationError": ValidationError, "ConflictError": ConflictError, "NotFoundError": NotFoundError}


# ─── Casos inventados ───────────────────────────────────────────────────────

TEXTOS = [
    "PAGTO \"FORNECEDOR\" LTDA", "BARRA \\ INVERTIDA", "LINHA\nQUEBRADA", "AÇÃO ÉÉ ü ñ", "EMOJI 😀 🧾", "", "    ESPAÇOS  ",
    "ENERGIA ALFA", "SISPAG FORNECEDORES", "TARIFA", "<TAG> & 'APOSTROFO'", "CONTROLE \x01 FIM",
]


def _uid(n: int) -> str:
    # Com letras no hexadecimal: no SQLite, a coluna UUID tem afinidade NUMERIC.
    return str(uuid.UUID(int=(0xFACE << 112) + n))


def _rng_uid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128) | (0xA << 124)))


def _limites_padrao(**m) -> dict:
    base = {"max_linhas": 20000, "max_fontes": 32, "max_documentos_mb": 100, "max_snapshot_mb": 64, "max_valor": "9999999999999.99"}
    base.update(m)
    return base


def _transacao(rng, dia, valor, dc, historico, *, ordem=None, lote=None, lote_em=None, saldo=None) -> dict:
    return {"id": _rng_uid(rng), "data": dia, "valor": valor, "dc": dc, "historico": historico, "saldo_apos": saldo,
            "ordem": ordem, "importacao_id": lote, "lote_em": lote_em}


def casos_criar(rng) -> list[dict]:
    lotes = [(_uid(0x10 + i), f"2025-03-0{i + 1}T10:00:00.{i:06d}") for i in range(3)]
    saida = []
    for n in range(45):
        transacoes = []
        for _ in range(rng.randint(0, 7)):
            lote, em = rng.choice(lotes + [(None, None)])
            transacoes.append(_transacao(
                rng, f"2025-02-{rng.randint(1, 28):02d}", rng.choice(["350.00", "1200.00", "15.90", "0.01", "9999999999999.99", "90.00"] + (["0.00"] if n % 9 == 0 else [])),
                rng.choice("CD"), rng.choice(TEXTOS), ordem=rng.choice([None, 0, 1, 2, 5]), lote=lote, lote_em=em,
                saldo=rng.choice([None, "100.00", "-15.30", "0.00"]),
            ))
        a = _agencia_padrao() | {"banco_sigla": rng.choice(["ITAU", "SICOOB", "BB"]), "digito": rng.choice([None, "0", ""])}
        limites = _limites_padrao()
        if n % 11 == 3:
            limites["max_linhas"] = max(len(transacoes) - 1, 0)
        if n % 11 == 5:
            limites["max_snapshot_mb"] = 0.0005
        if n % 11 == 7:
            limites["max_snapshot_mb"] = 0.002
        saida.append({"agencia": a, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "transacoes": transacoes, "limites": limites, "ids": []})
    return saida


def _linha_doc(rng, **m) -> dict:
    l = {
        "data": f"2025-02-{rng.randint(1, 28):02d}", "valor": rng.choice(["-200.00", "-150.00", "-90.00", "350.00", "-350", "1E+2", "-0.5"]),
        "historico": rng.choice(TEXTOS), "favorecido": rng.choice([None, "ENERGIA ALFA", "FORNECEDOR BETA", ""]),
        "documento": rng.choice([None, "NF 123"]), "categoria": rng.choice([None, "Energia"]), "parcela": rng.choice([None, "1/2"]),
        "banco": rng.choice([None, "ITAU"]), "referencia": f"Linha {rng.randint(1, 99)}", "observacao": rng.choice([None, "obs"]),
        "documento_favorecido": rng.choice([None, "98765432000110", "123.456.789-09"]),
    }
    l.update(m)
    return l


def _fin(rng, linhas=None, **m) -> dict:
    d = {"linhas": linhas if linhas is not None else [_linha_doc(rng) for _ in range(rng.randint(1, 5))],
         "banco": None, "avisos": [], "cnpj": "12345678000195", "titulos_abertos": []}
    d.update(m)
    return d


def _ok(funcao, d) -> dict:
    return {"funcao": funcao, "ok": d}


def _falha(funcao, classe, mensagem) -> dict:
    return {"funcao": funcao, "erro": {"classe": classe, "mensagem": mensagem}}


_VALIDA = {"funcao": "validar_conteudo", "ok": None}


def _documento(analise: dict, tipo: str, leitura: dict | None, n: int, **m) -> dict:
    leituras = [_VALIDA] + ([leitura] if leitura is not None else [])
    e = {
        "empresa": {"cnpj": "12.345.678/0001-95", "razao_social": EMPRESA_FICTICIA},
        "agencia": _agencia_padrao(), "analise": copy.deepcopy(analise), "versao": analise["versao"], "tipo": tipo,
        "nome_arquivo": {"FINANCEIRO": "Pagamentos.xlsx", "SISPAG": "sispag.xls", "RAZAO": "razao.xlsx", "EXTRATO_DETALHADO": "detalhado.xlsx"}[tipo],
        "confirmar_empresa": False, "hash_existe": False, "tamanho_atual": 0, "tamanho": 4000 + n, "semente": f"inventado-{n}",
        "limites": _limites_padrao(), "leituras": leituras, "ids": [],
    }
    e.update(m)
    e["hash_arquivo"] = hashlib.sha256(_enchimento(e["tamanho"], e["semente"])).hexdigest()
    return e


def _sispag(rng, **m) -> dict:
    d = {"conta": "7285 / 12287-0", "cnpj": "12345678000195", "pagamentos": [
        {"data": f"2025-02-{rng.randint(1, 28):02d}", "valor": rng.choice(["200.00", "150.00", "90", "1E+1"]), "tipo": rng.choice(["PIX", "BOLETO"]),
         "favorecido": rng.choice(["ENERGIA ALFA", "FORNECEDOR BETA", ""]), "documento": rng.choice(["98765432000110", ""]),
         "efetuado": rng.random() < 0.8}
        for _ in range(rng.randint(1, 5))
    ]}
    d.update(m)
    return d


def _razao(rng, **m) -> dict:
    d = {
        "empresa": EMPRESA_FICTICIA, "cnpj": "12345678000195", "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28",
        "conta_codigo": "2699", "conta_classificacao": "1.1.1.02.0015", "conta_descricao": "BANCO EXEMPLO C/C",
        "lancamentos": [[f"2025-02-{rng.randint(1, 28):02d}", str(rng.randint(1, 999)), rng.choice(TEXTOS), str(rng.randint(100, 999)),
                         rng.choice(["-200.00", "-150.00", "350.00", "0.00", "-90.00", "0"])] for _ in range(rng.randint(1, 5))],
        "total_debito": "0", "total_credito": "0",
    }
    d.update(m)
    return d


def _detalhado(rng, **m) -> dict:
    d = {
        "nome": EMPRESA_FICTICIA, "agencia": "7285", "conta": "0012287-0", "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28",
        "saldo_anterior": "0", "saldo_final": "0", "dias_conferidos": rng.randint(0, 20),
        "movimentos": [
            {"data": f"2025-02-{rng.randint(1, 28):02d}", "valor": rng.choice(["-200.00", "-150.00", "350.00", "-90.00", "1500"]),
             "lancamento": rng.choice(["SISPAG FORNECEDORES", "PIX", "RES APLIC AUT MAIS"]), "razao_social": rng.choice(["", "ENERGIA ALFA"]),
             "documento": rng.choice(["", "98765432000110"]), "linha": rng.randint(5, 900), "resgate_aplicacao": rng.random() < 0.3}
            for _ in range(rng.randint(1, 5))
        ],
    }
    d.update(m)
    return d


async def _analise_inicial(montado: _Montado, rng) -> dict:
    """Uma análise criada pelo original: o snapshot de partida dos casos de documento."""
    transacoes = [
        _transacao(rng, "2025-02-03", "1200.00", "C", "PIX RECEBIDO", ordem=0, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(rng, "2025-02-10", "350.00", "D", "SISPAG FORNECEDORES", ordem=1, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(rng, "2025-02-26", "90.00", "D", "TARIFA", ordem=2, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
    ]
    e = {"agencia": _agencia_padrao(), "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "transacoes": transacoes,
         "limites": _limites_padrao(), "ids": []}
    s = await montado.rodar("criar", e)
    return {"versao": 1, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": s["snapshot"]}


async def casos_documento(montado: _Montado, rng, inicial: dict) -> tuple[list[dict], dict]:
    n = itertools.count(1)
    d = lambda tipo, leitura, **m: _documento(inicial, tipo, leitura, next(n), **m)  # noqa: E731
    F_ = lambda dados: _ok("ler_financeiro", dados)  # noqa: E731
    S_ = lambda dados: _ok("ler_sispag", dados)  # noqa: E731
    R_ = lambda dados: _ok("ler_razao", dados)  # noqa: E731
    X_ = lambda dados: _ok("ler_extrato_detalhado", dados)  # noqa: E731
    nao_itau = _agencia_padrao() | {"banco_sigla": "SICOOB"}
    pagamentos = [
        _linha_doc(rng, data="2025-02-10", valor="-200.00", favorecido="ENERGIA ALFA", historico="ENERGIA"),
        _linha_doc(rng, data="2025-02-10", valor="-150.00", favorecido="ENERGIA BETA", historico="ENERGIA"),
        _linha_doc(rng, data="2025-02-26", valor="-90.00", favorecido="BANCO", historico="TARIFA"),
        _linha_doc(rng, data="2025-02-03", valor="1200.00", favorecido="CLIENTE", historico="RECEBIMENTO"),
    ]
    saida = [
        # Financeiro
        d("FINANCEIRO", F_(_fin(rng, pagamentos))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, banco="ITAU"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, banco="Itaú Unibanco"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, banco="BANCO DO BRASIL"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, banco="BANCO"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, banco="ITA"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, cnpj=None))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, cnpj=None)), confirmar_empresa=True),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, cnpj="98765432000110")), confirmar_empresa=True),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, cnpj="12.345.678/0001-95"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, cnpj="１２345678000195"))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, avisos=["Texto sobreposto na página 2."]))),
        d("FINANCEIRO", F_(_fin(rng, [], titulos_abertos=[_linha_doc(rng, data="2025-03-15", valor="500.00")]))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos, titulos_abertos=[_linha_doc(rng, valor="-0.00")]))),
        d("FINANCEIRO", F_(_fin(rng, []))),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, valor="0.00")]))),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, valor="-10.005")]))),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, valor="10000000000000.00")]))),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, valor="-10.00")])), limites=_limites_padrao(max_valor="9.99")),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, data="2025-01-31")]))),
        d("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng, data="2025-03-01")]))),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), versao=inicial["versao"] + 1),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), hash_existe=True, tamanho_atual=5000),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), tamanho_atual=5000, limites=_limites_padrao(max_documentos_mb=0.009)),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), tamanho_atual=5000, limites=_limites_padrao(max_documentos_mb=0.01)),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), limites=_limites_padrao(max_linhas=6)),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), limites=_limites_padrao(max_linhas=7)),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), limites=_limites_padrao(max_fontes=1)),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), limites=_limites_padrao(max_snapshot_mb=0.003)),
        d("FINANCEIRO", None, leituras=[_falha("validar_conteudo", "FinanceiroInvalido", "Formato não reconhecido. Envie XLS, XLSX ou PDF compatível.")]),
        d("FINANCEIRO", _falha("ler_financeiro", "FinanceiroInvalido", "O total declarado não confere com as linhas.")),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), nome_arquivo="C:\\Users\\x\\Pagamentos Fev.XLSX"),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), nome_arquivo="../../etc/relatorio.pdf"),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), nome_arquivo="nome\x00com\u200bcontrole\u2028.xls"),
        # Sem extensão conhecida depois de limpar o nome, o original quebrava (KeyError, 500): fora do gabarito.
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), nome_arquivo="R" * 250 + ".xlsx"),
        d("FINANCEIRO", F_(_fin(rng, pagamentos)), nome_arquivo="R" * 251 + ".xlsx"),
        # SISPAG
        d("SISPAG", S_(_sispag(rng))),
        d("SISPAG", None, agencia=nao_itau),
        d("SISPAG", S_(_sispag(rng)), agencia=_agencia_padrao() | {"banco_sigla": "ITAU UNIBANCO"}),
        d("SISPAG", S_(_sispag(rng, cnpj="98765432000110")), confirmar_empresa=True),
        d("SISPAG", S_(_sispag(rng, conta="9999 / 11111-1"))),
        d("SISPAG", S_(_sispag(rng, conta=""))),
        d("SISPAG", S_(_sispag(rng, conta="", cnpj=""))),
        d("SISPAG", S_(_sispag(rng, conta="", cnpj="")), confirmar_empresa=True),
        d("SISPAG", S_(_sispag(rng, pagamentos=[{"data": "2025-02-10", "valor": "0", "tipo": "PIX", "favorecido": "X", "documento": "", "efetuado": True}]))),
        d("SISPAG", S_(_sispag(rng, pagamentos=[{"data": "2025-02-10", "valor": "0", "tipo": "PIX", "favorecido": "X", "documento": "", "efetuado": False}]))),
        d("SISPAG", S_(_sispag(rng, pagamentos=[{"data": "2025-02-10", "valor": "10.001", "tipo": "PIX", "favorecido": "X", "documento": "", "efetuado": True}]))),
        d("SISPAG", _falha("ler_sispag", "SispagInvalido", "Não encontrei o cabeçalho da consulta de pagamentos.")),
        d("SISPAG", None, agencia=nao_itau, leituras=[_falha("validar_conteudo", "FinanceiroInvalido", "Envie um documento de até 25 MB, não vazio.")]),
        # Razão
        d("RAZAO", R_(_razao(rng))),
        d("RAZAO", R_(_razao(rng)), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": {"codigo": "1.1.1.02.0015", "conta_numero": None, "da_empresa": True}}),
        d("RAZAO", R_(_razao(rng)), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": {"codigo": "9.9", "conta_numero": 2699, "da_empresa": True}}),
        d("RAZAO", R_(_razao(rng)), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": {"codigo": "9.9", "conta_numero": 1, "da_empresa": True}}),
        d("RAZAO", R_(_razao(rng)), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": {"codigo": "1.1.1.02.0015", "conta_numero": 2699, "da_empresa": False}}),
        d("RAZAO", R_(_razao(rng)), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": None}),
        d("RAZAO", R_(_razao(rng, conta_codigo="None")), agencia=_agencia_padrao() | {"tem_conta_contabil": True, "conta_contabil": {"codigo": "9.9", "conta_numero": None, "da_empresa": True}}),
        d("RAZAO", R_(_razao(rng, lancamentos=[["2025-02-10", "1", "A", "504", "0.00"]]))),
        d("RAZAO", R_(_razao(rng, cnpj="")), confirmar_empresa=True),
        d("RAZAO", R_(_razao(rng, cnpj="98765432000110"))),
        d("RAZAO", R_(_razao(rng, lancamentos=[["2025-02-10", "1", "A", "504", "-1.005"]]))),
        d("RAZAO", _falha("ler_razao", "RazaoInvalido", "O razão foi lido, mas não tem nenhum lançamento no período.")),
        # Extrato detalhado
        d("EXTRATO_DETALHADO", X_(_detalhado(rng))),
        d("EXTRATO_DETALHADO", None, agencia=nao_itau),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, agencia="1234"))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012288-0"))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="12287-1"))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012287")), agencia=_agencia_padrao() | {"digito": None}),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012287-5")), agencia=_agencia_padrao() | {"digito": None}),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012287-55")), agencia=_agencia_padrao() | {"digito": None}),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012287-0")), agencia=_agencia_padrao() | {"digito": "0", "agencia": "07285"}),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, agencia="", conta=""))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, agencia="7285", conta=""))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, movimentos=[]))),
        d("EXTRATO_DETALHADO", X_(_detalhado(rng, conta="0012287-0")), agencia=_agencia_padrao() | {"digito": "X-0"}),
        d("EXTRATO_DETALHADO", _falha("ler_extrato_detalhado", "ExtratoDetalhadoInvalido", "O saldo do dia 10/02/2025 não fecha.")),
    ]
    for k in range(60):
        tipo = rng.choice(["FINANCEIRO", "SISPAG", "RAZAO", "EXTRATO_DETALHADO"])
        leitura = {"FINANCEIRO": lambda: F_(_fin(rng, banco=rng.choice([None, "ITAU", "SICREDI"]), cnpj=rng.choice([None, "12345678000195"]))),
                   "SISPAG": lambda: S_(_sispag(rng)), "RAZAO": lambda: R_(_razao(rng)), "EXTRATO_DETALHADO": lambda: X_(_detalhado(rng))}[tipo]()
        saida.append(d(tipo, leitura, confirmar_empresa=rng.random() < 0.5))
    # Depois de um financeiro aceito: o mesmo conteúdo noutro arquivo (aviso de repetição) e um diferente.
    primeiro = await montado.rodar("documento", saida[0])
    com_fin = {"versao": primeiro["versao"], "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": primeiro["snapshot"]}
    d2 = lambda tipo, leitura, **m: _documento(com_fin, tipo, leitura, next(n), **m)  # noqa: E731
    saida += [
        d2("FINANCEIRO", F_(_fin(rng, pagamentos))),
        d2("FINANCEIRO", F_(_fin(rng, [pagamentos[0], _linha_doc(rng)]))),
        d2("FINANCEIRO", F_(_fin(rng, [{**pagamentos[0], "referencia": "outra ref"}]))),
        d2("FINANCEIRO", F_(_fin(rng, [{**pagamentos[0], "favorecido": "OUTRO"}]))),
        d2("FINANCEIRO", F_(_fin(rng, [_linha_doc(rng)]))),
        d2("FINANCEIRO", F_(_fin(rng, [], titulos_abertos=[_linha_doc(rng)])), limites=_limites_padrao(max_linhas=7)),
        d2("FINANCEIRO", F_(_fin(rng, [], titulos_abertos=[_linha_doc(rng)])), limites=_limites_padrao(max_linhas=8)),
        d2("SISPAG", S_(_sispag(rng))),
        d2("RAZAO", R_(_razao(rng))),
    ]
    # A análise completa (financeiro, SISPAG, Razão e extrato detalhado), ponto de partida dos vínculos.
    atual = com_fin
    sispag = _sispag(rng, pagamentos=[
        {"data": "2025-02-10", "valor": "200.00", "tipo": "PIX", "favorecido": "ENERGIA ALFA", "documento": "", "efetuado": True},
        # Um segundo pagamento igual: as sugestões ficam ambíguas (dividem a mesma linha do financeiro).
        {"data": "2025-02-10", "valor": "200.00", "tipo": "PIX", "favorecido": "ENERGIA ALFA", "documento": "", "efetuado": True},
        {"data": "2025-02-10", "valor": "150.00", "tipo": "PIX", "favorecido": "ENERGIA BETA", "documento": "", "efetuado": True},
        {"data": "2025-02-11", "valor": "90.00", "tipo": "BOLETO", "favorecido": "BANCO", "documento": "", "efetuado": True},
    ])
    razao = _razao(rng, lancamentos=[
        ["2025-02-10", "1", "PAGTO ENERGIA ALFA", "504", "-200.00"], ["2025-02-10", "2", "PAGTO ENERGIA BETA", "504", "-150.00"],
        ["2025-02-10", "3", "SISPAG FORNECEDORES", "504", "-350.00"], ["2025-02-26", "4", "TARIFA", "506", "-90.00"],
        ["2025-02-03", "5", "RECEBIMENTO", "101", "1200.00"], ["2025-01-30", "6", "ANTERIOR", "101", "-10.00"],
    ])
    detalhado = _detalhado(rng, movimentos=[
        {"data": "2025-02-10", "valor": "-200.00", "lancamento": "SISPAG", "razao_social": "ENERGIA ALFA", "documento": "98765432000110", "linha": 10, "resgate_aplicacao": False},
        {"data": "2025-02-10", "valor": "-150.00", "lancamento": "SISPAG", "razao_social": "ENERGIA BETA", "documento": "", "linha": 11, "resgate_aplicacao": False},
        {"data": "2025-02-12", "valor": "500.00", "lancamento": "RES APLIC AUT MAIS", "razao_social": "", "documento": "", "linha": 12, "resgate_aplicacao": True},
    ])
    for tipo, leitura in (("SISPAG", S_(sispag)), ("RAZAO", R_(razao)), ("EXTRATO_DETALHADO", X_(detalhado))):
        s = await montado.rodar("documento", _documento(atual, tipo, leitura, next(n), confirmar_empresa=True))
        if "erro" in s:
            raise AssertionError(f"a análise completa não montou ({tipo}): {s['erro']}")
        atual = {"versao": s["versao"], "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": s["snapshot"]}
    return saida, atual


def _sugestoes_de(analise: dict, vinculos: list, extrato_valido: bool) -> dict:
    from src.domain.conciliacao_bancaria.sugestoes_financeiro import PARES, sugerir

    saida = {}
    for tipo in PARES:
        if tipo == "EXTRATO" and not extrato_valido:
            saida[tipo] = {"erro": {"tipo": "ConflictError", "codigo": "CONFLICT", "mensagem": "O extrato mudou. Crie uma análise com os movimentos atuais."}}
            continue
        ns = [types.SimpleNamespace(**v) for v in vinculos]
        r = sugerir(analise["snapshot"]["linhas"], ns, tipo, analise["versao"], analise["periodo_inicio"], analise["periodo_fim"])
        saida[tipo] = _sugestoes_min(r)
    return saida


def _vinc(analise, ids_f, ids_c, observacao="", vinculos=(), sugestao_id=None, extrato_valido=True, versao=None, **m) -> dict:
    e = {
        "analise": copy.deepcopy(analise), "extrato_valido": extrato_valido, "vinculos": list(vinculos),
        "dados": {"versao": analise["versao"] if versao is None else versao, "sugestao_id": sugestao_id, "financeiro_ids": list(ids_f),
                  "comparacao_ids": list(ids_c), "observacao": observacao},
        "limites": _limites_padrao(),
    }
    e.update(m)
    e["sugestoes"] = _sugestoes_de(analise, e["vinculos"], extrato_valido)
    return e


def casos_vinculo(rng, analise: dict) -> list[dict]:
    snap = analise["snapshot"]
    por = {}
    for l in snap["linhas"]:
        por.setdefault(l["tipo_fonte"], []).append(l)
    def ids(tipo, *valores):
        return [l["id"] for l in por.get(tipo, []) if not valores or l["valor"] in valores]
    v = lambda f, c, **m: _vinc(analise, f, c, **m)  # noqa: E731
    fin200, fin150 = ids("FINANCEIRO", "-200.00")[:1], ids("FINANCEIRO", "-150.00")[:1]
    ext350, ext1200, ext90 = ids("EXTRATO", "-350.00"), ids("EXTRATO", "1200.00"), ids("EXTRATO", "-90.00")
    ativo = {"estado": "ATIVO", "tipo_comparacao": "EXTRATO", "financeiro_ids": fin200 + fin150, "comparacao_ids": ext350}
    saida = [
        v(fin200 + fin150, ext350),
        v(fin200 + fin150, ext350, observacao="Conferido."),
        v(fin200, ext350),
        v(fin200, ext350, observacao="Parcial."),
        v(fin200 + fin150, ext350, extrato_valido=False),
        v(fin200 + fin150, ext350, versao=analise["versao"] + 1),
        v(fin200 + fin150, ext350, vinculos=[ativo]),
        v(fin200, ext350, vinculos=[{**ativo, "estado": "DESFEITO"}], observacao="x"),
        v(fin200, ext350, vinculos=[{**ativo, "tipo_comparacao": "SISPAG"}], observacao="x"),
        v(fin200 + fin200, ext350),
        v(fin200, ext350 + ext350),
        v(fin200, [_uid(1)]),
        v([_uid(2)], ext350),
        v(fin200, ext1200, observacao="x"),
        v(fin200 + ids("FINANCEIRO", "1200.00")[:1], ext350, observacao="x"),
        v(fin200 + ids("RAZAO", "-200.00"), ext350),
        v(ids("EXTRATO", "-350.00"), fin200),
        v(ids("SISPAG", "-200.00"), fin200),
        v(fin200, ext350 + ids("SISPAG", "-150.00")),
        v(fin200, ids("SISPAG", "-200.00")),
        v(fin200, ids("RAZAO", "-200.00")),
        v(fin200, ids("EXTRATO_DETALHADO", "-200.00")),
        v(ids("RAZAO", "-200.00"), ids("SISPAG", "-200.00")),
        v(ids("RAZAO", "-200.00"), ids("EXTRATO_DETALHADO", "-200.00")),
        v(ids("RAZAO", "-200.00"), ext350, observacao="x"),
        v(ids("RAZAO", "-350.00"), ids("SISPAG", "-200.00", "-150.00")),
        v(ids("RAZAO", "-10.00"), ids("SISPAG", "-90.00"), observacao="x"),
        v(ids("RAZAO", "-10.00"), ids("SISPAG", "-90.00")),
        v(ids("RAZAO", "-90.00"), ids("SISPAG", "-90.00")),
        v(fin200 + fin150, ext350, limites=_limites_padrao(max_valor="349.99"), observacao="x"),
        v(fin200 + fin150, ext350, limites=_limites_padrao(max_valor="199.99"), observacao="x"),
        v(fin200, ext90, observacao="x"),
    ]
    # Com sugestões: a certa, id errado, versão errada, conjunto diferente, extrato alterado.
    for tipo in ("EXTRATO", "SISPAG", "RAZAO", "RAZAO_SISPAG", "RAZAO_DETALHADO"):
        base = _vinc(analise, [], [], extrato_valido=True)
        for s in base["sugestoes"][tipo].get("items", [])[:3]:
            saida += [
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id=s["id"]),
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id=s["id"], observacao="Pela sugestão."),
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id="0" * 64),
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id=s["id"], versao=analise["versao"] + 1),
                v(s["financeiro_ids"][:1], s["comparacao_ids"], sugestao_id=s["id"], observacao="x"),
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id=s["id"], extrato_valido=False),
                v(s["financeiro_ids"], s["comparacao_ids"], sugestao_id=""),
            ]
    # Sorteados.
    todas = snap["linhas"]
    for _ in range(220):
        base = rng.choice([l for l in todas if l["tipo_fonte"] in ("FINANCEIRO", "RAZAO")])
        f = rng.sample([l for l in todas if l["tipo_fonte"] == base["tipo_fonte"]], rng.randint(1, 2))
        c = rng.sample(todas, rng.randint(1, 3)) if rng.random() < 0.3 else rng.sample(
            [l for l in todas if l["tipo_fonte"] == rng.choice(["EXTRATO", "SISPAG", "RAZAO", "EXTRATO_DETALHADO"])] or todas, 1)
        anteriores = [
            {"estado": rng.choice(["ATIVO", "DESFEITO"]), "tipo_comparacao": rng.choice(["EXTRATO", "SISPAG", "RAZAO", "RAZAO_SISPAG", "RAZAO_DETALHADO"]),
             "financeiro_ids": [rng.choice(todas)["id"]], "comparacao_ids": [rng.choice(todas)["id"]]}
            for _ in range(rng.choice([0, 0, 1, 2]))
        ]
        saida.append(v([l["id"] for l in f], [l["id"] for l in c], vinculos=anteriores, observacao=rng.choice(["", "", "Obs \"ção\""]),
                       extrato_valido=rng.random() > 0.1,
                       limites=_limites_padrao(max_valor=rng.choice(["9999999999999.99", "9999999999999.99", "300.00"]))))
    return saida


def casos_lote(rng, analise: dict) -> list[dict]:
    base = _vinc(analise, [], [])
    todas = [(t, s) for t, r in base["sugestoes"].items() if "items" in r for s in r["items"]]
    def lote(itens, observacao="", **m):
        e = _vinc(analise, [], [], **m)
        e["dados"] = {"versao": e["dados"]["versao"] if "versao" not in m else m["versao"], "observacao": observacao,
                      "sugestoes": [{"sugestao_id": s["id"], "financeiro_ids": s["financeiro_ids"], "comparacao_ids": s["comparacao_ids"]} for s in itens]}
        return e
    saida = []
    if todas:
        sugest = [s for _, s in todas]
        saida += [
            lote(sugest[:1]),
            lote(sugest[:3], observacao="Lote conferido."),
            lote(sugest),
            lote(sugest, observacao="Tudo."),
            lote(sugest[:2], versao=analise["versao"] + 1),
            lote(sugest[:2], extrato_valido=False),
            lote([sugest[0], {**sugest[0], "id": "f" * 64}]),
            lote([{**sugest[0], "financeiro_ids": sugest[0]["financeiro_ids"][:0] + [analise["snapshot"]["linhas"][0]["id"]]}]),
        ]
        # Sugestões ambíguas do mesmo tipo dividem um movimento: só uma pode ser confirmada.
        for tipo, r in base["sugestoes"].items():
            itens = r.get("items", [])
            for x, y in itertools.combinations(itens, 2):
                if set(x["financeiro_ids"] + x["comparacao_ids"]) & set(y["financeiro_ids"] + y["comparacao_ids"]):
                    saida += [lote([x, y]), lote([y, x], observacao="Ambíguas.")]
                    break
        for _ in range(40):
            saida.append(lote(rng.sample(sugest, rng.randint(1, min(4, len(sugest)))), observacao=rng.choice(["", "ok"]),
                              extrato_valido=rng.random() > 0.15))
    return saida


def casos_diretos() -> list[dict]:
    from pydantic import ValidationError as ErroPydantic

    from src.core.errors import AppError
    from src.domain.conciliacao_bancaria import financeiro as F
    from src.schemas.conciliacao_financeiro import AnaliseCreate, FinanceiroDesfazer, FinanceiroSugestoesLote, FinanceiroVinculoCreate

    saida = []
    nomes = ["Pagamentos.xlsx", "C:\\a\\b\\c.pdf", "a/b/c.xls", "", "/", "\\", "\x00\x01", " espaço .pdf", "nome\u200b\u00ad\u2028\u2029\u3000x.pdf",
             "\U000f0000privado.pdf", "\ud7ff", "😀" * 300, "R" * 254 + "😀" + "Z", "Relatório Ção.XLSX", "tab\tnome.pdf", "\x7f\x80\x9f.xls",
             "\u0378indefinido", "x\u00a0y", "\u0301combinado"]
    saida += [{"tipo": "nome", "entrada": n, "saida": F._nome(n)} for n in nomes]
    bancos = [("ITAU", "ITAU"), ("Itaú Unibanco", "ITAU"), ("ITAU", "ITAU UNIBANCO"), ("BANCO DO BRASIL", "BB"), ("BANCO", "ITAU"), ("ITA", "ITAU"),
              ("SICOOB", "756"), ("Sicoob Cooperativa", "SICOOB"), ("", "ITAU"), ("ITAU", ""), ("CAIXA S/A", "CAIXA"), ("BRADESCO S.A.", "BRADESCO"),
              ("ﬁNANCEIRA", "FINANCEIRA"), ("Straße", "STRASSE"), ("ITAU", "itau"), ("ITAÚ", "ITAU-UNIBANCO"), ("DE DA DO", "ITAU"), ("ITAU 341", "ITAU")]
    saida += [{"tipo": "banco", "entrada": list(p), "saida": F._banco_compativel(*p)} for p in bancos]
    valores = ["0", "-0", "0.00", "1", "1.5", "1.005", "-1.005", "1E+2", "1.2E-3", "9999999999999.99", "10000000000000.00", "-9999999999999.99",
               "-9999999999999.991", "350.00", "350.10", "0E-10", "12345678901234567890", "1.0000"]
    for v in valores:
        try:
            saida.append({"tipo": "valor", "entrada": v, "saida": {"ok": str(F._valor(Decimal(v)))}})
        except AppError as exc:
            saida.append({"tipo": "valor", "entrada": v, "saida": {"erro": exc.message}})
    u = "12345678-1234-5678-1234-567812345678"
    payloads = {
        "analise": [
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28"},
            {"agencia_id": u.upper(), "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-01", "titulo": "  Fevereiro  "},
            {"agencia_id": u, "periodo_inicio": "2025-02-28", "periodo_fim": "2025-02-01"},
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "titulo": "   "},
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "titulo": ""},
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "titulo": "X" * 200},
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "titulo": "X" * 201},
            {"agencia_id": u, "periodo_inicio": "2025-02-30", "periodo_fim": "2025-02-28"},
            {"agencia_id": "x", "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28"},
            {"agencia_id": u, "periodo_inicio": "2025-02-01"},
            {"agencia_id": u, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "extra": 1},
        ],
        "vinculo": [
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u]},
            {"versao": 1, "financeiro_ids": [u.upper()], "comparacao_ids": [u.replace("-", "")], "observacao": "  ok  ", "sugestao_id": "abc"},
            {"versao": 1, "financeiro_ids": [], "comparacao_ids": [u]},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": []},
            {"versao": 0, "financeiro_ids": [u], "comparacao_ids": [u]},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u], "sugestao_id": "s" * 64},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u], "sugestao_id": "s" * 65},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u], "sugestao_id": None},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u], "sugestao_id": ""},
            {"versao": 1, "financeiro_ids": [u], "comparacao_ids": [u], "observacao": "a" * 2001},
            {"versao": 1, "financeiro_ids": ["nao"], "comparacao_ids": [u]},
        ],
        "lote": [
            {"versao": 1, "sugestoes": [{"sugestao_id": "a", "financeiro_ids": [u], "comparacao_ids": [u]}]},
            {"versao": 1, "sugestoes": [{"sugestao_id": "a", "financeiro_ids": [u], "comparacao_ids": [u]},
                                        {"sugestao_id": "a", "financeiro_ids": [u], "comparacao_ids": [u]}]},
            {"versao": 1, "sugestoes": [{"sugestao_id": "a", "financeiro_ids": [u], "comparacao_ids": [u]},
                                        {"sugestao_id": "b", "financeiro_ids": [u], "comparacao_ids": [u]}], "observacao": " x "},
            {"versao": 1, "sugestoes": []},
            {"versao": 1, "sugestoes": [{"sugestao_id": "", "financeiro_ids": [u], "comparacao_ids": [u]}]},
            {"versao": 1, "sugestoes": [{"sugestao_id": "a" * 65, "financeiro_ids": [u], "comparacao_ids": [u]}]},
            {"versao": 1, "sugestoes": [{"sugestao_id": "a", "financeiro_ids": [], "comparacao_ids": [u]}]},
        ],
        "desfazer": [
            {"versao": 1, "motivo": "Revisto."},
            {"versao": 1, "motivo": "  revisto  "},
            {"versao": 1, "motivo": "   "},
            {"versao": 1, "motivo": ""},
            {"versao": 1, "motivo": "m" * 2001},
            {"versao": 1},
        ],
    }
    modelos = {"analise": AnaliseCreate, "vinculo": FinanceiroVinculoCreate, "lote": FinanceiroSugestoesLote, "desfazer": FinanceiroDesfazer}
    for nome, lista in payloads.items():
        for p in lista:
            try:
                saida.append({"tipo": "validacao", "entrada": {"modelo": nome, "payload": p},
                              "saida": {"ok": modelos[nome].model_validate_json(json.dumps(p)).model_dump(mode="json")}})
            except ErroPydantic as exc:
                primeiro = exc.errors()[0]
                mensagem = primeiro["msg"].removeprefix("Value error, ") if primeiro["type"] == "value_error" else None
                saida.append({"tipo": "validacao", "entrada": {"modelo": nome, "payload": p}, "saida": {"erro": mensagem}})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _comparavel(saida: dict) -> dict:
    return {k: v for k, v in saida.items() if not k.startswith("_")}


def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": _comparavel(saida)}
    texto = json.dumps(caso, ensure_ascii=False)
    if len(texto.encode()) > _MAX_CASO:
        _GRANDES["n"] += 1
        return
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        # 1. Suíte: o banco montado com a entrada crua repete a suíte; depois, a entrada sanitizada.
        for n, (tipo, entrada, real) in enumerate(_DA_SUITE):
            refeito = _comparavel(await montado.rodar(tipo, entrada))
            if refeito != _comparavel(real):
                raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False, default=str)[:3000]}\n"
                                     f"{json.dumps(_comparavel(real), ensure_ascii=False, default=str)[:3000]}")
            limpa = _sanitizar(tipo, entrada, n)
            _guardar(tipo, "suite", limpa, await montado.rodar(tipo, limpa))
        # 2. Inventados.
        rng = random.Random(20261112)
        for e in casos_criar(rng):
            s = await montado.rodar("criar", e)
            # A entrada guarda o extrato na ordem em que o serviço o leu do banco.
            posicao = {i: n for n, i in enumerate(s["_lidas"])}
            e["transacoes"].sort(key=lambda t: posicao[t["id"]])
            _guardar("criar", "inventado", {**e, "ids": s["_ids"]}, s)
        inicial = await _analise_inicial(montado, rng)
        documentos, completa = await casos_documento(montado, rng, inicial)
        for e in documentos:
            s = await montado.rodar("documento", e)
            _guardar("documento", "inventado", {**e, "ids": s["_ids"]}, s)
        for e in casos_vinculo(rng, completa):
            _guardar("vinculo", "inventado", e, await montado.rodar("vinculo", e))
        for e in casos_lote(rng, completa):
            _guardar("lote", "inventado", e, await montado.rodar("lote", e))
    finally:
        await montado.fechar()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    asyncio.run(_tudo())
    diretos = casos_diretos()
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate([*diretos, *lista], start=1)]
    for c in itens:
        c.setdefault("origem", "direto")
    arquivos = _escrever_partes(pasta, "financeiro-servico", itens)
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += "erro" in c["saida"] if isinstance(c["saida"], dict) else 0
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} recusas)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito do financeiro: {len(itens)} casos — {resumo}; {_GRANDES['n']} grandes de fora; arquivos: {', '.join(arquivos)}")
