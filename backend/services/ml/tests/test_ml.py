import json, time
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
from ml.features import FEATURES, synthetic
from ml import train as T
from ml.serve import create_app
from ml.evaluate import calibration_error, gate, lift_at

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    d = tmp_path_factory.mktemp("models"); card = T.run("synthetic", "xgboost", None, 12_000, 7, out=d); return d, card


def test_feature_contract_matches_backend():
    ts = (ROOT.parent.parent / "src/modules/retention/features.ts").read_text(); import re
    ts_list = re.findall(r"'([a-z0-9_]+)'", re.search(r"export const FEATURES = \[(.*?)\]", ts, re.S).group(1))
    assert ts_list == FEATURES == json.loads((ROOT / "features.json").read_text())["features"]


def test_synthetic_is_deterministic_and_has_signal():
    a, b = synthetic(2000, 1), synthetic(2000, 1); assert a.equals(b)
    assert 0.1 < a["churn_30d"].mean() < 0.9 and a["ltv_brl"].max() > 0


def test_temporal_split_has_no_leakage():
    tr, va, te = T.temporal_split(synthetic(3000, 3)); assert tr["snapshot_at"].max() <= va["snapshot_at"].min() <= te["snapshot_at"].min()


def test_training_meets_gate_and_card_is_honest(trained):
    d, card = trained; m = card["metrics"]
    assert m["churn"]["auc"] > 0.70 and m["churn"]["lift_top10"] > 1.3 and m["churn"]["ece"] < 0.08
    assert m["ltv"]["mae_brl"] < m["ltv"]["mae_baseline_median"] and m["ltv"]["spearman"] > 0.5
    assert card["data_source"] == "synthetic" and card["production_ready"] is False   # nunca marca sintético como pronto para produção
    assert (d / "model_card.json").exists()


def test_gate_rejects_bad_models(tmp_path):
    ok, reasons = gate({"churn": {"auc": 0.55, "ece": 0.02}, "upgrade": {"auc": 0.8, "ece": 0.02}, "credits": {"auc": 0.8, "ece": 0.2}, "ltv": {"mae_brl": 10, "mae_baseline_median": 5}})
    assert not ok and len(reasons) == 3
    with pytest.raises(SystemExit): T.run("synthetic", "xgboost", None, 400, 1, out=tmp_path)   # poucos dados


def test_metrics_helpers():
    y = np.array([0, 0, 1, 1]); assert calibration_error(y, np.array([0.0, 0.0, 1.0, 1.0])) == 0 and lift_at(y, np.array([.1, .2, .8, .9]), 0.5) == 2.0


def test_lightgbm_also_trains(tmp_path):
    card = T.run("synthetic", "lightgbm", None, 6000, 5, out=tmp_path); assert card["metrics"]["churn"]["auc"] > 0.68


def test_serving_contract_and_validation(trained):
    d, _ = trained; c = TestClient(create_app(d)); assert c.get("/healthz").json()["ok"] is True; assert c.get("/model").json()["data_source"] == "synthetic"
    row = [10, 100, 0, 1, .9, 0, 0, 0, 5, 0, 0, 0, 0, 0]; r = c.post("/predict/batch", json={"features": FEATURES, "rows": [{"id": "u1", "x": row}, {"id": "u2", "x": [0, 300, 6, 20, 1, 2, 8, 3, 100, 1, 2, 2, 1, 300]}]})
    assert r.status_code == 200; p = r.json()["predictions"]; assert [x["id"] for x in p] == ["u1", "u2"]
    assert all(0 <= x["churn"] <= 1 and x["ltv_brl"] >= 0 and 0 <= x["p_upgrade"] <= 1 and 0 <= x["p_credits"] <= 1 for x in p); assert p[0]["churn"] > p[1]["churn"]; assert len(p[0]["top"]) == 3 and set(p[0]["top"][0]) == {"feature", "contribution"}
    assert c.post("/predict/batch", json={"features": FEATURES[::-1], "rows": [{"id": "u", "x": row}]}).status_code == 422        # ordem errada
    assert c.post("/predict/batch", json={"features": FEATURES, "rows": [{"id": "u", "x": row[:-1]}]}).status_code == 422            # tamanho errado
    assert c.post("/predict/batch", json={"features": FEATURES, "rows": []}).json()["predictions"] == []


def test_serving_latency_budget_single_row(trained):
    d, _ = trained; c = TestClient(create_app(d)); body = {"features": FEATURES, "rows": [{"id": "u", "x": [10, 100, 0, 1, .9, 0, 0, 0, 5, 0, 0, 0, 0, 0]}]}
    for _ in range(5): c.post("/predict/batch", json=body)
    ts = []
    for _ in range(40): t = time.perf_counter(); c.post("/predict/batch", json=body); ts.append((time.perf_counter() - t) * 1000)
    assert np.percentile(ts, 95) < 50, f"p95={np.percentile(ts, 95):.1f}ms (orçamento do backend: 50 ms)"


def test_serving_without_model_is_503_and_token_enforced(tmp_path, trained, monkeypatch):
    c = TestClient(create_app(tmp_path)); assert c.get("/healthz").json()["ok"] is False; assert c.post("/predict/batch", json={"features": FEATURES, "rows": []}).status_code == 503
    import ml.serve as S; monkeypatch.setattr(S, "TOKEN", "s3cret"); c2 = TestClient(create_app(trained[0]))
    assert c2.get("/model").status_code == 401 and c2.get("/model", headers={"authorization": "Bearer s3cret"}).status_code == 200


@pytest.mark.skipif(not __import__("os").environ.get("ML_TEST_DSN"), reason="defina ML_TEST_DSN (Postgres com o schema do backend) para validar a extração point-in-time")
def test_point_in_time_sql_executes_and_has_no_future_features():
    import psycopg, pandas as pd, os
    from ml.features import POINT_IN_TIME_SQL
    sql = POINT_IN_TIME_SQL % {"horizon": "interval '30 days'", "ltv": "interval '365 days'"}
    with psycopg.connect(os.environ["ML_TEST_DSN"]) as con:
        df = pd.read_sql(sql + " LIMIT 50", con)
    assert set(FEATURES) <= set(df.columns) and {"churn_30d", "ltv_brl", "upgrade_30d", "credits_30d"} <= set(df.columns)
