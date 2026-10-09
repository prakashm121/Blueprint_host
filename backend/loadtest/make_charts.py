"""
make_charts.py — Builds PNG charts from the staged Locust CSV results.
Run from backend/:  .venv/Scripts/python.exe -m loadtest.make_charts
"""
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

RESULTS = Path(__file__).resolve().parent / "results"
STAGES = [20, 50, 100, 200, 400]
HIGHLIGHT_ENDPOINTS = [
    "GET /hub/coding",
    "GET /hub/interview",
    "GET /auth/me",
    "POST /hub/coding/[id]/progress",
    "POST /vault/",
    "PATCH /notifications/[id]/read",
]


def load_stage(users):
    path = RESULTS / f"stage_{users:03d}_stats.csv"
    with open(path, newline="", encoding="utf-8") as f:
        rows = {row["Name"]: row for row in csv.DictReader(f)}
    return rows


def main():
    agg = {u: load_stage(u)["Aggregated"] for u in STAGES}

    rps = [float(agg[u]["Requests/s"]) for u in STAGES]
    p50 = [float(agg[u]["50%"]) for u in STAGES]
    p95 = [float(agg[u]["95%"]) for u in STAGES]
    p99 = [float(agg[u]["99%"]) for u in STAGES]
    fail_pct = [
        100 * int(agg[u]["Failure Count"]) / max(1, int(agg[u]["Request Count"]))
        for u in STAGES
    ]

    # --- Chart 1: the headline capacity curve -----------------------------------
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4.5))

    ax1.plot(STAGES, rps, marker="o", color="#2563eb", linewidth=2)
    ax1.set_xlabel("Concurrent simulated users")
    ax1.set_ylabel("Requests / second (all endpoints combined)")
    ax1.set_title("Throughput vs concurrency")
    ax1.grid(alpha=0.3)
    for x, y in zip(STAGES, rps):
        ax1.annotate(f"{y:.0f}", (x, y), textcoords="offset points", xytext=(0, 8), ha="center", fontsize=9)

    ax2.plot(STAGES, p50, marker="o", label="p50 (median)", color="#16a34a")
    ax2.plot(STAGES, p95, marker="o", label="p95", color="#d97706")
    ax2.plot(STAGES, p99, marker="o", label="p99", color="#dc2626")
    ax2.set_xlabel("Concurrent simulated users")
    ax2.set_ylabel("Response time (ms, log scale)")
    ax2.set_yscale("log")
    ax2.set_title("Latency vs concurrency")
    ax2.grid(alpha=0.3, which="both")
    ax2.legend()

    fig.suptitle("Backend capacity curve — local SQLite harness (see README.md caveats)", fontsize=12)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(RESULTS / "chart_1_capacity_curve.png", dpi=130)
    plt.close(fig)

    # --- Chart 2: failure rate vs concurrency ------------------------------------
    fig, ax = plt.subplots(figsize=(6.5, 4.2))
    bars = ax.bar([str(u) for u in STAGES], fail_pct, color=["#16a34a" if f < 1 else "#dc2626" for f in fail_pct])
    ax.set_xlabel("Concurrent simulated users")
    ax.set_ylabel("Failure rate (%)")
    ax.set_title("Error rate vs concurrency")
    ax.grid(alpha=0.3, axis="y")
    for b, f in zip(bars, fail_pct):
        ax.annotate(f"{f:.2f}%", (b.get_x() + b.get_width() / 2, b.get_height()), textcoords="offset points", xytext=(0, 4), ha="center", fontsize=9)
    fig.tight_layout()
    fig.savefig(RESULTS / "chart_2_failure_rate.png", dpi=130)
    plt.close(fig)

    # --- Chart 3: per-endpoint p95 latency at 100 vs 200 users -------------------
    stage_a, stage_b = 100, 200
    rows_a = load_stage(stage_a)
    rows_b = load_stage(stage_b)
    names = [n for n in HIGHLIGHT_ENDPOINTS if n in rows_a and n in rows_b]
    p95_a = [float(rows_a[n]["95%"]) for n in names]
    p95_b = [float(rows_b[n]["95%"]) for n in names]

    fig, ax = plt.subplots(figsize=(9, 4.8))
    x = range(len(names))
    width = 0.35
    ax.bar([i - width / 2 for i in x], p95_a, width, label=f"{stage_a} users", color="#2563eb")
    ax.bar([i + width / 2 for i in x], p95_b, width, label=f"{stage_b} users", color="#dc2626")
    ax.set_xticks(list(x))
    ax.set_xticklabels(names, rotation=28, ha="right", fontsize=8)
    ax.set_ylabel("p95 response time (ms)")
    ax.set_title(f"p95 latency by endpoint: {stage_a} vs {stage_b} concurrent users")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(RESULTS / "chart_3_endpoint_latency.png", dpi=130)
    plt.close(fig)

    print("Wrote:")
    for p in ["chart_1_capacity_curve.png", "chart_2_failure_rate.png", "chart_3_endpoint_latency.png"]:
        print(" -", RESULTS / p)

    print("\nSummary table:")
    print(f"{'users':>6} {'rps':>8} {'p50ms':>7} {'p95ms':>7} {'p99ms':>8} {'fail%':>7}")
    for i, u in enumerate(STAGES):
        print(f"{u:>6} {rps[i]:>8.1f} {p50[i]:>7.0f} {p95[i]:>7.0f} {p99[i]:>8.0f} {fail_pct[i]:>6.2f}%")


if __name__ == "__main__":
    main()
