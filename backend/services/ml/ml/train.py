"""Treino: churn (classificação), LTV 365d (regressão) e propensão a upgrade/créditos (classificação).

Uso:
  python -m ml.train --source synthetic            # valida o pipeline (NÃO é modelo de produção)
  python -m ml.train --source db --dsn $WAREHOUSE_DSN --algo xgboost
Saída: models/{churn,ltv,upgrade,credits}.joblib + models/model_card.json (métricas, versão, janela de dados, fonte dos dados).
Promoção: `evaluate.gate` reprova modelos abaixo dos mínimos (AUC, calibração) — o serviço então mantém o modelo anterior.
"""
from __future__ import annotations
import argparse, json, hashlib, time
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from .features import FEATURES, synthetic, from_db, matrix
from .evaluate import classification_report, regression_report, gate

MODELS = Path(__file__).resolve().parent.parent / "models"


def _clf(algo: str, seed: int):
    if algo == "lightgbm":
        from lightgbm import LGBMClassifier
        return LGBMClassifier(n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, min_child_samples=40, random_state=seed, verbose=-1)
    from xgboost import XGBClassifier
    return XGBClassifier(n_estimators=300, learning_rate=0.05, max_depth=4, subsample=0.8, colsample_bytree=0.8, min_child_weight=5, eval_metric="logloss", random_state=seed, n_jobs=2)


def _reg(algo: str, seed: int):
    if algo == "lightgbm":
        from lightgbm import LGBMRegressor
        return LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, subsample=0.8, colsample_bytree=0.8, min_child_samples=40, random_state=seed, verbose=-1)
    from xgboost import XGBRegressor
    return XGBRegressor(n_estimators=300, learning_rate=0.05, max_depth=4, subsample=0.8, colsample_bytree=0.8, min_child_weight=5, random_state=seed, n_jobs=2)


def temporal_split(df: pd.DataFrame, valid_frac=0.2, test_frac=0.2):
    """Split POR TEMPO (treina no passado, valida/testa no futuro) — evita vazamento e superestimação."""
    d = df.sort_values("snapshot_at").reset_index(drop=True); n = len(d); a, b = int(n * (1 - valid_frac - test_frac)), int(n * (1 - test_frac))
    return d.iloc[:a], d.iloc[a:b], d.iloc[b:]


def fit_classifier(name: str, df: pd.DataFrame, target: str, algo: str, seed: int):
    tr, va, te = temporal_split(df)
    if name == "upgrade":  # só faz sentido para quem está no Free
        tr, va, te = (x[x["plan_ordinal"] == 0] for x in (tr, va, te))
    m = _clf(algo, seed); m.fit(matrix(tr), tr[target])
    iso = IsotonicRegression(out_of_bounds="clip").fit(m.predict_proba(matrix(va))[:, 1], va[target])   # calibra no conjunto de validação
    p_te = iso.predict(m.predict_proba(matrix(te))[:, 1]); rep = classification_report(te[target].to_numpy(), p_te)
    rep.update(n_train=len(tr), n_valid=len(va), n_test=len(te), base_rate=float(te[target].mean()))
    return {"model": m, "calibrator": iso, "algo": algo}, rep


def fit_regressor(df: pd.DataFrame, algo: str, seed: int):
    tr, va, te = temporal_split(df); m = _reg(algo, seed); m.fit(matrix(tr), np.log1p(tr["ltv_brl"]))   # log1p: cauda longa
    pred = np.expm1(m.predict(matrix(te))).clip(0); rep = regression_report(te["ltv_brl"].to_numpy(), pred); rep.update(n_train=len(tr), n_valid=len(va), n_test=len(te))
    return {"model": m, "algo": algo}, rep


def run(source: str, algo: str, dsn: str | None, n: int, seed: int, out: Path = MODELS, min_auc: float = 0.65) -> dict:
    df = synthetic(n, seed) if source == "synthetic" else from_db(dsn or "")
    if len(df) < 500: raise SystemExit(f"dados insuficientes para treinar ({len(df)} linhas; mínimo 500)")
    out.mkdir(parents=True, exist_ok=True); t0 = time.time(); metrics, arts = {}, {}
    for name, target in (("churn", "churn_30d"), ("upgrade", "upgrade_30d"), ("credits", "credits_30d")):
        arts[name], metrics[name] = fit_classifier(name, df, target, algo, seed)
    arts["ltv"], metrics["ltv"] = fit_regressor(df, algo, seed)
    ok, reasons = gate(metrics, min_auc=min_auc)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"); h = hashlib.sha1(json.dumps(metrics, sort_keys=True, default=float).encode()).hexdigest()[:6]
    version = f"{algo}-{stamp}-{h}"
    card = {"version": version, "algo": algo, "features": FEATURES, "data_source": source, "rows": len(df), "trained_at": stamp, "window": [str(df["snapshot_at"].min()), str(df["snapshot_at"].max())],
            "production_ready": bool(ok and source != "synthetic"), "gate_passed": ok, "gate_reasons": reasons, "metrics": metrics, "train_seconds": round(time.time() - t0, 1),
            "notes": "SINTÉTICO: valida o pipeline, não representa o negócio" if source == "synthetic" else "treinado com histórico real"}
    if not ok:
        (out / "model_card.rejected.json").write_text(json.dumps(card, indent=2, default=float)); raise SystemExit(f"modelo reprovado no gate: {reasons}")
    for name, a in arts.items(): joblib.dump(a, out / f"{name}.joblib")
    (out / "model_card.json").write_text(json.dumps(card, indent=2, default=float)); return card


def main() -> None:  # pragma: no cover
    ap = argparse.ArgumentParser(); ap.add_argument("--source", choices=["synthetic", "db"], default="synthetic"); ap.add_argument("--algo", choices=["xgboost", "lightgbm"], default="xgboost")
    ap.add_argument("--dsn"); ap.add_argument("--n", type=int, default=20_000); ap.add_argument("--seed", type=int, default=7); ap.add_argument("--min-auc", type=float, default=0.65)
    a = ap.parse_args(); card = run(a.source, a.algo, a.dsn, a.n, a.seed, min_auc=a.min_auc); print(json.dumps({k: card[k] for k in ("version", "data_source", "production_ready", "metrics")}, indent=2, default=float))


if __name__ == "__main__":
    main()
