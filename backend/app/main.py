from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import backtest, logs
from app.routers import paper_trade, live_trade, database, render_logs, strategies, report, signals

app = FastAPI(title="Algo Trading Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app", "https://*.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest.router,    prefix="/backtest",    tags=["backtest"])
app.include_router(logs.router,        prefix="/logs",        tags=["logs"])
app.include_router(paper_trade.router, prefix="/paper-trade", tags=["paper-trade"])
app.include_router(live_trade.router,  prefix="/live-trade",  tags=["live-trade"])
app.include_router(database.router,    prefix="/database",    tags=["database"])
app.include_router(render_logs.router, prefix="/render",      tags=["render"])
app.include_router(strategies.router,  prefix="/strategies",  tags=["strategies"])
app.include_router(report.router,      prefix="/report",      tags=["report"])
app.include_router(signals.router,     prefix="/signals",     tags=["signals"])


@app.get("/")
def root():
    return {"status": "Algo Trading Platform API running", "version": "2.0"}
