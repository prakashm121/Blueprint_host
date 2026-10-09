"""
locustfile_ai.py — A SEPARATE, deliberately small and slow load profile for the
real AI-backed endpoints: mentor chat, roadmap generation, weekly plan
generation, daily plan generation. Every call here hits the real Gemini API
(lite models only — see bootstrap_ai.py) and costs real, if small, money.

This is NOT a capacity/breaking-point test like locustfile.py. It's a bounded
sample of concurrent-AI-call latency and success rate: few users, long
think-time, short run. Do not raise --users/--run-time without re-reading
bootstrap_ai.py's docstring first.

Run from backend/ (server_entry_ai.py already running on 8801):
  .venv/Scripts/locust -f loadtest/locustfile_ai.py --host http://127.0.0.1:8801 \
      --headless --users 5 --spawn-rate 5 --run-time 90s --csv loadtest/results/ai_run
"""
import json
import random
from pathlib import Path

from locust import HttpUser, between, task

DATA_DIR = Path(__file__).resolve().parent / "data"
TOKENS: dict = json.loads((DATA_DIR / "tokens.json").read_text(encoding="utf-8"))
TOKEN_LIST = list(TOKENS.keys())

LITE_MODEL = "gemini-3.5-flash-lite"
MENTOR_PROMPTS = [
    "In one short paragraph, what is a hash map and when would I use one?",
    "Give me a 3-bullet summary of how TCP differs from UDP.",
    "What's one thing I should check before a system design interview?",
]


class AIUser(HttpUser):
    # Long think-time: these are expensive real calls, not a flood test.
    wait_time = between(3, 6)

    def on_start(self):
        token = random.choice(TOKEN_LIST)
        self.headers = {"Authorization": f"Bearer {token}"}
        self.conversation_id = None
        with self.client.post(
            "/api/v1/mentor/conversations",
            json={"title": "AI load test"},
            headers=self.headers,
            name="POST /mentor/conversations [setup]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                try:
                    self.conversation_id = resp.json().get("id")
                except Exception:
                    pass
            resp.success()

    @task(3)
    def t_mentor_chat(self):
        if not self.conversation_id:
            return
        self.client.post(
            f"/api/v1/mentor/conversations/{self.conversation_id}/stream",
            json={"content": random.choice(MENTOR_PROMPTS), "model_override": LITE_MODEL},
            headers=self.headers,
            name="POST /mentor/conversations/[id]/stream (real Gemini, lite)",
            timeout=60,
        )

    @task(1)
    def t_generate_roadmap(self):
        self.client.post(
            "/api/v1/onboarding/generate-roadmap",
            headers=self.headers,
            name="POST /onboarding/generate-roadmap (real Gemini, lite)",
            timeout=90,
        )

    @task(1)
    def t_weekly_plan(self):
        self.client.post(
            "/api/v1/planner/plans",
            json={"title": "AI load test week"},
            headers=self.headers,
            name="POST /planner/plans (real Gemini, lite)",
            timeout=60,
        )

    @task(1)
    def t_daily_plan(self):
        # Non-empty custom_tasks bypasses the per-day cache, so this is a real
        # Gemini call each time (not just the first call of the day per user).
        self.client.post(
            "/api/v1/planner/daily",
            json={"available_minutes": 60, "custom_tasks": [f"Custom task {random.randint(1, 999)}"]},
            headers=self.headers,
            name="POST /planner/daily (real Gemini, lite)",
            timeout=60,
        )
