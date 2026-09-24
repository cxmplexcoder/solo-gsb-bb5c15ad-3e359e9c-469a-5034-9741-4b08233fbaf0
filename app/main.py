"""FastAPI 入口：提供静态页面与 /api/solve 联立求解、/api/redundancy 约束冗余核对接口。"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .solver import check_redundancy, solve

app = FastAPI(title="口述史事件时间线核对", version="1.1.0")


class SolveRequest(BaseModel):
    text: str = ""


class RedundancyRequest(BaseModel):
    text: str = ""
    line: int = 0


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/solve")
def api_solve(req: SolveRequest) -> dict:
    return solve(req.text or "")


@app.post("/api/redundancy")
def api_redundancy(req: RedundancyRequest) -> dict:
    return check_redundancy(req.text or "", req.line)


@app.get("/")
def index() -> FileResponse:
    return FileResponse("static/index.html")


# 静态资源挂载放在最后（Starlette 中 Route 优先于 Mount 匹配，此处仅为可读性）
app.mount("/static", StaticFiles(directory="static"), name="static")
