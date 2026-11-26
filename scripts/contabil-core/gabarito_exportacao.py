"""Gabarito das exportações do Contábil Core (Bloco D, Fase D1, 26/11/2026).

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) da exportação
(`ExportacaoService`, `src/domain/exportacao/service.py`) e grava cada chamada de `exportar` e dos
exportadores internos que a suíte chama direto (`_exportar_lancamentos`, `_exportar_lancamentos_importacao`,
`_exportar_extrato`, `_exportar_notas`, `_exportar_conferencia`): a entrada (o que o serviço leu do banco e
o pedido) e a saída exata (o total, as contas sem código reduzido e o arquivo, ou a recusa). Depois
acrescenta casos inventados, com semente fixa: período (competência e datas com fuso), contas bancárias
ativas, inativas e apagadas, partidas vigentes e canceladas, notas de cada recorte e direção (CNPJ com e
sem máscara, CNPJ da empresa inválido), conferência com e sem nota ou comprovante, valores negativos e
assinados, e os filtros do extrato. Mais chamadas diretas de `_dicts_to_csv`/`_dicts_to_xlsx` e do
`ExportJobCreate`. O porte em TypeScript repete tudo em `src/lib/contabil-core/exportacao/arquivos.test.ts`.

O ARQUIVO: o CSV e o TXT vão como texto (o UTF-8 com o BOM, decodificado). O XLSX vai lido de volta pelo
openpyxl (o que o Excel vê): por célula, o endereço, o tipo, o valor, o formato e o negrito, e o título da
folha. O porte compara o CONTEÚDO, não os bytes do arquivo (o exceljs e o openpyxl escrevem o XML de jeitos
diferentes).

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada
gravada (já sanitizada). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o
resultado tem de ser igual ao da suíte de verdade (senão o plugin aborta).

O banco montado se comporta como o PostgreSQL da produção onde o SQLite difere:
- os instantes (`timestamptz`) são comparados em UTC e voltam com o fuso (o `isoformat()` sai com "+00:00");
- o `ilike` é o do PostgreSQL (minúscula Unicode; `%` e `_` são curingas);
a ordem dos empates é a da inserção (a do `rowid`), que a entrada grava em `ordem`.
Para a conferência com a suíte, o banco montado se comporta como o SQLite da suíte.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs
que não são de exemplo viram fictícios começando com 9. A razão social da empresa não é gravada: o banco
montado usa sempre "EMPRESA EXEMPLO LTDA".

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/exportacao/gabarito \\
        python -I -W ignore -m pytest -q -p gabarito_exportacao tests/integration/test_exportacao.py \\
        tests/unit/test_exportacao_historico.py
"""
from __future__ import annotations

import asyncio
import copy
import io
import itertools
import json
import os
import random
import re
import sys
import uuid
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402
from gabarito_revisao import _escrever_partes  # noqa: E402

_ORIGINAL: dict = {}
_MUNDOS: dict[str, dict] = {}
_EM_CURSO: dict = {"dentro": False, "montado": False, "pg": False}
_DA_SUITE: list[tuple[str, dict, dict]] = []
casos: dict[str, dict] = {}

RAZAO = "EMPRESA EXEMPLO LTDA"
OUTRA_RAZAO = "OUTRA EMPRESA LTDA"
USUARIO = uuid.UUID(int=0x05E)
EMPRESA_ID = "00000000-0000-0000-0000-00000000e3a5"


def _dv(d: str, pesos) -> str:
    resto = sum(int(a) * p for a, p in zip(d, pesos)) % 11
    return "0" if resto < 2 else str(11 - resto)


def cnpj(base12: str, mascara: bool = True) -> str:
    d = base12 + _dv(base12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d += _dv(d, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if mascara else d


EMPRESA_CNPJ = cnpj("123456780001")
OUTRA_CNPJ = cnpj("999999990002")


# ─── Codificação ─────────────────────────────────────────────────────────────

def _iso(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return (v.replace(tzinfo=UTC) if v.tzinfo is None else v).isoformat()
    return v.isoformat()


def _dinheiro(v) -> str | None:
    return None if v is None else str(Decimal(str(v)))


def despejo(conteudo: bytes) -> list[dict]:
    """A planilha como o Excel a vê: lida de volta pelo openpyxl. Por folha, o título, as linhas (o valor de
    cada célula: texto, número ou vazio; sem as vazias do fim), as células em negrito e os formatos que não são
    o "General"."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(conteudo))
    folhas = []
    for ws in wb.worksheets:
        linhas, negrito, formatos = [], [], []
        for linha in ws.iter_rows():
            valores = []
            for c in linha:
                v = c.value
                if c.font is not None and c.font.b:
                    negrito.append(c.coordinate)
                if c.number_format != "General":
                    formatos.append([c.coordinate, c.number_format])
                if isinstance(v, bool) or not (v is None or isinstance(v, (int, float, str))):
                    raise AssertionError(f"tipo inesperado na planilha: {type(v)}")
                valores.append(0 if isinstance(v, (int, float)) and v == 0 else v)
            while valores and valores[-1] is None:
                valores.pop()
            linhas.append(valores)
        while linhas and not linhas[-1]:
            linhas.pop()
        folhas.append({"titulo": ws.title, "linhas": linhas, "negrito": negrito, "formatos": formatos})
    return folhas


def _arquivo(fmt: str, conteudo: bytes) -> dict:
    if fmt == "xlsx":
        return {"planilha": despejo(conteudo)}
    return {"texto": conteudo.decode("utf-8")}


def _erro(exc) -> dict:
    return {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message, "detalhes": copy.deepcopy(getattr(exc, "details", None) or None)}}


_TEXTOS = ("historico", "historico_extrato", "descricao", "nome_emitente", "favorecido", "mensagem", "cnpj", "cnpj_emitente",
           "cnpj_destinatario", "numero", "serie", "texto", "codigo", "chave_acesso")


def _sanitizar(v, chave=None):
    if isinstance(v, dict):
        return {k: _sanitizar(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [_sanitizar(x, chave) for x in v]
    if isinstance(v, str) and chave in _TEXTOS:
        return sanitizar_texto(v)
    return v


# ─── O banco montado com a entrada ──────────────────────────────────────────

def _instalar_pg() -> None:
    """No banco montado (e só com `pg` ligado): instantes em UTC com o fuso, e o `ilike` do PostgreSQL."""
    from sqlalchemy.dialects.sqlite import base as sb
    from sqlalchemy.ext.compiler import compiles
    from sqlalchemy.sql import operators
    from sqlalchemy.sql.elements import BinaryExpression

    D = sb.DATETIME
    bind0, result0 = D.bind_processor, D.result_processor

    def bind_processor(self, dialect):
        p = bind0(self, dialect)

        def proc(v):
            if _EM_CURSO["pg"] and isinstance(v, datetime) and v.tzinfo is not None:
                v = v.astimezone(UTC).replace(tzinfo=None)
            return p(v) if p else v
        return proc

    def result_processor(self, dialect, coltype):
        p = result0(self, dialect, coltype)
        fuso = getattr(self, "timezone", False)

        def proc(v):
            v = p(v) if p else v
            if _EM_CURSO["pg"] and fuso and isinstance(v, datetime) and v.tzinfo is None:
                v = v.replace(tzinfo=UTC)
            return v
        return proc

    D.bind_processor = bind_processor
    D.result_processor = result_processor

    @compiles(BinaryExpression, "sqlite")
    def _binaria(element, compiler, **kw):
        if _EM_CURSO["pg"] and element.operator in (operators.ilike_op, operators.not_ilike_op):
            texto = f"pg_ilike({compiler.process(element.left, **kw)}, {compiler.process(element.right, **kw)})"
            return texto if element.operator is operators.ilike_op else f"NOT {texto}"
        return compiler.visit_binary(element, **kw)


def _ilike(valor: str, padrao: str) -> bool:
    """`valor ILIKE padrao` como o PostgreSQL: minúscula Unicode, `%` e `_` curingas, `\` escapa."""
    rx, i = "", 0
    p = padrao.lower()
    while i < len(p):
        c = p[i]
        if c == "\\" and i + 1 < len(p):
            rx += re.escape(p[i + 1])
            i += 2
            continue
        rx += ".*" if c == "%" else "." if c == "_" else re.escape(c)
        i += 1
    return re.fullmatch(rx, valor.lower(), re.S) is not None


class _Montado:
    async def abrir(self):
        from sqlalchemy import event
        from sqlalchemy.ext.asyncio import create_async_engine

        from src.db.functions import registrar_funcoes_sqlite
        from src.db.models import Base

        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:", query_cache_size=0)
        registrar_funcoes_sqlite(self.engine)

        @event.listens_for(self.engine.sync_engine, "connect")
        def _funcoes(dbapi, _rec):
            dbapi.create_function("pg_ilike", 2, lambda v, p: None if v is None or p is None else int(_ilike(v, p)), deterministic=True)

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def fechar(self):
        await self.engine.dispose()

    async def rodar(self, tipo: str, e: dict, pg: bool = True) -> dict:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        factory = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with factory() as db:
            try:
                _EM_CURSO["montado"] = True
                _EM_CURSO["pg"] = pg
                return await _executar(db, tipo, e)
            finally:
                _EM_CURSO["montado"] = False
                _EM_CURSO["pg"] = False
                await db.rollback()


def _dt(v: str | None):
    return datetime.fromisoformat(v) if v else None


async def _base(db, e: dict):
    from src.db.models import (AgenciaBancaria, Comprovante, Empresa, ExtratoImportacao, NotaFiscal, PlanoConta,
                               RegistroContabil, Tenant, Transacao)

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    emp = e["empresa"]
    empresa = Empresa(id=uuid.UUID(emp.get("id", EMPRESA_ID)), tenant_id=tenant.id, razao_social=RAZAO, cnpj=emp["cnpj"],
                      regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social=OUTRA_RAZAO, cnpj=OUTRA_CNPJ, regime_tributario="simples_nacional")
    db.add_all([empresa, outra])
    await db.flush()

    def de(x):
        return outra.id if x.get("empresa") == "outra" else empresa.id

    apagado = datetime(2026, 1, 9, tzinfo=UTC)
    for a in e["agencias"]:
        db.add(AgenciaBancaria(id=uuid.UUID(a["id"]), empresa_id=de(a), banco_sigla=a["banco_sigla"], agencia=a["agencia"],
                               numero=a["numero"], digito=a["digito"], ativa=a["ativa"], deleted_at=apagado if a["apagada"] else None))
    await db.flush()
    for c in e["contas"]:
        db.add(PlanoConta(id=uuid.UUID(c["id"]), empresa_id=de(c), codigo=c["codigo"], descricao=c["descricao"], tipo="despesa",
                          conta_numero=c["conta_numero"]))
    await db.flush()
    for i in e["importacoes"]:
        db.add(ExtratoImportacao(id=uuid.UUID(i["id"]), empresa_id=de(i), agencia_id=uuid.UUID(i["agencia_id"]), nome_arquivo="extrato.ofx",
                                 hash_arquivo="0" * 64, created_at=_dt(i["created_at"]), updated_at=_dt(i["created_at"])))
    await db.flush()
    for t in sorted(e["transacoes"], key=lambda t: t["ordem_insercao"]):
        db.add(Transacao(id=uuid.UUID(t["id"]), empresa_id=de(t), agencia_id=uuid.UUID(t["agencia_id"]), data=date.fromisoformat(t["data"]),
                         valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"], status=t["status"], ordem=t["ordem"],
                         importacao_id=uuid.UUID(t["importacao_id"]) if t["importacao_id"] else None,
                         hash_dedup=t["id"].replace("-", "") * 2, deleted_at=apagado if t["apagada"] else None))
        await db.flush()
    for r in sorted(e["registros"], key=lambda r: r["ordem_insercao"]):
        db.add(RegistroContabil(
            id=uuid.UUID(r["id"]), empresa_id=de(r), transacao_id=uuid.UUID(r["transacao_id"]) if r["transacao_id"] else None,
            lancamento_id=uuid.UUID(r["lancamento_id"]), ordem_composicao=r["ordem_composicao"], conta_id=uuid.UUID(r["conta_id"]), agencia_id=uuid.UUID(r["agencia_id"]),
            descricao="x", historico=r["historico"], historico_extrato=r["historico_extrato"], dc=r["dc"], tipo_regra=r["tipo_regra"],
            valor=Decimal(r["valor"]), data_lancamento=_dt(r["data_lancamento"]), deleted_at=apagado if r["apagado"] else None,
        ))
        await db.flush()
    for n in sorted(e["notas"], key=lambda n: n["ordem_insercao"]):
        db.add(NotaFiscal(
            id=uuid.UUID(n["id"]), empresa_id=de(n), tipo=n["tipo"], numero=n["numero"], serie=n["serie"], cnpj_emitente=n["cnpj_emitente"],
            nome_emitente=n["nome_emitente"], cnpj_destinatario=n["cnpj_destinatario"], valor=Decimal(n["valor"]),
            data_emissao=_dt(n["data_emissao"]), status=n["status"], transacao_id=uuid.UUID(n["transacao_id"]) if n["transacao_id"] else None,
            chave_acesso=n["chave_acesso"], dedup_key=n["id"].replace("-", "") * 2, deleted_at=apagado if n["apagada"] else None,
        ))
        await db.flush()
    for c in sorted(e["comprovantes"], key=lambda c: c["ordem_insercao"]):
        db.add(Comprovante(
            id=uuid.UUID(c["id"]), empresa_id=de(c), transacao_id=uuid.UUID(c["transacao_id"]) if c["transacao_id"] else None,
            favorecido=c["favorecido"], valor_pago=Decimal(c["valor_pago"]), deleted_at=apagado if c["apagado"] else None,
        ))
        await db.flush()
    return empresa


_INTERNOS = ("_exportar_lancamentos", "_exportar_lancamentos_importacao", "_exportar_extrato", "_exportar_notas", "_exportar_conferencia")


async def _executar(db, chamada: str, e: dict) -> dict:
    from src.core.errors import AppError
    from src.domain.exportacao.service import ExportacaoService
    from src.schemas.contabil import ExportJobCreate

    empresa = await _base(db, e)
    servico = ExportacaoService(db, empresa.id, USUARIO)
    pedido = ExportJobCreate.model_validate(e["pedido"])
    try:
        if chamada == "exportar":
            resposta, conteudo = await servico.exportar(pedido)
            fmt, total = resposta.formato, resposta.total_registros
        else:
            fmt = e["formato"]
            args = (e["tipo"], pedido, fmt) if chamada == "_exportar_notas" else (pedido, fmt)
            linhas, conteudo = await getattr(servico, chamada)(*args)
            total = len(linhas)
    except AppError as exc:
        return _erro(exc)
    return {"total": total, "contas_sem_codigo": _contas_sem_codigo(servico, chamada, e["pedido"]), **_arquivo(fmt, conteudo)}


def _contas_sem_codigo(servico, chamada: str, pedido: dict) -> list[str]:
    """As contas sem código reduzido (o cabeçalho da rota): só a exportação do Domínio as calcula; nas outras, a
    lista da instância é a da chamada anterior (a suíte reaproveita o serviço), e a rota nova não a veria."""
    if chamada == "_exportar_lancamentos_importacao" or (chamada == "exportar" and pedido.get("tipo") == "lancamentos_importacao"):
        return list(servico._contas_sem_codigo_abreviado)
    return []


# ─── A foto do banco (o que o serviço pode ler) ─────────────────────────────

async def _foto(db, empresa_id) -> dict:
    from sqlalchemy import select

    from src.db.models import (AgenciaBancaria, Comprovante, Empresa, ExtratoImportacao, NotaFiscal, PlanoConta, RegistroContabil,
                               Transacao)

    def quem(x):
        return "esta" if x.empresa_id == empresa_id else "outra"

    async def todas(modelo):
        return list((await db.execute(select(modelo))).scalars())

    emp = await db.get(Empresa, empresa_id)
    return {
        "empresa": {"id": str(emp.id), "cnpj": emp.cnpj},
        "agencias": [{"id": str(a.id), "empresa": quem(a), "banco_sigla": a.banco_sigla, "agencia": a.agencia, "numero": a.numero,
                      "digito": a.digito, "ativa": a.ativa, "apagada": a.deleted_at is not None} for a in await todas(AgenciaBancaria)],
        "contas": [{"id": str(c.id), "empresa": quem(c), "codigo": c.codigo, "descricao": c.descricao, "conta_numero": c.conta_numero}
                   for c in await todas(PlanoConta)],
        "importacoes": [{"id": str(i.id), "empresa": quem(i), "agencia_id": str(i.agencia_id), "created_at": _iso(i.created_at)}
                        for i in await todas(ExtratoImportacao)],
        "transacoes": [{"id": str(t.id), "empresa": quem(t), "agencia_id": str(t.agencia_id), "data": t.data.isoformat(),
                        "valor": _dinheiro(t.valor), "historico": t.historico, "dc": t.dc, "status": t.status, "ordem": t.ordem,
                        "importacao_id": str(t.importacao_id) if t.importacao_id else None, "apagada": t.deleted_at is not None,
                        "ordem_insercao": k} for k, t in enumerate(await todas(Transacao))],
        "registros": [{"id": str(r.id), "empresa": quem(r), "transacao_id": str(r.transacao_id) if r.transacao_id else None,
                       "lancamento_id": str(r.lancamento_id), "ordem_composicao": r.ordem_composicao, "conta_id": str(r.conta_id), "agencia_id": str(r.agencia_id),
                       "historico": r.historico, "historico_extrato": r.historico_extrato, "dc": r.dc, "tipo_regra": r.tipo_regra,
                       "valor": _dinheiro(r.valor), "data_lancamento": _iso(r.data_lancamento), "apagado": r.deleted_at is not None,
                       "ordem_insercao": k} for k, r in enumerate(await todas(RegistroContabil))],
        "notas": [{"id": str(n.id), "empresa": quem(n), "tipo": n.tipo, "numero": n.numero, "serie": n.serie, "cnpj_emitente": n.cnpj_emitente,
                   "nome_emitente": n.nome_emitente, "cnpj_destinatario": n.cnpj_destinatario, "valor": _dinheiro(n.valor),
                   "data_emissao": _iso(n.data_emissao), "status": n.status, "transacao_id": str(n.transacao_id) if n.transacao_id else None,
                   "chave_acesso": n.chave_acesso, "apagada": n.deleted_at is not None, "ordem_insercao": k}
                  for k, n in enumerate(await todas(NotaFiscal))],
        "comprovantes": [{"id": str(c.id), "empresa": quem(c), "transacao_id": str(c.transacao_id) if c.transacao_id else None,
                          "favorecido": c.favorecido, "valor_pago": _dinheiro(c.valor_pago), "apagado": c.deleted_at is not None,
                          "ordem_insercao": k} for k, c in enumerate(await todas(Comprovante))],
    }


def pytest_configure(config):  # noqa: ARG001
    from src.core.errors import AppError
    from src.domain.exportacao import service as S

    if getattr(S, "__gabarito__", False):
        return
    S.__gabarito__ = True
    _instalar_pg()
    _ORIGINAL["S"] = S
    Servico = S.ExportacaoService
    exportar0 = Servico.exportar
    internos0 = {n: getattr(Servico, n) for n in _INTERNOS}

    async def gravar(self, chamada, extra, executar):
        if _EM_CURSO["montado"] or _EM_CURSO["dentro"] or self._db is None:
            return await executar()
        _EM_CURSO["dentro"] = True
        try:
            entrada = {**await _foto(self._db, self._empresa_id), **extra}
            try:
                r, exc = await executar(), None
            except AppError as e:
                r, exc = None, e
            if exc is not None:
                saida = _erro(exc)
            elif chamada == "exportar":
                resposta, conteudo = r
                saida = {"total": resposta.total_registros, "contas_sem_codigo": _contas_sem_codigo(self, chamada, extra["pedido"]),
                         **_arquivo(resposta.formato, conteudo)}
            else:
                linhas, conteudo = r
                saida = {"total": len(linhas), "contas_sem_codigo": _contas_sem_codigo(self, chamada, extra["pedido"]),
                         **_arquivo(extra["formato"], conteudo)}
            _DA_SUITE.append((chamada, entrada, saida))
        finally:
            _EM_CURSO["dentro"] = False
        if exc is not None:
            raise exc
        return r

    async def exportar(self, data):
        return await gravar(self, "exportar", {"pedido": data.model_dump(mode="json")}, lambda: exportar0(self, data))

    def interno(nome):
        async def f(self, *args):
            if nome == "_exportar_notas":
                tipo, data, fmt = args
                extra = {"pedido": data.model_dump(mode="json"), "formato": fmt, "tipo": tipo}
            else:
                data, fmt = args
                extra = {"pedido": data.model_dump(mode="json"), "formato": fmt}
            return await gravar(self, nome, extra, lambda: internos0[nome](self, *args))
        return f

    Servico.exportar = exportar
    for n in _INTERNOS:
        setattr(Servico, n, interno(n))


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=(prefixo << 96) | next(_IDS)))


HISTORICOS = [
    "PIX RECEBIDO CLIENTE EXEMPLO", "PAGAMENTO FORNECEDOR FICTICIO", "TARIFA BANCARIA", "=SOMA(A1:A2)", "-TARIFA AVULSA",
    "+55 TRANSFERENCIA", "@USUARIO PIX", "  =ESPACO ANTES", "LIQUIDAÇÃO BOLETO ÁGUA", "liquidação boleto água", "APLICACAO CDB",
    "RESGATE POUPANCA", 'TEXTO COM "ASPAS"', "VIRGULA, NO MEIO", "PONTO;E;VIRGULA", "QUEBRA\nDE LINHA", "100% CERTO", "SALDO_DIA",
    "PGTO REF NF 123", "Ç MAIÚSCULO ÇEDILHA", "ção minúsculo", "ÉPOCA", "época", "DEPOSITO 50,00",
]


def _agencias() -> list[dict]:
    def ag(sigla, agencia, numero, digito, ativa=True, apagada=False, empresa="esta"):
        return {"id": _uid(0xA6), "empresa": empresa, "banco_sigla": sigla, "agencia": agencia, "numero": numero, "digito": digito,
                "ativa": ativa, "apagada": apagada}
    return [ag("ITAU", "0001", "12345", "6"), ag("BB", "1234", "99887", None, ativa=False), ag("SICOOB", "3069", "55555", "0", apagada=True),
            ag("SAFRA", "0005", "77777", None, empresa="outra"), ag("CAIXA", "0420", "1001", None, ativa=False, apagada=True)]


def _contas() -> list[dict]:
    def conta(codigo, descricao, numero, empresa="esta"):
        return {"id": _uid(0xC0), "empresa": empresa, "codigo": codigo, "descricao": descricao, "conta_numero": numero}
    return [conta("1.1.1.01", "Banco conta movimento", 5), conta("3.4.2.05.0009", "Despesas bancárias", 1026),
            conta("4.1.1", "Receitas de serviços", None), conta("1.1.B.x", "Conta bancária sintética", None),
            conta("2.1.1", "Fornecedores", 2001), conta("9.9.9", "Da outra empresa", 77, empresa="outra")]


def _valor(rng: random.Random) -> str:
    escolha = rng.random()
    if escolha < 0.08:
        return f"-{rng.randint(1, 999)}.{rng.randint(0, 99):02d}"
    if escolha < 0.12:
        return "0.00"
    if escolha < 0.2:
        return f"{rng.randint(1, 9_999_999_999)}.{rng.randint(0, 99):02d}"
    return f"{rng.randint(1, 9999)}.{rng.randint(0, 99):02d}"


def _mundo(rng: random.Random, cnpj_empresa: str = EMPRESA_CNPJ) -> dict:
    agencias = _agencias()
    contas = _contas()
    esta = [a for a in agencias if a["empresa"] == "esta"]
    base = datetime(2026, 2, 1, 12, tzinfo=UTC)
    importacoes = [{"id": _uid(0x1B), "empresa": "esta", "agencia_id": agencias[k]["id"], "created_at": (base + timedelta(days=k, microseconds=k)).isoformat()}
                   for k in (0, 1, 0)]
    dias = [date(2026, 1, 31), date(2026, 2, 1), date(2026, 2, 28), date(2026, 3, 1), date(2026, 3, 15), date(2026, 3, 31), date(2026, 4, 1),
            date(2026, 4, 30)]
    transacoes = []
    for k in range(rng.randint(14, 26)):
        ag = rng.choice(esta + [agencias[3]] if rng.random() < 0.1 else esta)
        imp = rng.choice([None, *importacoes])
        transacoes.append({
            "id": _uid(0x7A), "empresa": ag["empresa"], "agencia_id": ag["id"], "data": rng.choice(dias).isoformat(), "valor": _valor(rng),
            "historico": rng.choice(HISTORICOS), "dc": rng.choice("DC"), "status": rng.choice(["pendente", "processada", "processada", "erro"]),
            "ordem": rng.choice([None, 0, 1, 2, 3, 7]), "importacao_id": imp["id"] if imp else None, "apagada": rng.random() < 0.12,
            "ordem_insercao": k,
        })
    registros = []
    contas_esta = [c for c in contas if c["empresa"] == "esta"]
    for t in transacoes:
        if t["empresa"] != "esta" or t["status"] != "processada" and rng.random() < 0.7:
            continue
        quantos = 1 if rng.random() < 0.8 else 2
        for componente in range(quantos):
            lanc = _uid(0x1A)
            hora = rng.choice(["T00:00:00+00:00", "T00:00:00+00:00", "T23:30:00+00:00", "T02:00:00+00:00", "T12:00:00.250000+00:00"])
            apagado = rng.random() < 0.15
            hist = rng.choice(HISTORICOS + [""])
            valor = t["valor"] if rng.random() < 0.8 else _valor(rng)
            pernas = ["D", "C"] if rng.random() < 0.92 else [rng.choice("DC")]
            for dc in pernas:
                registros.append({
                    "id": _uid(0x8A), "empresa": "esta", "transacao_id": t["id"] if rng.random() < 0.95 else None, "lancamento_id": lanc,
                    "ordem_composicao": componente + 1 if quantos > 1 else None,
                    "conta_id": rng.choice(contas_esta)["id"], "agencia_id": t["agencia_id"], "historico": hist,
                    "historico_extrato": rng.choice([t["historico"], ""]), "dc": dc, "tipo_regra": rng.choice(["automatica", "contraparte", "manual"]),
                    "valor": valor, "data_lancamento": t["data"] + hora, "apagado": apagado, "ordem_insercao": len(registros),
                })
    # Partida sem transação e de outra empresa.
    registros.append({"id": _uid(0x8A), "empresa": "outra", "transacao_id": None, "lancamento_id": _uid(0x1A), "ordem_composicao": None, "conta_id": contas[5]["id"],
                      "agencia_id": agencias[3]["id"], "historico": "DA OUTRA", "historico_extrato": "", "dc": "D", "tipo_regra": "manual",
                      "valor": "1.00", "data_lancamento": "2026-03-15T00:00:00+00:00", "apagado": False, "ordem_insercao": len(registros)})
    so_esta = [t for t in transacoes if t["empresa"] == "esta"]
    terceiro = cnpj("999999990005")
    notas = []
    instantes = ["2026-03-01T00:00:00+00:00", "2026-03-15T13:45:10+00:00", "2026-03-31T23:59:59.999999+00:00", "2026-04-01T00:00:00+00:00",
                 "2026-03-31T22:00:00-03:00", "2026-02-28T23:30:00+00:00", "2026-03-10T00:00:00+00:00", "2026-03-10T00:00:00+00:00"]
    for k in range(rng.randint(6, 14)):
        tipo = rng.choice(["nfe", "nfse"])
        saida = rng.random() < 0.5
        emp_fmt = rng.choice([cnpj_empresa, re.sub(r"\D", "", cnpj_empresa)])
        ligada = rng.choice([None, None, *so_esta]) if so_esta else None
        da_outra = rng.random() < 0.07
        if da_outra:
            # A nota de outra empresa só se liga a transação dela (o associar confere).
            ligada = None
        notas.append({
            "id": _uid(0x4F), "empresa": "outra" if da_outra else "esta", "tipo": tipo, "numero": str(rng.randint(1, 99999)),
            "serie": rng.choice([None, "1", "A1"]), "cnpj_emitente": emp_fmt if saida else terceiro,
            "nome_emitente": rng.choice([None, "FORNECEDOR EXEMPLO LTDA", "=FORMULA SA", "-MENOS LTDA"]),
            "cnpj_destinatario": rng.choice([terceiro, None]) if saida else rng.choice([emp_fmt, emp_fmt, None, terceiro]),
            "valor": _valor(rng).lstrip("-") or "1.00", "data_emissao": _utc_iso(rng.choice(instantes)),
            "status": rng.choice(["pendente", "associada", "cancelada"]), "transacao_id": ligada["id"] if ligada else None,
            "chave_acesso": "".join(rng.choice("0123456789") for _ in range(44)) if tipo == "nfe" and rng.random() < 0.7 else None,
            "apagada": rng.random() < 0.12, "ordem_insercao": k,
        })
    comprovantes = []
    for k in range(rng.randint(3, 10)):
        ligada = rng.choice([None, *so_esta]) if so_esta else None
        comprovantes.append({"id": _uid(0xC2), "empresa": "esta", "transacao_id": ligada["id"] if ligada else None,
                             "favorecido": rng.choice([None, "FORNECEDOR EXEMPLO", "@ARROBA", "+MAIS"]), "valor_pago": _valor(rng),
                             "apagado": rng.random() < 0.12, "ordem_insercao": k})
    return {"empresa": {"id": EMPRESA_ID, "cnpj": cnpj_empresa}, "agencias": agencias, "contas": contas, "importacoes": importacoes, "transacoes": transacoes,
            "registros": registros, "notas": notas, "comprovantes": comprovantes}


def _utc_iso(v: str) -> str:
    return datetime.fromisoformat(v).astimezone(UTC).isoformat()


def _pedidos(rng: random.Random, mundo: dict) -> list[dict]:
    ags = mundo["agencias"]
    periodos = [{"mes": "2026-03"}, {"mes": "2026-02"}, {}, {"mes": "2026-04"},
                {"data_de": "2026-03-01T00:00:00Z", "data_ate": "2026-03-31T23:59:59Z"},
                {"data_de": "2026-03-01T00:00:00-03:00", "data_ate": "2026-03-31T23:59:59-03:00"},
                {"data_de": "2026-03-15T10:00:00+00:00"}, {"data_ate": "2026-03-01T01:00:00+02:00"},
                {"mes": "2026-03", "data_de": "2025-01-01T00:00:00Z"}]
    saida = []
    tipos = ["lancamentos", "lancamentos_importacao", "extrato", "nfe_entrada", "nfe_saida", "nfse_tomado", "nfse_prestado", "conferencia"]
    for tipo in tipos:
        for _ in range(9):
            p = {"tipo": tipo, "formato": rng.choice(["csv", "csv", "xlsx"] + (["txt"] if tipo == "lancamentos_importacao" else [])),
                 **rng.choice(periodos)}
            if rng.random() < 0.4:
                p["incluir_contas_inativas"] = True
            if rng.random() < 0.3:
                p["agencia_id"] = rng.choice(ags)["id"]
            if tipo == "lancamentos_importacao" and rng.random() < 0.5:
                p["usar_historico_extrato"] = True
            if tipo == "extrato":
                if rng.random() < 0.4:
                    p["status"] = rng.choice(["pendente", "processada", "erro"])
                if rng.random() < 0.4:
                    p["dc"] = rng.choice("DC")
                if rng.random() < 0.4:
                    p["historico"] = rng.choice([" tarifa ", "ÁGUA", "água", "agua", "%", "SALDO_DIA", "_", "ção", "ÇÃO", "pix", "\\", "=SOMA"])
                if rng.random() < 0.3:
                    p["valor_min"] = rng.choice(["0", "10.50", "1000"])
                if rng.random() < 0.3:
                    p["valor_max"] = rng.choice(["0", "500", "99999.99"])
            saida.append(p)
    return saida


def _registrar(mundo: dict) -> str:
    """Os mundos inventados vão uma vez só para `exportacao-mundos.json`; o caso leva a chave."""
    chave = json.dumps(mundo, sort_keys=True, ensure_ascii=False)
    for k, m in _MUNDOS.items():
        if json.dumps(m, sort_keys=True, ensure_ascii=False) == chave:
            return k
    k = f"m{len(_MUNDOS) + 1}"
    _MUNDOS[k] = mundo
    return k


def casos_inventados(rng: random.Random) -> list[tuple[str, dict]]:
    saida: list[tuple[str, dict]] = []
    for _ in range(9):
        mundo = _mundo(rng)
        for p in _pedidos(rng, mundo):
            saida.append(("exportar", {"mundo": _registrar(mundo), "pedido": p}))
    # O CNPJ da empresa que não é CNPJ: as notas recusam; os outros tipos não olham.
    for invalido in ("00.000.000/0000-00", "12.345.678/0001-00", "", "123", "11111111111111", cnpj("123456780001", mascara=False)):
        mundo = _mundo(rng, cnpj_empresa=invalido)
        chave = _registrar(mundo)
        for tipo in ("nfe_entrada", "nfse_prestado", "lancamentos", "conferencia"):
            saida.append(("exportar", {"mundo": chave, "pedido": {"tipo": tipo, "formato": "csv", "mes": "2026-03"}}))
    # Recusas do pedido.
    mundo = _mundo(rng)
    for p in [{"formato": "pdf"}, {"formato": "XLSX"}, {"formato": "txt"}, {"formato": "txt", "tipo": "extrato"}, {"formato": "csv", "tipo": "nfe"},
              {"formato": "csv", "tipo": ""}, {"formato": "csv", "tipo": "Lancamentos"}, {}, {"tipo": "conferencia"}, {"formato": "pdf", "tipo": "xyz"},
              {"formato": "txt", "tipo": "xyz"}]:
        saida.append(("exportar", {"mundo": _registrar(mundo), "pedido": p}))
    return saida


def casos_formatacao() -> list[dict]:
    """`_dicts_to_csv` e `_dicts_to_xlsx` direto: a neutralização de fórmula, as aspas, os números."""
    from src.domain.exportacao.formatos import _dicts_to_csv, _dicts_to_xlsx

    colunas = ["a", "b", "c"]
    linhas = [
        {"a": "=1+1", "b": "+X", "c": "-Y"}, {"a": "@Z", "b": "  =ESPACO", "c": "\t=TAB"}, {"a": Decimal("-10.00"), "b": Decimal("0.00"), "c": Decimal("1E+2")},
        {"a": 'com "aspas"', "b": "vir,gula", "c": "linha\r\nnova"}, {"a": "", "b": None, "c": "ok"}, {"a": Decimal("-0.00"), "b": "x"},
        {"a": "ÁÉÍÕÇ", "b": "日本", "c": "😀"}, {"b": "só b"}, {"a": Decimal("12345678901234.56"), "b": Decimal("0.10"), "c": Decimal("3")},
    ]
    saida = []
    for k in range(1, len(linhas) + 1):
        parte = linhas[:k]
        cod = [{c: (None if v is None else {"dec": str(v)} if isinstance(v, Decimal) else v) for c, v in linha.items()} for linha in parte]
        saida.append({"tipo": "formatacao", "entrada": {"linhas": cod, "colunas": colunas, "folha": "Teste"},
                      "saida": {"texto": _dicts_to_csv(parte, colunas).decode("utf-8"), "planilha": despejo(_dicts_to_xlsx(parte, colunas, "Teste"))}})
    return saida


def casos_validacao() -> list[dict]:
    from pydantic import ValidationError as ErroPydantic

    from src.schemas.contabil import ExportJobCreate

    variantes = [
        {}, {"mes": "2026-03"}, {"mes": "2026-13"}, {"mes": "2026-00"}, {"mes": "26-03"}, {"mes": "2026-3"}, {"mes": "junho/2024"}, {"mes": "0000-01"},
        {"mes": ""}, {"mes": None}, {"dc": "D"}, {"dc": "d"}, {"dc": "X"}, {"dc": ""}, {"valor_min": "-1"}, {"valor_min": "0"}, {"valor_max": "abc"},
        {"valor_max": "10.5"}, {"agencia_id": "x"}, {"agencia_id": str(uuid.UUID(int=5))}, {"status": "qualquer"}, {"historico": "  a  "},
        {"incluir_contas_inativas": "sim"}, {"incluir_contas_inativas": "true"}, {"usar_historico_extrato": 1}, {"formato": 3}, {"tipo": None},
        {"data_de": "2026-03-01"}, {"data_de": "ontem"}, {"data_ate": "2026-03-31T23:59:59-03:00"},
    ]
    saida = []
    for v in variantes:
        try:
            m = ExportJobCreate.model_validate_json(json.dumps(v))
        except ErroPydantic as exc:
            e = exc.errors()[0]
            saida.append({"tipo": "validacao", "entrada": v, "saida": {"pydantic": {"type": e["type"], "loc": [str(x) for x in e["loc"]]}}})
            continue
        saida.append({"tipo": "validacao", "entrada": v, "saida": {"ok": m.model_dump(mode="json")}})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for chamada, entrada, real in _DA_SUITE:
            refeito = await montado.rodar(chamada, entrada, pg=False)
            if refeito != real:
                raise AssertionError(f"o banco montado não repete a suíte ({chamada}):\n{json.dumps(refeito, ensure_ascii=False, default=str)[:3000]}\n"
                                     f"{json.dumps(real, ensure_ascii=False, default=str)[:3000]}")
            limpa = _sanitizar(entrada)
            _guardar(chamada, "suite", limpa, await montado.rodar(chamada, limpa))
        rng = random.Random(20261126)
        for chamada, e in casos_inventados(rng):
            _guardar(chamada, "inventado", e, await montado.rodar(chamada, {**_MUNDOS[e["mundo"]], **e}))
    finally:
        await montado.fechar()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    os.makedirs(pasta, exist_ok=True)
    asyncio.run(_tudo())
    diretos = casos_formatacao() + casos_validacao()
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate([*diretos, *lista], start=1)]
    for c in itens:
        c.setdefault("origem", "direto")
    arquivos = _escrever_partes(pasta, "exportacao", itens)
    with open(os.path.join(pasta, "exportacao-mundos.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(_MUNDOS, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    arquivos.append("exportacao-mundos.json")
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        chave = c["tipo"] if c["tipo"] != "exportar" else f"exportar:{c['entrada']['pedido'].get('tipo') or 'lancamentos'}"
        n = por_tipo.setdefault(chave, [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += ("erro" in c["saida"] or "pydantic" in c["saida"])
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} com recusa)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito das exportações: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
