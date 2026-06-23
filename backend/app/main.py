from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import backtest, logs
from app.routers import paper_trade, live_trade, database, render_logs, strategies

app = FastAPI(title="Algo Trading Platform")

app.add_middleware(
    CORSMiddleware,
    # Starlette's allow_origins does exact-string matching only — a literal
    # "https://*.vercel.app" never matches a real subdomain. Use a regex so
    # every *.vercel.app / *.onrender.com deployment (and localhost) is allowed.
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app|https://([a-z0-9-]+\.)*onrender\.com|http://localhost:3000",
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


@app.get("/")
def root():
    return {"status": "Algo Trading Platform API running", "version": "2.0"}
