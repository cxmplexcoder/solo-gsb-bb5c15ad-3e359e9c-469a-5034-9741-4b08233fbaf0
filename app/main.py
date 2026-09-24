"""FastAPI 入口：提供静态页面与 /api/solve 联立求解、/api/redundancy 约束冗余核对、
/api/compare 两版比较接口。"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .solver import check_redundancy, compare_texts, solve

app = FastAPI(title="口述史事件时间线核对", version="1.2.0")


class SolveRequest(BaseModel):
    text: str = ""


class RedundancyRequest(BaseModel):
    text: str = ""
    line: int = 0


class CompareRequest(BaseModel):
    base: str = ""
    revised: str = ""


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/solve")
def api_solve(req: SolveRequest) -> dict:
    return solve(req.text or "")


@app.post("/api/redundancy")
def api_redundancy(req: RedundancyRequest) -> dict:
    return check_redundancy(req.text or "", req.line)


@app.post("/api/compare")
def api_compare(req: CompareRequest) -> dict:
    # 两版各自独立校验与联立；任一版无效或矛盾时，分别带回该版错误/矛盾链，不生成差异结论
    return compare_texts(req.base or "", req.revised or "")


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


# 静态资源挂载放在最后（Starlette 中 Route 优先于 Mount 匹配，此处仅为可读性）
app.mount("/static", StaticFiles(directory="static"), name="static")
