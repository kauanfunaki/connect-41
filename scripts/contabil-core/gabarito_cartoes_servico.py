"""Gabarito do serviço dos cartões de crédito (Bloco C, Fase C3, 23/11/2026).

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) que tocam cartões e faturas e grava,
para cada chamada de `CartaoService` (`src/domain/cartoes/service.py`: listar_cartoes, criar_cartao,
atualizar_cartao, remover_cartao, listar_faturas, criar_fatura, atualizar_fatura, associar_transacao,
desassociar_transacao, listar_lancamentos, adicionar_lancamento, importar_csv, importar_lancamentos_pdf e
remover_lancamento) e de `DistribuicaoService` (`src/domain/cartoes/distribuicao.py`: obter, salvar, aplicar,
desfazer, adicionar_documento, confirmar_documento e documento), mais `processar_documento`, a entrada (o
banco que o serviço leu e o que recebeu) e a saída exata: a resposta ou a recusa (tipo e frase) e, quando
deu certo, as linhas que mudaram ou nasceram. Depois acrescenta casos inventados, com semente fixa, para
cada ramo, e chamadas diretas dos esquemas (`src/schemas/cartoes.py`), de `_identificador_compra`, do
`uuid5`, do `_parse_data`/`_parse_valor` do serviço, do `csv.DictReader`, de `leitura_expirada` e do
`DistribuicaoService._hash` (o hash da classificação bancária, que a carga C4 precisa repetir byte a byte).
O porte em TypeScript repete tudo em `src/lib/contabil-core/cartoes/servico.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada
gravada (já sanitizada). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado
tem de ser igual ao da suíte de verdade (senão o plugin aborta). O arquivo de um documento da fatura não vai
para o gabarito: só o tamanho, o SHA-256 e se começa por "%PDF" (o banco montado recebe bytes de enchimento
do mesmo tamanho; o envio pequeno da suíte vai inteiro, em base64).

Onde o SQLite difere do PostgreSQL da produção, o banco montado faz como o PostgreSQL:
- as datas com fuso (`data_compra`, `data_fechamento`, `data_vencimento`) são gravadas em UTC (o SQLite
  guardava o relógio de parede sem o fuso);
- a soma de `Numeric` volta `Decimal` com as 2 casas (no SQLite, `float`);
- o texto mais longo que a coluna e o valor acima de `Numeric(15,2)` são erro do banco (o SQLite aceita):
  a chamada é marcada `erro_do_banco`, e o porte decide (ver o teste).
A ordem das linhas é a de criação; o desempate da lista de lançamentos (mesma data) é a ordem de criação.

`aplicar` e `desfazer` mexem no NEO (`classificar_manualmente_lote`, `alterar_composicao`,
`cancelar_lancamento`): a saída grava a decisão, o que foi pedido ao NEO e as partidas vivas do pagamento
depois, com os ids aleatórios (uuid4) trocados por "<novo1>", "<novo2>"… na ordem em que aparecem.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs
que não são de exemplo viram fictícios começando com 9.

Uso, a partir da raiz do contabil-core (o `-I` ignora o PYTHONPATH, então o caminho do plugin entra pelo `-c`):
    GABARITO_NOMES=... GABARITO_DIR=<connect>/src/lib/contabil-core/cartoes/gabarito/servico \\
        python -I -B -W ignore -c "import sys; sys.path.insert(0, '<connect>/scripts/contabil-core'); import pytest; \\
        sys.exit(pytest.main(['-q', '-p', 'no:cacheprovider', '-p', 'gabarito_cartoes_servico', \\
        'tests/integration/test_cartoes.py', 'tests/integration/test_fatura_distribuicao.py', \\
        'tests/integration/test_auditoria.py']))"
"""
from __future__ import annotations

import asyncio
import base64
import csv
import hashlib
import io
import itertools
import json
import os
import random
import re
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_EM: dict = {"dentro": False, "montado": False}
_DA_SUITE: list[tuple[str, dict, dict]] = []
casos: dict[str, dict] = {}

# Os ids fixos começam por letra: no SQLite a coluna UUID tem afinidade numérica, e "0…0e1" viraria o número 0.
_A = 0xA << 124
TENANT_ID = uuid.UUID(int=_A | 0x7E0)
USUARIO_ID = uuid.UUID(int=_A | 0x05E)
EMPRESA_ID = uuid.UUID(int=_A | 0xE1)
OUTRA_ID = uuid.UUID(int=_A | 0xE2)
SEM_EMPRESA = uuid.UUID(int=_A | 0xDEAD)
AGENCIA_ID = uuid.UUID(int=_A | 0xA6E)
AGENCIA_OUTRA = uuid.UUID(int=_A | 0xA6F)

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


# ─── Codificação ─────────────────────────────────────────────────────────────

def _utc(v: datetime | None) -> str | None:
    """O instante em UTC no `isoformat()`, como o PostgreSQL (sessão em UTC) o devolve."""
    if v is None:
        return None
    return (v.replace(tzinfo=UTC) if v.tzinfo is None else v.astimezone(UTC)).isoformat()


# Os instantes como o serviço os atribuiu (o SQLite guarda o relógio de parede sem o fuso).
_ATRIBUIDOS: dict[tuple[str, str], datetime] = {}
_CAMPOS_DE_DATA = {"LancamentoCartao": ("data_compra", "valor"), "FaturaCartao": ("data_fechamento", "data_vencimento"), "CartaoCredito": ("limite",)}


def _anotar(session, _contexto) -> None:
    for obj in list(session.new) + list(session.dirty):
        for campo in _CAMPOS_DE_DATA.get(type(obj).__name__, ()):
            v = getattr(obj, campo, None)
            if isinstance(v, (datetime, Decimal)) and obj.id is not None:
                _ATRIBUIDOS[(str(obj.id), campo)] = v


def _instante(obj, campo: str) -> str | None:
    v = _ATRIBUIDOS.get((str(obj.id), campo), getattr(obj, campo))
    return _utc(v)


def _din(v) -> str | None:
    return None if v is None else str(Decimal(str(v)))


def _din2(v) -> str | None:
    """O `Numeric(15,2)` como o PostgreSQL devolve: 2 casas (o SQLite devolvia `float` nas somas)."""
    return None if v is None else str(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _id(v) -> str | None:
    return None if v is None else str(v)


async def _estado(db, empresa_id) -> dict:
    """As linhas que o serviço lê e grava, na ordem de criação, marcadas "esta" ou "outra" empresa."""
    from sqlalchemy import func, select

    from src.db.models import (
        AgenciaBancaria, CartaoCredito, FaturaCartao, FaturaDistribuicao, FaturaDocumento, LancamentoCartao,
        PlanoConta, RegistroContabil, Transacao,
    )

    def emp(x):
        return "esta" if x == empresa_id else "outra"

    async def linhas(modelo):
        return (await db.execute(select(modelo).order_by(modelo.created_at, modelo.id))).scalars().all()

    agora = datetime.now(UTC)
    e: dict = {}
    e["agencias"] = [
        {"id": str(a.id), "empresa": emp(a.empresa_id), "conta_contabil_id": _id(a.conta_contabil_id), "apagada": a.deleted_at is not None}
        for a in await linhas(AgenciaBancaria) if a.id not in (AGENCIA_ID, AGENCIA_OUTRA)
    ]
    e["contas"] = [
        {"id": str(c.id), "empresa": emp(c.empresa_id), "codigo": c.codigo, "tipo_sa": c.tipo_sa, "apagada": c.deleted_at is not None}
        for c in await linhas(PlanoConta)
    ]
    e["transacoes"] = [
        {"id": str(t.id), "empresa": emp(t.empresa_id), "agencia_id": str(t.agencia_id), "data": t.data.isoformat(), "valor": _din2(t.valor),
         "dc": t.dc, "status": t.status, "historico": t.historico, "apagada": t.deleted_at is not None}
        for t in await linhas(Transacao)
    ]
    e["registros"] = [
        {"id": str(r.id), "empresa": emp(r.empresa_id), "transacao_id": _id(r.transacao_id), "lancamento_id": str(r.lancamento_id),
         "ordem_composicao": r.ordem_composicao, "conta_id": str(r.conta_id), "agencia_id": str(r.agencia_id), "historico": r.historico,
         "descricao": r.descricao, "dc": r.dc, "valor": _din2(r.valor), "tipo_regra": r.tipo_regra,
         "data_lancamento": _utc(r.data_lancamento), "apagado": r.deleted_at is not None}
        for r in await linhas(RegistroContabil)
    ]
    e["cartoes"] = [
        {"id": str(c.id), "empresa": emp(c.empresa_id), "nome": c.nome, "bandeira": c.bandeira, "ultimos_digitos": c.ultimos_digitos,
         "dia_fechamento": c.dia_fechamento, "dia_vencimento": c.dia_vencimento, "limite": _din2(_ATRIBUIDOS.get((str(c.id), "limite"), c.limite)), "ativo": c.ativo,
         "apagado": c.deleted_at is not None}
        for c in await linhas(CartaoCredito)
    ]
    e["faturas"] = [
        {"id": str(f.id), "empresa": emp(f.empresa_id), "cartao_id": str(f.cartao_id), "competencia": f.competencia,
         "data_fechamento": _instante(f, "data_fechamento"), "data_vencimento": _instante(f, "data_vencimento"),
         "valor_total": _din2(f.valor_total), "status": f.status, "transacao_id": _id(f.transacao_id), "observacao": f.observacao,
         "apagada": f.deleted_at is not None}
        for f in await linhas(FaturaCartao)
    ]
    e["lancamentos"] = [
        {"id": str(x.id), "empresa": emp(x.empresa_id), "fatura_id": str(x.fatura_id), "data_compra": _instante(x, "data_compra"),
         "descricao": x.descricao, "valor": _din2(_ATRIBUIDOS.get((str(x.id), "valor"), x.valor)), "conta_id": _id(x.conta_id), "parcela_atual": x.parcela_atual,
         "parcela_total": x.parcela_total, "apagado": x.deleted_at is not None}
        for x in await linhas(LancamentoCartao)
    ]
    e["distribuicoes"] = [
        {"id": str(d.id), "empresa": emp(d.empresa_id), "fatura_id": str(d.fatura_id), "versao": d.versao, "distribuicoes": d.distribuicoes,
         "aplicacao": d.aplicacao}
        for d in await linhas(FaturaDistribuicao)
    ]
    docs = (await db.execute(
        select(FaturaDocumento.id, FaturaDocumento.empresa_id, FaturaDocumento.fatura_id, FaturaDocumento.nome, FaturaDocumento.hash_arquivo,
               func.length(FaturaDocumento.conteudo), FaturaDocumento.status, FaturaDocumento.resultado, FaturaDocumento.erro,
               FaturaDocumento.updated_at)
        .order_by(FaturaDocumento.created_at, FaturaDocumento.id)
    )).all()
    e["documentos"] = [
        {"id": str(i), "empresa": emp(em), "fatura_id": str(f), "nome": n, "hash_arquivo": h, "tamanho": t, "status": s, "resultado": r,
         "erro": er, "ha_segundos": max(0, int((agora - (u.replace(tzinfo=UTC) if u.tzinfo is None else u)).total_seconds()))}
        for i, em, f, n, h, t, s, r, er, u in docs
    ]
    return e


_TABELAS = ("cartoes", "faturas", "lancamentos", "distribuicoes", "documentos", "transacoes", "registros", "contas", "agencias")


def _mudancas(antes: dict, depois: dict) -> dict:
    """As linhas que nasceram ou mudaram (`ha_segundos` não conta)."""
    saida = {}
    for t in _TABELAS:
        velhas = {r["id"]: {k: v for k, v in r.items() if k != "ha_segundos"} for r in antes.get(t, [])}
        lista = []
        for r in depois.get(t, []):
            sem = {k: v for k, v in r.items() if k != "ha_segundos"}
            if velhas.get(r["id"]) != sem:
                lista.append(sem)
        if lista:
            saida[t] = lista
    return saida


def _normalizar(saida, entrada: dict):
    """Troca os uuid4 que não estão na entrada por "<novoN>" e o usuário e o tenant por marcas fixas."""
    conhecidos = set(_UUID.findall(json.dumps(entrada)))
    novos: dict[str, str] = {}

    def troca(m):
        u = m.group(0)
        if u in conhecidos or u[14] != "4":
            return u
        if u not in novos:
            novos[u] = f"<novo{len(novos) + 1}>"
        return novos[u]

    def andar(v):
        if isinstance(v, str):
            return _UUID.sub(troca, v)
        if isinstance(v, list):
            return [andar(x) for x in v]
        if isinstance(v, dict):
            return {andar(k): andar(x) for k, x in v.items()}
        return v

    return andar(saida)


def _sem_hash_novo(tipo: str, saida: dict) -> dict:
    """Em `aplicar` e `desfazer` o NEO grava partidas com ids aleatórios, e o hash da classificação muda a cada
    execução: fica a marca "<hash>", e `hash_confere` diz se a aplicação gravada guarda o hash da vista."""
    if tipo not in ("aplicar", "desfazer") or "resposta" not in saida:
        return saida
    saida = json.loads(json.dumps(saida))
    vista = saida["resposta"]["classificacao_hash"]
    saida["resposta"]["classificacao_hash"] = "<hash>"
    for d in saida["mudou"].get("distribuicoes", []):
        if d.get("aplicacao"):
            saida["hash_confere"] = d["aplicacao"]["hash"] == vista
            d["aplicacao"]["hash"] = "<hash>"
    return saida


def _cartao(r) -> dict:
    return {"id": str(r.id), "nome": r.nome, "bandeira": r.bandeira, "ultimos_digitos": r.ultimos_digitos, "dia_fechamento": r.dia_fechamento,
            "dia_vencimento": r.dia_vencimento, "limite": _din(r.limite), "ativo": r.ativo, "total_faturas": r.total_faturas,
            "fatura_aberta_valor": _din(r.fatura_aberta_valor)}


def _fatura(r) -> dict:
    return {"id": str(r.id), "cartao_id": str(r.cartao_id), "cartao_nome": r.cartao_nome, "cartao_bandeira": r.cartao_bandeira,
            "cartao_digitos": r.cartao_digitos, "competencia": r.competencia, "data_fechamento": _utc(r.data_fechamento),
            "data_vencimento": _utc(r.data_vencimento), "valor_total": _din(r.valor_total), "status": r.status,
            "transacao_id": _id(r.transacao_id), "observacao": r.observacao, "total_lancamentos": r.total_lancamentos}


def _lanc(r) -> dict:
    return {"id": str(r.id), "fatura_id": str(r.fatura_id), "data_compra": _utc(r.data_compra), "descricao": r.descricao, "valor": _din(r.valor),
            "conta_id": _id(r.conta_id), "parcela_atual": r.parcela_atual, "parcela_total": r.parcela_total}


def _resposta(tipo: str, r):
    if tipo == "listar_cartoes":
        return {"total": r.total, "itens": [_cartao(c) for c in r.items]}
    if tipo in ("criar_cartao", "atualizar_cartao"):
        return _cartao(r)
    if tipo == "listar_faturas":
        return {"total": r.total, "itens": [_fatura(f) for f in r.items]}
    if tipo in ("criar_fatura", "atualizar_fatura", "associar_transacao", "desassociar_transacao"):
        return _fatura(r)
    if tipo == "listar_lancamentos":
        return {"total": r.total, "valor_total": _din(r.valor_total), "itens": [_lanc(x) for x in r.items]}
    if tipo == "adicionar_lancamento":
        return _lanc(r)
    if tipo in ("importar_csv", "importar_lancamentos_pdf"):
        return {"importados": r.importados, "duplicados": r.duplicados, "erros": list(r.erros)}
    if tipo in ("remover_cartao", "remover_lancamento", "processar"):
        return None
    if tipo in ("adicionar_documento", "documento"):
        return {"id": str(r.id), "nome": r.nome, "status": r.status, "hash_arquivo": r.hash_arquivo}
    # obter, salvar, aplicar, desfazer, confirmar_documento: o dicionário de `obter`.
    return r


def _erro(exc) -> dict:
    return {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message}}


def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


def _sanitizar(v):
    if isinstance(v, str):
        return v if _UUID.fullmatch(v) or re.fullmatch(r"[0-9a-f]{64}", v) else sanitizar_texto(v)
    if isinstance(v, dict):
        return {_sanitizar(k) if isinstance(k, str) else k: _sanitizar(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_sanitizar(x) for x in v]
    return v


# ─── O banco montado com a entrada ──────────────────────────────────────────

_ENGINE: dict = {}


async def _engine():
    if "e" not in _ENGINE:
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        engine = create_async_engine("sqlite+aiosqlite:///:memory:", query_cache_size=0)
        registrar_funcoes_sqlite(engine)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _ENGINE["e"] = engine
    return _ENGINE["e"]


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v).astimezone(UTC) if v else None


def _bytes_do_documento(d: dict) -> bytes:
    if d.get("b64") is not None:
        return base64.b64decode(d["b64"])
    inicio = b"%PDF" if d.get("pdf", True) else b"XXXX"
    return (inicio + b"\0" * max(0, d["tamanho"] - 4))[: d["tamanho"]]


async def _montar(db, e: dict) -> uuid.UUID:
    from src.db.models import (
        AgenciaBancaria, CartaoCredito, Empresa, FaturaCartao, FaturaDistribuicao, FaturaDocumento, LancamentoCartao, PlanoConta,
        RegistroContabil, Tenant, Transacao, Usuario,
    )

    base = datetime(2026, 1, 1, tzinfo=UTC)
    ordem = itertools.count(1)

    def quando():
        return base + timedelta(minutes=next(ordem))

    apagado = datetime(2026, 3, 9, tzinfo=UTC)
    db.add(Tenant(id=TENANT_ID, nome="Escritório do gabarito", cnpj="00.000.000/0001-00"))
    await db.flush()
    db.add(Usuario(id=USUARIO_ID, tenant_id=TENANT_ID, email="gabarito@exemplo.com", nome="Gabarito", senha_hash="x" * 60, role="admin"))
    empresa = e.get("empresa", {"ativa": True})
    if empresa is not None:
        db.add(Empresa(id=EMPRESA_ID, tenant_id=TENANT_ID, razao_social="EMPRESA EXEMPLO LTDA", cnpj="12.345.678/0001-95",
                       regime_tributario="simples_nacional", ativa=empresa.get("ativa", True)))
    db.add(Empresa(id=OUTRA_ID, tenant_id=TENANT_ID, razao_social="OUTRA EMPRESA", cnpj="99.999.999/0001-91", regime_tributario="simples_nacional"))
    await db.flush()

    def eid(x):
        return OUTRA_ID if x.get("empresa") == "outra" else EMPRESA_ID

    db.add_all([
        AgenciaBancaria(id=AGENCIA_ID, empresa_id=EMPRESA_ID if empresa is not None else OUTRA_ID, banco_sigla="ITAU", agencia="1234", numero="56789", ativa=True),
        AgenciaBancaria(id=AGENCIA_OUTRA, empresa_id=OUTRA_ID, banco_sigla="ITAU", agencia="1234", numero="99999", ativa=True),
    ])
    for c in e.get("contas", []):
        db.add(PlanoConta(id=uuid.UUID(c["id"]), empresa_id=eid(c), codigo=c["codigo"], descricao=f"Conta {c['codigo']}", tipo="despesa",
                          tipo_sa=c["tipo_sa"], created_at=quando(), deleted_at=apagado if c["apagada"] else None))
    await db.flush()
    for a in e.get("agencias", []):
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=eid(a), banco_sigla="BB", agencia="0001", numero=a["id"][-12:], ativa=True,
                               conta_contabil_id=uuid.UUID(a["conta_contabil_id"]) if a.get("conta_contabil_id") else None,
                               created_at=quando(), deleted_at=apagado if a.get("apagada") else None))
    await db.flush()
    for t in e.get("transacoes", []):
        db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=eid(t), agencia_id=uuid.UUID(t["agencia_id"]), data=date.fromisoformat(t["data"]),
                         valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"], status=t["status"], hash_dedup=t["id"].replace("-", "") * 2,
                         created_at=quando(), deleted_at=apagado if t["apagada"] else None))
    await db.flush()
    for r in e.get("registros", []):
        db.add(RegistroContabil(
            id=uuid.UUID(r["id"]), empresa_id=eid(r), transacao_id=uuid.UUID(r["transacao_id"]) if r["transacao_id"] else None,
            lancamento_id=uuid.UUID(r["lancamento_id"]), ordem_composicao=r["ordem_composicao"], conta_id=uuid.UUID(r["conta_id"]),
            agencia_id=uuid.UUID(r["agencia_id"]), descricao=r["descricao"], historico=r["historico"], historico_extrato=r["historico"],
            dc=r["dc"], tipo_regra=r["tipo_regra"], valor=Decimal(r["valor"]), data_lancamento=_dt(r["data_lancamento"]),
            created_at=quando(), deleted_at=apagado if r["apagado"] else None,
        ))
    await db.flush()
    for c in e.get("cartoes", []):
        db.add(CartaoCredito(id=uuid.UUID(c["id"]), empresa_id=eid(c), nome=c["nome"], bandeira=c["bandeira"], ultimos_digitos=c["ultimos_digitos"],
                             dia_fechamento=c["dia_fechamento"], dia_vencimento=c["dia_vencimento"],
                             limite=Decimal(c["limite"]) if c["limite"] is not None else None, ativo=c["ativo"],
                             created_at=quando(), deleted_at=apagado if c["apagado"] else None))
    await db.flush()
    for f in e.get("faturas", []):
        db.add(FaturaCartao(id=uuid.UUID(f["id"]), empresa_id=eid(f), cartao_id=uuid.UUID(f["cartao_id"]), competencia=f["competencia"],
                            data_fechamento=_dt(f["data_fechamento"]), data_vencimento=_dt(f["data_vencimento"]),
                            valor_total=Decimal(f["valor_total"]), status=f["status"],
                            transacao_id=uuid.UUID(f["transacao_id"]) if f["transacao_id"] else None, observacao=f["observacao"],
                            created_at=quando(), deleted_at=apagado if f["apagada"] else None))
    await db.flush()
    for x in e.get("lancamentos", []):
        db.add(LancamentoCartao(id=uuid.UUID(x["id"]), empresa_id=eid(x), fatura_id=uuid.UUID(x["fatura_id"]), data_compra=_dt(x["data_compra"]),
                                descricao=x["descricao"], valor=Decimal(x["valor"]), conta_id=uuid.UUID(x["conta_id"]) if x["conta_id"] else None,
                                parcela_atual=x["parcela_atual"], parcela_total=x["parcela_total"],
                                created_at=quando(), deleted_at=apagado if x["apagado"] else None))
    await db.flush()
    for d in e.get("distribuicoes", []):
        db.add(FaturaDistribuicao(id=uuid.UUID(d["id"]), empresa_id=eid(d), fatura_id=uuid.UUID(d["fatura_id"]), versao=d["versao"],
                                  distribuicoes=d["distribuicoes"], aplicacao=d["aplicacao"], created_at=quando()))
    await db.flush()
    agora = datetime.now(UTC)
    for d in e.get("documentos", []):
        conteudo = _bytes_do_documento({"tamanho": d["tamanho"], "pdf": True})
        db.add(FaturaDocumento(id=uuid.UUID(d["id"]), empresa_id=eid(d), fatura_id=uuid.UUID(d["fatura_id"]), nome=d["nome"],
                               hash_arquivo=d["hash_arquivo"], conteudo=conteudo, status=d["status"], resultado=d["resultado"], erro=d["erro"],
                               created_at=quando(), updated_at=agora - timedelta(seconds=d["ha_segundos"])))
    await db.flush()
    return EMPRESA_ID if empresa is not None else SEM_EMPRESA


# ─── Execução de uma chamada ────────────────────────────────────────────────

_PEDIDOS_AO_NEO: list = []


def _instalar_espioes() -> None:
    """Grava o que a distribuição pede ao NEO (os componentes, o lote, o cancelamento)."""
    from src.domain.cartoes import distribuicao as D
    from src.domain.neo import cancelamento as C
    from src.domain.neo import engine as E

    if getattr(D, "__gabarito_espioes__", False):
        return
    D.__gabarito_espioes__ = True
    alterar = D.alterar_composicao

    async def alterar_espiao(db, **kw):
        _PEDIDOS_AO_NEO.append({"alterar_composicao": [{"conta_id": str(c.conta_id), "valor": str(c.valor), "historico": c.historico}
                                                       for c in kw["componentes"]], "motivo": kw["motivo"]})
        return await alterar(db, **kw)

    D.alterar_composicao = alterar_espiao
    lote = E.NeoEngine.classificar_manualmente_lote

    async def lote_espiao(self, transacoes, conta_id, descricao, **kw):
        r = await lote(self, transacoes, conta_id, descricao, **kw)
        _PEDIDOS_AO_NEO.append({"classificar_lote": {"conta_id": str(conta_id), "descricao": descricao,
                                                     "bloqueadas": [b.motivo for b in r.bloqueadas]}})
        return r

    E.NeoEngine.classificar_manualmente_lote = lote_espiao
    cancelar = C.cancelar_lancamento

    async def cancelar_espiao(db, **kw):
        _PEDIDOS_AO_NEO.append({"cancelar_lancamento": {"lancamento_id": str(kw["lancamento_id"]), "motivo": kw["motivo"]}})
        return await cancelar(db, **kw)

    C.cancelar_lancamento = cancelar_espiao


def _leitura_simulada(leitura: dict):
    from src.core.errors import ValidationError

    def ler(_conteudo, _competencia):
        if "resultado" in leitura:
            return leitura["resultado"]
        if "recusa" in leitura:
            raise ValidationError(message=leitura["recusa"])
        raise RuntimeError("falha simulada")

    return ler


async def _chamar(db, tipo: str, a: dict, empresa_id):
    from src.domain.cartoes import distribuicao as D
    from src.domain.cartoes import service as S
    from src.domain.cartoes.pdf_parser import LancamentoPDF
    from src.domain.jobs import JobRuntime
    from src.schemas import cartoes as K

    svc = S.CartaoService(db, empresa_id)
    dist = D.DistribuicaoService(db, empresa_id, TENANT_ID, USUARIO_ID)
    u = uuid.UUID
    if tipo == "listar_cartoes":
        return await svc.listar_cartoes()
    if tipo == "criar_cartao":
        return await svc.criar_cartao(K.CartaoCreate.model_validate(a["dados"]))
    if tipo == "atualizar_cartao":
        return await svc.atualizar_cartao(u(a["cartao_id"]), K.CartaoUpdate.model_validate(a["dados"]))
    if tipo == "remover_cartao":
        return await svc.remover_cartao(u(a["cartao_id"]))
    if tipo == "listar_faturas":
        return await svc.listar_faturas(u(a["cartao_id"]))
    if tipo == "criar_fatura":
        return await svc.criar_fatura(u(a["cartao_id"]), K.FaturaCreate.model_validate(a["dados"]))
    if tipo == "atualizar_fatura":
        return await svc.atualizar_fatura(u(a["cartao_id"]), u(a["fatura_id"]), K.FaturaUpdate.model_validate(a["dados"]))
    if tipo == "associar_transacao":
        return await svc.associar_transacao(u(a["cartao_id"]), u(a["fatura_id"]), K.AssociarTransacaoFaturaRequest(transacao_id=a["transacao_id"]))
    if tipo == "desassociar_transacao":
        return await svc.desassociar_transacao(u(a["cartao_id"]), u(a["fatura_id"]))
    if tipo == "listar_lancamentos":
        return await svc.listar_lancamentos(u(a["cartao_id"]), u(a["fatura_id"]))
    if tipo == "adicionar_lancamento":
        return await svc.adicionar_lancamento(u(a["cartao_id"]), u(a["fatura_id"]), K.LancamentoCreate.model_validate(a["dados"]))
    if tipo == "importar_csv":
        conteudo = base64.b64decode(a["conteudo_b64"]) if "conteudo_b64" in a else a["conteudo"].encode("utf-8")
        return await svc.importar_csv(u(a["cartao_id"]), u(a["fatura_id"]), conteudo)
    if tipo == "importar_lancamentos_pdf":
        lidos = [LancamentoPDF(data_compra=datetime.fromisoformat(x["data_compra"]).replace(tzinfo=UTC), descricao=x["descricao"],
                               valor=Decimal(x["valor"]), parcela_atual=x["parcela_atual"], parcela_total=x["parcela_total"]) for x in a["lancamentos"]]
        return await svc.importar_lancamentos_pdf(u(a["cartao_id"]), u(a["fatura_id"]), lidos)
    if tipo == "remover_lancamento":
        return await svc.remover_lancamento(u(a["cartao_id"]), u(a["fatura_id"]), u(a["lancamento_id"]))
    if tipo == "obter":
        return await dist.obter(u(a["cartao_id"]), u(a["fatura_id"]))
    if tipo == "salvar":
        return await dist.salvar(u(a["cartao_id"]), u(a["fatura_id"]), a["versao"], a["distribuicoes"])
    if tipo == "aplicar":
        return await dist.aplicar(u(a["cartao_id"]), u(a["fatura_id"]), a["versao"], a["classificacao_hash"], a["motivo"])
    if tipo == "desfazer":
        return await dist.desfazer(u(a["cartao_id"]), u(a["fatura_id"]), a["versao"], a["motivo"], a["preservar_atual"])
    if tipo == "adicionar_documento":
        return await dist.adicionar_documento(u(a["cartao_id"]), u(a["fatura_id"]), _bytes_do_documento(a["arquivo"]), a["nome"])
    if tipo == "confirmar_documento":
        return await dist.confirmar_documento(u(a["cartao_id"]), u(a["fatura_id"]), u(a["documento_id"]), K.FaturaDocumentoConfirmar.model_validate(a["dados"]))
    if tipo == "documento":
        return await dist.documento(u(a["cartao_id"]), u(a["fatura_id"]), u(a["documento_id"]))
    if tipo == "processar":
        from src.domain.cartoes import documentos as DOC

        @asynccontextmanager
        async def escopo():
            yield db

        original = DOC.ler_documento
        DOC.ler_documento = _leitura_simulada(a["leitura"])
        try:
            return await D.processar_documento(u(a["documento_id"]), JobRuntime(session_scope=escopo, commit=False))
        finally:
            DOC.ler_documento = original
    raise AssertionError(tipo)


def _limites_do_banco(depois: dict) -> str | None:
    """O que o PostgreSQL recusaria e o SQLite aceitou (texto mais longo, valor acima de `Numeric(15,2)`)."""
    limites = {"cartoes": {"nome": 200}, "faturas": {"observacao": 500, "competencia": 7}, "lancamentos": {"descricao": 500},
               "documentos": {"nome": 255}}
    for t, campos in limites.items():
        for r in depois.get(t, []):
            for campo, n in campos.items():
                if isinstance(r.get(campo), str) and len(r[campo]) > n:
                    return f"{t}.{campo}"
    for t, campos in {"cartoes": ("limite",), "lancamentos": ("valor",)}.items():
        for r in depois.get(t, []):
            for campo in campos:
                if r.get(campo) is not None and abs(Decimal(r[campo])) >= Decimal("1E13"):
                    return f"{t}.{campo}"
    return None


async def _executar(db, tipo: str, e: dict) -> dict:
    from pydantic import ValidationError as ErroPydantic
    from sqlalchemy.exc import IntegrityError

    from src.core.errors import AppError

    empresa_id = await _montar(db, e["estado"])
    antes = await _estado(db, EMPRESA_ID)
    _PEDIDOS_AO_NEO.clear()
    try:
        r = await _chamar(db, tipo, e["args"], empresa_id)
        await db.flush()
    except AppError as exc:
        return {**_erro(exc), **({"neo": list(_PEDIDOS_AO_NEO)} if _PEDIDOS_AO_NEO else {})}
    except IntegrityError:
        return {"erro_do_banco": "integridade"}
    except ErroPydantic as exc:
        e0 = exc.errors()[0]
        return {"pydantic": {"type": e0["type"], "loc": [str(x) for x in e0["loc"]], "msg": e0["msg"]}}
    except Exception as exc:  # noqa: BLE001
        # A exceção crua que o original deixava escapar (erro 500 na rota).
        return {"erro_500": type(exc).__name__}
    depois = await _estado(db, EMPRESA_ID)
    mudou = _mudancas(antes, depois)
    saida = {"resposta": _resposta(tipo, r), "mudou": mudou}
    if _PEDIDOS_AO_NEO:
        saida["neo"] = list(_PEDIDOS_AO_NEO)
    banco = _limites_do_banco(mudou)
    if banco:
        saida = {"erro_do_banco": banco}
    elif empresa_id == SEM_EMPRESA and mudou:
        saida = {"erro_do_banco": "empresa"}
    return saida


async def _rodar(tipo: str, e: dict) -> dict:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = await _engine()
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    _ATRIBUIDOS.clear()
    async with factory() as db:
        _EM["montado"] = True
        try:
            saida = await _executar(db, tipo, e)
        finally:
            _EM["montado"] = False
            await db.rollback()
    return _normalizar(_sem_hash_novo(tipo, saida), e)


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

def _dump(modelo) -> dict:
    return modelo.model_dump(mode="json")


def _args_de(tipo: str, args: tuple, kw: dict) -> dict:
    s = str
    if tipo in ("listar_cartoes",):
        return {}
    if tipo == "criar_cartao":
        return {"dados": _dump(args[0])}
    if tipo == "atualizar_cartao":
        return {"cartao_id": s(args[0]), "dados": _dump(args[1])}
    if tipo in ("remover_cartao", "listar_faturas"):
        return {"cartao_id": s(args[0])}
    if tipo == "criar_fatura":
        return {"cartao_id": s(args[0]), "dados": _dump(args[1])}
    if tipo == "atualizar_fatura":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "dados": _dump(args[2])}
    if tipo == "associar_transacao":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "transacao_id": s(args[2].transacao_id)}
    if tipo in ("desassociar_transacao", "listar_lancamentos", "obter"):
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1])}
    if tipo == "adicionar_lancamento":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "dados": _dump(args[2])}
    if tipo == "importar_csv":
        try:
            return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "conteudo": args[2].decode("utf-8")}
        except UnicodeDecodeError:
            return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "conteudo_b64": base64.b64encode(args[2]).decode()}
    if tipo == "importar_lancamentos_pdf":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "lancamentos": [
            {"data_compra": x.data_compra.astimezone(UTC).date().isoformat(), "descricao": x.descricao, "valor": str(x.valor),
             "parcela_atual": x.parcela_atual, "parcela_total": x.parcela_total} for x in args[2]]}
    if tipo == "remover_lancamento":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "lancamento_id": s(args[2])}
    if tipo == "salvar":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "versao": args[2], "distribuicoes": args[3]}
    if tipo == "aplicar":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "versao": args[2], "classificacao_hash": args[3], "motivo": args[4]}
    if tipo == "desfazer":
        preservar = args[4] if len(args) > 4 else kw.get("preservar_atual", False)
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "versao": args[2], "motivo": args[3], "preservar_atual": preservar}
    if tipo == "adicionar_documento":
        conteudo = args[2]
        arquivo = {"tamanho": len(conteudo), "pdf": conteudo.startswith(b"%PDF")}
        if len(conteudo) <= 4096:
            arquivo["b64"] = base64.b64encode(conteudo).decode()
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "arquivo": arquivo, "nome": args[3]}
    if tipo == "confirmar_documento":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "documento_id": s(args[2]), "dados": _dump(args[3])}
    if tipo == "documento":
        return {"cartao_id": s(args[0]), "fatura_id": s(args[1]), "documento_id": s(args[2])}
    raise AssertionError(tipo)


_MARCAS: dict[str, str] = {}


def _marcar(v):
    """Troca o tenant e o usuário da suíte pelos do banco montado (a revisão grava `revisado_por`)."""
    if isinstance(v, str):
        for real, marca in _MARCAS.items():
            v = v.replace(real, marca)
        return v
    if isinstance(v, list):
        return [_marcar(x) for x in v]
    if isinstance(v, dict):
        return {_marcar(k): _marcar(x) for k, x in v.items()}
    return v


_LEITURAS_DA_SUITE: dict[str, dict] = {}


def pytest_configure(config):  # noqa: ARG001
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    from src.core.errors import AppError
    from src.domain.cartoes import distribuicao as D
    from src.domain.cartoes import service as S

    if getattr(S, "__gabarito__", False):
        return
    S.__gabarito__ = True
    _ORIGINAL["S"] = S
    event.listen(Session, "after_flush", _anotar)
    _instalar_espioes()

    def gravar(classe, nome: str, tipo: str):
        original = getattr(classe, nome)

        async def f(self, *args, **kw):
            if _EM["montado"] or _EM["dentro"]:
                return await original(self, *args, **kw)
            _EM["dentro"] = True
            db = getattr(self, "_db", None) or self.db
            empresa_id = getattr(self, "_empresa_id", None) or self.empresa_id
            if hasattr(self, "usuario_id") and self.usuario_id:
                _MARCAS[str(self.usuario_id)] = str(USUARIO_ID)
            try:
                from src.db.models import Empresa

                emp = await db.get(Empresa, empresa_id)
                estado = await _estado(db, empresa_id)
                estado["empresa"] = {"ativa": emp.ativa} if emp else None
                entrada = {"estado": estado, "args": _args_de(tipo, args, kw)}
                _PEDIDOS_AO_NEO.clear()
                try:
                    r, exc = await original(self, *args, **kw), None
                except AppError as e:
                    r, exc = None, e
                if exc is not None:
                    saida = {**_erro(exc), **({"neo": list(_PEDIDOS_AO_NEO)} if _PEDIDOS_AO_NEO else {})}
                else:
                    await db.flush()
                    depois = await _estado(db, empresa_id)
                    saida = {"resposta": _resposta(tipo, r), "mudou": _mudancas(estado, depois)}
                    if _PEDIDOS_AO_NEO:
                        saida["neo"] = list(_PEDIDOS_AO_NEO)
                    banco = _limites_do_banco(saida["mudou"])
                    if banco:
                        saida = {"erro_do_banco": banco}
                _DA_SUITE.append((tipo, _marcar(entrada), _normalizar(_sem_hash_novo(tipo, _marcar(saida)), _marcar(entrada))))
            finally:
                _EM["dentro"] = False
            if exc is not None:
                raise exc
            return r

        setattr(classe, nome, f)

    for nome in ("listar_cartoes", "criar_cartao", "atualizar_cartao", "remover_cartao", "listar_faturas", "criar_fatura", "atualizar_fatura",
                 "associar_transacao", "desassociar_transacao", "listar_lancamentos", "adicionar_lancamento", "importar_csv",
                 "importar_lancamentos_pdf", "remover_lancamento"):
        gravar(S.CartaoService, nome, nome)
    for nome in ("obter", "salvar", "aplicar", "desfazer", "adicionar_documento", "confirmar_documento", "documento"):
        gravar(D.DistribuicaoService, nome, nome)

    # `processar_documento`: a leitura da suíte (simulada nela) é gravada como a resposta da leitura.
    processar = D.processar_documento

    async def processar_gravado(documento_id, runtime):
        if _EM["montado"] or _EM["dentro"]:
            return await processar(documento_id, runtime)
        from src.domain.cartoes import documentos as DOC

        ler = DOC.ler_documento
        leitura: dict = {}

        def espiao(conteudo, competencia):
            try:
                r = ler(conteudo, competencia)
            except Exception as exc:  # noqa: BLE001
                from src.core.errors import ValidationError

                leitura.update({"recusa": exc.message} if isinstance(exc, ValidationError) else {"falha": True})
                raise
            leitura["resultado"] = r
            return r

        async with runtime.session_scope() as db:
            from src.db.models import FaturaDocumento

            doc = await db.get(FaturaDocumento, documento_id)
            empresa_id = doc.empresa_id
            from src.db.models import Empresa

            emp = await db.get(Empresa, empresa_id)
            estado = await _estado(db, empresa_id)
            estado["empresa"] = {"ativa": emp.ativa} if emp else None
        DOC.ler_documento = espiao
        _EM["dentro"] = True
        try:
            await processar(documento_id, runtime)
        finally:
            DOC.ler_documento = ler
            _EM["dentro"] = False
        async with runtime.session_scope() as db:
            depois = await _estado(db, empresa_id)
        entrada = {"estado": estado, "args": {"documento_id": str(documento_id), "leitura": leitura or {"nao_lida": True}}}
        _DA_SUITE.append(("processar", _marcar(entrada), _normalizar(_marcar({"resposta": None, "mudou": _mudancas(estado, depois)}), _marcar(entrada))))

    D.processar_documento = processar_gravado
    from src.api.v1 import cartoes as rota

    rota.processar_documento = processar_gravado


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=_A | (prefixo << 96) | (0x4 << 76) | next(_IDS)))


def _uid_fixo(prefixo: int) -> str:
    """Um id que o `_normalizar` não troca (a versão não é 4)."""
    return str(uuid.UUID(int=_A | (prefixo << 96) | (0x1 << 76) | next(_IDS)))


def _conta(codigo: str, **sobre) -> dict:
    return {"id": _uid_fixo(0xC0), "empresa": "esta", "codigo": codigo, "tipo_sa": "A", "apagada": False, **sobre}


def _cartao_linha(**sobre) -> dict:
    return {"id": _uid_fixo(0xCA), "empresa": "esta", "nome": "CARTAO CORPORATIVO", "bandeira": "visa", "ultimos_digitos": "4321",
            "dia_fechamento": 20, "dia_vencimento": 28, "limite": "50000.00", "ativo": True, "apagado": False, **sobre}


def _fatura_linha(cartao: dict, **sobre) -> dict:
    return {"id": _uid_fixo(0xFA), "empresa": cartao["empresa"], "cartao_id": cartao["id"], "competencia": "2026-03", "data_fechamento": None,
            "data_vencimento": None, "valor_total": "0.00", "status": "aberta", "transacao_id": None, "observacao": None, "apagada": False, **sobre}


def _lanc_linha(fatura: dict, valor: str, **sobre) -> dict:
    return {"id": _uid_fixo(0x1A), "empresa": fatura["empresa"], "fatura_id": fatura["id"], "data_compra": "2026-03-05T00:00:00+00:00",
            "descricao": f"COMPRA {valor}", "valor": valor, "conta_id": None, "parcela_atual": None, "parcela_total": None, "apagado": False, **sobre}


def _transacao_linha(valor: str, **sobre) -> dict:
    return {"id": _uid_fixo(0x7A), "empresa": "esta", "agencia_id": str(AGENCIA_ID), "data": "2026-04-10", "valor": valor, "dc": "D",
            "status": "pendente", "historico": "PAGAMENTO FATURA", "apagada": False, **sobre}


def _registros_classificados(t: dict, partes: list[tuple[str, str, str]], banco: str) -> list[dict]:
    """Os pares vivos de uma transação classificada: (conta, valor, histórico) por componente."""
    saida = []
    for ordem, (conta, valor, hist) in enumerate(partes, start=1):
        lanc = _uid_fixo(0x1C)
        comum = {"empresa": "esta", "transacao_id": t["id"], "lancamento_id": lanc, "ordem_composicao": ordem if len(partes) > 1 else None,
                 "agencia_id": t["agencia_id"], "valor": valor, "tipo_regra": "manual", "data_lancamento": f"{t['data']}T00:00:00+00:00", "apagado": False}
        oposto = "C" if t["dc"] == "D" else "D"
        saida.append({"id": _uid_fixo(0x2E), **comum, "conta_id": conta, "historico": hist, "descricao": hist, "dc": t["dc"]})
        saida.append({"id": _uid_fixo(0x2E), **comum, "conta_id": banco, "historico": hist, "descricao": f"Contrapartida bancária: {hist}", "dc": oposto})
    return saida


def _estado_vazio(**sobre) -> dict:
    e = {"empresa": {"ativa": True}, "agencias": [], "contas": [], "transacoes": [], "registros": [], "cartoes": [], "faturas": [],
         "lancamentos": [], "distribuicoes": [], "documentos": []}
    e.update(sobre)
    return e


def casos_cartoes(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    c1 = _cartao_linha(nome="CARTAO B")
    c2 = _cartao_linha(nome="CARTAO A", limite=None, ultimos_digitos=None)
    c3 = _cartao_linha(nome="CARTAO C", apagado=True)
    c4 = _cartao_linha(nome="CARTAO D", empresa="outra")
    f = [
        _fatura_linha(c1, competencia="2026-01", status="paga"),
        _fatura_linha(c1, competencia="2026-03", status="aberta"),
        _fatura_linha(c1, competencia="2026-02", status="aberta"),
        _fatura_linha(c1, competencia="2026-04", status="fechada"),
        _fatura_linha(c1, competencia="2026-05", status="aberta", apagada=True),
        _fatura_linha(c2, competencia="2026-03", status="fechada"),
        _fatura_linha(c4, competencia="2026-03"),
    ]
    lancs = [_lanc_linha(f[1], "10.50"), _lanc_linha(f[1], "0.25"), _lanc_linha(f[1], "99.00", apagado=True), _lanc_linha(f[2], "7.00"),
             _lanc_linha(f[5], "3.33"), _lanc_linha(f[0], "100.00")]
    estado = _estado_vazio(cartoes=[c1, c2, c3, c4], faturas=f, lancamentos=lancs)
    saida.append(("listar_cartoes", {"estado": estado, "args": {}}))
    saida.append(("listar_cartoes", {"estado": _estado_vazio(cartoes=[c3, c4]), "args": {}}))
    saida.append(("listar_cartoes", {"estado": _estado_vazio(cartoes=[c2]), "args": {}}))
    for cartao in (c1, c2, c3, c4):
        saida.append(("listar_faturas", {"estado": estado, "args": {"cartao_id": cartao["id"]}}))
        saida.append(("remover_cartao", {"estado": estado, "args": {"cartao_id": cartao["id"]}}))
    saida.append(("listar_faturas", {"estado": estado, "args": {"cartao_id": _uid_fixo(0xBAD)}}))
    # remover: só faturas pagas; com distribuição aplicada; sem faturas.
    c5 = _cartao_linha(nome="CARTAO E")
    paga = _fatura_linha(c5, status="paga")
    dist = {"id": _uid_fixo(0xD1), "empresa": "esta", "fatura_id": paga["id"], "versao": 2, "distribuicoes": {},
            "aplicacao": {"antes": None, "transacao_id": _uid_fixo(0x7A), "hash": "0" * 64}}
    saida.append(("remover_cartao", {"estado": _estado_vazio(cartoes=[c5], faturas=[paga]), "args": {"cartao_id": c5["id"]}}))
    saida.append(("remover_cartao", {"estado": _estado_vazio(cartoes=[c5], faturas=[paga], distribuicoes=[dist]), "args": {"cartao_id": c5["id"]}}))
    saida.append(("remover_cartao", {"estado": _estado_vazio(cartoes=[c5], faturas=[paga], distribuicoes=[{**dist, "aplicacao": None}]),
                                     "args": {"cartao_id": c5["id"]}}))
    saida.append(("remover_cartao", {"estado": _estado_vazio(cartoes=[c5]), "args": {"cartao_id": c5["id"]}}))
    # criar
    for dados in (
        {"nome": "CARTAO NOVO", "bandeira": "visa", "ultimos_digitos": "1234", "dia_fechamento": 1, "dia_vencimento": 28, "limite": "1000"},
        {"nome": "CARTAO NOVO", "bandeira": " MasterCard ", "ultimos_digitos": None, "dia_fechamento": 28, "dia_vencimento": 1, "limite": None},
        {"nome": "Cartão Ácido", "bandeira": "elo", "dia_fechamento": 10, "dia_vencimento": 15, "limite": "0"},
        {"nome": "XX", "bandeira": "outros", "ultimos_digitos": " 0001 ", "dia_fechamento": 10, "dia_vencimento": 15, "limite": "123.456"},
        {"nome": "N" * 200, "bandeira": "amex", "dia_fechamento": "5", "dia_vencimento": 5, "limite": "1e3"},
        {"nome": "LIMITE ALTO", "bandeira": "hipercard", "dia_fechamento": 5, "dia_vencimento": 5, "limite": "99999999999999.99"},
    ):
        saida.append(("criar_cartao", {"estado": _estado_vazio(cartoes=[c1]), "args": {"dados": dados}}))
    saida.append(("criar_cartao", {"estado": _estado_vazio(empresa=None), "args": {"dados": {"nome": "SEM EMPRESA", "bandeira": "visa",
                                                                                              "dia_fechamento": 1, "dia_vencimento": 2}}}))
    # atualizar
    for dados in ({}, {"nome": "NOVO NOME"}, {"dia_fechamento": 3, "dia_vencimento": 4}, {"limite": "-10"}, {"limite": "0"}, {"ativo": False},
                  {"nome": None, "limite": None, "ativo": None}, {"limite": "12.345"}):
        for alvo in (c1, c3, c4):
            if alvo is not c1 and dados:
                continue
            saida.append(("atualizar_cartao", {"estado": estado, "args": {"cartao_id": alvo["id"], "dados": dados}}))
    return saida


def casos_faturas(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    c = _cartao_linha()
    outro = _cartao_linha(nome="OUTRO CARTAO")
    da_outra = _cartao_linha(nome="DA OUTRA", empresa="outra")
    contas = [_conta("3.1.1"), _conta("3.1.2", apagada=True), _conta("3.1.3", empresa="outra"), _conta("3.1", tipo_sa="S")]
    ag = {"id": _uid_fixo(0xA0), "empresa": "esta", "conta_contabil_id": None, "apagada": False}
    trans = [
        _transacao_linha("150.00"), _transacao_linha("150.00", dc="C"), _transacao_linha("150.01"), _transacao_linha("150.00", apagada=True),
        _transacao_linha("150.00", empresa="outra", agencia_id=str(AGENCIA_OUTRA)), _transacao_linha("0.00"), _transacao_linha("150.00"),
    ]
    for status in ("aberta", "fechada", "paga"):
        for ligada in (None, trans[6]["id"]):
            fat = _fatura_linha(c, status=status, transacao_id=ligada, data_vencimento="2026-04-10T03:00:00+00:00", observacao="OBS")
            outra_fat = _fatura_linha(c, competencia="2026-02", status="paga", transacao_id=trans[0]["id"]) if rng.random() < 0.5 else None
            fatura_outro = _fatura_linha(outro, competencia="2026-03")
            lancs = [_lanc_linha(fat, "100.00"), _lanc_linha(fat, "50.00"), _lanc_linha(fat, "1.00", apagado=True)]
            faturas = [fat, fatura_outro] + ([outra_fat] if outra_fat else [])
            estado = _estado_vazio(agencias=[ag], contas=contas, transacoes=trans, cartoes=[c, outro, da_outra], faturas=faturas, lancamentos=lancs)
            base = {"cartao_id": c["id"], "fatura_id": fat["id"]}
            for dados in ({"status": None}, {"status": "aberta"}, {"status": "fechada"}, {"status": "paga"},
                          {"status": "fechada", "data_vencimento": "2026-05-01T10:00:00-03:00", "observacao": "NOVA"},
                          {"data_vencimento": "2026-05-01T00:00:00Z"}, {"observacao": ""}):
                saida.append(("atualizar_fatura", {"estado": estado, "args": {**base, "dados": dados}}))
            for t in trans + [{"id": _uid_fixo(0xBAD)}]:
                saida.append(("associar_transacao", {"estado": estado, "args": {**base, "transacao_id": t["id"]}}))
            saida.append(("desassociar_transacao", {"estado": estado, "args": base}))
            saida.append(("listar_lancamentos", {"estado": estado, "args": base}))
            for dados in ({"data_compra": "2026-03-05T00:00:00Z", "descricao": "COMPRA", "valor": "10"},
                          {"data_compra": "2026-03-05T21:00:00-03:00", "descricao": "D", "valor": 0.1, "conta_id": contas[0]["id"], "parcela_atual": 1, "parcela_total": 3},
                          {"data_compra": "2026-03-05", "descricao": "COMPRA", "valor": "10.005", "conta_id": contas[1]["id"]},
                          {"data_compra": "2026-03-05T00:00:00Z", "descricao": "COMPRA", "valor": "10", "conta_id": contas[2]["id"]},
                          {"data_compra": "2026-03-05T00:00:00Z", "descricao": "COMPRA", "valor": "10", "conta_id": contas[3]["id"]},
                          {"data_compra": "2026-03-05T00:00:00Z", "descricao": "COMPRA", "valor": "10", "conta_id": _uid_fixo(0xBAD)},
                          {"data_compra": "2026-03-05T00:00:00Z", "descricao": "X" * 500, "valor": "12345678901234.56"}):
                saida.append(("adicionar_lancamento", {"estado": estado, "args": {**base, "dados": dados}}))
            for alvo in (lancs[0], lancs[2], {"id": _uid_fixo(0xBAD)}):
                saida.append(("remover_lancamento", {"estado": estado, "args": {**base, "lancamento_id": alvo["id"]}}))
            # a fatura procurada pelo cartão errado
            saida.append(("listar_lancamentos", {"estado": estado, "args": {"cartao_id": outro["id"], "fatura_id": fat["id"]}}))
    # criar fatura
    existente = _fatura_linha(c, competencia="2026-03")
    apagada = _fatura_linha(c, competencia="2026-05", apagada=True)
    estado = _estado_vazio(cartoes=[c, da_outra, _cartao_linha(nome="APAGADO", apagado=True)], faturas=[existente, apagada])
    for comp in ("2026-03", "2026-04", " 2026-06 ", "2026-12", "0001-01"):
        for alvo in estado["cartoes"]:
            saida.append(("criar_fatura", {"estado": estado, "args": {"cartao_id": alvo["id"], "dados": {"competencia": comp}}}))
    saida.append(("criar_fatura", {"estado": estado, "args": {"cartao_id": c["id"], "dados": {
        "competencia": "2026-07", "data_fechamento": "2026-07-20T00:00:00-03:00", "data_vencimento": "2026-07-28", "observacao": "O" * 500}}}))
    saida.append(("criar_fatura", {"estado": estado, "args": {"cartao_id": c["id"], "dados": {"competencia": "2026-08", "observacao": "O" * 499}}}))
    return saida


def _csv(*linhas: str) -> str:
    return "".join(linhas)


def casos_importacao(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    c = _cartao_linha()
    fat = _fatura_linha(c)
    paga = _fatura_linha(c, competencia="2026-02", status="paga")
    # Os ids que um CSV com estas linhas já gravou (para "duplicado no banco" e "removido e reimportado").
    from src.domain.cartoes.service import _identificador_compra

    def id_de(data: datetime, desc: str, valor: str, linha=None) -> str:
        return str(uuid.uuid5(uuid.UUID(fat["id"]), _identificador_compra(linha or {}, data, desc, Decimal(valor))))

    ja = _lanc_linha(fat, "100.00", id=id_de(datetime(2026, 3, 5, tzinfo=UTC), "COMPRA BOA", "100.00"), descricao="COMPRA BOA")
    removido = _lanc_linha(fat, "50.00", id=id_de(datetime(2026, 3, 6, tzinfo=UTC), "REMOVIDA", "50.00"), descricao="REMOVIDA", apagado=True)
    externo = _lanc_linha(fat, "1.00", id=str(uuid.uuid5(uuid.UUID(fat["id"]), _identificador_compra({"id": "ext-1"}, datetime(2026, 3, 1, tzinfo=UTC), "X", Decimal(1)))))
    estado = _estado_vazio(cartoes=[c], faturas=[fat, paga], lancamentos=[ja, removido, externo])
    csvs = [
        _csv("data_compra,descricao,valor\n", '05/03/2026,COMPRA BOA,"100,00"\n', "07/03/2026,NOVA,1.234\n"),
        _csv("data_compra,descricao,valor\n", "06/03/2026,REMOVIDA,50.00\n", "07/03/2026,OUTRA NOVA,2\n"),
        _csv("date,description,amount\n", "2026-03-07,NUVEM,150.00\n", "2026-03-07,  nuvem  ,150\n"),
        _csv("Data,Historico,Value\n", "5/3/2026,A,1\n", "05-03-2026,B,2\n", "05/03/26,C,3\n", "2026/03/05,D,4\n", "31/02/2026,E,5\n", " 5/03/2026,F,6\n",
             "05/03/2026 ,G,7\n", "2026-3-5,H,8\n", "05/03/69,I,9\n", "05/03/68,J,10\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,A,NaN\n", "05/03/2026,B,Infinity\n", "05/03/2026,C,-Infinity\n", "05/03/2026,D,abc\n",
             "05/03/2026,E,0\n", "05/03/2026,F,-0,01\n", "05/03/2026,G,1.234.567,89\n", "05/03/2026,H,\"1,234.56\"\n", "05/03/2026,I,R$ 9\n",
             "05/03/2026,J,1e3\n", "05/03/2026,K,1_000\n", "05/03/2026,M,1E+30\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,N,99999999999999999999999999\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,L,12345678901234\n"),
        _csv("id,data_compra,descricao,valor\n", "ext-1,01/03/2026,X,1\n", "ext-2,01/03/2026,Y,2\n", "ext-2,02/03/2026,Z,3\n", ",03/03/2026,W,4\n"),
        _csv("referencia;data;valor\n", "a;b;c\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,COMPRA,10\n", "\n", "06/03/2026,COMPRA,10\n", "05/03/2026,compra,10.00\n"),
        _csv("data_compra,descricao,valor,extra\n", "05/03/2026,A,10,x,y,z\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,A\n"),
        _csv("data_compra,descricao,valor\r\n", "05/03/2026,A,10\r\n", "06/03/2026,\"B\nQUEBRADA\",11\r\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,A,10\rX\n"),
        _csv("\ufeffdata_compra,descricao,valor\n", "05/03/2026,BOM,10\n"),
        _csv("data_compra,descricao,valor\n", "05/03/2026,\"ASPAS \"\"DUPLAS\"\"\",10\n", "05/03/2026,\"ABERTA,10\n"),
        _csv("", ""),
        _csv("\n", "data_compra,descricao,valor\n", "05/03/2026,A,10\n"),
        _csv("DATA_COMPRA , Descricao,VALOR\n", "05/03/2026 , B ,  20 \n"),
        _csv("data_compra,descricao,valor,data\n", ",A,10,05/03/2026\n", "05/03/2026,,10,x\n", "05/03/2026,B,,x\n"),
        _csv("data_compra,descricao,valor\n", f"05/03/2026,{'L' * 501},10\n"),
        _csv("data_compra,data_compra,descricao,valor\n", "01/01/2026,05/03/2026,DUP,10\n"),
    ]
    for texto in csvs:
        for alvo in (fat, paga):
            if alvo is paga and texto is not csvs[0]:
                continue
            saida.append(("importar_csv", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": alvo["id"], "conteudo": texto}}))
    saida.append(("importar_csv", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"],
                                                             "conteudo_b64": base64.b64encode(b"data_compra,descricao,valor\n05/03/2026,CAF\xe9,10\n").decode()}}))
    saida.append(("importar_csv", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": _uid_fixo(0xBAD), "conteudo": csvs[0]}}))
    # PDF
    lidos = [
        {"data_compra": "2026-03-05", "descricao": "COMPRA BOA", "valor": "100.00", "parcela_atual": None, "parcela_total": None},
        {"data_compra": "2026-03-07", "descricao": "PARCELADA", "valor": "33.33", "parcela_atual": 2, "parcela_total": 3},
        {"data_compra": "2026-03-07", "descricao": "PARCELADA", "valor": "33.330", "parcela_atual": 3, "parcela_total": 3},
        {"data_compra": "2026-03-08", "descricao": "NAN", "valor": "NaN", "parcela_atual": None, "parcela_total": None},
        {"data_compra": "2026-03-08", "descricao": "INF", "valor": "Infinity", "parcela_atual": None, "parcela_total": None},
        {"data_compra": "2026-03-08", "descricao": "ZERO", "valor": "0", "parcela_atual": None, "parcela_total": None},
        {"data_compra": "2026-03-09", "descricao": "Compra  Com   Espaços", "valor": "1E+1", "parcela_atual": None, "parcela_total": None},
        {"data_compra": "2026-03-09", "descricao": "compra com espaços", "valor": "10.00", "parcela_atual": None, "parcela_total": None},
    ]
    for alvo in (fat, paga):
        saida.append(("importar_lancamentos_pdf", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": alvo["id"], "lancamentos": lidos}}))
    saida.append(("importar_lancamentos_pdf", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "lancamentos": []}}))
    removida = [{"data_compra": "2026-03-06", "descricao": "REMOVIDA", "valor": "50.0", "parcela_atual": None, "parcela_total": None}]
    saida.append(("importar_lancamentos_pdf", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "lancamentos": removida}}))
    grande = [{"data_compra": "2026-03-08", "descricao": "GRANDE", "valor": "1E+13", "parcela_atual": None, "parcela_total": None}]
    saida.append(("importar_lancamentos_pdf", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "lancamentos": grande}}))
    return saida


def _cenario_distribuicao(rng: random.Random, *, status_pag="pendente", com_classificacao=False, valores=("50.00", "50.00"),
                          dist=None, aplicacao=None, versao=0, tipo_sa=("A", "A"), pag_valor=None, historico="PAGAMENTO FATURA",
                          fatura_status="paga", ligada=True, pag_dc="D", pag_apagada=False) -> dict:
    c = _cartao_linha()
    fat = _fatura_linha(c, competencia="2026-04")
    contas = [_conta(f"3.1.{i}", tipo_sa=s) for i, s in enumerate(tipo_sa)] + [_conta("3.9.9", apagada=True), _conta("3.8.8", empresa="outra")]
    banco = _conta("1.1.1")
    ag = {"id": _uid_fixo(0xA0), "empresa": "esta", "conta_contabil_id": banco["id"], "apagada": False}
    total = sum((Decimal(v) for v in valores), Decimal(0))
    pag = _transacao_linha(pag_valor or str(total.quantize(Decimal("0.01"))), agencia_id=ag["id"], status=status_pag, historico=historico, dc=pag_dc,
                           apagada=pag_apagada)
    fat.update(status=fatura_status, transacao_id=pag["id"] if ligada else None)
    lancs = [_lanc_linha(fat, v, data_compra=f"2026-03-{5 + k % 20:02d}T00:00:00+00:00", descricao=f"GASTO {k + 1}") for k, v in enumerate(valores)]
    registros = _registros_classificados(pag, [(contas[0]["id"], pag["valor"], "CLASSIFICAÇÃO ANTERIOR")], banco["id"]) if com_classificacao else []
    distribs = []
    if dist is not None or aplicacao is not None or versao:
        distribs.append({"id": _uid_fixo(0xD1), "empresa": "esta", "fatura_id": fat["id"], "versao": versao,
                         "distribuicoes": dist(lancs, contas) if callable(dist) else (dist or {}), "aplicacao": aplicacao})
    estado = _estado_vazio(agencias=[ag], contas=contas + [banco], transacoes=[pag], registros=registros, cartoes=[c], faturas=[fat],
                           lancamentos=lancs, distribuicoes=distribs)
    return {"estado": estado, "c": c, "fat": fat, "lancs": lancs, "contas": contas, "pag": pag, "banco": banco}


def _hash_do(estado: dict, pag: dict) -> str:
    """O `_hash` do original sobre o estado montado (para a tela "ter visto" a classificação certa)."""
    from types import SimpleNamespace

    from src.domain.cartoes.distribuicao import DistribuicaoService

    partidas = sorted([r for r in estado["registros"] if r["transacao_id"] == pag["id"] and not r["apagado"]], key=lambda r: r["id"])
    if pag.get("apagada"):
        return DistribuicaoService._hash([], None)
    p = SimpleNamespace(id=pag["id"], valor=Decimal(pag["valor"]), data=date.fromisoformat(pag["data"]), dc=pag["dc"], status=pag["status"],
                        agencia_id=pag["agencia_id"])
    ps = [SimpleNamespace(id=r["id"], conta_id=r["conta_id"], valor=Decimal(r["valor"]), historico=r["historico"], dc=r["dc"]) for r in partidas]
    return DistribuicaoService._hash(ps, p)


def casos_distribuicao(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []

    def um_a_um(lancs, contas):
        return {x["id"]: [{"conta_id": contas[k % 2]["id"], "historico": x["descricao"], "valor": x["valor"]}] for k, x in enumerate(lancs)}

    def args(cen, **kw):
        return {"cartao_id": cen["c"]["id"], "fatura_id": cen["fat"]["id"], **kw}

    # obter e salvar
    for kw in ({}, {"dist": um_a_um, "versao": 1}, {"ligada": False, "fatura_status": "fechada"}, {"com_classificacao": True, "status_pag": "processada"}):
        cen = _cenario_distribuicao(rng, **kw)
        saida.append(("obter", {"estado": cen["estado"], "args": args(cen)}))
        L, C = cen["lancs"], cen["contas"]
        variantes = [
            {L[0]["id"]: [{"conta_id": C[0]["id"], "historico": "Escritorio", "valor": "20.00"}, {"conta_id": C[1]["id"], "historico": "Limpeza", "valor": "30.00"}]},
            {L[0]["id"]: [{"conta_id": C[0]["id"], "historico": "Demais", "valor": "50.01"}]},
            {L[0]["id"]: [{"conta_id": C[0]["id"], "historico": "Parcial", "valor": "10"}]},
            {_uid_fixo(0xBAD): [{"conta_id": C[0]["id"], "historico": "Fora", "valor": "1.00"}]},
            {L[0]["id"]: [{"conta_id": C[2]["id"], "historico": "Apagada", "valor": "1.00"}]},
            {L[0]["id"]: [{"conta_id": C[3]["id"], "historico": "Outra", "valor": "1.00"}]},
            {L[0]["id"]: [{"conta_id": cen["banco"]["id"], "historico": "Banco", "valor": "1.00"}]},
            {},
            {L[0]["id"]: [], L[1]["id"]: [{"conta_id": C[1]["id"], "historico": "So o segundo", "valor": "50"}]},
        ]
        for d in variantes:
            for v in (0, 1, 2):
                saida.append(("salvar", {"estado": cen["estado"], "args": args(cen, versao=v, distribuicoes=d)}))
    # conta sintética no salvar
    cen = _cenario_distribuicao(rng, tipo_sa=("A", "S"))
    saida.append(("salvar", {"estado": cen["estado"], "args": args(cen, versao=0, distribuicoes={
        cen["lancs"][0]["id"]: [{"conta_id": cen["contas"][1]["id"], "historico": "Sintetica", "valor": "1.00"}]})}))
    # salvar com aplicação
    cen = _cenario_distribuicao(rng, dist=um_a_um, versao=2, aplicacao={"antes": None, "transacao_id": "x", "hash": "0" * 64})
    saida.append(("salvar", {"estado": cen["estado"], "args": args(cen, versao=2, distribuicoes={})}))
    saida.append(("obter", {"estado": cen["estado"], "args": args(cen)}))
    # gastos alterados
    cen = _cenario_distribuicao(rng, dist=um_a_um, versao=1)
    cen["lancs"][0]["apagado"] = True
    saida.append(("obter", {"estado": cen["estado"], "args": args(cen)}))
    saida.append(("aplicar", {"estado": cen["estado"], "args": args(cen, versao=1, classificacao_hash=_hash_do(cen["estado"], cen["pag"]), motivo="Aplicar")}))

    # aplicar: cada ramo
    aplicaveis = [
        {"dist": um_a_um, "versao": 1},
        {"dist": um_a_um, "versao": 1, "status_pag": "processada", "com_classificacao": True},
        {"dist": um_a_um, "versao": 1, "ligada": False},
        {"dist": um_a_um, "versao": 1, "pag_dc": "C"},
        {"dist": um_a_um, "versao": 1, "status_pag": "erro"},
        {"dist": um_a_um, "versao": 1, "pag_apagada": True},
        {"dist": um_a_um, "versao": 1, "pag_valor": "100.01"},
        {"dist": um_a_um, "versao": 1, "valores": ()},
        {"dist": lambda L, C: {L[0]["id"]: [{"conta_id": C[0]["id"], "historico": "Parcial", "valor": "10.00"}]}, "versao": 1},
        {"dist": um_a_um, "versao": 1, "tipo_sa": ("A", "S")},
        {"dist": lambda L, C: {x["id"]: [{"conta_id": C[0]["id"], "historico": "H" * 470, "valor": x["valor"]}] for x in L}, "versao": 1},
        {"dist": lambda L, C: {x["id"]: [{"conta_id": C[0]["id"], "historico": "H" * 460, "valor": x["valor"]}] for x in L}, "versao": 1},
        {"dist": um_a_um, "versao": 1, "historico": ""},
        {"dist": um_a_um, "versao": 1, "aplicacao": {"antes": None, "transacao_id": "x", "hash": "0" * 64}},
        {"dist": um_a_um, "versao": 1, "status_pag": "processada", "com_classificacao": False},
        {"dist": um_a_um, "versao": 1, "com_classificacao": True},
        {"dist": lambda L, C: {L[0]["id"]: [{"conta_id": C[0]["id"], "historico": "Aa", "valor": "20.00"}, {"conta_id": C[1]["id"], "historico": "Bb", "valor": "30.00"}],
                               L[1]["id"]: [{"conta_id": C[0]["id"], "historico": "Cc", "valor": "50"}]}, "versao": 1},
        {"dist": um_a_um, "versao": 1, "valores": tuple(f"{k}.{k:02d}" for k in range(1, 61))},
        {"dist": um_a_um, "versao": 1, "valores": ("33.33", "33.33", "33.34")},
    ]
    for kw in aplicaveis:
        cen = _cenario_distribuicao(rng, **kw)
        h = _hash_do(cen["estado"], cen["pag"])
        for versao, hash_visto in ((1, h), (0, h), (1, "f" * 64)):
            saida.append(("aplicar", {"estado": cen["estado"], "args": args(cen, versao=versao, classificacao_hash=hash_visto, motivo="Distribuir")}))

    # desfazer: aplicação vigente (com e sem antes), desatualizada, ausente
    for status_pag, com_class in (("pendente", False), ("processada", True)):
        cen = _cenario_distribuicao(rng, dist=um_a_um, versao=1, status_pag=status_pag, com_classificacao=com_class)
        # Aplica de verdade no banco montado e usa o estado de depois como entrada do desfazer.
        saida.append(("__aplicar_e_desfazer__", {"estado": cen["estado"], "args": args(cen, versao=1, classificacao_hash=_hash_do(cen["estado"], cen["pag"]),
                                                                                       motivo="Distribuir")}))
    cen = _cenario_distribuicao(rng, dist=um_a_um, versao=1)
    for preservar in (False, True):
        saida.append(("desfazer", {"estado": cen["estado"], "args": args(cen, versao=1, motivo="Nada", preservar_atual=preservar)}))
    cen = _cenario_distribuicao(rng, dist=um_a_um, versao=2, aplicacao={"antes": None, "transacao_id": "x", "hash": "0" * 64}, status_pag="processada",
                                com_classificacao=True)
    for preservar in (False, True):
        for versao in (2, 1):
            saida.append(("desfazer", {"estado": cen["estado"], "args": args(cen, versao=versao, motivo="  Encerrar  ", preservar_atual=preservar)}))
    return saida


def casos_documentos(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    c = _cartao_linha()
    fat = _fatura_linha(c)
    paga = _fatura_linha(c, competencia="2026-02", status="paga")

    def doc(f, status, n=100, **sobre):
        return {"id": _uid_fixo(0xD0), "empresa": "esta", "fatura_id": f["id"], "nome": "fatura.pdf", "hash_arquivo": hashlib.sha256(str(rng.random()).encode()).hexdigest(),
                "tamanho": n, "status": status, "resultado": {"itens": []}, "erro": None, "ha_segundos": 0, **sobre}

    docs = [doc(fat, s) for s in ("processando", "revisar", "complementar", "falhou", "principal")]
    docs.append(doc(fat, "processando", ha_segundos=3600))
    docs.append(doc(fat, "processando", ha_segundos=300))
    estado = _estado_vazio(cartoes=[c], faturas=[fat, paga], documentos=docs)
    saida.append(("obter", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"]}}))
    conteudo = b"%PDF-1.4 inventado"
    for arquivo, nome in (({"tamanho": len(conteudo), "pdf": True, "b64": base64.b64encode(conteudo).decode()}, "C:\\Faturas\\março.pdf"),
                          ({"tamanho": 10, "pdf": False, "b64": base64.b64encode(b"nao e pdf!").decode()}, "x.pdf"),
                          ({"tamanho": 25 * 1024 * 1024, "pdf": True}, "a/b/grande.pdf"),
                          ({"tamanho": 25 * 1024 * 1024 + 1, "pdf": True}, "grande-demais.pdf"),
                          ({"tamanho": 100, "pdf": True}, "n" * 300 + ".pdf")):
        saida.append(("adicionar_documento", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": arquivo, "nome": nome}}))
    repetido = {"tamanho": 100, "pdf": True}
    h = hashlib.sha256(_bytes_do_documento(repetido)).hexdigest()
    saida.append(("adicionar_documento", {"estado": _estado_vazio(cartoes=[c], faturas=[fat, paga], documentos=[doc(fat, "revisar", hash_arquivo=h)]),
                                          "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": repetido, "nome": "repetido.pdf"}}))
    saida.append(("adicionar_documento", {"estado": _estado_vazio(cartoes=[c], faturas=[fat, paga], documentos=[doc(paga, "revisar", hash_arquivo=h)]),
                                          "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": repetido, "nome": "em-outra-fatura.pdf"}}))
    muitos = [doc(fat, "revisar") for _ in range(32)]
    saida.append(("adicionar_documento", {"estado": _estado_vazio(cartoes=[c], faturas=[fat], documentos=muitos),
                                          "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": {"tamanho": 50, "pdf": True}, "nome": "33.pdf"}}))
    saida.append(("adicionar_documento", {"estado": _estado_vazio(cartoes=[c], faturas=[fat], documentos=muitos[:31]),
                                          "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": {"tamanho": 51, "pdf": True}, "nome": "32.pdf"}}))
    pesados = [doc(fat, "revisar", n=25 * 1024 * 1024) for _ in range(3)] + [doc(fat, "revisar", n=25 * 1024 * 1024 - 100)]
    for n in (100, 101):
        saida.append(("adicionar_documento", {"estado": _estado_vazio(cartoes=[c], faturas=[fat], documentos=pesados),
                                              "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "arquivo": {"tamanho": n, "pdf": True}, "nome": "peso.pdf"}}))
    for d in docs + [{"id": _uid_fixo(0xBAD)}]:
        saida.append(("documento", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": fat["id"], "documento_id": d["id"]}}))
    saida.append(("documento", {"estado": estado, "args": {"cartao_id": c["id"], "fatura_id": paga["id"], "documento_id": docs[0]["id"]}}))

    # confirmar
    itens = [{"data": "2026-03-01", "descricao": "TRANSPORTE", "valor": "20.00"}] * 2
    variantes = [
        {"versao": 0, "principal": True, "itens": itens, "total": "40.00", "pendencias_resolvidas": True},
        {"versao": 0, "principal": True, "itens": itens, "total": "40.00", "pendencias_resolvidas": False},
        {"versao": 0, "principal": True, "itens": itens, "total": "20.00", "pendencias_resolvidas": True},
        {"versao": 0, "principal": True, "itens": [], "total": "0", "pendencias_resolvidas": True},
        {"versao": 0, "principal": True, "itens": [{"data": "2026-02-30", "descricao": "X", "valor": "1.00"}], "total": "1.00", "pendencias_resolvidas": True},
        {"versao": 0, "principal": True, "itens": [{"data": "2026-03-01", "descricao": "  X  ", "valor": "1,5", "referencia": "p1"}], "total": "1,50", "pendencias_resolvidas": True},
        {"versao": 0, "principal": True, "substituir": True, "itens": itens, "total": "40.00", "pendencias_resolvidas": True},
        {"versao": 1, "principal": True, "itens": itens, "total": "40.00", "pendencias_resolvidas": True},
        {"versao": 0, "principal": False},
        {"versao": 1, "principal": False},
    ]
    for estado_doc in ("revisar", "complementar", "falhou", "principal", "processando"):
        for com_gastos in (False, True):
            for f_alvo, aplicada in ((fat, False), (paga, False), (fat, True)):
                d = doc(f_alvo, estado_doc, resultado={"itens": [], "metodo": "TEXTO"})
                outro_principal = doc(f_alvo, "principal")
                lancs = [_lanc_linha(f_alvo, "5.00")] if com_gastos else []
                dists = [{"id": _uid_fixo(0xD1), "empresa": "esta", "fatura_id": f_alvo["id"], "versao": 0, "distribuicoes": {lancs[0]["id"]: []} if lancs else {},
                          "aplicacao": {"antes": None, "transacao_id": "x", "hash": "0" * 64} if aplicada else None}] if (aplicada or com_gastos) else []
                e = _estado_vazio(cartoes=[c], faturas=[fat, paga], documentos=[outro_principal, d], lancamentos=lancs, distribuicoes=dists)
                for dados in variantes:
                    if (estado_doc, com_gastos, aplicada) != ("revisar", False, False) and dados is not variantes[0] and dados is not variantes[6] \
                            and dados is not variantes[8]:
                        continue
                    saida.append(("confirmar_documento", {"estado": e, "args": {"cartao_id": c["id"], "fatura_id": f_alvo["id"], "documento_id": d["id"], "dados": dados}}))
    # processar
    for leitura in ({"resultado": {"itens": [{"data": "2026-03-01", "descricao": "TRANSPORTE", "valor": "20.00", "referencia": "1"}], "total": "20.00",
                                   "pendencias": [], "metodo": "TEXTO"}},
                    {"recusa": "Envie um PDF de até 25 MiB."}, {"recusa": "R" * 1200}, {"falha": True}):
        for status, ativa in (("processando", True), ("revisar", True), ("processando", False)):
            d = doc(fat, status)
            e = _estado_vazio(empresa={"ativa": ativa}, cartoes=[c], faturas=[fat], documentos=[d])
            saida.append(("processar", {"estado": e, "args": {"documento_id": d["id"], "leitura": leitura}}))
    return saida


# ─── Chamadas diretas ───────────────────────────────────────────────────────

def _pydantic(modelo, dados) -> dict:
    from pydantic import ValidationError as ErroPydantic

    try:
        m = modelo.model_validate_json(json.dumps(dados))
    except ErroPydantic as exc:
        e = exc.errors()[0]
        return {"pydantic": {"type": e["type"], "loc": [str(x) for x in e["loc"]], "msg": e["msg"]}}
    except Exception as exc:  # noqa: BLE001
        # Exceção crua de um validador do original (erro 500 na rota).
        return {"erro_500": type(exc).__name__}
    d = m.model_dump(mode="json")
    for k, v in list(d.items()):
        if isinstance(getattr(m, k, None), datetime):
            d[k] = _utc(getattr(m, k))
    return {"ok": d}


def casos_diretos() -> list[dict]:
    from src.domain.cartoes import service as S
    from src.domain.cartoes.distribuicao import DistribuicaoService, leitura_expirada
    from src.schemas import cartoes as K
    from src.schemas.types import normalizar_competencia

    saida = []
    cartao = {"nome": "CARTAO", "bandeira": "visa", "dia_fechamento": 10, "dia_vencimento": 20}
    for v in [{}, {"nome": "C"}, {"nome": "C" * 201}, {"nome": 5}, {"bandeira": "VISA "}, {"bandeira": "diners"}, {"bandeira": None},
              {"ultimos_digitos": "123"}, {"ultimos_digitos": "12a4"}, {"ultimos_digitos": " 1234 "}, {"ultimos_digitos": "١٢٣٤"}, {"ultimos_digitos": "12345"},
              {"ultimos_digitos": 1234}, {"dia_fechamento": 0}, {"dia_fechamento": 29}, {"dia_fechamento": "7"}, {"dia_fechamento": 7.0},
              {"dia_fechamento": 7.5}, {"dia_fechamento": True}, {"dia_vencimento": None}, {"limite": "-0.01"}, {"limite": "-0"}, {"limite": "abc"},
              {"limite": "NaN"}, {"limite": "Infinity"}, {"limite": 10.5}, {"limite": "1E+3"}, {"limite": None}, {"limite": "100000000000000"}]:
        saida.append({"tipo": "esquema_cartao", "entrada": {**cartao, **v}, "saida": _pydantic(K.CartaoCreate, {**cartao, **v})})
    for v in [{}, {"nome": "X"}, {"nome": "XY"}, {"dia_fechamento": 30}, {"limite": "-5"}, {"limite": "abc"}, {"ativo": "sim"}, {"ativo": False},
              {"ativo": None}, {"dia_vencimento": "12"}]:
        saida.append({"tipo": "esquema_cartao_atualizar", "entrada": v, "saida": _pydantic(K.CartaoUpdate, v)})
    for v in [{"competencia": "2026-03"}, {"competencia": " 2026-03 "}, {"competencia": "2026-13"}, {"competencia": "2026-00"}, {"competencia": "0000-01"},
              {"competencia": "2026-3"}, {"competencia": "202603"}, {"competencia": 202603}, {"competencia": "٢٠٢٦-٠٣"}, {},
              {"competencia": "2026-03", "data_fechamento": "2026-03-20"}, {"competencia": "2026-03", "data_vencimento": "2026-03-28T10:00:00-03:00"},
              {"competencia": "2026-03", "data_vencimento": "ontem"}, {"competencia": "2026-03", "observacao": "O" * 501},
              {"competencia": "2026-03", "observacao": "O" * 500}, {"competencia": "2026-03", "data_fechamento": 1773100800}]:
        saida.append({"tipo": "esquema_fatura", "entrada": v, "saida": _pydantic(K.FaturaCreate, v)})
    for v in [{}, {"status": "aberta"}, {"status": "Paga"}, {"status": "cancelada"}, {"status": None}, {"data_vencimento": "2026-04-01"},
              {"observacao": "x" * 501}]:
        saida.append({"tipo": "esquema_fatura_atualizar", "entrada": v, "saida": _pydantic(K.FaturaUpdate, v)})
    lanc = {"data_compra": "2026-03-05T00:00:00Z", "descricao": "COMPRA", "valor": "10.00"}
    for v in [{}, {"valor": "0"}, {"valor": "-1"}, {"valor": "abc"}, {"valor": None}, {"valor": "NaN"}, {"valor": 0.01}, {"descricao": ""},
              {"descricao": "D" * 501}, {"descricao": " "}, {"data_compra": None}, {"data_compra": "2026-02-30"}, {"data_compra": "2026-03-05"},
              {"data_compra": "2026-03-05T10:00:00-03:00"}, {"conta_id": "x"}, {"conta_id": "00000000000000000000000000000c01"},
              {"parcela_atual": 0}, {"parcela_atual": 1}, {"parcela_total": "2"}, {"parcela_total": -1}, {"valor": "1E+20"}]:
        saida.append({"tipo": "esquema_lancamento", "entrada": {**lanc, **v}, "saida": _pydantic(K.LancamentoCreate, {**lanc, **v})})
    conta = "00000000-0000-0000-0000-000000000c01"
    gasto = "00000000-0000-0000-0000-0000000001a1"
    comp = {"conta_id": conta, "historico": "Despesa", "valor": "10.00"}
    for v in [{"versao": 0, "distribuicoes": {}}, {"versao": -1, "distribuicoes": {}}, {"versao": 2147483647, "distribuicoes": {}},
              {"versao": 0, "distribuicoes": {gasto: [comp]}}, {"versao": 0, "distribuicoes": {"x": [comp]}},
              {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": "10.001"}]}}, {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": "0"}]}},
              {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": 10}]}}, {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": 10.5}]}},
              {"versao": 0, "distribuicoes": {gasto: [{**comp, "historico": " X "}]}}, {"versao": 0, "distribuicoes": {gasto: [{**comp, "historico": "  XY  "}]}},
              {"versao": 0, "distribuicoes": {gasto: [{**comp, "conta_id": "x"}]}}, {"versao": "1", "distribuicoes": {}},
              {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": "1E+1"}]}}, {"versao": 0, "distribuicoes": {gasto: [{**comp, "valor": "NaN"}]}}]:
        saida.append({"tipo": "esquema_salvar", "entrada": v, "saida": _pydantic(K.FaturaDistribuicaoSalvar, v)})
    h = "a" * 64
    for v in [{"versao": 0, "classificacao_hash": h, "motivo": "Ok"}, {"versao": 0, "classificacao_hash": "a" * 63, "motivo": "Ok"},
              {"versao": 0, "classificacao_hash": h, "motivo": ""}, {"versao": 0, "classificacao_hash": h, "motivo": "   "},
              {"versao": 0, "classificacao_hash": h, "motivo": "  Ok  "}, {"versao": 0, "classificacao_hash": h, "motivo": "M" * 301},
              {"versao": 0, "classificacao_hash": h, "motivo": " " + "M" * 299 + " "}]:
        saida.append({"tipo": "esquema_aplicar", "entrada": v, "saida": _pydantic(K.FaturaDistribuicaoAplicar, v)})
    for v in [{"versao": 0, "motivo": "Ok"}, {"versao": 0, "motivo": "Ok", "preservar_classificacao_atual": True},
              {"versao": 0, "motivo": "Ok", "preservar_classificacao_atual": "sim"}, {"versao": 0, "motivo": " "}]:
        saida.append({"tipo": "esquema_desfazer", "entrada": v, "saida": _pydantic(K.FaturaDistribuicaoDesfazer, v)})
    item = {"data": "2026-03-01", "descricao": "TRANSPORTE", "valor": "20.00"}
    for v in [{"versao": 0, "principal": True}, {"versao": 0}, {"versao": 0, "principal": True, "itens": [item]},
              {"versao": 0, "principal": True, "itens": [{**item, "data": "2026-3-1"}]}, {"versao": 0, "principal": True, "itens": [{**item, "descricao": ""}]},
              {"versao": 0, "principal": True, "itens": [{**item, "valor": "1" * 31}]}, {"versao": 0, "principal": True, "itens": [{**item, "referencia": "r" * 101}]},
              {"versao": 0, "principal": True, "total": "1" * 31}, {"versao": 0, "principal": "sim"}, {"versao": 0, "principal": False, "substituir": True}]:
        saida.append({"tipo": "esquema_confirmar", "entrada": v, "saida": _pydantic(K.FaturaDocumentoConfirmar, v)})
    for v in ["2026-03", " 2026-03", "2026-13", "x", "٢٠٢٦-٠٣", "2026-03 "]:
        try:
            saida.append({"tipo": "competencia", "entrada": v, "saida": {"ok": normalizar_competencia(v)}})
        except ValueError as exc:
            saida.append({"tipo": "competencia", "entrada": v, "saida": {"erro": str(exc)}})
    # A identidade da compra e o uuid5.
    rng = random.Random(20261123)
    for k in range(40):
        linha = {}
        if rng.random() < 0.3:
            linha[rng.choice(["id", "identificador", "transaction_id", "reference", "referencia", "purchase_id", "transactionid"])] = rng.choice(["", "  ", "abc", " ext-9 "])
        if rng.random() < 0.2:
            linha["id"] = ""
            linha["referencia"] = "segunda"
        data = datetime(2026, rng.randint(1, 12), rng.randint(1, 28), tzinfo=UTC)
        desc = rng.choice(["COMPRA", "  compra   com\tespaços ", "Straße", "ÇÃO", "ﬁ", "MERCADO\u00a0EXEMPLO"])
        valor = Decimal(rng.choice(["10", "10.005", "10.015", "0.1", "1E+2", "123.456"]))
        fatura = _uid_fixo(0xFA)
        ident = S._identificador_compra(linha, data, desc, valor)
        saida.append({"tipo": "identificador", "entrada": {"linha": linha, "data": data.isoformat(), "descricao": desc, "valor": str(valor), "fatura_id": fatura},
                      "saida": {"identificador": ident, "id": str(uuid.uuid5(uuid.UUID(fatura), ident))}})
    for doc_id in (_uid_fixo(0xD0), _uid_fixo(0xD0)):
        for versao, n in ((0, 0), (0, 1), (7, 19999)):
            saida.append({"tipo": "uuid5", "entrada": {"namespace": doc_id, "nome": f"{versao}:{n}"}, "saida": {"id": str(uuid.uuid5(uuid.UUID(doc_id), f"{versao}:{n}"))}})
    for s in ["05/03/2026", "5/3/2026", " 5/03/2026", "05/03/26", "05/03/69", "05/03/68", "2026-03-05", "2026-3-5", "05-03-2026", "2026/03/05",
              "31/02/2026", "29/02/2024", "29/02/2025", "05/03/2026 ", "x", "", "00/03/2026", "05/13/2026", "٠٥/٠٣/٢٠٢٦", "05/03/0000", "05/03/0001",
              "1/1/1", "2026-03-05T00:00", "32/01/2026", "30/1/2026"]:
        try:
            saida.append({"tipo": "data_do_csv", "entrada": s, "saida": {"ok": S._parse_data(s).isoformat()}})
        except ValueError as exc:
            saida.append({"tipo": "data_do_csv", "entrada": s, "saida": {"erro": str(exc)}})
    for s in ["1.234,56", "R$ 265,44", "1,234.56", "150.00", "-50", "1.234.567,89", "1,5", "1.5", "abc", "NaN", "1e3", "1_000", " R$1 ", "12,", ",5",
              "1.2.3", "1,2,3", "R$", "", "-0,01", "١٢٣"]:
        texto_ = s.replace(" ", "").replace("R$", "").strip()
        if "," in texto_ and texto_.rfind(",") > texto_.rfind("."):
            texto_ = texto_.replace(".", "").replace(",", ".")
        else:
            texto_ = texto_.replace(",", "")
        try:
            saida.append({"tipo": "valor_do_csv", "entrada": s, "saida": {"texto": texto_, "ok": str(S._parse_valor(s))}})
        except Exception as exc:  # noqa: BLE001
            saida.append({"tipo": "valor_do_csv", "entrada": s, "saida": {"texto": texto_, "erro": type(exc).__name__}})
    # O csv.DictReader cru.
    for texto in ["a,b\n1,2\n", "a,b\r\n1,2\r\n", "a,b\n\n1,2\n\n", 'a,b\n"x,y",2\n', 'a,b\n"x""y",2\n', 'a,b\n"x\ny",2\n', "a,b\n1\n",
                  "a,b\n1,2,3\n", "a,b\n1,2", 'a,b\n"aberta,2', 'a,b\nx"y,2\n', 'a,b\n"x"y,2\n', "a,b\n1\r2,3\n", "\n\na,b\n1,2\n", "",
                  "a,,b\n1,2,3\n", ",\n,\n", 'a\n" x "\n', "a,b\n1,2\r", "a,b\r1,2\r"]:
        try:
            linhas = [{k: v for k, v in r.items()} for r in csv.DictReader(io.StringIO(texto))]
            linhas = [{("<None>" if k is None else k): v for k, v in r.items()} for r in linhas]
            saida.append({"tipo": "csv", "entrada": texto, "saida": {"linhas": linhas}})
        except csv.Error as exc:
            saida.append({"tipo": "csv", "entrada": texto, "saida": {"erro": str(exc)}})
    # O hash da classificação bancária.
    from types import SimpleNamespace

    for k in range(30):
        pag = None
        if k % 7 != 0:
            pag = SimpleNamespace(id=_uid_fixo(0x7A), valor=Decimal(rng.choice(["100.00", "0.10", "-5.00", "12345.67"])), data=date(2026, 4, rng.randint(1, 28)),
                                  dc=rng.choice("DC"), status=rng.choice(["pendente", "processada"]), agencia_id=_uid_fixo(0xA0))
        partidas = []
        for _ in range(rng.randint(0, 4)):
            partidas.append(SimpleNamespace(id=_uid_fixo(0x2E), conta_id=_uid_fixo(0xC0), valor=Decimal(rng.choice(["50.00", "0.01", "100.00"])),
                                            historico=rng.choice(["CLASSIFICAÇÃO", "D'ÁGUA", 'ASPAS "DUPLAS"', "AMBAS ' \"", "BARRA \\ E\tTAB",
                                                                  "LINHA\nNOVA", "\x00CONTROLE\x7f", "ÇÃO ÿ Ā \u2028 \U0001F600", "\u200bINVISIVEL"]),
                                            dc=rng.choice("DC")))
        partidas.sort(key=lambda p: p.id)
        entrada = {"pagamento": None if pag is None else {"id": pag.id, "valor": str(pag.valor), "data": pag.data.isoformat(), "dc": pag.dc,
                                                          "status": pag.status, "agencia_id": pag.agencia_id},
                   "partidas": [{"id": p.id, "conta_id": p.conta_id, "valor": str(p.valor), "historico": p.historico, "dc": p.dc} for p in partidas]}
        saida.append({"tipo": "hash", "entrada": entrada, "saida": {"hash": DistribuicaoService._hash(partidas, pag)}})
    agora = datetime.now(UTC)
    for status in ("processando", "revisar"):
        for seg in (0, 359, 361, 3600):
            d = SimpleNamespace(status=status, updated_at=(agora - timedelta(seconds=seg)).replace(tzinfo=None))
            saida.append({"tipo": "leitura_expirada", "entrada": {"status": status, "ha_segundos": seg}, "saida": {"expirada": leitura_expirada(d)}})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


_GRANDE = 200_000


async def _aplicar_e_desfazer(e: dict) -> list[tuple[str, dict, dict]]:
    """Aplica no banco montado e devolve o desfazer (com e sem preservar) sobre o estado de depois."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    engine = await _engine()
    factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    async with factory() as db:
        _EM["montado"] = True
        try:
            await _montar(db, e["estado"])
            await _chamar(db, "aplicar", e["args"], EMPRESA_ID)
            await db.flush()
            depois = await _estado(db, EMPRESA_ID)
        finally:
            _EM["montado"] = False
            await db.rollback()
    depois["empresa"] = e["estado"]["empresa"]
    a = e["args"]
    versao = next(d["versao"] for d in depois["distribuicoes"])
    saida = []
    base = {"cartao_id": a["cartao_id"], "fatura_id": a["fatura_id"], "motivo": "Corrigir"}
    for preservar in (False, True):
        saida.append(("desfazer", {"estado": depois, "args": {**base, "versao": versao, "preservar_atual": preservar}}))
    # E depois de alguém mudar o histórico no NEO (a aplicação fica desatualizada).
    mudado = json.loads(json.dumps(depois))
    for r in mudado["registros"]:
        if not r["apagado"]:
            r["historico"] = "CLASSIFICAÇÃO ATUALIZADA POSTERIORMENTE"
    saida.append(("obter", {"estado": mudado, "args": {"cartao_id": a["cartao_id"], "fatura_id": a["fatura_id"]}}))
    for preservar in (False, True):
        saida.append(("desfazer", {"estado": mudado, "args": {**base, "versao": versao, "preservar_atual": preservar}}))
    return saida


async def _tudo() -> None:
    for tipo, entrada, real in _DA_SUITE:
        refeito = await _rodar(tipo, entrada)
        if refeito != real:
            raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False, default=str)[:4000]}\n"
                                 f"{json.dumps(real, ensure_ascii=False, default=str)[:4000]}")
        limpa = _sanitizar(entrada)
        if len(json.dumps(limpa)) > _GRANDE:
            print(f"\n(fora do gabarito por tamanho: {tipo}, {len(json.dumps(limpa))} bytes)")
            continue
        _guardar(tipo, "suite", limpa, await _rodar(tipo, limpa))
    rng = random.Random(20261123)
    inventados = casos_cartoes(rng) + casos_faturas(rng) + casos_importacao(rng) + casos_distribuicao(rng) + casos_documentos(rng)
    for tipo, e in inventados:
        if tipo == "__aplicar_e_desfazer__":
            _guardar("aplicar", "inventado", e, await _rodar("aplicar", e))
            for t2, e2 in await _aplicar_e_desfazer(e):
                _guardar(t2, "inventado", e2, await _rodar(t2, e2))
            continue
        _guardar(tipo, "inventado", e, await _rodar(tipo, e))
    await _ENGINE["e"].dispose()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    os.makedirs(pasta, exist_ok=True)
    asyncio.run(_tudo())
    diretos = casos_diretos()
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate([*diretos, *lista], start=1)]
    for c in itens:
        c.setdefault("origem", "direto")
    arquivos = _escrever_partes(pasta, "cartoes-servico", itens)
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += any(k in c["saida"] for k in ("erro", "pydantic", "erro_do_banco"))
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} com recusa)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito do serviço dos cartões: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
