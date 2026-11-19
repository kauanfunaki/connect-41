"""Gabarito do serviço das notas fiscais (Bloco C, Fase C1, 18/11/2026).

Plugin do pytest: roda os testes do original (dev41tech/contabil-core) das notas fiscais (`NotaService`,
`src/domain/notas/service.py`) e grava, para cada chamada de `criar`, `importar_xml`, `importar_visual`,
`associar_transacao`, `desassociar_transacao`, `cancelar` e `listar`, a entrada das partes puras (o que
o serviço leu do banco, o que recebeu, o que o leitor devolveu) e a saída exata: a nota gravada (com o
`dedup_key`), o resultado da importação, a recusa (tipo e frase) ou a página da lista. Depois acrescenta
casos inventados, com semente fixa, para cada ramo (inclusive `importar_zip`, que a suíte não chama, com
ZIPs inventados gravados ao lado), e chamadas diretas do `NotaFiscalCreate` com a identidade calculada.
O porte em TypeScript repete tudo em `src/lib/contabil-core/notas/servico.test.ts`.

COMO A SAÍDA É GRAVADA: o serviço original roda de novo num SQLite em memória montado só com a entrada
gravada (já sanitizada): empresa, transações e notas. Os leitores (`parse_nota_xml`, `parse_pdf`,
`parse_imagem`) são trocados pela saída gravada, para o gabarito não depender do porte deles (que tem
gabarito próprio). As chamadas da suíte também rodam assim com a entrada SEM sanitizar, e o resultado
tem de ser igual ao da suíte de verdade (senão o plugin aborta).

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs
que não são de exemplo viram fictícios começando com 9. Os inventados usam só CNPJs de exemplo
(raízes 12345678, 99999999 e 11111111, com os verificadores calculados).

Uso, a partir da raiz do contabil-core (os testes usam SQLite em memória):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_DIR=<connect>/src/lib/contabil-core/notas/gabarito/servico \\
        python -W ignore -m pytest -q -p gabarito_notas_servico tests/integration/test_notas.py tests/unit/test_notas_service_visual.py
"""
from __future__ import annotations

import asyncio
import copy
import io
import itertools
import json
import os
import random
import uuid
import zipfile
from datetime import UTC, date, datetime
from decimal import Decimal

from gabarito_cruzamento import sanitizar_texto
from gabarito_revisao import _escrever_partes

_ORIGINAL: dict = {}
_EM_CURSO: dict = {"dentro": False, "montado": None}
_DA_SUITE: list[tuple[str, dict, dict]] = []
casos: dict[str, dict] = {}
_ZIPS: dict[str, bytes] = {}

AGENCIA_ID = uuid.UUID(int=0xA6E)
NOVA = "<nova>"


# ─── CNPJs e chaves de exemplo ──────────────────────────────────────────────

def _dv(d: str, pesos) -> str:
    resto = sum(int(a) * p for a, p in zip(d, pesos)) % 11
    return "0" if resto < 2 else str(11 - resto)


def cnpj(base12: str, formatado: bool = True) -> str:
    d = base12 + _dv(base12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d += _dv(d, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}" if formatado else d


EMPRESA = cnpj("123456780001")
FILIAL = cnpj("123456780002")
FORNECEDOR = cnpj("999999990001")
CLIENTE = cnpj("111111110001")
OUTRO = cnpj("999999990002")


def _digitos(v: str) -> str:
    return "".join(c for c in v if c.isdigit())


def chave(rng: random.Random, emitente: str = FORNECEDOR, modelo: str = "55") -> str:
    meio = f"35{rng.randint(20, 26):02d}{rng.randint(1, 12):02d}{_digitos(emitente)}{modelo}{rng.randint(1, 9):03d}{rng.randint(1, 999999):09d}1{rng.randint(0, 99999999):08d}"
    return meio + str(rng.randint(0, 9))


# ─── Codificação ─────────────────────────────────────────────────────────────

def _iso(v: datetime) -> str:
    return v.isoformat()


# A emissão como o serviço a gravou (com o fuso). O SQLite devolve a data sem o fuso; o PostgreSQL
# guardava o instante. `after_flush` anota o valor atribuído antes de qualquer releitura.
_EMISSOES: dict[str, str] = {}


def _anotar_emissoes(session, _contexto) -> None:
    from src.db.models import NotaFiscal

    for obj in list(session.new) + list(session.dirty):
        if isinstance(obj, NotaFiscal) and obj.id is not None and isinstance(obj.data_emissao, datetime) and obj.data_emissao.tzinfo:
            _EMISSOES[str(obj.id)] = obj.data_emissao.isoformat()


def _linha(n) -> dict:
    return {
        "id": str(n.id), "tipo": n.tipo, "numero": n.numero, "serie": n.serie, "cnpj_emitente": n.cnpj_emitente,
        "nome_emitente": n.nome_emitente, "cnpj_destinatario": n.cnpj_destinatario, "valor": str(n.valor),
        "data_emissao": _EMISSOES.get(str(n.id), _iso(n.data_emissao)), "status": n.status, "transacao_id": str(n.transacao_id) if n.transacao_id else None,
        "chave_acesso": n.chave_acesso, "dedup_key": n.dedup_key, "observacao": n.observacao, "origem": n.origem,
        "assinatura_motivo": n.assinatura_motivo,
    }


def _parseada(n) -> dict:
    return {
        "tipo": n.tipo, "numero": n.numero, "serie": n.serie, "cnpj_emitente": n.cnpj_emitente, "nome_emitente": n.nome_emitente,
        "cnpj_destinatario": n.cnpj_destinatario, "valor": str(n.valor), "data_emissao": _iso(n.data_emissao),
        "chave_acesso": n.chave_acesso, "observacao": n.observacao, "assinatura_nao_verificada": n.assinatura_nao_verificada,
    }


def _parseada_obj(d: dict):
    from src.domain.notas.xml_parser import NotaParseada

    return NotaParseada(**{**d, "valor": Decimal(d["valor"]), "data_emissao": datetime.fromisoformat(d["data_emissao"])})


def _erro(exc) -> dict:
    return {"erro": {"tipo": type(exc).__name__, "mensagem": exc.message}}


def _pydantic(campos: dict) -> dict | None:
    """O primeiro erro do `NotaFiscalCreate` para estes campos (o que vira a linha de erro da importação)."""
    from pydantic import ValidationError as ErroPydantic

    from src.schemas.notas import NotaFiscalCreate

    try:
        NotaFiscalCreate(**campos)
    except ErroPydantic as exc:
        e = exc.errors()[0]
        return {"type": e["type"], "loc": [str(x) for x in e["loc"]], "msg": e["msg"]}
    return None


# ─── Sanitização (só as chamadas da suíte; os inventados já são fictícios) ──

def _s(v):
    return sanitizar_texto(v) if isinstance(v, str) else v


_TEXTOS = ("numero", "serie", "cnpj_emitente", "nome_emitente", "cnpj_destinatario", "observacao", "assinatura_motivo",
           "assinatura_nao_verificada", "historico", "chave_acesso")


def _sanitizar(v):
    if isinstance(v, dict):
        return {k: (_s(x) if k in _TEXTOS or k in ("nome_arquivo", "cnpj", "mensagem") else _sanitizar(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_sanitizar(x) for x in v]
    return v


# ─── O banco montado com a entrada ──────────────────────────────────────────

class _Montado:
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
                _EM_CURSO["montado"] = e
                return await _executar(db, tipo, e)
            finally:
                _EM_CURSO["montado"] = None
                await db.rollback()


async def _base(db, e: dict):
    from src.db.models import AgenciaBancaria, Empresa, NotaFiscal, Tenant, Transacao

    tenant = Tenant(nome="Escritório do gabarito", cnpj="00.000.000/0001-00")
    db.add(tenant)
    await db.flush()
    empresa = Empresa(tenant_id=tenant.id, razao_social="EMPRESA EXEMPLO LTDA", cnpj=(e.get("empresa") or {}).get("cnpj", EMPRESA),
                      regime_tributario="simples_nacional")
    outra = Empresa(tenant_id=tenant.id, razao_social="OUTRA EMPRESA", cnpj=OUTRO, regime_tributario="simples_nacional")
    db.add_all([empresa, outra])
    await db.flush()
    db.add_all([
        AgenciaBancaria(id=AGENCIA_ID, empresa_id=empresa.id, banco_sigla="ITAU", agencia="1234", numero="56789", ativa=True),
        AgenciaBancaria(id=uuid.UUID(int=0xA6F), empresa_id=outra.id, banco_sigla="ITAU", agencia="1234", numero="99999", ativa=True),
    ])
    await db.flush()
    for t in e.get("transacoes", []):
        da_outra = t.get("empresa") == "outra"
        db.add(Transacao(
            id=uuid.UUID(t["id"]), empresa_id=outra.id if da_outra else empresa.id,
            agencia_id=uuid.UUID(int=0xA6F) if da_outra else AGENCIA_ID, data=date.fromisoformat(t.get("data", "2026-03-05")),
            valor=Decimal(t["valor"]), historico=t["historico"], dc=t["dc"], hash_dedup=t["id"].replace("-", "") * 2,
            deleted_at=datetime(2026, 3, 9, tzinfo=UTC) if t.get("apagada") else None,
        ))
    await db.flush()
    for n in e.get("notas", []):
        db.add(NotaFiscal(
            id=uuid.UUID(n["id"]), empresa_id=empresa.id, tipo=n["tipo"], numero=n["numero"], serie=n["serie"],
            cnpj_emitente=n["cnpj_emitente"], nome_emitente=n["nome_emitente"], cnpj_destinatario=n["cnpj_destinatario"],
            valor=Decimal(n["valor"]), data_emissao=_utc(datetime.fromisoformat(n["data_emissao"])), status=n["status"],
            transacao_id=uuid.UUID(n["transacao_id"]) if n["transacao_id"] else None, chave_acesso=n["chave_acesso"],
            dedup_key=n["dedup_key"], observacao=n["observacao"], origem=n["origem"], assinatura_motivo=n["assinatura_motivo"],
        ))
    await db.flush()
    return empresa if e.get("empresa", {}) is not None else None


async def _notas(db, empresa_id) -> list[dict]:
    from sqlalchemy import select

    from src.db.models import NotaFiscal

    return [_linha(n) for n in (await db.execute(
        select(NotaFiscal).where(NotaFiscal.empresa_id == empresa_id).order_by(NotaFiscal.created_at, NotaFiscal.id)
    )).scalars()]


def _novas(antes: list[dict], depois: list[dict]) -> list[dict]:
    ja = {n["id"] for n in antes}
    return [{**n, "id": NOVA} for n in depois if n["id"] not in ja]


def _lista(r) -> dict:
    return {
        "total": r.total,
        "itens": [
            {"id": str(i.id), "data_emissao": _EMISSOES.get(str(i.id), _iso(i.data_emissao)), "transacao_descricao": i.transacao_descricao,
             "transacao_valor": str(i.transacao_valor) if i.transacao_valor is not None else None, "transacao_dc": i.transacao_dc}
            for i in r.items
        ],
    }


def _utc(d: datetime) -> datetime:
    """Sem fuso vale como UTC (o `_data_utc` do original); com fuso, convertido."""
    return d.replace(tzinfo=UTC) if d.tzinfo is None else d.astimezone(UTC)


def _filtros_obj(f: dict) -> dict:
    # Em UTC: o SQLite compara o texto da data sem o fuso; o PostgreSQL compara o instante.
    return {k: (_utc(datetime.fromisoformat(v)) if k in ("data_de", "data_ate") and v else v) for k, v in f.items()}


async def _executar(db, tipo: str, e: dict) -> dict:
    from src.core.errors import AppError
    from src.domain.notas import service as S
    from src.domain.notas import visual_parser
    from src.schemas.notas import AssociarTransacaoRequest, NotaFiscalCreate

    empresa = await _base(db, e)
    empresa_id = empresa.id if empresa is not None else uuid.UUID(int=0xDEAD)
    servico = S.NotaService(db, empresa_id)
    antes = await _notas(db, empresa_id)
    saida: dict = {}
    trocas = {}
    try:
        if tipo == "criar":
            await servico.criar(NotaFiscalCreate.model_validate(e["dados"]))
        elif tipo in ("importar", "zip"):
            leituras = e["leituras"] if tipo == "zip" else {"": e["leitura"]}
            mime: list[str] = []

            def ler(conteudo, content_type=None):
                if content_type is not None:
                    mime.append(content_type)
                chave_ = conteudo.decode("utf-8")[len("<nota>"):-len("</nota>")] if tipo == "zip" else ""
                lida = leituras[chave_]
                if "erro" in lida:
                    raise (ValueError if e.get("via", "xml") == "xml" else visual_parser.VisualParseError)(lida["erro"])
                return _parseada_obj(lida["ok"])

            trocas = {(S, "parse_nota_xml"): S.parse_nota_xml, (visual_parser, "parse_pdf"): visual_parser.parse_pdf,
                      (visual_parser, "parse_imagem"): visual_parser.parse_imagem}
            S.parse_nota_xml = ler
            visual_parser.parse_pdf = ler
            visual_parser.parse_imagem = ler
            if tipo == "zip":
                r = await servico.importar_zip(_ZIPS[e["arquivo"]] if e["arquivo"] in _ZIPS else _ler_zip(e["arquivo"]))
            elif e["via"] == "xml":
                r = await servico.importar_xml(b"<nota></nota>", e["nome_arquivo"])
            else:
                r = await servico.importar_visual(b"<nota></nota>", e["nome_arquivo"], e["extensao"])
            saida = {"importadas": r.importadas, "duplicadas": r.duplicadas, "erros": list(r.erros)}
            if tipo == "importar":
                saida["tipo_mime"] = mime[0] if mime else None
                if e["leitura"].get("ok") and any("for NotaFiscalCreate" in x for x in r.erros):
                    p = e["leitura"]["ok"]
                    saida["pydantic"] = _pydantic({
                        **{k: v for k, v in p.items() if k != "assinatura_nao_verificada"},
                        "valor": Decimal(p["valor"]), "data_emissao": datetime.fromisoformat(p["data_emissao"]),
                        "origem": "ocr" if e["via"] == "visual" else ("xml_nao_verificado" if p["assinatura_nao_verificada"] else "xml_assinado"),
                        "assinatura_motivo": p["assinatura_nao_verificada"],
                    })
        elif tipo == "associar":
            await servico.associar_transacao(uuid.UUID(e["nota_id"]), AssociarTransacaoRequest(transacao_id=e["transacao_id"]))
        elif tipo == "desassociar":
            await servico.desassociar_transacao(uuid.UUID(e["nota_id"]))
        elif tipo == "cancelar":
            await servico.cancelar(uuid.UUID(e["nota_id"]))
        elif tipo == "listar":
            r = await servico.listar(page=e["page"], page_size=e["page_size"], **_filtros_obj(e["filtros"]))
            saida = _lista(r)
        else:
            raise AssertionError(tipo)
        if tipo != "listar":
            depois = await _notas(db, empresa_id)
            if tipo in ("criar", "importar", "zip"):
                saida["notas"] = _novas(antes, depois)
            else:
                saida["nota"] = next(n for n in depois if n["id"] == e["nota_id"])
    except AppError as exc:
        saida = _erro(exc)
    finally:
        for (modulo, nome), original in trocas.items():
            setattr(modulo, nome, original)
    return saida


def _ler_zip(nome: str) -> bytes:
    with open(os.path.join(os.environ["GABARITO_DIR"], nome), "rb") as f:
        return f.read()


# ─── Gravação das chamadas da suíte ─────────────────────────────────────────

async def _transacoes(db, empresa_id) -> list[dict]:
    from sqlalchemy import select

    from src.db.models import Transacao

    return [
        {"id": str(t.id), "historico": t.historico, "valor": str(t.valor), "dc": t.dc, "data": t.data.isoformat(),
         "apagada": t.deleted_at is not None, "empresa": "esta"}
        for t in (await db.execute(select(Transacao).where(Transacao.empresa_id == empresa_id))).scalars()
    ]


async def _empresa(db, empresa_id) -> dict | None:
    from src.db.models import Empresa

    emp = await db.get(Empresa, empresa_id)
    return {"cnpj": emp.cnpj} if emp else None


def pytest_configure(config):  # noqa: ARG001
    from src.core.errors import AppError
    from src.domain.notas import service as S
    from src.domain.notas import visual_parser

    if getattr(S, "__gabarito__", False):
        return
    S.__gabarito__ = True
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    event.listen(Session, "after_flush", _anotar_emissoes)
    _ORIGINAL["S"] = S
    Servico = S.NotaService
    originais = {n: getattr(Servico, n) for n in ("criar", "importar_xml", "importar_visual", "associar_transacao",
                                                  "desassociar_transacao", "cancelar", "listar")}

    async def chamar(nome, self, /, *args, **kw):
        try:
            return await originais[nome](self, *args, **kw), None
        except AppError as exc:
            return None, exc

    async def anotar(nome, tipo, self, entrada, /, *args, **kw):
        notas_antes = await _notas(self._db, self._empresa_id)
        entrada = {"empresa": await _empresa(self._db, self._empresa_id), "notas": notas_antes,
                   "transacoes": await _transacoes(self._db, self._empresa_id), **entrada}
        r, exc = await chamar(nome, self, *args, **kw)
        if exc is not None:
            saida = _erro(exc)
        elif tipo == "listar":
            saida = _lista(r)
        else:
            depois = await _notas(self._db, self._empresa_id)
            if tipo in ("criar", "importar"):
                saida = {"notas": _novas(notas_antes, depois)}
                if tipo == "importar":
                    saida = {"importadas": r.importadas, "duplicadas": r.duplicadas, "erros": list(r.erros), **saida}
            else:
                saida = {"nota": next(n for n in depois if n["id"] == entrada["nota_id"])}
        return r, exc, entrada, saida

    def gravar(nome, tipo, montar):
        async def f(self, *args, **kw):
            if _EM_CURSO["montado"] is not None or _EM_CURSO["dentro"]:
                return await originais[nome](self, *args, **kw)
            r, exc, entrada, saida = await anotar(nome, tipo, self, montar(*args, **kw), *args, **kw)
            _DA_SUITE.append((tipo, entrada, saida))
            if exc is not None:
                raise exc
            return r
        return f

    async def importar(nome, self, conteudo, nome_arquivo, *resto):
        if _EM_CURSO["montado"] is not None:
            return await originais[nome](self, conteudo, nome_arquivo, *resto)
        via = "xml" if nome == "importar_xml" else "visual"
        lidas: list[dict] = []
        mime: list[str] = []
        alvos = [(S, "parse_nota_xml")] if via == "xml" else [(visual_parser, "parse_pdf"), (visual_parser, "parse_imagem")]
        guardados = {a: getattr(*a) for a in alvos}

        def envolver(fn):
            def lido(conteudo_, *a, **kw):
                if a or "content_type" in kw:
                    mime.append(a[0] if a else kw["content_type"])
                try:
                    p = fn(conteudo_, *a, **kw)
                except Exception as exc:
                    lidas.append({"erro": str(exc)})
                    raise
                lidas.append({"ok": _parseada(p)})
                return p
            return lido

        for a, fn in guardados.items():
            setattr(*a, envolver(fn))
        _EM_CURSO["dentro"] = True
        try:
            entrada = {"nome_arquivo": nome_arquivo, "via": via, **({"extensao": resto[0]} if resto else {})}
            r, exc, entrada, saida = await anotar(nome, "importar", self, entrada, conteudo, nome_arquivo, *resto)
        finally:
            _EM_CURSO["dentro"] = False
            for a, fn in guardados.items():
                setattr(*a, fn)
        entrada["leitura"] = lidas[0] if lidas else None
        saida["tipo_mime"] = mime[0] if mime else None
        if lidas:
            _DA_SUITE.append(("importar", entrada, saida))
        if exc is not None:
            raise exc
        return r

    async def importar_xml(self, conteudo, nome_arquivo):
        return await importar("importar_xml", self, conteudo, nome_arquivo)

    async def importar_visual(self, conteudo, nome_arquivo, extensao):
        return await importar("importar_visual", self, conteudo, nome_arquivo, extensao)

    def filtros(page=1, page_size=50, **f):
        return {"page": page, "page_size": page_size,
                "filtros": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in f.items() if v is not None}}

    Servico.criar = gravar("criar", "criar", lambda data: {"dados": data.model_dump(mode="json")})
    Servico.associar_transacao = gravar("associar_transacao", "associar", lambda nota_id, req: {"nota_id": str(nota_id), "transacao_id": str(req.transacao_id)})
    Servico.desassociar_transacao = gravar("desassociar_transacao", "desassociar", lambda nota_id: {"nota_id": str(nota_id)})
    Servico.cancelar = gravar("cancelar", "cancelar", lambda nota_id: {"nota_id": str(nota_id)})
    Servico.listar = gravar("listar", "listar", filtros)
    Servico.importar_xml = importar_xml
    Servico.importar_visual = importar_visual


# ─── Inventados ─────────────────────────────────────────────────────────────

_IDS = itertools.count(1)


def _uid(prefixo: int) -> str:
    return str(uuid.UUID(int=(prefixo << 96) + next(_IDS)))


def _nota_parseada(rng: random.Random, **sobre) -> dict:
    tipo = sobre.pop("tipo", rng.choice(["nfe", "nfe", "nfse"]))
    base = {
        "tipo": tipo, "numero": str(rng.randint(1, 99999)), "serie": rng.choice([None, "1", "2"]),
        "cnpj_emitente": FORNECEDOR, "nome_emitente": "FORNECEDORA FICTICIA LTDA", "cnpj_destinatario": EMPRESA,
        "valor": rng.choice(["100.00", "1500.50", "0.01", "987.65"]),
        "data_emissao": f"2026-0{rng.randint(1, 9)}-{rng.randint(10, 28)}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00-03:00",
        "chave_acesso": chave(rng) if tipo == "nfe" else None, "observacao": None, "assinatura_nao_verificada": None,
    }
    base.update(sobre)
    return base


def _linha_de(parseada: dict, origem: str, **sobre) -> dict:
    """A linha que o original gravaria para esta nota (identidade pelo próprio `_calcular_identidade_nota`)."""
    from src.domain.notas import service as S
    from src.schemas.notas import NotaFiscalCreate

    p = parseada
    data = NotaFiscalCreate(
        tipo=p["tipo"], numero=p["numero"], serie=p["serie"], cnpj_emitente=p["cnpj_emitente"], nome_emitente=p["nome_emitente"],
        cnpj_destinatario=p["cnpj_destinatario"], valor=Decimal(p["valor"]), data_emissao=datetime.fromisoformat(p["data_emissao"]),
        chave_acesso=p["chave_acesso"], observacao=p["observacao"], origem=origem,
    )
    ch = S._normalizar_chave_acesso(data.chave_acesso)
    linha = {
        "id": _uid(0x707A), "tipo": data.tipo, "numero": data.numero, "serie": data.serie, "cnpj_emitente": data.cnpj_emitente,
        "nome_emitente": data.nome_emitente, "cnpj_destinatario": data.cnpj_destinatario, "valor": str(data.valor),
        "data_emissao": _iso(data.data_emissao), "status": "pendente", "transacao_id": None, "chave_acesso": ch,
        "dedup_key": S._calcular_identidade_nota(data, ch), "observacao": data.observacao, "origem": origem, "assinatura_motivo": None,
    }
    linha.update(sobre)
    return linha


def casos_importar(rng: random.Random) -> list[dict]:
    saida: list[dict] = []
    envolvidos = [
        (FORNECEDOR, EMPRESA), (EMPRESA, CLIENTE), (FORNECEDOR, CLIENTE), (FILIAL, FORNECEDOR), (FORNECEDOR, FILIAL),
        (EMPRESA, None), (FORNECEDOR, None), (_digitos(FORNECEDOR), _digitos(EMPRESA)), ("", EMPRESA),
        (cnpj("999999990001")[:-1] + "9", EMPRESA), (EMPRESA, cnpj("111111110001")[:-1] + "8"), ("9999999900019", EMPRESA),
        (EMPRESA, "1234567"), (" " + FORNECEDOR + " ", EMPRESA), (FILIAL, FILIAL),
    ]
    variacoes = {
        "numero": ["1", "000123", " 42 ", "", "N" * 50, "N" * 51, "NFS-é 7"],
        "serie": [None, "1", " 2 ", "", "S" * 10, "S" * 11],
        "valor": ["100.00", "0.01", "10.005", "10.015", "10.025", "-10.025", "0", "0.00", "-5.00", "1234567.891", "9999999999999.99",
                  "10000000000000.00", "9999999999999.995", "1E+2", "100", "0.004"],
        "data_emissao": ["2026-03-05T10:20:00-03:00", "2026-03-05T00:00:00", "2026-03-05T23:30:00+00:00", "2026-03-05T10:20:00.123456-03:00",
                         "2026-03-06T01:00:00+05:30", "2025-12-31T22:00:00-03:00", "2026-03-05T10:20:00.500000", "1999-01-01T00:00:00-02:00"],
        "chave": ["ok", "ok", None, "curta", "formatada", "longa"],
        "observacao": [None, "", "Lida do XML.", "O" * 500, "O" * 501],
        "nome_emitente": [None, "", "EMPRESA FICTICIA FORNECEDORA LTDA", "N" * 300, "N" * 301],
        "assinatura_nao_verificada": [None, None, "a referência do SignedInfo não confere", "M" * 200, "M" * 201],
    }
    erros_de_leitura = ["XML malformado: linha 1.", "NF-e sem protocolo de autorização da SEFAZ.", "Não foi possível extrair os dados da nota.",
                        "A leitura de PDF e imagem por IA está desligada neste escritório."]
    for i in range(320):
        via = rng.choice(["xml", "xml", "xml", "visual"])
        extensao = rng.choice([".pdf", ".png", ".jpg", ".jpeg", ".PDF", ".JPG", ".Png"]) if via == "visual" else None
        nome = f"nota-{i:03d}{extensao or rng.choice(['.xml', '.XML', '.txt', ''])}"
        e: dict = {"empresa": {"cnpj": rng.choice([EMPRESA, EMPRESA, EMPRESA, _digitos(EMPRESA)])}, "notas": [], "transacoes": [],
                   "nome_arquivo": nome, "via": via, **({"extensao": extensao.lower()} if extensao else {})}
        if rng.random() < 0.08:
            e["leitura"] = {"erro": rng.choice(erros_de_leitura)}
            saida.append(e)
            continue
        emit, dest = rng.choice(envolvidos) if rng.random() < 0.5 else envolvidos[0]
        p = _nota_parseada(rng, cnpj_emitente=emit, cnpj_destinatario=dest)
        if rng.random() < 0.6:
            campo = rng.choice(list(variacoes))
            v = rng.choice(variacoes[campo])
            if campo == "chave":
                c = chave(rng)
                p["chave_acesso"] = {"ok": c, None: None, "curta": c[:43], "formatada": " ".join(c[k:k + 4] for k in range(0, 44, 4)),
                                     "longa": c + "1"}[v]
            else:
                p[campo] = v
        if rng.random() < 0.1:
            p["tipo"] = rng.choice(["NFE", " nfse ", "boleto"])
        e["leitura"] = {"ok": p}
        # Notas que já estão na empresa: a mesma nota, outra com a mesma chave, ou uma qualquer.
        sorte = rng.random()
        try:
            origem = "ocr" if via == "visual" else ("xml_nao_verificado" if p["assinatura_nao_verificada"] else "xml_assinado")
            if sorte < 0.15:
                e["notas"] = [_linha_de(p, origem)]
            elif sorte < 0.25 and p["chave_acesso"]:
                e["notas"] = [_linha_de({**p, "numero": p["numero"] + "9", "valor": "77.70"}, "xml_assinado")]
            elif sorte < 0.35:
                e["notas"] = [_linha_de(_nota_parseada(rng), "xml_assinado")]
        except Exception:  # a própria nota é inválida: sem gêmea
            e["notas"] = []
        saida.append(e)
    # A empresa sem cadastro (o "empresa do contexto não encontrada").
    saida.append({"empresa": None, "notas": [], "transacoes": [], "nome_arquivo": "sem-empresa.xml", "via": "xml",
                  "leitura": {"ok": _nota_parseada(rng)}})
    # A empresa sem CNPJ: o vazio "consta" quando a nota não tem destinatário.
    for dest in (None, EMPRESA):
        saida.append({"empresa": {"cnpj": ""}, "notas": [], "transacoes": [], "nome_arquivo": "sem-cnpj.xml", "via": "xml",
                      "leitura": {"ok": _nota_parseada(rng, cnpj_destinatario=dest)}})
    return saida


def _zip(entradas: list[tuple[str, bytes]], comprimir=zipfile.ZIP_DEFLATED) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", comprimir) as z:
        for nome, conteudo in entradas:
            z.writestr(nome, conteudo)
    return buf.getvalue()


def casos_zip(rng: random.Random) -> list[dict]:
    def xml(nome: str) -> tuple[str, bytes]:
        return nome, f"<nota>{nome}</nota>".encode()

    a = _nota_parseada(rng, tipo="nfe")
    b = _nota_parseada(rng, tipo="nfse")
    c = _nota_parseada(rng, tipo="nfe", cnpj_emitente=FORNECEDOR, cnpj_destinatario=CLIENTE)
    especiais = {
        "notas-zip-normal.zip": (_zip([xml("a.xml"), xml("pasta/b.XML"), ("leia-me.txt", b"ola"), ("pasta/", b""), xml("c.xml")]),
                                 {"a.xml": {"ok": a}, "pasta/b.XML": {"ok": b}, "c.xml": {"ok": c}}),
        "notas-zip-repetida.zip": (_zip([xml("a.xml"), xml("a2.xml"), xml("x.xml")]),
                                   {"a.xml": {"ok": a}, "a2.xml": {"ok": a}, "x.xml": {"erro": "XML malformado: linha 3."}}),
        "notas-zip-sem-xml.zip": (_zip([("a.txt", b"x"), ("b.pdf", b"%PDF")]), {}),
        "notas-zip-vazio.zip": (_zip([]), {}),
        "notas-zip-invalido.zip": (b"isto nao e um zip", {}),
        "notas-zip-razao.zip": (_zip([xml("a.xml"), ("zeros.bin", b"\x00" * 300_000)]), {"a.xml": {"ok": a}}),
        "notas-zip-xml-grande.zip": (_zip([("grande.xml", b"\x00" * (10 * 1024 * 1024 + 1))]), {}),
        "notas-zip-entradas.zip": (_zip([(f"v{k}.txt", b"") for k in range(1001)], zipfile.ZIP_STORED), {}),
        "notas-zip-guardado.zip": (_zip([xml("a.xml"), xml("b.xml")], zipfile.ZIP_STORED), {"a.xml": {"ok": a}, "b.xml": {"ok": b}}),
    }
    saida = []
    for nome, (conteudo, leituras) in especiais.items():
        _ZIPS[nome] = conteudo
        notas = [_linha_de(b, "xml_assinado")] if nome == "notas-zip-guardado.zip" else []
        saida.append({"empresa": {"cnpj": EMPRESA}, "notas": notas, "transacoes": [], "arquivo": nome, "leituras": leituras})
    return saida


def casos_estado(rng: random.Random) -> list[tuple[str, dict]]:
    saida = []
    transacoes = [
        {"id": _uid(0x7A0), "historico": "PAGTO FORNECEDOR FICTICIO", "valor": "800.00", "dc": "D", "data": "2026-03-05", "apagada": False, "empresa": "esta"},
        {"id": _uid(0x7A0), "historico": "RECEBIMENTO CLIENTE", "valor": "1500.50", "dc": "C", "data": "2026-03-06", "apagada": False, "empresa": "esta"},
        {"id": _uid(0x7A0), "historico": "TARIFA DESFEITA", "valor": "12.00", "dc": "D", "data": "2026-03-07", "apagada": True, "empresa": "esta"},
        {"id": _uid(0x7A0), "historico": "DA OUTRA EMPRESA", "valor": "10.00", "dc": "D", "data": "2026-03-08", "apagada": False, "empresa": "outra"},
    ]
    for status, ligada in [("pendente", None), ("associada", 0), ("associada", 2), ("cancelada", None), ("pendente", 1), ("cancelada", 0)]:
        for alvo in [0, 1, 2, 3, "inexistente"]:
            nota = _linha_de(_nota_parseada(rng), "xml_assinado", status=status,
                             transacao_id=transacoes[ligada]["id"] if ligada is not None else None)
            outra = _linha_de(_nota_parseada(rng), "xml_assinado")
            base = {"empresa": {"cnpj": EMPRESA}, "notas": [nota, outra], "transacoes": transacoes}
            tid = transacoes[alvo]["id"] if alvo != "inexistente" else _uid(0xBAD)
            saida.append(("associar", {**base, "nota_id": nota["id"], "transacao_id": tid}))
        base = {"empresa": {"cnpj": EMPRESA}, "notas": [nota, outra], "transacoes": transacoes}
        saida.append(("desassociar", {**base, "nota_id": nota["id"]}))
        saida.append(("cancelar", {**base, "nota_id": nota["id"]}))
    inexistente = {"empresa": {"cnpj": EMPRESA}, "notas": [], "transacoes": transacoes, "nota_id": _uid(0xBAD)}
    saida += [("associar", {**inexistente, "transacao_id": transacoes[0]["id"]}), ("desassociar", inexistente), ("cancelar", inexistente)]
    return saida


def casos_listar(rng: random.Random) -> list[dict]:
    transacoes = [
        {"id": _uid(0x7A0), "historico": "PAGTO NF 123", "valor": "800.00", "dc": "D", "data": "2026-03-05", "apagada": False, "empresa": "esta"},
        {"id": _uid(0x7A0), "historico": "TARIFA DESFEITA", "valor": "12.00", "dc": "D", "data": "2026-03-07", "apagada": True, "empresa": "esta"},
    ]
    nomes = ["Distribuidora Sao Jose LTDA", "COMERCIO FICTICIO", "servicos exemplo me", None, "Padaria Modelo"]
    notas = []
    for k in range(30):
        p = _nota_parseada(
            rng, numero=rng.choice([f"BUSCA-{k}", f"{k:06d}", f"NF%{k}", f"A_{k}"]),
            cnpj_emitente=rng.choice([FORNECEDOR, CLIENTE, EMPRESA]), cnpj_destinatario=rng.choice([EMPRESA, None, FORNECEDOR]),
            nome_emitente=rng.choice(nomes),
            data_emissao=datetime(2026, 1 + k % 9, 1 + k % 28, 12, k, tzinfo=UTC).isoformat(),
        )
        ligada = rng.choice([None, None, 0, 1])
        status = "associada" if ligada is not None else rng.choice(["pendente", "pendente", "cancelada"])
        notas.append(_linha_de(p, rng.choice(["xml_assinado", "ocr", "xml_nao_verificado"]), status=status,
                               transacao_id=transacoes[ligada]["id"] if ligada is not None else None))
    alguma_chave = next(n["chave_acesso"] for n in notas if n["chave_acesso"])
    filtros = [
        {}, {"tipo": "nfe"}, {"tipo": "nfse"}, {"status": "pendente"}, {"status": "associada"}, {"status": "cancelada"},
        {"numero": "BUSCA-"}, {"numero": " busca-1 "}, {"numero": "%"}, {"numero": "_"}, {"numero": "0000"},
        {"chave_acesso": alguma_chave[10:20]}, {"chave_acesso": "abc"}, {"chave_acesso": alguma_chave[:4] + "." + alguma_chave[4:8]},
        {"cnpj": _digitos(FORNECEDOR)}, {"cnpj": FORNECEDOR}, {"cnpj": EMPRESA}, {"cnpj": "99.999"}, {"cnpj": " 11.111 "}, {"cnpj": "   "},
        {"cnpj": "999999990001"}, {"emitente": "sao jose"}, {"emitente": "FICTICIO"}, {"emitente": " modelo "},
        {"data_de": "2026-03-01T00:00:00+00:00"}, {"data_ate": "2026-05-04T12:00:00+00:00"},
        {"data_de": "2026-03-01T00:00:00-03:00", "data_ate": "2026-06-30T23:59:59-03:00"}, {"tipo": "nfe", "status": "pendente", "cnpj": FORNECEDOR},
    ]
    saida = []
    for f in filtros:
        for page, page_size in [(1, 50), (1, 7), (2, 7), (5, 7)]:
            saida.append({"empresa": {"cnpj": EMPRESA}, "notas": notas, "transacoes": transacoes, "filtros": f, "page": page, "page_size": page_size})
    return saida


def casos_criar(rng: random.Random) -> list[dict]:
    from src.schemas.notas import NotaFiscalCreate

    saida = []
    payloads = [
        {"tipo": "nfe", "numero": "000001", "cnpj_emitente": "12345678000195", "valor": 800.0, "data_emissao": "2024-02-01T00:00:00Z"},
        {"tipo": "nfse", "numero": "NFSE-42", "cnpj_emitente": FORNECEDOR, "valor": "1500.505", "data_emissao": "2024-02-01T10:00:00-03:00"},
        {"tipo": "nfe", "numero": "7", "serie": "2", "cnpj_emitente": FORNECEDOR, "valor": "10.005", "data_emissao": "2024-02-01"},
        {"tipo": "nfse", "numero": " 8 ", "serie": " 1 ", "cnpj_emitente": FORNECEDOR, "valor": 0.1, "data_emissao": "2024-02-01T00:00:00.250Z"},
        {"tipo": "nfse", "numero": "9", "cnpj_emitente": FORNECEDOR, "valor": "99", "data_emissao": "2024-02-29T23:59:59+05:30", "chave_acesso": None},
        {"tipo": "NFE", "numero": "10", "cnpj_emitente": FORNECEDOR, "valor": 5, "data_emissao": "2024-03-01T12:00:00Z", "origem": " OCR "},
    ]
    for p in payloads:
        dados = NotaFiscalCreate.model_validate_json(json.dumps(p)).model_dump(mode="json")
        saida.append({"empresa": {"cnpj": EMPRESA}, "notas": [], "transacoes": [], "dados": dados})
        linha = _linha_de({"tipo": dados["tipo"], "numero": dados["numero"], "serie": dados["serie"], "cnpj_emitente": dados["cnpj_emitente"],
                           "nome_emitente": None, "cnpj_destinatario": None, "valor": dados["valor"],
                           "data_emissao": datetime.fromisoformat(dados["data_emissao"].replace("Z", "+00:00")).isoformat(),
                           "chave_acesso": dados["chave_acesso"], "observacao": None}, "xml_assinado")
        saida.append({"empresa": {"cnpj": EMPRESA}, "notas": [linha], "transacoes": [], "dados": dados})
    for _ in range(30):
        c = chave(rng)
        p = {"tipo": rng.choice(["nfe", "nfse"]), "numero": str(rng.randint(1, 999)), "cnpj_emitente": rng.choice([FORNECEDOR, CLIENTE]),
             "valor": rng.choice(["1.00", "2.50", "100"]), "data_emissao": "2026-01-15T00:00:00Z", "chave_acesso": rng.choice([None, c])}
        dados = NotaFiscalCreate.model_validate_json(json.dumps(p)).model_dump(mode="json")
        existente = []
        if rng.random() < 0.5 and dados["chave_acesso"]:
            existente = [_linha_de(_nota_parseada(rng, chave_acesso=dados["chave_acesso"]), "xml_assinado")]
        saida.append({"empresa": {"cnpj": EMPRESA}, "notas": existente, "transacoes": [], "dados": dados})
    return saida


def casos_diretos() -> list[dict]:
    from pydantic import ValidationError as ErroPydantic

    from src.core.errors import AppError
    from src.domain.notas import service as S
    from src.schemas.notas import NotaFiscalCreate

    ok = {"tipo": "nfe", "numero": "1", "cnpj_emitente": FORNECEDOR, "valor": "10.00", "data_emissao": "2026-03-05T10:00:00-03:00"}
    variantes = [
        {}, {"tipo": "boleto"}, {"tipo": " NFSE "}, {"tipo": 1}, {"numero": ""}, {"numero": " "}, {"numero": "N" * 50}, {"numero": "N" * 51},
        {"serie": "S" * 10}, {"serie": "S" * 11}, {"serie": None}, {"cnpj_emitente": "123"}, {"cnpj_emitente": _digitos(FORNECEDOR)},
        {"cnpj_emitente": FORNECEDOR[:-1] + "0"}, {"cnpj_emitente": "11.111.111/1111-11"}, {"cnpj_emitente": 12345678000195},
        {"cnpj_destinatario": EMPRESA}, {"cnpj_destinatario": "x"}, {"nome_emitente": "N" * 300}, {"nome_emitente": "N" * 301},
        {"valor": "0"}, {"valor": "-1"}, {"valor": "abc"}, {"valor": "NaN"}, {"valor": "Infinity"}, {"valor": 0.1}, {"valor": "1E+3"},
        {"valor": "12345678901234.5"}, {"data_emissao": "2026-02-30T00:00:00"}, {"data_emissao": "ontem"}, {"data_emissao": "2026-03-05"},
        {"data_emissao": "2026-03-05T10:00:00Z"}, {"data_emissao": "2026-03-05 10:00"}, {"chave_acesso": "1" * 44}, {"chave_acesso": "1" * 43},
        {"chave_acesso": " ".join(["1234"] * 11)}, {"chave_acesso": "1" * 44 + "x" * 30}, {"chave_acesso": ""}, {"observacao": "O" * 500},
        {"observacao": "O" * 501}, {"origem": "OCR"}, {"origem": "manual"}, {"assinatura_motivo": "M" * 200}, {"assinatura_motivo": "M" * 201},
        {"tipo": "nfse", "chave_acesso": "2" * 44}, {"tipo": "nfe", "chave_acesso": None, "serie": " 3 "},
    ]
    saida = []
    for v in variantes:
        p = {**ok, **v}
        try:
            m = NotaFiscalCreate.model_validate_json(json.dumps(p))
        except ErroPydantic as exc:
            e = exc.errors()[0]
            saida.append({"tipo": "validacao", "entrada": p, "saida": {"pydantic": {"type": e["type"], "loc": [str(x) for x in e["loc"]], "msg": e["msg"]}}})
            continue
        try:
            ch = S._normalizar_chave_acesso(m.chave_acesso)
            dedup = S._calcular_identidade_nota(m, ch)
        except AppError as exc:
            saida.append({"tipo": "validacao", "entrada": p, "saida": {"erro": exc.message}})
            continue
        d = m.model_dump(mode="json")
        saida.append({"tipo": "validacao", "entrada": p, "saida": {"ok": {
            "tipo": d["tipo"], "numero": d["numero"], "serie": d["serie"], "cnpj_emitente": d["cnpj_emitente"],
            "cnpj_destinatario": d["cnpj_destinatario"], "valor": str(m.valor), "chave_acesso": ch, "origem": d["origem"], "dedup_key": dedup,
        }}})
    return saida


# ─── Execução e gravação ────────────────────────────────────────────────────

def _guardar(tipo: str, origem: str, entrada: dict, saida: dict) -> None:
    caso = {"tipo": tipo, "origem": origem, "entrada": entrada, "saida": saida}
    casos.setdefault(json.dumps([tipo, entrada], sort_keys=True, ensure_ascii=False), caso)


def _comparavel(tipo: str, s: dict) -> dict:
    s = copy.deepcopy(s)
    if tipo == "importar" and "erro" not in s:
        s.pop("pydantic", None)
    return s


async def _tudo() -> None:
    montado = _Montado()
    await montado.abrir()
    try:
        for tipo, entrada, real in _DA_SUITE:
            refeito = await montado.rodar(tipo, entrada)
            if _comparavel(tipo, refeito) != _comparavel(tipo, real):
                raise AssertionError(f"o banco montado não repete a suíte ({tipo}):\n{json.dumps(refeito, ensure_ascii=False, default=str)[:3000]}\n"
                                     f"{json.dumps(real, ensure_ascii=False, default=str)[:3000]}")
            limpa = _sanitizar(entrada)
            _guardar(tipo, "suite", limpa, await montado.rodar(tipo, limpa))
        rng = random.Random(20261118)
        for e in casos_importar(rng):
            _guardar("importar", "inventado", e, await montado.rodar("importar", e))
        for e in casos_zip(rng):
            _guardar("zip", "inventado", e, await montado.rodar("zip", e))
        for tipo, e in casos_estado(rng):
            _guardar(tipo, "inventado", e, await montado.rodar(tipo, e))
        for e in casos_listar(rng):
            _guardar("listar", "inventado", e, await montado.rodar("listar", e))
        for e in casos_criar(rng):
            _guardar("criar", "inventado", e, await montado.rodar("criar", e))
    finally:
        await montado.fechar()


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_DIR")
    if not pasta or not _ORIGINAL:
        return
    asyncio.run(_tudo())
    for nome, conteudo in _ZIPS.items():
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)
    diretos = casos_diretos()
    ordem = {"suite": 0, "inventado": 1}
    lista = sorted(casos.values(), key=lambda c: (c["tipo"], ordem[c["origem"]]))
    itens = [{"id": n, **c} for n, c in enumerate([*diretos, *lista], start=1)]
    for c in itens:
        c.setdefault("origem", "direto")
    arquivos = _escrever_partes(pasta, "notas-servico", itens)
    por_tipo: dict[str, list[int]] = {}
    for c in itens:
        n = por_tipo.setdefault(c["tipo"], [0, 0, 0])
        n[0] += 1
        n[1] += c["origem"] == "suite"
        n[2] += ("erro" in c["saida"] or "pydantic" in c["saida"] or bool(c["saida"].get("erros")))
    resumo = ", ".join(f"{t}: {n} ({s} da suíte, {e} com recusa)" for t, (n, s, e) in sorted(por_tipo.items()))
    print(f"\ngabarito das notas: {len(itens)} casos — {resumo}; arquivos: {', '.join(arquivos)}")
