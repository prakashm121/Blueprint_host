"""
make_chart_ai.py — Builds one PNG chart from the bounded AI-endpoint test run.
Run from backend/:  .venv/Scripts/python.exe -m loadtest.make_chart_ai
"""
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

RESULTS = Path(__file__).resolve().parent / "results"

LABELS = {
    "POST /mentor/conversations/[id]/stream (real Gemini, lite)": "Mentor chat",
    "POST /onboarding/generate-roadmap (real Gemini, lite)": "Generate roadmap",
    "POST /planner/daily (real Gemini, lite)": "Daily plan*",
    "POST /planner/plans (real Gemini, lite)": "Weekly plan**",
}


def main():
    with open(RESULTS / "ai_run_stats.csv", newline="", encoding="utf-8") as f:
        rows = {row["Name"]: row for row in csv.DictReader(f)}

    names = [n for n in LABELS if n in rows]
    labels = [LABELS[n] for n in names]
    p50 = [float(rows[n]["50%"]) for n in names]
    p90 = [float(rows[n]["90%"]) for n in names]
    counts = [int(rows[n]["Request Count"]) for n in names]
    fails = [int(rows[n]["Failure Count"]) for n in names]

    fig, ax = plt.subplots(figsize=(8.5, 5))
    x = range(len(names))
    width = 0.35
    ax.bar([i - width / 2 for i in x], p50, width, label="p50 (median)", color="#2563eb")
    ax.bar([i + width / 2 for i in x], p90, width, label="p90", color="#d97706")
    ax.set_xticks(list(x))
    ax.set_xticklabels([f"{l}\n({c} calls, {f} failed)" for l, c, f in zip(labels, counts, fails)], fontsize=9)
    ax.set_ylabel("Response time (ms)")
    ax.set_title("Real Gemini latency per AI endpoint — lite models, 5 concurrent users, 90s\n(free-tier quota: 15 req/min per model — see report)")
    ax.legend()
    ax.grid(alpha=0.3, axis="y")
    fig.tight_layout()
    fig.savefig(RESULTS / "chart_4_ai_endpoints.png", dpi=130)
    plt.close(fig)
    print("Wrote", RESULTS / "chart_4_ai_endpoints.png")


if __name__ == "__main__":
    main()
