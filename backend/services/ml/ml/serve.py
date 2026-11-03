"""Serviço de inferência (FastAPI). Contrato consumido por src/modules/retention/churn.client.ts.

POST /predict/batch  {features:[...], rows:[{id, x:[...]}]} → {version:{churn,ltv,propensity}, predictions:[{id, churn, ltv_brl, p_upgrade, p_credits, top:[{feature, contribution}]}]}
GET  /model          → model_card (métricas, fonte dos dados, production_ready)
GET  /healthz
Segurança: Bearer opcional (ML_SERVICE_TOKEN); rejeita vetores com ordem/tamanho de features diferente do treino (nunca prevê "no escuro").
Latência: modelos carregados no start; 1 linha ≈ poucos ms. O backend aplica timeout de 50 ms e cai em heurística.
"""
from __future__ import annotations
import json, os
from pathlib import Path
import joblib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from .features import FEATURES

MODELS = Path(os.environ.get("ML_MODELS_DIR", Path(__file__).resolve().parent.parent / "models"))
TOKEN = os.environ.get("ML_SERVICE_TOKEN", "")
MAX_ROWS = 5000


class Row(BaseModel):
    id: str; x: list[float] = Field(min_length=len(FEATURES), max_length=len(FEATURES))


class Batch(BaseModel):
    features: list[str]; rows: list[Row] = Field(max_length=MAX_ROWS)


class Bundle:
    def __init__(self, d: Path):
        self.card = json.loads((d / "model_card.json").read_text())
        if self.card["features"] != FEATURES: raise RuntimeError("features do modelo diferem do contrato atual (retreine)")
        self.churn, self.ltv, self.up, self.cr = (joblib.load(d / f"{n}.joblib") for n in ("churn", "ltv", "upgrade", "credits"))

    @staticmethod
    def _p(a, X): return np.clip(a["calibrator"].predict(a["model"].predict_proba(X)[:, 1]), 0, 1)

    def top(self, X: np.ndarray, k: int = 3):
        """Contribuições por feature (XGBoost: pred_contribs; LightGBM: pred_contrib). Positivo = aumenta o risco."""
        m = self.churn["model"]
        try:
            if self.churn["algo"] == "xgboost":
                import xgboost as xgb; c = m.get_booster().predict(xgb.DMatrix(X, feature_names=None), pred_contribs=True)[:, :-1]
            else: c = m.predict(X, pred_contrib=True)[:, :-1]
        except Exception: return [[] for _ in range(len(X))]
        out = []
        for row in c:
            idx = np.argsort(-np.abs(row))[:k]; out.append([{"feature": FEATURES[i], "contribution": round(float(row[i]), 4)} for i in idx])
        return out

    def predict(self, X: np.ndarray):
        pc, pu, pcr = self._p(self.churn, X), self._p(self.up, X), self._p(self.cr, X); ltv = np.expm1(self.ltv["model"].predict(X)).clip(0); tops = self.top(X)
        return pc, ltv, pu, pcr, tops


def create_app(models_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="NexusReel ML", version="1.0.0"); state: dict = {"bundle": None, "error": None}
    try: state["bundle"] = Bundle(models_dir or MODELS)
    except Exception as e: state["error"] = str(e)

    def auth(authorization: str | None = Header(default=None)):
        if TOKEN and authorization != f"Bearer {TOKEN}": raise HTTPException(401, "token inválido")

    @app.get("/healthz")
    def health(): return {"ok": state["bundle"] is not None, "error": state["error"]}

    @app.get("/model", dependencies=[Depends(auth)])
    def model():
        if not state["bundle"]: raise HTTPException(503, state["error"] or "sem modelo")
        c = state["bundle"].card; return {k: c[k] for k in ("version", "algo", "data_source", "production_ready", "trained_at", "window", "rows", "metrics", "gate_passed", "notes")}

    @app.post("/predict/batch", dependencies=[Depends(auth)])
    def predict(b: Batch):
        if not state["bundle"]: raise HTTPException(503, state["error"] or "sem modelo")
        if b.features != FEATURES: raise HTTPException(422, "ordem/nomes de features diferem do modelo")
        if not b.rows: return {"version": {}, "predictions": []}
        X = np.asarray([r.x for r in b.rows], dtype=float)
        if not np.isfinite(X).all(): raise HTTPException(422, "valores não finitos")
        pc, ltv, pu, pcr, tops = state["bundle"].predict(X); v = state["bundle"].card["version"]
        return {"version": {"churn": v, "ltv": v, "propensity": v}, "predictions": [{"id": r.id, "churn": float(pc[i]), "ltv_brl": float(ltv[i]), "p_upgrade": float(pu[i]), "p_credits": float(pcr[i]), "top": tops[i]} for i, r in enumerate(b.rows)]}
    return app


app = create_app()
