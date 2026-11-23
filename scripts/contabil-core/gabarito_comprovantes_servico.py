"""Gabarito do serviço dos comprovantes de pagamento (Bloco C, Fase C2, 19/11/2026).

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) dos comprovantes
(`ComprovanteService`, `src/domain/comprovantes/service.py`) e grava, para cada chamada de `criar`,
`associar_transacao`, `desassociar_transacao`, `deletar`, `obter`, `listar` e `buscar_por_arquivo`, a
entrada (o que o serviço leu do banco e o que recebeu) e a saída exata: o comprovante gravado, a recusa
(tipo, frase, código e detalhes), a página da lista. Depois acrescenta casos inventados, com semente
fixa, para cada ramo (o arquivo repetido, vivo e excluído; o mesmo pagamento por documento e por nome, na
virada do dia, com a confirmação; a conta bancária e a transação de outra empresa ou desfeita; a lista
com cada filtro e página) e chamadas diretas do `ComprovanteCreate`. O porte em TypeScript repete tudo
em `src/lib/contabil-core/comprovantes/servico.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada
gravada (já sanitizada): empresa, contas bancárias, transações e comprovantes. O arquivo não vai para o
gabarito: o comprovante guarda o SHA-256 dos bytes, e o `_hash_do_base64` do serviço é trocado pelo
SHA-256 gravado. As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado tem
de ser igual ao da suíte de verdade (senão o plugin aborta).

O banco montado se comporta como o PostgreSQL da produção onde o SQLite difere: a lista põe o pagamento
sem data PRIMEIRO na ordem decrescente (`NULLS FIRST`), e as datas voltam com o fuso (UTC). Para a
conferência com a suíte, a ordem do SQLite é usada.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs
que não são de exemplo viram fictícios começando com 9.

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/comprovantes/gabarito/servico \\
        python -I -W ignore -m pytest -q -p gabarito_comprovantes_servico tests/integration/test_comprovantes.py
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import copy
import hashlib
import itertools
import json
import os
import random
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_EM_CURSO: dict = {"dentro": False, "montado": None, "ordem_pg": False}
_DA_SUITE: list[tuple[str, dict, dict]] = []
casos: dict[str, dict] = {}

AGENCIA_ID = uuid.UUID(int=0xA6E)
AGENCIA_OUTRA = uuid.UUID(int=0xA6F)
NOVO = "<novo>"


def _dv(d: str, pesos) -> str:
    resto = sum(int(a) * p for a, p in zip(d, pesos)) % 11
    return "0" if resto < 2 else str(11 - resto)


def cnpj(base12: str) -> str:
    d = base12 + _dv(base12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d += _dv(d, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"


EMPRESA = cnpj("123456780001")
OUTRA = cnpj("999999990002")


# ─── Codificação ─────────────────────────────────────────────────────────────

def _utc(v: datetime | None) -> str | None:
    """O instante em UTC no `isoformat()`, como o PostgreSQL (sessão em UTC) o devolve."""
    if v is None:
        return None
    return (v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)).isoformat()


# Os instantes como o serviço os atribuiu (o SQLite guarda o relógio de parede sem o fuso).
_ATRIBUIDOS: dict[str, dict] = {}


def _anotar(session, _contexto) -> None:
    from src.db.models import Comprovante

    for obj in list(session.new) + list(session.dirty):
        if isinstance(obj, Comprovante) and obj.id is not None:
            _ATRIBUIDOS[str(obj.id)] = {k: getattr(obj, k) for k in ("data_pagamento", "data_vencimento") if isinstance(getattr(obj, k), datetime)}


def _instante(c, campo: str) -> str | None:
    v = _ATRIBUIDOS.get(str(c.id), {}).get(campo, getattr(c, campo))
    return _utc(v)


def _dinheiro(v) -> str | None:
    return None if v is None else str(Decimal(str(v)))


def _linha(c, ordem: int) -> dict:
    return {
        "id": str(c.id), "agencia_id": str(c.agencia_id) if c.agencia_id else None, "transacao_id": str(c.transacao_id) if c.transacao_id else None,
        "favorecido": c.favorecido, "cpf_cnpj": c.cpf_cnpj, "data_pagamento": _instante(c, "data_pagamento"),
        "data_vencimento": _instante(c, "data_vencimento"), "valor_documento": _dinheiro(c.valor_documento), "valor_pago": _dinheiro(c.valor_pago),
        "juros": _dinheiro(c.juros), "multa": _dinheiro(c.multa), "desconto": _dinheiro(c.desconto), "observacao": c.observacao,
        "arquivo_nome": c.arquivo_nome, "arquivo_sha256": c.arquivo_sha256, "tem_arquivo": bool(c.arquivo_base64),
        "apagado": c.deleted_at is not None, "ordem": ordem,
    }


def _resposta(r) -> dict:
    return {
        "id": str(r.id), "transacao_id": str(r.transacao_id) if r.transacao_id else None, "transacao_descricao": r.transacao_descricao,
        # A transação com as 2 casas, como o banco a devolve (o objeto da suíte, nunca relido, guardava o `int`).
        "transacao_valor": None if r.transacao_valor is None else str(Decimal(str(r.transacao_valor)).quantize(Decimal("0.01"))), "transacao_dc": r.transacao_dc, "tem_arquivo": r.tem_arquivo,
        "data_pagamento": _utc(r.data_pagamento), "valor_pago": _dinheiro(r.valor_pago),
    }


def _erro(exc) -> dict:
    detalhes = copy.deepcopy(getattr(exc, "details", None) or None)
    if detalhes and detalhes.get("data_pagamento") and "+" not in detalhes["data_pagamento"][10:]:
        detalhes["data_pagamento"] += "+00:00"
    return {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message, "code": getattr(exc, "code", None), "detalhes": detalhes}}


def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


_TEXTOS = ("favorecido", "cpf_cnpj", "observacao", "arquivo_nome", "historico", "mensagem", "cnpj")


def _sanitizar(v):
    if isinstance(v, dict):
        return {k: (_s(x) if k in _TEXTOS else _sanitizar(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_sanitizar(x) for x in v]
    return v


# ─── O banco montado com a entrada ──────────────────────────────────────────

def _instalar_ordem_pg() -> None:
    """No banco montado, `ORDER BY x DESC` põe o nulo primeiro e `ASC` por último, como o PostgreSQL."""
    from sqlalchemy.ext.compiler import compiles
    from sqlalchemy.sql import operators
    from sqlalchemy.sql.elements import UnaryExpression

    @compiles(UnaryExpression, "sqlite")
    def _ordem(element, compiler, **kw):
        texto = compiler.visit_unary(element, **kw)
        if _EM_CURSO["ordem_pg"] and getattr(compiler.dialect, "_gabarito_pg", False):
            if element.modifier is operators.desc_op:
                return texto + " NULLS FIRST"
            if element.modifier is operators.asc_op:
                return texto + " NULLS LAST"
        return texto


class _Montado:
    async def abrir(self):
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", query_cache_size=0)
        self.engine.sync_engine.dialect._gabarito_pg = True
        registrar_funcoes_sqlite(self.engine)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def fechar(self):
        await self.engine.dispose()

    async def rodar(self, tipo: str, e: dict, ordem_pg: bool = True) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            try:
                _EM_CURSO["montado"] = e
                _EM_CURSO["ordem_pg"] = ordem_pg
                return await _executar(db, tipo, e)
            finally:
                _EM_CURSO["montado"] = None
                _EM_CURSO["ordem_pg"] = False
                await db.rollback()


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v).astimezone(UTC) if v else None


async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Comprovante, Empresa, Tenant, Transacao

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    empresa = Empresa(tenant_id=tenant.id, razao_social="EMPRESA EXEMPLO LTDA", cnpj=EMPRESA, regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social="OUTRA EMPRESA", cnpj=OUTRA, regime_tributario="simples_nacional")
    db.add_all([empresa, outra])
    await db.flush()
    db.add_all([
        AgenciaBancaria(id=AGENCIA_ID, empresa_id=empresa.id, banco_sigla="ITAU", agencia="1234", numero="56789", ativa=True),
        AgenciaBancaria(id=AGENCIA_OUTRA, empresa_id=outra.id, banco_sigla="ITAU", agencia="1234", numero="99999", ativa=True),
    ])
    for a in e.get("agencias", []):
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=outra.id if a.get("empresa") == "outra" else empresa.id, banco_sigla="BB",
                               agencia="0001", numero=a["id"][-12:], ativa=True,
                               deleted_at=datetime(2026, 3, 9, tzinfo=UTC) if a.get("apagada") else None))
    await db.flush()
    for t in e.get("transacoes", []):
        da_outra = t.get("empresa") == "outra"
        db.add(Transacao(
            id=uuid.UUID(t["id"]), empresa_id=outra.id if da_outra else empresa.id, agencia_id=AGENCIA_OUTRA if da_outra else AGENCIA_ID,
            data=date.fromisoformat(t.get("data", "2026-03-05")), valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"],
            hash_dedup=t["id"].replace("-", "") * 2, deleted_at=datetime(2026, 3, 9, tzinfo=UTC) if t.get("apagada") else None,
        ))
    await db.flush()
    base = datetime(2026, 1, 1, tzinfo=UTC)
    for c in sorted(e.get("comprovantes", []), key=lambda c: c["ordem"]):
        db.add(Comprovante(
            id=uuid.UUID(c["id"]), empresa_id=outra.id if c.get("empresa") == "outra" else empresa.id,
            agencia_id=uuid.UUID(c["agencia_id"]) if c["agencia_id"] else None, transacao_id=uuid.UUID(c["transacao_id"]) if c["transacao_id"] else None,
            favorecido=c["favorecido"], cpf_cnpj=c["cpf_cnpj"], data_pagamento=_dt(c["data_pagamento"]), data_vencimento=_dt(c["data_vencimento"]),
            valor_documento=Decimal(c["valor_documento"]) if c["valor_documento"] is not None else None, valor_pago=Decimal(c["valor_pago"]),
            juros=Decimal(c["juros"]), multa=Decimal(c["multa"]), desconto=Decimal(c["desconto"]), observacao=c["observacao"],
            arquivo_nome=c["arquivo_nome"], arquivo_base64=("SHA:" + (c["arquivo_sha256"] or "")) if c["tem_arquivo"] else None,
            arquivo_sha256=c["arquivo_sha256"], created_at=base + timedelta(minutes=c["ordem"]), updated_at=base,
            deleted_at=datetime(2026, 3, 9, tzinfo=UTC) if c.get("apagado") else None,
        ))
    await db.flush()
    return empresa if e.get("empresa", {}) is not None else None


async def _comprovantes(db, empresa_id) -> list[dict]:
    from sqlalchemy import select

    from src.db.models import Comprovante

    linhas = (await db.execute(select(Comprovante).where(Comprovante.empresa_id == empresa_id).order_by(Comprovante.created_at, Comprovante.id))).scalars()
    return [_linha(c, k) for k, c in enumerate(linhas)]


def _hash_trocado(original):
    def hash_(texto):
        if texto and texto.startswith("SHA:"):
            return texto[4:] or None
        return original(texto)
    return hash_


async def _executar(db, tipo: str, e: dict) -> dict:
    from src.core.errors import AppError
    from src.domain.comprovantes import service as S
    from src.schemas.comprovantes import AssociarTransacaoRequest, ComprovanteCreate

    empresa = await _base(db, e)
    empresa_id = empresa.id if empresa is not None else uuid.UUID(int=0xDEAD)
    servico = S.ComprovanteService(db, empresa_id)
    antes = await _comprovantes(db, empresa_id)
    saida: dict = {}
    hash_original = S._hash_do_base64
    S._hash_do_base64 = _hash_trocado(hash_original)
    try:
        if tipo == "criar":
            dados = dict(e["dados"])
            arquivo = dados.pop("arquivo")
            dados["arquivo_base64"] = ("SHA:" + (arquivo["sha256"] or "")) if arquivo["tem"] else None
            r = await servico.criar(ComprovanteCreate.model_validate(dados))
            depois = await _comprovantes(db, empresa_id)
            ja = {c["id"] for c in antes}
            saida = {"novos": [{**c, "id": NOVO} for c in depois if c["id"] not in ja], "resposta": {**_resposta(r), "id": NOVO}}
        elif tipo in ("associar", "desassociar", "deletar"):
            cid = uuid.UUID(e["comprovante_id"])
            if tipo == "associar":
                await servico.associar_transacao(cid, AssociarTransacaoRequest(transacao_id=e["transacao_id"]))
            elif tipo == "desassociar":
                await servico.desassociar_transacao(cid)
            else:
                await servico.deletar(cid)
            depois = await _comprovantes(db, empresa_id)
            saida = {"comprovante": next(c for c in depois if c["id"] == e["comprovante_id"])}
        elif tipo == "obter":
            saida = {"resposta": _resposta(await servico.obter(uuid.UUID(e["comprovante_id"])))}
        elif tipo == "listar":
            f = e["filtros"]
            r = await servico.listar(page=e["page"], page_size=e["page_size"],
                                     agencia_id=uuid.UUID(f["agencia_id"]) if f.get("agencia_id") else None,
                                     transacao_id=uuid.UUID(f["transacao_id"]) if f.get("transacao_id") else None, status=f.get("status"))
            saida = {"total": r.total, "itens": [_resposta(i) for i in r.items]}
        elif tipo == "buscar":
            r = await servico.buscar_por_arquivo(e["sha256"])
            saida = {"achado": str(r.id) if r else None}
        else:
            raise AssertionError(tipo)
    except AppError as exc:
        saida = _erro(exc)
    finally:
        S._hash_do_base64 = hash_original
    return saida


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

async def _transacoes(db, empresa_id) -> list[dict]:
    from sqlalchemy import select

    from src.db.models import Transacao

    return [
        {"id": str(t.id), "historico": t.historico, "valor": str(t.valor), "dc": t.dc, "data": t.data.isoformat(),
         "apagada": t.deleted_at is not None, "empresa": "esta" if t.empresa_id == empresa_id else "outra"}
        for t in (await db.execute(select(Transacao))).scalars()
    ]


async def _agencias(db, empresa_id) -> list[dict]:
    from sqlalchemy import select

    from src.db.models import AgenciaBancaria

    return [
        {"id": str(a.id), "empresa": "esta" if a.empresa_id == empresa_id else "outra", "apagada": a.deleted_at is not None}
        for a in (await db.execute(select(AgenciaBancaria))).scalars() if a.id not in (AGENCIA_ID, AGENCIA_OUTRA)
    ]


def _hash_real(texto):
    if not texto:
        return None
    try:
        return hashlib.sha256(base64.b64decode(texto)).hexdigest()
    except (binascii.Error, ValueError):
        return None


def pytest_configure(config):  # noqa: ARG001
    from src.core.errors import AppError
    from src.domain.comprovantes import service as S

    if getattr(S, "__gabarito__", False):
        return
    S.__gabarito__ = True
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    event.listen(Session, "after_flush", _anotar)
    _instalar_ordem_pg()
    _ORIGINAL["S"] = S
    Servico = S.ComprovanteService
    originais = {n: getattr(Servico, n) for n in ("criar", "associar_transacao", "desassociar_transacao", "deletar", "obter", "listar", "buscar_por_arquivo")}

    def gravar(nome, tipo, montar):
        async def f(self, *args, **kw):
            if _EM_CURSO["montado"] is not None or _EM_CURSO["dentro"]:
                return await originais[nome](self, *args, **kw)
            _EM_CURSO["dentro"] = True
            try:
                from src.db.models import Empresa

                emp = await self._db.get(Empresa, self._empresa_id)
                antes = await _comprovantes(self._db, self._empresa_id)
                entrada = {"empresa": {"cnpj": emp.cnpj} if emp else None, "agencias": await _agencias(self._db, self._empresa_id),
                           "transacoes": await _transacoes(self._db, self._empresa_id), "comprovantes": antes, **montar(*args, **kw)}
                try:
                    r, exc = await originais[nome](self, *args, **kw), None
                except AppError as e:
                    r, exc = None, e
                if exc is not None:
                    saida = _erro(exc)
                elif tipo == "criar":
                    depois = await _comprovantes(self._db, self._empresa_id)
                    ja = {c["id"] for c in antes}
                    saida = {"novos": [{**c, "id": NOVO} for c in depois if c["id"] not in ja], "resposta": {**_resposta(r), "id": NOVO}}
                elif tipo in ("associar", "desassociar", "deletar"):
                    depois = await _comprovantes(self._db, self._empresa_id)
                    saida = {"comprovante": next(c for c in depois if c["id"] == entrada["comprovante_id"])}
                elif tipo == "obter":
                    saida = {"resposta": _resposta(r)}
                elif tipo == "listar":
                    saida = {"total": r.total, "itens": [_resposta(i) for i in r.items]}
                else:
                    saida = {"achado": str(r.id) if r else None}
                _DA_SUITE.append((tipo, entrada, saida))
            finally:
                _EM_CURSO["dentro"] = False
            if exc is not None:
                raise exc
            return r
        return f

    def dados_de(data):
        d = data.model_dump(mode="json")
        b64 = d.pop("arquivo_base64")
        d["arquivo"] = {"tem": bool(b64), "sha256": _hash_real(b64)}
        return {"dados": d}

    def filtros(page=1, page_size=50, agencia_id=None, transacao_id=None, status=None):
        f = {"agencia_id": str(agencia_id) if agencia_id else None, "transacao_id": str(transacao_id) if transacao_id else None, "status": status}
        return {"page": page, "page_size": page_size, "filtros": {k: v for k, v in f.items() if v is not None}}

    Servico.criar = gravar("criar", "criar", dados_de)
    Servico.associar_transacao = gravar("associar_transacao", "associar", lambda cid, req: {"comprovante_id": str(cid), "transacao_id": str(req.transacao_id)})
    Servico.desassociar_transacao = gravar("desassociar_transacao", "desassociar", lambda cid: {"comprovante_id": str(cid)})
    Servico.deletar = gravar("deletar", "deletar", lambda cid: {"comprovante_id": str(cid)})
    Servico.obter = gravar("obter", "obter", lambda cid: {"comprovante_id": str(cid)})
    Servico.listar = gravar("listar", "listar", filtros)
    Servico.buscar_por_arquivo = gravar("buscar_por_arquivo", "buscar", lambda sha: {"sha256": sha})


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=(prefixo << 96) | next(_IDS)))


def _sha(rng: random.Random) -> str:
    return hashlib.sha256(str(rng.random()).encode()).hexdigest()


def _comp(ordem: int, **sobre) -> dict:
    c = {"id": _uid(0xC0), "agencia_id": None, "transacao_id": None, "favorecido": "FORNECEDOR EXEMPLO LTDA", "cpf_cnpj": cnpj("999999990001"),
         "data_pagamento": "2026-03-10T00:00:00+00:00", "data_vencimento": None, "valor_documento": None, "valor_pago": "1500.00",
         "juros": "0.00", "multa": "0.00", "desconto": "0.00", "observacao": None, "arquivo_nome": "pix.pdf", "arquivo_sha256": None,
         "tem_arquivo": False, "apagado": False, "ordem": ordem}
    c.update(sobre)
    return c


def _dados(**sobre) -> dict:
    d = {"favorecido": "FORNECEDOR EXEMPLO LTDA", "cpf_cnpj": cnpj("999999990001"), "data_pagamento": "2026-03-10T00:00:00Z",
         "data_vencimento": None, "valor_documento": None, "valor_pago": "1500.00", "juros": "0.00", "multa": "0.00", "desconto": "0.00",
         "observacao": None, "agencia_id": None, "transacao_id": None, "arquivo_nome": None, "permitir_duplicado": False}
    arquivo = sobre.pop("arquivo", None)
    d.update(sobre)
    from src.schemas.comprovantes import ComprovanteCreate

    validado = ComprovanteCreate.model_validate({**d, "arquivo_base64": None}).model_dump(mode="json")
    validado.pop("arquivo_base64")
    validado["arquivo"] = arquivo or {"tem": False, "sha256": None}
    return validado


TRANSACOES = None


def _transacoes_inventadas() -> list[dict]:
    global TRANSACOES
    if TRANSACOES is None:
        TRANSACOES = [
            {"id": _uid(0x7A0), "historico": "PAGTO FORNECEDOR FICTICIO", "valor": "1500.00", "dc": "D", "data": "2026-03-10", "apagada": False, "empresa": "esta"},
            {"id": _uid(0x7A0), "historico": "RECEBIMENTO CLIENTE", "valor": "200.00", "dc": "C", "data": "2026-03-11", "apagada": False, "empresa": "esta"},
            {"id": _uid(0x7A0), "historico": "TARIFA DESFEITA", "valor": "12.00", "dc": "D", "data": "2026-03-07", "apagada": True, "empresa": "esta"},
            {"id": _uid(0x7A0), "historico": "DA OUTRA EMPRESA", "valor": "10.00", "dc": "D", "data": "2026-03-08", "apagada": False, "empresa": "outra"},
        ]
    return TRANSACOES


AGENCIAS = [{"id": str(uuid.UUID(int=0xA70)), "empresa": "esta", "apagada": False},
            {"id": str(uuid.UUID(int=0xA71)), "empresa": "esta", "apagada": True},
            {"id": str(uuid.UUID(int=0xA72)), "empresa": "outra", "apagada": False}]


def casos_criar(rng: random.Random) -> list[dict]:
    T = _transacoes_inventadas()
    base = {"empresa": {"cnpj": EMPRESA}, "agencias": AGENCIAS, "transacoes": T}
    sha = _sha(rng)
    saida = []
    # O arquivo repetido: vivo (o mais antigo vence), excluído, de outra empresa, e com a confirmação.
    for existentes in (
        [_comp(0, arquivo_sha256=sha, tem_arquivo=True)],
        [_comp(0, arquivo_sha256=sha, tem_arquivo=True, apagado=True)],
        [_comp(0, arquivo_sha256=sha, tem_arquivo=True, apagado=True), _comp(1, arquivo_sha256=sha, tem_arquivo=True, favorecido="SEGUNDO", data_pagamento=None)],
        [_comp(0, arquivo_sha256=sha, tem_arquivo=True, transacao_id=T[0]["id"]), _comp(1, arquivo_sha256=sha, tem_arquivo=True, favorecido="SEGUNDO")],
        [_comp(0, arquivo_sha256=sha, tem_arquivo=True, empresa="outra")],
        [_comp(0, arquivo_sha256=_sha(rng), tem_arquivo=True)],
    ):
        for permitir in (False, True):
            for d in (_dados(arquivo={"tem": True, "sha256": sha}, permitir_duplicado=permitir, favorecido="OUTRO NOME", valor_pago="99.90"),
                      _dados(arquivo={"tem": True, "sha256": sha}, permitir_duplicado=permitir)):
                saida.append({**base, "comprovantes": existentes, "dados": d})
    # O mesmo pagamento com outro arquivo: documento, nome, dia, valor.
    doc = cnpj("999999990001")
    variantes_existente = [
        {}, {"cpf_cnpj": doc.replace(".", "").replace("/", "").replace("-", "")}, {"cpf_cnpj": cnpj("111111110001")}, {"cpf_cnpj": None},
        {"cpf_cnpj": None, "favorecido": "  fornecedor   exemplo LTDA "}, {"cpf_cnpj": None, "favorecido": None}, {"cpf_cnpj": ""},
        {"valor_pago": "1500.01"}, {"data_pagamento": "2026-03-10T23:59:59+00:00"}, {"data_pagamento": "2026-03-11T00:00:00+00:00"},
        {"data_pagamento": "2026-03-09T23:59:59+00:00"}, {"data_pagamento": None}, {"apagado": True}, {"empresa": "outra"},
        {"transacao_id": T[0]["id"], "arquivo_nome": None, "favorecido": None, "cpf_cnpj": doc},
        {"favorecido": "FORNECEDOR EXEMPLO LTDA", "cpf_cnpj": "000.000.000-00"},
    ]
    variantes_novo = [
        {}, {"cpf_cnpj": None}, {"cpf_cnpj": None, "favorecido": "fornecedor exemplo ltda"}, {"cpf_cnpj": None, "favorecido": None},
        {"cpf_cnpj": "", "favorecido": ""}, {"data_pagamento": None}, {"data_pagamento": "2026-03-10T21:30:00-03:00"},
        {"data_pagamento": "2026-03-10T23:00:00-03:00"}, {"data_pagamento": "2026-03-10T12:00:00"}, {"valor_pago": "1500"},
        {"valor_pago": 1500}, {"valor_pago": "1500.001"}, {"permitir_duplicado": True},
        {"favorecido": "FORNECEDOR EXEMPLO LTDA", "cpf_cnpj": "ab"}, {"favorecido": "FORNECEDOR ÉXEMPLO LTDA"},
    ]
    for ve in variantes_existente:
        for vn in variantes_novo:
            existentes = [_comp(0, **ve)]
            if rng.random() < 0.3:
                existentes.append(_comp(1, **{**ve, "favorecido": "PRIMEIRO A CASAR", "cpf_cnpj": None if ve.get("cpf_cnpj") is None else ve.get("cpf_cnpj", doc)}))
            saida.append({**base, "comprovantes": existentes, "dados": _dados(arquivo={"tem": True, "sha256": _sha(rng)}, **vn)})
    # Conta bancária e transação.
    for agencia in [None, AGENCIAS[0]["id"], AGENCIAS[1]["id"], AGENCIAS[2]["id"], str(AGENCIA_ID), _uid(0xBAD)]:
        for transacao in [None, T[0]["id"], T[1]["id"], T[2]["id"], T[3]["id"], _uid(0xBAD)]:
            saida.append({**base, "comprovantes": [], "dados": _dados(agencia_id=agencia, transacao_id=transacao)})
    # Valores e campos.
    for vn in [{"valor_pago": "10.005"}, {"valor_pago": "0.01", "juros": "1.5", "multa": "2", "desconto": "0.105"}, {"valor_documento": "1.234"},
               {"observacao": "OBS", "arquivo_nome": "nome.png", "data_vencimento": "2026-04-01"}, {"data_pagamento": "2026-03-10"},
               {"favorecido": None, "cpf_cnpj": None, "data_pagamento": None}, {"valor_pago": "1E+2"}]:
        saida.append({**base, "comprovantes": [], "dados": _dados(**vn)})
    saida.append({"empresa": None, "agencias": [], "transacoes": [], "comprovantes": [], "dados": _dados()})
    return saida


def casos_estado(rng: random.Random) -> list[tuple[str, dict]]:
    T = _transacoes_inventadas()
    saida = []
    for ligada in (None, 0, 1, 2):
        for apagado in (False, True):
            c = _comp(0, transacao_id=T[ligada]["id"] if ligada is not None else None, apagado=apagado, arquivo_sha256=_sha(rng), tem_arquivo=True)
            outro = _comp(1, favorecido="OUTRO")
            base = {"empresa": {"cnpj": EMPRESA}, "agencias": AGENCIAS, "transacoes": T, "comprovantes": [c, outro]}
            for alvo in (0, 1, 2, 3, "inexistente"):
                tid = T[alvo]["id"] if alvo != "inexistente" else _uid(0xBAD)
                saida.append(("associar", {**base, "comprovante_id": c["id"], "transacao_id": tid}))
            saida.append(("desassociar", {**base, "comprovante_id": c["id"]}))
            saida.append(("deletar", {**base, "comprovante_id": c["id"]}))
            saida.append(("obter", {**base, "comprovante_id": c["id"]}))
            saida.append(("buscar", {**base, "sha256": c["arquivo_sha256"]}))
    de_outra = _comp(0, empresa="outra")
    base = {"empresa": {"cnpj": EMPRESA}, "agencias": AGENCIAS, "transacoes": T, "comprovantes": [de_outra]}
    for tipo in ("associar", "desassociar", "deletar", "obter"):
        saida.append((tipo, {**base, "comprovante_id": de_outra["id"], **({"transacao_id": T[0]["id"]} if tipo == "associar" else {})}))
        saida.append((tipo, {**base, "comprovante_id": _uid(0xBAD), **({"transacao_id": T[0]["id"]} if tipo == "associar" else {})}))
    sha = _sha(rng)
    tres = [_comp(0, arquivo_sha256=sha, tem_arquivo=True, apagado=True), _comp(1, arquivo_sha256=sha, tem_arquivo=True), _comp(2, arquivo_sha256=sha, tem_arquivo=True)]
    saida.append(("buscar", {"empresa": {"cnpj": EMPRESA}, "agencias": [], "transacoes": T, "comprovantes": tres, "sha256": sha}))
    saida.append(("buscar", {"empresa": {"cnpj": EMPRESA}, "agencias": [], "transacoes": T, "comprovantes": tres, "sha256": _sha(rng)}))
    return saida


def casos_listar(rng: random.Random) -> list[dict]:
    T = _transacoes_inventadas()
    comps = []
    for k in range(25):
        ligada = rng.choice([None, None, 0, 1, 2, 3])
        comps.append(_comp(
            k, transacao_id=T[ligada]["id"] if ligada is not None else None, agencia_id=rng.choice([None, AGENCIAS[0]["id"], str(AGENCIA_ID)]),
            data_pagamento=None if k == 7 else (datetime(2026, 1, 1, tzinfo=UTC) + timedelta(hours=7 * k + rng.randint(0, 5))).isoformat(),
            valor_pago=f"{rng.randint(1, 9999)}.{rng.randint(0, 99):02d}", apagado=rng.random() < 0.15, tem_arquivo=rng.random() < 0.5,
            favorecido=rng.choice(["A LTDA", "B ME", None]),
        ))
    filtros = [{}, {"status": "associado"}, {"status": "nao_associado"}, {"status": "xyz"}, {"agencia_id": AGENCIAS[0]["id"]},
               {"transacao_id": T[0]["id"]}, {"transacao_id": T[3]["id"]}, {"transacao_id": T[0]["id"], "status": "nao_associado"},
               {"transacao_id": T[0]["id"], "status": "associado"}, {"agencia_id": str(AGENCIA_ID), "status": "associado"}]
    saida = []
    for f in filtros:
        for page, page_size in [(1, 50), (1, 6), (2, 6), (5, 6)]:
            saida.append({"empresa": {"cnpj": EMPRESA}, "agencias": AGENCIAS, "transacoes": T, "comprovantes": comps, "filtros": f, "page": page, "page_size": page_size})
    return saida


def casos_diretos() -> list[dict]:
    from pydantic import ValidationError as ErroPydantic

    from src.schemas.comprovantes import ComprovanteCreate

    ok = {"valor_pago": "10.00"}
    variantes = [
        {}, {"valor_pago": None}, {"valor_pago": 0}, {"valor_pago": "-1"}, {"valor_pago": "abc"}, {"valor_pago": "NaN"}, {"valor_pago": "Infinity"},
        {"valor_pago": 0.1}, {"valor_pago": "1E+3"}, {"valor_pago": " 5 "}, {"valor_pago": "1_000"}, {"valor_pago": True},
        {"juros": "-0.01"}, {"juros": "0"}, {"juros": None}, {"multa": "-5"}, {"desconto": "abc"}, {"desconto": 1.25},
        {"valor_documento": "x"}, {"valor_documento": None}, {"valor_documento": "-3"}, {"favorecido": 12}, {"favorecido": "F" * 400},
        {"cpf_cnpj": "1" * 30}, {"observacao": "O" * 600}, {"arquivo_nome": "a" * 300}, {"data_pagamento": "2026-02-30T00:00:00"},
        {"data_pagamento": "ontem"}, {"data_pagamento": "2026-03-10"}, {"data_pagamento": "2026-03-10T10:00:00-03:00"},
        {"data_pagamento": "2026-03-10 10:00"}, {"data_pagamento": 1773100800}, {"data_vencimento": "x"}, {"agencia_id": "x"},
        {"agencia_id": "A6E00000-0000-0000-0000-000000000000"}, {"transacao_id": "00000000000000000000000000000a6e"},
        {"permitir_duplicado": "sim"}, {"permitir_duplicado": True}, {"valor_pago": "12345678901234.5"},
    ]
    saida = []
    for v in variantes:
        p = {**ok, **v}
        try:
            m = ComprovanteCreate.model_validate_json(json.dumps(p))
        except ErroPydantic as exc:
            e = exc.errors()[0]
            saida.append({"tipo": "validacao", "entrada": p, "saida": {"pydantic": {"type": e["type"], "loc": [str(x) for x in e["loc"]], "msg": e["msg"]}}})
            continue
        d = m.model_dump(mode="json")
        d.pop("arquivo_base64")
        for k in ("data_pagamento", "data_vencimento"):
            v_ = getattr(m, k)
            d[k] = _utc(v_) if v_ else None
        saida.append({"tipo": "validacao", "entrada": p, "saida": {"ok": d}})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for tipo, entrada, real in _DA_SUITE:
            refeito = await montado.rodar(tipo, entrada, ordem_pg=False)
            if refeito != real:
                raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False, default=str)[:3000]}\n"
                                     f"{json.dumps(real, ensure_ascii=False, default=str)[:3000]}")
            limpa = _sanitizar(entrada)
            _guardar(tipo, "suite", limpa, await montado.rodar(tipo, limpa))
        rng = random.Random(20261119)
        for e in casos_criar(rng):
            _guardar("criar", "inventado", e, await montado.rodar("criar", e))
        for tipo, e in casos_estado(rng):
            _guardar(tipo, "inventado", e, await montado.rodar(tipo, e))
        for e in casos_listar(rng):
            _guardar("listar", "inventado", e, await montado.rodar("listar", e))
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
    arquivos = _escrever_partes(pasta, "comprovantes-servico", itens)
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += ("erro" in c["saida"] or "pydantic" in c["saida"])
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} com recusa)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito dos comprovantes: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
