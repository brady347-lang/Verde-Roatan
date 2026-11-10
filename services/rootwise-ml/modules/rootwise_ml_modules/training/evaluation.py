"""Evaluation metrics and confusion matrices (NumPy / scikit-learn only).

These functions compute metrics on data YOU supply. No result is built in or implied.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import numpy as np


def classification_metrics(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    labels: Sequence[str],
    *,
    y_score: Optional[np.ndarray] = None,
    top_k: Sequence[int] = (1, 5),
) -> Dict[str, Any]:
    """Accuracy, balanced accuracy, macro/weighted P/R/F1, per-class metrics and optional top-k.

    ``y_true``/``y_pred`` are indices into ``labels``; ``y_score`` is an optional ``[N, C]`` score matrix.
    """
    from sklearn.metrics import accuracy_score, balanced_accuracy_score, precision_recall_fscore_support

    yt = np.asarray(y_true, dtype=np.int64)
    yp = np.asarray(y_pred, dtype=np.int64)
    if yt.ndim != 1 or yt.shape != yp.shape or len(yt) == 0:
        raise ValueError("y_true and y_pred must be non-empty 1-D arrays of the same length.")
    c = len(labels)
    if yt.min() < 0 or yp.min() < 0 or yt.max() >= c or yp.max() >= c:
        raise ValueError("label indices out of range for 'labels'.")
    idx = list(range(c))
    p, r, f, s = precision_recall_fscore_support(yt, yp, labels=idx, zero_division=0)
    _, _, fw, _ = precision_recall_fscore_support(yt, yp, labels=idx, average="weighted", zero_division=0)
    present = s > 0
    out: Dict[str, Any] = {
        "n_samples": int(len(yt)),
        "accuracy": float(accuracy_score(yt, yp)),
        "balanced_accuracy": float(balanced_accuracy_score(yt, yp)),
        "macro_precision": float(p[present].mean()),
        "macro_recall": float(r[present].mean()),
        "macro_f1": float(f[present].mean()),
        "weighted_f1": float(fw),
        "per_class": {
            labels[i]: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
            for i in idx
        },
    }
    if y_score is not None:
        sc = np.asarray(y_score, dtype=np.float64)
        if sc.shape != (len(yt), c):
            raise ValueError(f"y_score must have shape {(len(yt), c)}.")
        ranks = np.argsort(-sc, axis=1)
        out["top_k_accuracy"] = {
            str(k): float(np.mean([yt[i] in ranks[i, :k] for i in range(len(yt))])) for k in top_k if 1 <= k <= c
        }
    return out


def confusion_matrix_report(
    y_true: Sequence[int], y_pred: Sequence[int], labels: Sequence[str], *, top_confusions: int = 10
) -> Dict[str, Any]:
    """Confusion matrix (rows = true, columns = predicted), row-normalised copy and top confused pairs."""
    from sklearn.metrics import confusion_matrix

    c = len(labels)
    cm = confusion_matrix(np.asarray(y_true), np.asarray(y_pred), labels=list(range(c)))
    rows = cm.sum(axis=1, keepdims=True)
    norm = np.divide(cm, rows, out=np.zeros_like(cm, dtype=np.float64), where=rows > 0)
    off = [(int(cm[i, j]), labels[i], labels[j]) for i in range(c) for j in range(c) if i != j and cm[i, j] > 0]
    off.sort(key=lambda t: (-t[0], t[1], t[2]))
    return {
        "labels": list(labels),
        "matrix": cm.tolist(),
        "row_normalized": norm.tolist(),
        "top_confusions": [{"true": a, "predicted": b, "count": n} for n, a, b in off[:top_confusions]],
    }


def retrieval_metrics(
    query_embeddings: np.ndarray,
    query_labels: Sequence[str],
    reference_embeddings: np.ndarray,
    reference_labels: Sequence[str],
    *,
    ks: Sequence[int] = (1, 5),
) -> Dict[str, Any]:
    """Species-level top-k retrieval accuracy by cosine similarity (nearest reference images)."""
    q = np.asarray(query_embeddings, dtype=np.float32)
    r = np.asarray(reference_embeddings, dtype=np.float32)
    if q.ndim != 2 or r.ndim != 2 or q.shape[1] != r.shape[1]:
        raise ValueError("embeddings must be 2-D with matching dimensions.")
    if len(query_labels) != len(q) or len(reference_labels) != len(r):
        raise ValueError("labels must match embedding counts.")
    if not (np.isfinite(q).all() and np.isfinite(r).all()):
        raise ValueError("embeddings contain non-finite values.")
    q = q / np.linalg.norm(q, axis=1, keepdims=True)
    r = r / np.linalg.norm(r, axis=1, keepdims=True)
    order = np.argsort(-(q @ r.T), axis=1)
    ref = np.asarray(reference_labels)
    result: Dict[str, Any] = {"n_queries": int(len(q)), "n_references": int(len(r)), "top_k_species_accuracy": {}}
    for k in ks:
        hits = 0
        for i in range(len(q)):
            seen: List[str] = []
            for j in order[i]:
                if ref[j] not in seen:
                    seen.append(str(ref[j]))
                if len(seen) == k:
                    break
            hits += int(query_labels[i] in seen)
        result["top_k_species_accuracy"][str(k)] = hits / len(q)
    return result
