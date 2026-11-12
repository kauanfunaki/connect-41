"""Gabarito da revisão manual da conciliação Razão × extrato (Fase B3, 12/11/2026).

Plugin do pytest: roda os testes de integração do original (dev41tech/contabil-core) que usam a
revisão (`RevisaoService`, `src/domain/conciliacao_bancaria/revisao.py`) e grava, para cada
chamada de `criar`, `adicionar_apoio` e `criar_vinculo`, a entrada das partes puras (o que o
serviço leu do banco, o que recebeu e os ids que gerou) e a saída exata: o snapshot gravado, os
hashes, a auditoria, ou a recusa (tipo, código e frase). Depois acrescenta casos inventados, com
semente fixa, para cada ramo, e chamadas diretas de `_hash`, `_moeda`, `_identidade_linha`,
`_evidencia_extrato`, da ordem do extrato (`ordenar_como_o_extrato`) e dos validadores pydantic.
O porte em TypeScript repete tudo em `src/lib/contabil-core/conciliacao/revisao.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a
entrada gravada (já sanitizada): empresa, conta bancária, lotes e transações, revisão e vínculos.
A conciliação (B2, já conferida no seu gabarito) é trocada por um substituto que devolve a conta
bancária gravada, e os ids novos saem da lista gravada. Assim a entrada determina a saída por
inteiro. As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado tem de
ser igual ao da suíte de verdade (senão o plugin aborta): é a prova de que o banco montado responde
como o real.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, os
CNPJs que não são de exemplo viram fictícios começando com 9 e a razão social vira um nome fictício
fixo. Os `hashes_apoio` do snapshot são recalculados depois da troca (e conferidos antes dela).

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/conciliacao/gabarito \\
        python -W ignore -m pytest -q -p gabarito_revisao \\
        tests/integration/test_conciliacao_revisao.py tests/integration/test_gestao_conciliacoes.py
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

EMPRESA_FICTICIA = "EMPRESA EXEMPLO LTDA"
_MAX_BYTES = 2_500_000
AGENCIA_ID = uuid.UUID(int=0xA6E)

_ORIGINAL: dict = {}
# O que a chamada em andamento gera: ids, auditoria, e se a conciliação (B2) recusou.
_EM_CURSO: dict = {"ids": None, "fila": None, "auditoria": None, "conciliacao_recusou": False, "montado": None}
# Chamadas da suíte: (tipo, entrada sem sanitizar, saída real).
_DA_SUITE: list[tuple[str, dict, dict]] = []
_SEQUENCIA = itertools.count(1)
casos: dict[str, dict] = {}


# ─── Codificação ─────────────────────────────────────────────────────────────

def _d(v) -> str | None:
    return v.isoformat() if v is not None else None


def _instante(v: datetime | None) -> str | None:
    if v is None:
        return None
    if v.tzinfo is not None:
        v = v.astimezone(UTC).replace(tzinfo=None)
    return v.strftime("%Y-%m-%dT%H:%M:%S.%f")


def _erro(exc) -> dict:
    return {"erro": {"tipo": type(exc).__name__, "codigo": exc.code, "mensagem": exc.message}}


def _limites(R) -> dict:
    s = R.get_settings()
    return {
        "max_linhas": s.conciliacao_revisao_max_linhas,
        "max_fontes": s.conciliacao_revisao_max_fontes,
        "max_valor": str(R.MAX_VALOR_VINCULO),
    }


def _razao_banco(r) -> dict:
    return {
        "empresa": r.empresa,
        "cnpj": r.cnpj,
        "periodo_inicio": _d(r.periodo_inicio),
        "periodo_fim": _d(r.periodo_fim),
        "conta_codigo": r.conta_codigo,
        "conta_classificacao": r.conta_classificacao,
        "conta_descricao": r.conta_descricao,
        "lancamentos": [[l.data.isoformat(), l.lote, l.historico, l.contrapartida, str(l.valor)] for l in r.lancamentos],
        "total_debito": str(r.total_debito),
        "total_credito": str(r.total_credito),
    }


def _razao_banco_obj(e: dict):
    from src.domain.conciliacao_bancaria.razao import LancamentoRazao, RazaoConta

    dia = date.fromisoformat
    return RazaoConta(
        empresa=e["empresa"], cnpj=e["cnpj"],
        periodo_inicio=dia(e["periodo_inicio"]) if e["periodo_inicio"] else None,
        periodo_fim=dia(e["periodo_fim"]) if e["periodo_fim"] else None,
        conta_codigo=e["conta_codigo"], conta_classificacao=e["conta_classificacao"], conta_descricao=e["conta_descricao"],
        lancamentos=[LancamentoRazao(dia(d), lote, h, cp, Decimal(v)) for d, lote, h, cp, v in e["lancamentos"]],
        total_debito=Decimal(e["total_debito"]), total_credito=Decimal(e["total_credito"]),
    )


_CAMPOS_APOIO = ("conta_codigo", "conta_classificacao", "conta_descricao", "lote", "contrapartida", "historico")


def _razao_apoio(r) -> dict:
    return {
        "empresa": r.empresa,
        "cnpj": r.cnpj,
        "periodo_inicio": _d(r.periodo_inicio),
        "periodo_fim": _d(r.periodo_fim),
        "linhas": [
            {
                "data": l.data.isoformat(),
                **{c: getattr(l, c) for c in _CAMPOS_APOIO},
                "valor_debito": str(l.valor_debito),
                "valor_credito": str(l.valor_credito),
                "documento": l.documento,
                "favorecido": l.favorecido,
            }
            for l in r.linhas
        ],
    }


def _razao_apoio_obj(e: dict):
    from src.domain.conciliacao_bancaria.apoio import LinhaApoio, RazaoApoio

    dia = date.fromisoformat
    return RazaoApoio(
        empresa=e["empresa"], cnpj=e["cnpj"],
        periodo_inicio=dia(e["periodo_inicio"]) if e["periodo_inicio"] else None,
        periodo_fim=dia(e["periodo_fim"]) if e["periodo_fim"] else None,
        contas=[],
        linhas=[
            LinhaApoio(
                data=dia(l["data"]), **{c: l[c] for c in _CAMPOS_APOIO},
                valor_debito=Decimal(l["valor_debito"]), valor_credito=Decimal(l["valor_credito"]),
                documento=l["documento"], favorecido=l["favorecido"],
            )
            for l in e["linhas"]
        ],
    )


# ─── Sanitização ─────────────────────────────────────────────────────────────

def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


def _hashes_apoio(R, snapshot: dict) -> list[str]:
    """Os `hashes_apoio` recalculados das linhas: um por razão de apoio, na ordem das fontes."""
    saida = []
    for fonte in snapshot["fontes"]:
        if fonte["tipo"] != "RAZAO_APOIO":
            continue
        linhas = [l for l in snapshot["linhas_razao"] if l["fonte_id"] == fonte["id"]]
        saida.append(R._hash([R._identidade_linha(l) for l in linhas]))
    return saida


def _sanitizar_snapshot(R, snap: dict) -> dict:
    assert _hashes_apoio(R, snap) == snap["hashes_apoio"], "hashes_apoio não batem com as linhas"
    novo = copy.deepcopy(snap)
    for f in novo["fontes"]:
        f["nome_arquivo"] = _s(f["nome_arquivo"])
        f["cnpj"] = _s(f["cnpj"])
    for l in novo["linhas_razao"]:
        for c in ("conta_descricao", "historico", "lote", "contrapartida", "documento", "favorecido"):
            l[c] = _s(l[c])
    for l in novo["extrato"]:
        l["historico"] = _s(l["historico"])
    novo["avisos"] = [_s(a) for a in novo["avisos"]]
    novo["hashes_apoio"] = _hashes_apoio(R, novo)
    return novo


def _sanitizar(R, tipo: str, e: dict) -> dict:
    e = copy.deepcopy(e)
    if "empresa" in e:
        e["empresa"] = {"cnpj": _s(e["empresa"]["cnpj"]), "razao_social": EMPRESA_FICTICIA}
    if tipo in ("criar", "apoio"):
        r = e["razao"]
        r["empresa"] = EMPRESA_FICTICIA if r["empresa"] else ""
        r["cnpj"] = _s(r["cnpj"])
        e["nome_arquivo"] = _s(e["nome_arquivo"])
    if tipo == "criar":
        r = e["razao"]
        r["conta_descricao"] = _s(r["conta_descricao"])
        r["lancamentos"] = [[d, _s(lote), _s(h), _s(cp), v] for d, lote, h, cp, v in r["lancamentos"]]
        e["conta_bancaria"] = _s(e["conta_bancaria"])
        e["transacoes"] = [{**t, "historico": _s(t["historico"])} for t in e["transacoes"]]
    if tipo == "apoio":
        for l in e["razao"]["linhas"]:
            for c in ("conta_descricao", "historico", "lote", "contrapartida", "documento", "favorecido"):
                l[c] = _s(l[c])
    if tipo in ("apoio", "vinculo"):
        e["revisao"]["snapshot"] = _sanitizar_snapshot(R, e["revisao"]["snapshot"])
    if tipo == "vinculo":
        e["dados"]["observacao"] = _s(e["dados"]["observacao"])
    return e


# ─── O banco montado com a entrada ──────────────────────────────────────────

class _Montado:
    """Um SQLite em memória com o esquema do original, uma sessão por caso (desfeita no fim)."""

    def __init__(self):
        self.engine = None

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


async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Empresa, Tenant, Usuario

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    usuario = Usuario(tenant_id=tenant.id, email="gabarito@exemplo.com", nome="Pessoa do Gabarito", senha_hash="x", role="admin")
    emp = e.get("empresa") or {"cnpj": "12.345.678/0001-95", "razao_social": EMPRESA_FICTICIA}
    empresa = Empresa(tenant_id=tenant.id, razao_social=emp["razao_social"], cnpj=emp["cnpj"], regime_tributario="simples_nacional")
    db.add_all([usuario, empresa])
    await db.flush()
    db.add(AgenciaBancaria(id=AGENCIA_ID, empresa_id=empresa.id, banco_sigla="ITAU", agencia="1", numero="2"))
    await db.flush()
    return tenant, usuario, empresa


async def _gravar_extrato(db, empresa, transacoes: list[dict]):
    from src.db.models import ExtratoImportacao, Transacao

    lotes = {}
    for t in transacoes:
        if t["importacao_id"] and t["importacao_id"] not in lotes:
            lotes[t["importacao_id"]] = ExtratoImportacao(
                id=uuid.UUID(t["importacao_id"]), empresa_id=empresa.id, agencia_id=AGENCIA_ID,
                nome_arquivo="lote.ofx", hash_arquivo="0" * 64,
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


async def _revisao_montada(db, tenant, usuario, empresa, r: dict, fontes_validas: bool):
    from src.db.models import ConciliacaoRevisao

    R = _ORIGINAL["R"]
    revisao = ConciliacaoRevisao(
        tenant_id=tenant.id, empresa_id=empresa.id, agencia_id=AGENCIA_ID, criado_por=usuario.id,
        nome_arquivo="razao.xlsx", conta_bancaria="ITAU ag. 1 c/c 2",
        periodo_inicio=date.fromisoformat(r.get("periodo_inicio") or "2025-02-01"),
        periodo_fim=date.fromisoformat(r.get("periodo_fim") or "2025-02-28"),
        revisao_hash="f" * 64,
        # Sem transações no banco montado, a evidência atual é a lista vazia.
        extrato_hash=R._hash([]) if fontes_validas else "0" * 64,
        versao=r["versao"], snapshot=r["snapshot"], relatorio={},
    )
    db.add(revisao)
    await db.flush()
    return revisao


async def _executar(db, tipo: str, e: dict) -> dict:
    from sqlalchemy import select

    from src.core.errors import AppError
    from src.db.models import ConciliacaoRevisao, ConciliacaoVinculo
    from src.schemas.revisao_conciliacao import VinculoCreate

    R = _ORIGINAL["R"]
    tenant, usuario, empresa = await _base(db, e)
    servico = R.RevisaoService(db, empresa_id=empresa.id, tenant_id=tenant.id, usuario_id=usuario.id)
    limites = e["limites"]
    configuracao = R.get_settings().model_copy(update={
        "conciliacao_revisao_max_linhas": limites["max_linhas"],
        "conciliacao_revisao_max_fontes": limites["max_fontes"],
    })
    trocas = {
        "get_settings": lambda: configuracao,
        "MAX_VALOR_VINCULO": Decimal(limites["max_valor"]),
    }
    antes = {k: getattr(R, k) for k in trocas}
    obter = R.RevisaoService.obter

    async def obter_sem_resposta(self, revisao_id):  # a resposta da rota não é o que se grava
        return types.SimpleNamespace(id=revisao_id)

    for k, v in trocas.items():
        setattr(R, k, v)
    R.RevisaoService.obter = obter_sem_resposta
    ids_usados: list[str] = []
    lidas: list[str] = []
    _EM_CURSO.update(montado=e, fila=list(e.get("ids", [])), ids=ids_usados, auditoria=[])
    try:
        if tipo == "criar":
            await _gravar_extrato(db, empresa, e["transacoes"])
            r = e["razao"]
            if r["periodo_inicio"] and r["periodo_fim"]:
                lidas = [str(t.id) for t in await servico._transacoes(
                    AGENCIA_ID, date.fromisoformat(r["periodo_inicio"]), date.fromisoformat(r["periodo_fim"]))]
            await servico.criar(
                agencia_id=AGENCIA_ID, razao=_razao_banco_obj(e["razao"]), nome_arquivo=e["nome_arquivo"],
                hash_arquivo=e["hash_arquivo"], sispag=None, hash_sispag=e["hash_sispag"],
                confirmar_empresa=e["confirmar_empresa"],
            )
            r = (await db.execute(select(ConciliacaoRevisao).where(ConciliacaoRevisao.empresa_id == empresa.id))).scalar_one()
            saida = {
                "revisao_hash": r.revisao_hash, "extrato_hash": r.extrato_hash, "nome_arquivo": r.nome_arquivo,
                "conta_bancaria": r.conta_bancaria, "periodo_inicio": _d(r.periodo_inicio), "periodo_fim": _d(r.periodo_fim),
                "versao": r.versao, "snapshot": r.snapshot,
            }
        elif tipo == "apoio":
            revisao = await _revisao_montada(db, tenant, usuario, empresa, e["revisao"], e["fontes_validas"])
            await servico.adicionar_apoio(
                revisao.id, razao=_razao_apoio_obj(e["razao"]), nome_arquivo=e["nome_arquivo"],
                versao=e["versao"], confirmar_empresa=e["confirmar_empresa"],
            )
            r = (await db.execute(select(ConciliacaoRevisao).where(ConciliacaoRevisao.id == revisao.id)
                                  .execution_options(populate_existing=True))).scalar_one()
            saida = {"versao": r.versao, "snapshot": r.snapshot}
        elif tipo == "vinculo":
            revisao = await _revisao_montada(db, tenant, usuario, empresa, e["revisao"], e["fontes_validas"])
            base = datetime(2025, 3, 1, tzinfo=UTC)
            for n, v in enumerate(e["vinculos"]):
                db.add(ConciliacaoVinculo(
                    tenant_id=tenant.id, empresa_id=empresa.id, revisao_id=revisao.id,
                    extrato_ids=v["extrato_ids"], razao_itens=v["razao_itens"],
                    total_extrato=Decimal("1"), total_razao=Decimal("1"), diferenca=Decimal("0"), observacao="",
                    estado=v["estado"], usuario_id=usuario.id, responsavel="Pessoa do Gabarito",
                    created_at=base + timedelta(seconds=n),
                ))
            await db.flush()
            ja = {v.id for v in await servico._vinculos(revisao.id)}
            await servico.criar_vinculo(revisao.id, VinculoCreate.model_validate(e["dados"]))
            (v,) = [v for v in await servico._vinculos(revisao.id) if v.id not in ja]
            saida = {"vinculo": _vinculo(v), "versao": (await db.get(ConciliacaoRevisao, revisao.id, populate_existing=True)).versao}
        elif tipo == "ordem":
            await _gravar_extrato(db, empresa, e["transacoes"])
            lidas = await servico._transacoes(AGENCIA_ID, date.fromisoformat(e["inicio"]), date.fromisoformat(e["fim"]))
            saida = {"ids": [str(t.id) for t in lidas]}
        else:
            raise AssertionError(tipo)
        saida["auditoria"] = _auditoria(_EM_CURSO["auditoria"])
    except AppError as exc:
        saida = _erro(exc)
    finally:
        for k, v in antes.items():
            setattr(R, k, v)
        R.RevisaoService.obter = obter
        _EM_CURSO.update(montado=None, fila=None, ids=None, auditoria=None)
    saida["_ids"] = ids_usados
    saida["_lidas"] = lidas
    return saida


def _vinculo(v) -> dict:
    return {
        "extrato_ids": list(v.extrato_ids),
        "razao_itens": list(v.razao_itens),
        "total_extrato": str(v.total_extrato),
        "total_razao": str(v.total_razao),
        "diferenca": str(v.diferenca),
        "observacao": v.observacao,
        "estado": v.estado,
    }


def _auditoria(registros: list) -> list:
    saida = []
    for acao, dados in registros:
        dados = json.loads(json.dumps(dados, default=str))
        dados.pop("vinculo_id", None)
        saida.append({"acao": acao, "dados": dados})
    return saida


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

async def _ler_extrato(servico, agencia_id, inicio, fim) -> list[dict]:
    """O que `_transacoes` lê, com o instante do lote (para conferir a ordem)."""
    from sqlalchemy import select

    from src.db.models import ExtratoImportacao

    if inicio is None or fim is None:
        return []
    lidas = await servico._transacoes(agencia_id, inicio, fim)
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


def pytest_configure(config):  # noqa: ARG001
    from src.core.errors import AppError
    from src.domain.conciliacao_bancaria import revisao as R

    if getattr(R, "__gabarito__", False):
        return
    R.__gabarito__ = True
    _ORIGINAL["R"] = R
    Servico = R.RevisaoService
    uuid4, registrar, conciliar = R.uuid4, R.registrar_auditoria, R.conciliar_razao_extrato
    criar, apoio, vinculo = Servico.criar, Servico.adicionar_apoio, Servico.criar_vinculo

    def gerar_id():
        if _EM_CURSO["fila"]:
            novo = uuid.UUID(_EM_CURSO["fila"].pop(0))
        elif _EM_CURSO["montado"] is not None:
            # Caso inventado: ids sequenciais (únicos entre os casos), para o gabarito ficar estável.
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

    async def conciliacao(db, **kw):
        montado = _EM_CURSO["montado"]
        if montado is not None:
            return types.SimpleNamespace(
                resumo=types.SimpleNamespace(conta_bancaria=montado["conta_bancaria"]),
                model_dump=lambda **_: {"montado": True},
            )
        try:
            return await conciliar(db, **kw)
        except AppError:
            _EM_CURSO["conciliacao_recusou"] = True
            raise

    async def chamar(fn, *args, **kw):
        """A chamada original, com os ids e a auditoria anotados; devolve (resposta, saída)."""
        _EM_CURSO.update(ids=[], auditoria=[], conciliacao_recusou=False)
        ids = _EM_CURSO["ids"]
        try:
            resposta = await fn(*args, **kw)
            return resposta, None, ids
        except AppError as exc:
            return None, _erro(exc), ids
        finally:
            _EM_CURSO["auditoria_feita"] = _EM_CURSO["auditoria"]
            _EM_CURSO.update(ids=None, auditoria=None)

    async def gravar_criar(self, **kw):
        if _EM_CURSO["montado"] is not None:
            return await criar(self, **kw)
        from sqlalchemy import select

        from src.db.models import ConciliacaoRevisao

        razao = kw["razao"]
        try:
            emp = await self._empresa()
        except AppError:
            return await criar(self, **kw)
        entrada = {
            "empresa": {"cnpj": emp.cnpj, "razao_social": emp.razao_social},
            "confirmar_empresa": kw["confirmar_empresa"],
            "razao": _razao_banco(razao),
            "nome_arquivo": kw["nome_arquivo"],
            "hash_arquivo": kw["hash_arquivo"],
            "hash_sispag": kw["hash_sispag"],
            "transacoes": await _ler_extrato(self, kw["agencia_id"], razao.periodo_inicio, razao.periodo_fim),
            "limites": _limites(R),
        }
        resposta, erro, ids = await chamar(criar, self, **kw)
        auditoria = _EM_CURSO.pop("auditoria_feita")
        if _EM_CURSO["conciliacao_recusou"]:
            pass  # recusa da conciliação (B2): fora das partes puras da revisão
        elif erro is not None:
            entrada.update(ids=ids, conta_bancaria="")
            _DA_SUITE.append(("criar", entrada, erro))
        elif ids:  # sem ids novos, devolveu a revisão que já existia (o primeiro envio já foi gravado)
            r = (await self.db.execute(select(ConciliacaoRevisao).where(ConciliacaoRevisao.id == resposta.id))).scalar_one()
            entrada.update(ids=ids, conta_bancaria=r.conta_bancaria)
            _DA_SUITE.append(("criar", entrada, {
                "revisao_hash": r.revisao_hash, "extrato_hash": r.extrato_hash, "nome_arquivo": r.nome_arquivo,
                "conta_bancaria": r.conta_bancaria, "periodo_inicio": _d(r.periodo_inicio), "periodo_fim": _d(r.periodo_fim),
                "versao": r.versao, "snapshot": copy.deepcopy(r.snapshot), "auditoria": _auditoria(auditoria),
            }))
        if erro is not None:
            raise _excecao(erro)
        return resposta

    async def gravar_apoio(self, revisao_id, **kw):
        if _EM_CURSO["montado"] is not None:
            return await apoio(self, revisao_id, **kw)
        from sqlalchemy import select

        from src.db.models import ConciliacaoRevisao

        try:
            revisao = await self._obter(revisao_id)
            emp = await self._empresa()
        except AppError:
            return await apoio(self, revisao_id, **kw)
        entrada = {
            "empresa": {"cnpj": emp.cnpj, "razao_social": emp.razao_social},
            "confirmar_empresa": kw["confirmar_empresa"],
            "fontes_validas": await self._fontes_validas(revisao),
            "revisao": {
                "versao": revisao.versao, "periodo_inicio": _d(revisao.periodo_inicio),
                "periodo_fim": _d(revisao.periodo_fim), "snapshot": copy.deepcopy(revisao.snapshot),
            },
            "razao": _razao_apoio(kw["razao"]),
            "nome_arquivo": kw["nome_arquivo"],
            "versao": kw["versao"],
            "limites": _limites(R),
        }
        resposta, erro, ids = await chamar(apoio, self, revisao_id, **kw)
        auditoria = _EM_CURSO.pop("auditoria_feita")
        entrada["ids"] = ids
        if erro is not None:
            _DA_SUITE.append(("apoio", entrada, erro))
            raise _excecao(erro)
        r = (await self.db.execute(select(ConciliacaoRevisao).where(ConciliacaoRevisao.id == revisao_id)
                                   .execution_options(populate_existing=True))).scalar_one()
        _DA_SUITE.append(("apoio", entrada, {"versao": r.versao, "snapshot": copy.deepcopy(r.snapshot), "auditoria": _auditoria(auditoria)}))
        return resposta

    async def gravar_vinculo(self, revisao_id, dados):
        if _EM_CURSO["montado"] is not None:
            return await vinculo(self, revisao_id, dados)
        try:
            revisao = await self._obter(revisao_id)
        except AppError:
            return await vinculo(self, revisao_id, dados)
        anteriores = await self._vinculos(revisao.id)
        entrada = {
            "fontes_validas": await self._fontes_validas(revisao),
            "revisao": {
                "versao": revisao.versao, "periodo_inicio": _d(revisao.periodo_inicio),
                "periodo_fim": _d(revisao.periodo_fim), "snapshot": copy.deepcopy(revisao.snapshot),
            },
            "vinculos": [{"estado": v.estado, "extrato_ids": list(v.extrato_ids), "razao_itens": list(v.razao_itens)} for v in anteriores],
            "dados": dados.model_dump(mode="json"),
            "limites": _limites(R),
        }
        ja = {v.id for v in anteriores}
        resposta, erro, _ = await chamar(vinculo, self, revisao_id, dados)
        auditoria = _EM_CURSO.pop("auditoria_feita")
        if erro is not None:
            _DA_SUITE.append(("vinculo", entrada, erro))
            raise _excecao(erro)
        (novo,) = [v for v in await self._vinculos(revisao.id) if v.id not in ja]
        await self.db.refresh(revisao)
        _DA_SUITE.append(("vinculo", entrada, {"vinculo": _vinculo(novo), "versao": revisao.versao, "auditoria": _auditoria(auditoria)}))
        return resposta

    R.uuid4 = gerar_id
    R.registrar_auditoria = auditar
    R.conciliar_razao_extrato = conciliacao
    Servico.criar = gravar_criar
    Servico.adicionar_apoio = gravar_apoio
    Servico.criar_vinculo = gravar_vinculo
    _ORIGINAL["excecoes"] = _excecoes()


def _excecoes() -> dict:
    from src.core.errors import ConflictError, NotFoundError, ValidationError

    return {"ValidationError": ValidationError, "ConflictError": ConflictError, "NotFoundError": NotFoundError}


def _excecao(erro: dict):
    e = erro["erro"]
    return _ORIGINAL["excecoes"][e["tipo"]](message=e["mensagem"], code=e["codigo"])


# ─── Casos inventados ───────────────────────────────────────────────────────

# Textos que o `json.dumps` trata de um jeito próprio: aspas, barra, controles, acento, emoji…
TEXTOS_DIFICEIS = [
    "PAGTO \"FORNECEDOR\" LTDA", "BARRA \\ INVERTIDA", "LINHA\nQUEBRADA", "TAB\tAQUI", "RETORNO\rCARRO",
    "CONTROLE \x01\x1f FIM", "NULO \x00 NO MEIO", "DEL \x7f", "AÇÃO ÉÉ ü ñ", "é COMBINADO", "SEPARADOR    ",
    "EMOJI 😀 🧾", "\b\f", "    ESPAÇOS  ", "", "/BARRA/NORMAL", "<TAG> & 'APOSTROFO'", " NBSP", "﻿BOM",
]


def _uid(n: int) -> str:
    # Com letras no hexadecimal: no SQLite, a coluna UUID tem afinidade NUMERIC e um id só de
    # dígitos voltaria como inteiro.
    return str(uuid.UUID(int=(0xFACE << 112) + n))


def _rng_uid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128)))


def _limites_padrao(**mudancas) -> dict:
    base = {"max_linhas": 20000, "max_fontes": 32, "max_valor": "9999999999999.99"}
    base.update(mudancas)
    return base


def _transacao(rng, k, dia, valor, dc, historico, *, ordem=None, lote=None, lote_em=None, saldo=None) -> dict:
    return {
        "id": _rng_uid(rng) if rng else _uid(0x7000 + k), "data": dia, "valor": valor, "dc": dc, "historico": historico,
        "saldo_apos": saldo, "ordem": ordem, "importacao_id": lote, "lote_em": lote_em,
    }


def _criar_base(rng, **mudancas) -> dict:
    lotes = [(_uid(0x10 + i), f"2025-03-0{i + 1}T10:00:00.{i:06d}") for i in range(3)]
    transacoes = []
    for k in range(rng.randint(0, 8)):
        lote, em = rng.choice(lotes + [(None, None)])
        valor = rng.choice(["350.00", "0.00", "1200.00", "15.90", "90.00", "9999999999999.99", "0.01"])
        transacoes.append(_transacao(
            rng, k, f"2025-02-{rng.randint(1, 28):02d}", valor, rng.choice("CD"), rng.choice(TEXTOS_DIFICEIS),
            ordem=rng.choice([None, 0, 1, 2, 5]), lote=lote, lote_em=em, saldo=rng.choice([None, "100.00", "-15.30", "0.00"]),
        ))
    e = {
        "empresa": {"cnpj": "12.345.678/0001-95", "razao_social": EMPRESA_FICTICIA},
        "confirmar_empresa": False,
        "razao": {
            "empresa": EMPRESA_FICTICIA, "cnpj": "12345678000195", "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28",
            "conta_codigo": "2699", "conta_classificacao": "1.1.1.02.0015", "conta_descricao": "BANCO EXEMPLO C/C 1",
            "lancamentos": [
                [f"2025-02-{rng.randint(1, 28):02d}", str(rng.randint(1, 9999)), rng.choice(TEXTOS_DIFICEIS), str(rng.randint(100, 999)),
                 rng.choice(["1200.00", "-400.00", "-90.00", "0.00", "-0.00", "0", "1E+2", "-1E+2", "0.005", "-123.456", "350"])]
                for _ in range(rng.randint(0, 6))
            ],
            "total_debito": "0", "total_credito": "0",
        },
        "nome_arquivo": "razao.xlsx", "hash_arquivo": hashlib.sha256(str(rng.random()).encode()).hexdigest(),
        "hash_sispag": rng.choice([None, hashlib.sha256(b"sispag").hexdigest()]),
        "conta_bancaria": "ITAU ag. 1 c/c 2", "transacoes": transacoes, "limites": _limites_padrao(), "ids": [],
    }
    e.update(mudancas)
    return e


def casos_criar(rng) -> list[dict]:
    saida = []
    for _ in range(40):
        saida.append(_criar_base(rng))
    b = lambda **m: _criar_base(rng, **m)  # noqa: E731
    razao = lambda **m: {**_criar_base(rng)["razao"], **m}  # noqa: E731
    saida += [
        b(razao=razao(cnpj="98765432000110")),
        b(razao=razao(cnpj="")),
        b(razao=razao(cnpj=""), confirmar_empresa=True),
        b(razao=razao(cnpj="１２345678000195")),
        b(razao=razao(cnpj="12.345.678/0001-95")),
        b(empresa={"cnpj": "１２.345.678/0001-95", "razao_social": EMPRESA_FICTICIA}, razao=razao(cnpj="１２345678000195")),
        b(razao=razao(cnpj="98765432000110"), limites=_limites_padrao(max_linhas=0)),
        b(nome_arquivo="R" * 254 + "😀" + "FIM.xlsx"),
        b(nome_arquivo="Razão ção 😀.xlsx"),
    ]
    com_linhas = razao(lancamentos=[["2025-02-03", "1", "A", "1", "100.00"], ["2025-02-04", "2", "B", "1", "-50.00"]])
    saida += [
        b(razao=com_linhas, limites=_limites_padrao(max_linhas=1)),
        b(razao=com_linhas, limites=_limites_padrao(max_linhas=2),
          transacoes=[_transacao(None, 1, "2025-02-03", "100.00", "C", "X")]),
        b(razao=com_linhas, limites=_limites_padrao(max_valor="99.99")),
        b(razao=com_linhas, limites=_limites_padrao(max_valor="100.00")),
        b(razao=com_linhas, limites=_limites_padrao(max_valor="100.00"),
          transacoes=[_transacao(None, 2, "2025-02-03", "100.01", "D", "X")]),
        b(razao=razao(lancamentos=[["2025-02-03", "1", "A", "1", "-1E+14"]])),
    ]
    return saida


def _apoio_linha(rng, **m) -> dict:
    linha = {
        "data": f"2025-02-{rng.randint(1, 28):02d}", "conta_codigo": "354", "conta_classificacao": "2.1.2.01.0003",
        "conta_descricao": "FGTS A RECOLHER", "lote": str(rng.randint(1, 9999)), "contrapartida": "504",
        "historico": rng.choice(TEXTOS_DIFICEIS), "valor_debito": "0", "valor_credito": "0",
        "documento": rng.choice([None, "DOC 1", "ção"]), "favorecido": rng.choice([None, "FAVORECIDO EXEMPLO"]),
    }
    if rng.random() < 0.5:
        linha["valor_credito"] = rng.choice(["200.00", "150.00", "90.00", "1E+2", "0.005", "0.015", "0.025", "-0.00", "12.345"])
    else:
        linha["valor_debito"] = rng.choice(["50.00", "350", "0.00", "1200.10", "0.035"])
    linha.update(m)
    return linha


def _razao_apoio_base(rng, linhas=None, **m) -> dict:
    r = {
        "empresa": EMPRESA_FICTICIA, "cnpj": "12345678000195", "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28",
        "linhas": linhas if linhas is not None else [_apoio_linha(rng) for _ in range(rng.randint(1, 5))],
    }
    r.update(m)
    return r


def _entrada_apoio(revisao: dict, razao: dict, **m) -> dict:
    e = {
        "empresa": {"cnpj": "12.345.678/0001-95", "razao_social": EMPRESA_FICTICIA}, "confirmar_empresa": False,
        "fontes_validas": True, "revisao": copy.deepcopy(revisao), "razao": razao, "nome_arquivo": "FGTS.xlsx",
        "versao": revisao["versao"], "limites": _limites_padrao(), "ids": [],
    }
    e.update(m)
    return e


async def _revisao_inicial(montado: _Montado, rng) -> dict:
    """Uma revisão criada pelo original: o snapshot de partida dos casos de apoio e de vínculo."""
    e = _criar_base(rng)
    e["razao"]["lancamentos"] = [
        ["2025-02-03", "1001", "RECEBIMENTO CLIENTE", "504", "1200.00"],
        ["2025-02-10", "1002", "PAGAMENTO TRIBUTO", "354", "-400.00"],
        ["2025-02-26", "1003", "TARIFA BANCARIA", "506", "-90.00"],
        ["2025-02-27", "1004", "LANÇAMENTO ZERO", "506", "0.00"],
    ]
    e["transacoes"] = [
        _transacao(None, 1, "2025-02-03", "1200.00", "C", "PIX RECEBIDO", ordem=0, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(None, 2, "2025-02-10", "350.00", "D", "SISPAG FGTS", ordem=1, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(None, 3, "2025-02-10", "50.00", "D", "SISPAG OUTROS", ordem=2, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(None, 4, "2025-02-26", "90.00", "D", "TARIFA", ordem=3, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
        _transacao(None, 5, "2025-02-27", "0.00", "D", "ZERO", ordem=4, lote=_uid(0x10), lote_em="2025-03-01T10:00:00.000000"),
    ]
    saida = await montado.rodar("criar", e)
    return {"versao": 1, "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": saida["snapshot"]}


async def casos_apoio(montado: _Montado, rng, inicial: dict) -> tuple[list[dict], dict]:
    """Os casos de apoio e a revisão com dois razões de apoio (o ponto de partida dos vínculos)."""
    fgts = [
        _apoio_linha(rng, data="2025-02-03", historico="PROVISAO FGTS 001", valor_credito="200.00", valor_debito="0"),
        _apoio_linha(rng, data="2025-02-07", historico="PROVISAO FGTS 002", valor_credito="150.00", valor_debito="0"),
        _apoio_linha(rng, data="2025-02-10", historico="BAIXA PARCIAL FGTS", valor_debito="50.00", valor_credito="0"),
        _apoio_linha(rng, data="2025-02-26", historico="PROVISAO ENCARGOS", valor_credito="90.00", valor_debito="0"),
    ]
    saida = [
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts)),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), fontes_validas=False),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts, cnpj="98765432000110")),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts, cnpj="98765432000110"), fontes_validas=False),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts, cnpj="")),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts, cnpj=""), confirmar_empresa=True),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts, cnpj=""), confirmar_empresa=True, nome_arquivo="F" * 260 + "😀.xlsx"),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), limites=_limites_padrao(max_linhas=12)),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), limites=_limites_padrao(max_linhas=13)),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), limites=_limites_padrao(max_fontes=1)),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), limites=_limites_padrao(max_valor="199.99")),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), limites=_limites_padrao(max_valor="200.00")),
        _entrada_apoio(inicial, _razao_apoio_base(rng, fgts), versao=inicial["versao"] + 1),
        _entrada_apoio(inicial, _razao_apoio_base(rng, [*fgts, _apoio_linha(rng, conta_classificacao="1.1.1.02.0015")])),
        _entrada_apoio(inicial, _razao_apoio_base(rng, [_apoio_linha(rng, data="2025-01-31")])),
        _entrada_apoio(inicial, _razao_apoio_base(rng, [_apoio_linha(rng, data="2025-03-01")], cnpj=""), confirmar_empresa=True),
        _entrada_apoio(inicial, _razao_apoio_base(rng, [], periodo_inicio=None, periodo_fim=None)),
    ]
    for _ in range(40):
        saida.append(_entrada_apoio(inicial, _razao_apoio_base(rng), confirmar_empresa=rng.random() < 0.5))
    # Depois de um razão de apoio aceito: o mesmo arquivo, parte dele e um complementar.
    primeiro = await montado.rodar("apoio", saida[0])
    com_fgts = {"versao": primeiro["versao"], "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": primeiro["snapshot"]}
    impostos = [
        _apoio_linha(rng, conta_codigo="400", conta_classificacao="2.1.3.01.0001", conta_descricao="IMPOSTOS A RECOLHER",
                     data="2025-02-10", historico="PROVISAO ISS", valor_credito="50.00", valor_debito="0"),
        _apoio_linha(rng, conta_codigo="400", conta_classificacao="2.1.3.01.0001", conta_descricao="IMPOSTOS A RECOLHER",
                     data="2025-02-26", historico="PROVISAO TARIFA", valor_debito="90.00", valor_credito="0"),
    ]
    saida += [
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, fgts)),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, fgts), nome_arquivo="FGTS_REENVIADO.xlsx"),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, [*fgts, _apoio_linha(rng, conta_classificacao="1.1.1.02.0015")])),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, fgts[:2])),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, [fgts[0], _apoio_linha(rng, conta_classificacao="1.1.1.02.0015")])),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, impostos)),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, impostos), versao=com_fgts["versao"] - 1),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, impostos), limites=_limites_padrao(max_fontes=2)),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, [{**fgts[0], "valor_credito": "200"}])),
        _entrada_apoio(com_fgts, _razao_apoio_base(rng, [{**fgts[0], "documento": "OUTRO"}])),
    ]
    segundo = await montado.rodar("apoio", _entrada_apoio(com_fgts, _razao_apoio_base(rng, impostos)))
    completa = {"versao": segundo["versao"], "periodo_inicio": "2025-02-01", "periodo_fim": "2025-02-28", "snapshot": segundo["snapshot"]}
    return saida, completa


def _entrada_vinculo(revisao: dict, extrato_ids, razao_itens, observacao="", vinculos=(), **m) -> dict:
    e = {
        "fontes_validas": True, "revisao": copy.deepcopy(revisao), "vinculos": list(vinculos),
        "dados": {"versao": revisao["versao"], "extrato_ids": list(extrato_ids), "razao_itens": list(razao_itens), "observacao": observacao},
        "limites": _limites_padrao(),
    }
    e.update(m)
    return e


def casos_vinculo(rng, revisao: dict) -> list[dict]:
    snap = revisao["snapshot"]
    ext = {l["valor"]: l["transacao_id"] for l in snap["extrato"]}
    banco = [l for l in snap["linhas_razao"] if l["tipo_fonte"] == "RAZAO_BANCO"]
    apoio = [l for l in snap["linhas_razao"] if l["tipo_fonte"] == "RAZAO_APOIO"]
    item = lambda l, dc: {"linha_id": l["id"], "dc": dc}  # noqa: E731
    credito = [l for l in apoio if Decimal(l["valor_credito"]) > 0]
    debito = [l for l in apoio if Decimal(l["valor_debito"]) > 0]
    fgts = [l for l in credito if Decimal(l["valor_credito"]) in (Decimal(200), Decimal(150))]
    recebimento = next(l for l in banco if Decimal(l["valor_debito"]) > 0)
    tarifa = next(l for l in banco if Decimal(l["valor_credito"]) == 90)
    zero = next(l for l in banco if Decimal(l["valor_debito"]) == 0 and Decimal(l["valor_credito"]) == 0)
    v = lambda ids, itens, **m: _entrada_vinculo(revisao, ids, itens, **m)  # noqa: E731
    ativo = {"estado": "ATIVO", "extrato_ids": [ext["-350.00"]], "razao_itens": [item(l, "C") for l in fgts]}
    desfeito = {**ativo, "estado": "DESFEITO"}
    saida = [
        v([ext["-350.00"]], [item(l, "C") for l in fgts], observacao="Conferido com os documentos do FGTS."),
        v([ext["-350.00"]], [item(l, "C") for l in fgts], fontes_validas=False),
        v([ext["-350.00"]], [item(l, "C") for l in fgts], dados_versao=None),
        v([ext["1200.00"]], [item(recebimento, "D")]),
        v([ext["1200.00"]], [item(recebimento, "C")]),
        v([ext["-90.00"]], [item(tarifa, "C")]),
        v([ext["-90.00"]], [item(tarifa, "D")]),
        v([ext["-90.00"]], [item(zero, "C")]),
        v([ext["-350.00"]], [item(fgts[0], "C")]),
        v([ext["-350.00"]], [item(fgts[0], "C")], observacao="Faltam documentos."),
        v([ext["-350.00"], ext["-350.00"]], [item(fgts[0], "C")]),
        v([ext["-350.00"]], [item(fgts[0], "C"), item(fgts[0], "D")]),
        v([str(uuid.UUID(int=1))], [item(fgts[0], "C")]),
        v([ext["-350.00"]], [{"linha_id": str(uuid.UUID(int=2)), "dc": "C"}]),
        v([ext["-350.00"], ext["1200.00"]], [item(fgts[0], "C")]),
        v([ext["-0.00"]], [item(fgts[0], "C")]),
        v([ext["-350.00"]], [*[item(l, "C") for l in fgts], item(debito[0], "D")]),
        v([ext["-350.00"]], [*[item(l, "C") for l in fgts], item(tarifa, "C")]),
        v([ext["-350.00"]], [item(debito[0], "C")]),
        v([ext["-350.00"]], [item(l, "C") for l in fgts], vinculos=[ativo]),
        v([ext["-50.00"]], [item(fgts[0], "C")], vinculos=[ativo], observacao="x"),
        v([ext["-350.00"]], [item(l, "C") for l in fgts], vinculos=[desfeito]),
        v([ext["-350.00"]], [item(l, "C") for l in credito], limites=_limites_padrao(max_valor="400.00"), observacao="x"),
        v([ext["-350.00"], ext["-90.00"]], [item(l, "C") for l in fgts], limites=_limites_padrao(max_valor="400.00"), observacao="x"),
        v([ext["-350.00"], ext["-50.00"]], [item(l, "C") for l in fgts]),
        v([ext["-350.00"], ext["-50.00"]], [item(l, "C") for l in fgts], observacao="Diferença de R$ 50,00."),
    ]
    for e in saida:
        if e.pop("dados_versao", 1) is None:
            e["dados"]["versao"] = revisao["versao"] + 1
    # Sorteados: seleções aleatórias, com vínculos anteriores ativos e desfeitos.
    todos_ext = [l["transacao_id"] for l in snap["extrato"]]
    todas_r = snap["linhas_razao"]
    por_sinal = {
        1: [l["transacao_id"] for l in snap["extrato"] if Decimal(l["valor"]) > 0],
        -1: [l["transacao_id"] for l in snap["extrato"] if Decimal(l["valor"]) < 0],
    }
    for n in range(260):
        if n % 2 == 0:
            # Plausível: um sentido só, uma origem só e a natureza esperada (muitas passam).
            sinal = rng.choice([1, -1, -1])
            ids = rng.sample(por_sinal[sinal], rng.randint(1, min(2, len(por_sinal[sinal]))))
            tipo = rng.choice(["RAZAO_BANCO", "RAZAO_APOIO", "RAZAO_APOIO"])
            dc = ("D" if sinal > 0 else "C") if tipo == "RAZAO_BANCO" else rng.choice("DC")
            campo = "valor_debito" if dc == "D" else "valor_credito"
            candidatas = [l for l in todas_r if l["tipo_fonte"] == tipo and Decimal(l[campo]) > 0] or todas_r
            linhas = rng.sample(candidatas, rng.randint(1, min(3, len(candidatas))))
            itens = [item(l, dc) for l in linhas]
        else:
            ids = rng.sample(todos_ext, rng.randint(1, min(3, len(todos_ext))))
            linhas = rng.sample(todas_r, rng.randint(1, min(4, len(todas_r))))
            itens = [item(l, rng.choice("DC") if rng.random() < 0.2 else ("D" if Decimal(l["valor_debito"]) > 0 else "C")) for l in linhas]
        anteriores = []
        for _ in range(rng.choice([0, 0, 1, 2])):
            anteriores.append({
                "estado": rng.choice(["ATIVO", "DESFEITO"]),
                "extrato_ids": rng.sample(todos_ext, 1),
                "razao_itens": [item(rng.choice(todas_r), "C")],
            })
        if rng.random() < 0.08:
            ids = ids + ids[:1]
        saida.append(v(
            ids, itens, vinculos=anteriores, observacao=rng.choice(["", "", "Observação ção \"x\""]),
            fontes_validas=rng.random() > 0.05,
            limites=_limites_padrao(max_valor=rng.choice(["9999999999999.99", "9999999999999.99", "1000.00", "349.99"])),
        ))
    return saida


def casos_ordem(rng) -> list[dict]:
    saida = []
    for _ in range(40):
        lotes = [(_rng_uid(rng), f"2025-03-0{rng.randint(1, 3)}T{rng.randint(8, 18):02d}:00:00.{rng.randint(0, 999999):06d}") for _ in range(3)]
        transacoes = []
        for k in range(rng.randint(2, 14)):
            lote, em = rng.choice(lotes + [(None, None)])
            transacoes.append(_transacao(
                rng, k, f"2025-02-0{rng.randint(1, 3)}", "10.00", rng.choice("CD"), f"T{k}",
                ordem=rng.choice([None, 0, 1, 2, 3]), lote=lote, lote_em=em,
            ))
        rng.shuffle(transacoes)
        saida.append({"transacoes": transacoes, "inicio": "2025-02-01", "fim": "2025-02-28", "limites": _limites_padrao()})
    return saida


def casos_hash(R) -> list[dict]:
    rng = random.Random(20261112)
    objetos = [
        None, True, False, 0, -1, 7, 2**53 - 1, "", "ação", *TEXTOS_DIFICEIS,
        [], {}, [1, "a", None, True], {"b": 1, "a": 2}, {"a": {"z": [], "y": {}}, "A": None},
        {"é": 1, "e": 2, "Z": 3, "_": 4, "😀": 5, "￿": 6, "é": 7, "é": 8, "10": 9, "2": 10, "1": 11},
        {"razao": "a" * 64, "sispag": None, "extrato": "b" * 64},
        {"valor": "-0.00", "ordem": None, "saldo_apos": "0.00"},
    ]
    for _ in range(40):
        objetos.append({rng.choice(["k", "K", "ç", "z", "😀", "\x01"]) + str(rng.randint(0, 9)): rng.choice(TEXTOS_DIFICEIS) for _ in range(4)})
    saida = [{"tipo": "hash", "entrada": o, "saida": {"hash": R._hash(o), "texto": json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(",", ":"))}} for o in objetos]
    moedas = ["0", "-0", "0.00", "-0.00", "0.005", "0.015", "0.025", "-0.005", "-0.015", "1E+2", "1.2E-3", "123456789012.345",
              "9999999999999.995", "-1.235", "1.245", "350", "350.0", "350.00", "-350.004", "0E-10", "5E-3", "-5E-3"]
    moedas += [str(Decimal(rng.randint(-10**8, 10**8)) / Decimal(10 ** rng.randint(0, 5))) for _ in range(40)]
    saida += [{"tipo": "moeda", "entrada": m, "saida": R._moeda(Decimal(m))} for m in moedas]
    for _ in range(30):
        linha = {
            "id": _rng_uid(rng), "fonte_id": _rng_uid(rng), "tipo_fonte": rng.choice(["RAZAO_BANCO", "RAZAO_APOIO"]),
            "referencia_id": rng.choice([None, "r0", "r12"]), "data": "2025-02-03", "conta_codigo": "354",
            "conta_classificacao": "2.1.2.01.0003", "conta_descricao": rng.choice(TEXTOS_DIFICEIS), "historico": rng.choice(TEXTOS_DIFICEIS),
            "lote": "1", "contrapartida": "504", "documento": rng.choice([None, "D1"]), "favorecido": rng.choice([None, "F"]),
            "valor_debito": rng.choice(moedas), "valor_credito": rng.choice(moedas),
        }
        identidade = R._identidade_linha(linha)
        saida.append({"tipo": "identidade", "entrada": linha, "saida": {"identidade": identidade, "hash": R._hash(identidade)}})
    for _ in range(30):
        ts = []
        for _ in range(rng.randint(0, 6)):
            ts.append({
                "id": _rng_uid(rng), "data": f"2025-02-{rng.randint(1, 28):02d}",
                "valor": rng.choice(["350.00", "0.00", "1.005", "1E+2", "15.9"]), "dc": rng.choice("CD"), "historico": rng.choice(TEXTOS_DIFICEIS),
                "saldo_apos": rng.choice([None, "-15.30", "0.00", "2.675"]), "ordem": rng.choice([None, 0, 3]),
                "importacao_id": rng.choice([None, _rng_uid(rng)]), "lote_em": None,
            })
        ns = [types.SimpleNamespace(
            id=uuid.UUID(t["id"]), data=date.fromisoformat(t["data"]), valor=Decimal(t["valor"]), dc=t["dc"], historico=t["historico"],
            saldo_apos=Decimal(t["saldo_apos"]) if t["saldo_apos"] is not None else None, ordem=t["ordem"],
            importacao_id=uuid.UUID(t["importacao_id"]) if t["importacao_id"] else None,
        ) for t in ts]
        evidencia = R.RevisaoService._evidencia_extrato(ns)
        saida.append({"tipo": "evidencia", "entrada": ts, "saida": {"evidencia": evidencia, "hash": R._hash(evidencia)}})
    return saida


def casos_validacao() -> list[dict]:
    from pydantic import ValidationError as ErroPydantic

    from src.schemas.gestao_conciliacao import ExclusaoConciliacao, NomeConciliacao
    from src.schemas.revisao_conciliacao import VinculoCreate, VinculoDesfazer

    u = "12345678-1234-5678-1234-567812345678"
    item = {"linha_id": u, "dc": "D"}
    payloads = {
        "vinculo": [
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [u.upper()], "razao_itens": [{"linha_id": u.replace("-", ""), "dc": "C"}], "observacao": "  ok  "},
            {"versao": 1, "extrato_ids": ["{" + u + "}"], "razao_itens": [{"linha_id": "urn:uuid:" + u, "dc": "C"}]},
            {"versao": 1, "extrato_ids": ["{" + u.replace("-", "") + "}"], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": ["urn:uuid:" + u.replace("-", "")], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": ["URN:UUID:" + u], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [" " + u], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [u[:-1] + "g"], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [u[:8] + u[9:]], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [u], "razao_itens": []},
            {"versao": 0, "extrato_ids": [u], "razao_itens": [item]},
            {"versao": -1, "extrato_ids": [u], "razao_itens": [item]},
            {"versao": 2.5, "extrato_ids": [u], "razao_itens": [item]},
            {"versao": "3", "extrato_ids": [u], "razao_itens": [item]},
            {"versao": " 4 ", "extrato_ids": [u], "razao_itens": [item]},
            {"versao": "x", "extrato_ids": [u], "razao_itens": [item]},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [{"linha_id": u, "dc": "d"}]},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [{"linha_id": u, "dc": " D"}]},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [{"linha_id": u, "dc": "X"}]},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": "   "},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": "x\x1c\x85　"},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": "a" * 2000},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": "a" * 2000 + " "},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": "😀" * 2000},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "observacao": None},
            {"versao": 1, "extrato_ids": [u], "razao_itens": [item], "extra": 1},
        ],
        "desfazer": [
            {"versao": 1, "motivo": "Conferência revista pelo contador."},
            {"versao": 1, "motivo": "  revisto  "},
            {"versao": 1, "motivo": ""},
            {"versao": 1, "motivo": "   "},
            {"versao": 1, "motivo": "　\x1c"},
            {"versao": 1, "motivo": "m" * 2000},
            {"versao": 1, "motivo": "m" * 2001},
            {"versao": 1, "motivo": "😀" * 2000},
            {"versao": 1},
            {"versao": 0, "motivo": "x"},
        ],
        "nome": [
            {"versao": 1, "titulo": " Nova conferência "},
            {"versao": 1, "titulo": "   "},
            {"versao": 1, "titulo": ""},
            {"versao": 1, "titulo": "X" * 200},
            {"versao": 1, "titulo": "X" * 201},
            {"versao": 1, "titulo": " " + "X" * 200},
            {"versao": 1, "titulo": "😀" * 200},
            {"versao": 1, "titulo": "Nome", "agencia_id": "outra"},
            {"versao": 1, "titulo": "Nome", "periodo_inicio": "2026-01-01"},
            {"versao": 1, "titulo": "Nome", "fontes": []},
            {"titulo": "Nome"},
        ],
        "exclusao": [{"versao": 3}, {"versao": 0}, {"versao": 1, "titulo": "x"}, {}],
    }
    modelos = {"vinculo": VinculoCreate, "desfazer": VinculoDesfazer, "nome": NomeConciliacao, "exclusao": ExclusaoConciliacao}
    saida = []
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
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    R = _ORIGINAL["R"]
    montado = _Montado()
    await montado.abrir()
    try:
        # 1. Suíte: o banco montado com a entrada crua repete a suíte; depois, a entrada sanitizada.
        for tipo, entrada, real in _DA_SUITE:
            refeito = _comparavel(await montado.rodar(tipo, entrada))
            if refeito != _comparavel(real):
                raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False)[:2000]}\n"
                                     f"{json.dumps(_comparavel(real), ensure_ascii=False)[:2000]}")
            limpa = _sanitizar(R, tipo, entrada)
            _guardar(tipo, "suite", limpa, await montado.rodar(tipo, limpa))
        # 2. Inventados.
        rng = random.Random(20261112)
        for e in casos_criar(rng):
            s = await montado.rodar("criar", e)
            # A entrada guarda o extrato na ordem em que o serviço o leu do banco.
            posicao = {i: n for n, i in enumerate(s["_lidas"])}
            e["transacoes"].sort(key=lambda t: posicao[t["id"]])
            _guardar("criar", "inventado", {**e, "ids": s["_ids"]}, s)
        inicial = await _revisao_inicial(montado, rng)
        apoios, completa = await casos_apoio(montado, rng, inicial)
        for e in apoios:
            s = await montado.rodar("apoio", e)
            _guardar("apoio", "inventado", {**e, "ids": s["_ids"]}, s)
        for e in casos_vinculo(rng, completa):
            _guardar("vinculo", "inventado", e, await montado.rodar("vinculo", e))
        for e in casos_ordem(rng):
            _guardar("ordem", "inventado", e, await montado.rodar("ordem", e))
    finally:
        await montado.fechar()


def _escrever_partes(pasta: str, prefixo: str, itens: list[dict]) -> list[str]:
    """Grava `itens` em arquivos de até ~2,5 MB: `<prefixo>-1.json`, `<prefixo>-2.json`…"""
    for antigo in os.listdir(pasta):
        if antigo.startswith(prefixo + "-") and antigo.endswith(".json"):
            os.remove(os.path.join(pasta, antigo))
    linhas = [json.dumps(i, ensure_ascii=False, separators=(",", ":")) for i in itens]
    partes, atual, tamanho = [], [], 0
    for linha in linhas:
        if atual and tamanho + len(linha.encode()) > _MAX_BYTES:
            partes.append(atual)
            atual, tamanho = [], 0
        atual.append(linha)
        tamanho += len(linha.encode()) + 2
    if atual:
        partes.append(atual)
    nomes = []
    for k, parte in enumerate(partes, start=1):
        nome = f"{prefixo}-{k}.json"
        with open(os.path.join(pasta, nome), "w", encoding="utf-8", newline="\n") as f:
            f.write("[\n" + ",\n".join(parte) + "\n]\n")
        nomes.append(nome)
    return nomes


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    asyncio.run(_tudo())
    R = _ORIGINAL["R"]
    diretos = casos_hash(R) + casos_validacao()
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate([*diretos, *lista], start=1)]
    for c in itens:
        c.setdefault("origem", "direto")
    arquivos = _escrever_partes(pasta, "revisao", itens)
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += "erro" in c["saida"] if isinstance(c["saida"], dict) else 0
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} recusas)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito da revisão: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
