"""Métricas de avaliação e gate de promoção."""
from __future__ import annotations
import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss, log_loss


def calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    """ECE: média ponderada de |taxa observada − probabilidade média| por faixa de probabilidade."""
    idx = np.minimum((p * bins).astype(int), bins - 1); e = 0.0
    for b in range(bins):
        m = idx == b
        if m.any(): e += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(e)


def lift_at(y: np.ndarray, p: np.ndarray, frac: float = 0.1) -> float:
    k = max(1, int(len(y) * frac)); top = np.argsort(-p)[:k]; base = y.mean()
    return float(y[top].mean() / base) if base > 0 else float("nan")


def classification_report(y: np.ndarray, p: np.ndarray) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"auc": float(roc_auc_score(y, p)), "pr_auc": float(average_precision_score(y, p)), "brier": float(brier_score_loss(y, p)), "log_loss": float(log_loss(y, p)),
            "ece": calibration_error(y, p), "lift_top10": lift_at(y, p, 0.1)}


def regression_report(y: np.ndarray, p: np.ndarray) -> dict:
    from scipy.stats import spearmanr
    mae = float(np.mean(np.abs(y - p))); base = float(np.mean(np.abs(y - np.median(y)))); ss = float(np.sum((y - p) ** 2)); st = float(np.sum((y - y.mean()) ** 2))
    top = np.argsort(-p)[: max(1, len(y) // 10)]
    return {"mae_brl": mae, "mae_baseline_median": base, "r2": 1 - ss / st if st else float("nan"), "spearman": float(spearmanr(y, p)[0]), "top_decile_capture": float(y[top].sum() / y.sum()) if y.sum() > 0 else float("nan")}


def gate(metrics: dict, min_auc: float = 0.65, max_ece: float = 0.08) -> tuple[bool, list[str]]:
    reasons = []
    for k in ("churn", "upgrade", "credits"):
        m = metrics[k]
        if m["auc"] < min_auc: reasons.append(f"{k}: AUC {m['auc']:.3f} < {min_auc}")
        if m["ece"] > max_ece: reasons.append(f"{k}: ECE {m['ece']:.3f} > {max_ece}")
    if metrics["ltv"]["mae_brl"] >= metrics["ltv"]["mae_baseline_median"]: reasons.append("ltv: pior que o baseline da mediana")
    return (not reasons, reasons)
