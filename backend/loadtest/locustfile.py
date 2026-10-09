"""
locustfile.py — Load profile for the real backend API, built from what the
frontend actually calls (checked file-by-file against src/pages, not guessed).

Weighted so the mix approximates real traffic:
  - Tier 1 (DB reads, no AI) dominates — these fire on nearly every page view.
  - Tier 2 (DB writes, no AI) are rarer, matching how often a real user acts.
  - No AI/Gemini-backed endpoint is included — see loadtest/README.md. This also
    rules out POST /planner/daily specifically: its read path compares a seeded
    PlannerTask.due_date (DateTime(timezone=True)) against an aware "now", and
    SQLite's DateTime(timezone=True) doesn't actually preserve tzinfo on
    round-trip (values come back naive) — a SQLite-only limitation, confirmed by
    reading every write path to due_date, which always constructs it tz-aware.
    On the real Postgres database this comparison works fine. Excluded here
    rather than widening the harness's SQLite type-patching to every datetime
    column app-wide for the sake of one endpoint.

Run from backend/ (server + stub already running — see README.md):
  .venv/Scripts/locust -f loadtest/locustfile.py --host http://127.0.0.1:8800 --headless \
      --users 100 --spawn-rate 10 --run-time 2m --csv loadtest/results/stage_100
"""
import json
import random
from pathlib import Path

from locust import HttpUser, between, task

DATA_DIR = Path(__file__).resolve().parent / "data"
TOKENS: dict = json.loads((DATA_DIR / "tokens.json").read_text(encoding="utf-8"))
SEED: dict = json.loads((DATA_DIR / "seed_summary.json").read_text(encoding="utf-8"))

TOKEN_LIST = list(TOKENS.keys())
DSA_IDS = SEED["dsa_ids"]
IQ_IDS = SEED["iq_ids"]
TOPICS = SEED["dsa_topics"]
COMPANIES = SEED["dsa_companies"]
IQ_CATEGORIES = SEED["iq_categories"]
NOTIFS_BY_USER = SEED["notifications_by_user"]
VAULT_BY_USER = SEED["vault_ids_by_user"]
MILESTONES_BY_USER = SEED["milestones_by_user"]


class AppUser(HttpUser):
    # Think-time between actions: a real person pauses to read before clicking again.
    wait_time = between(0.3, 1.8)

    def on_start(self):
        token = random.choice(TOKEN_LIST)
        self.user_supabase_id = TOKENS[token]["id"]
        self.user_id = str(TOKENS[token]["_user_id"])
        self.headers = {"Authorization": f"Bearer {token}"}

    # ------------------------------------------------------------- Tier 1: reads

    @task(10)
    def t_dashboard_bundle(self):
        """What the dashboard page fires on load."""
        self.client.get("/api/v1/auth/me", headers=self.headers, name="GET /auth/me")
        self.client.get("/api/v1/profile/", headers=self.headers, name="GET /profile/")
        self.client.get("/api/v1/planner/plans", headers=self.headers, name="GET /planner/plans")
        self.client.get("/api/v1/roadmap", headers=self.headers, name="GET /roadmap")
        self.client.get("/api/v1/notifications/", headers=self.headers, name="GET /notifications/")
        # GET /hub/stats/dsa is deliberately NOT included: its streak query does
        # cast(UserCodingProgress.created_at, Date) at the SQL level. That's a
        # correct, standard cast on the real Postgres database, but SQLite has no
        # real DATE type (it's dynamically typed), so the cast comes back as
        # something SQLAlchemy's SQLite result-processor can't parse as a date —
        # another SQLite-only round-trip gap, not a reachable production bug,
        # same category as the /planner/daily exclusion above. See README.md.

    @task(20)
    def t_browse_coding(self):
        params = {"page": random.randint(0, 50), "limit": 20}
        if random.random() < 0.4:
            params["difficulty"] = random.choice(["EASY", "MEDIUM", "HARD"])
        if random.random() < 0.3:
            params["topic"] = random.choice(TOPICS)
        if random.random() < 0.2:
            params["company"] = random.choice(COMPANIES)
        self.client.get("/api/v1/hub/coding", params=params, headers=self.headers, name="GET /hub/coding")

    @task(8)
    def t_coding_detail(self):
        pid = random.choice(DSA_IDS)
        self.client.get(f"/api/v1/hub/coding/{pid}", headers=self.headers, name="GET /hub/coding/[id]")
        self.client.get(f"/api/v1/hub/coding/{pid}/progress", headers=self.headers, name="GET /hub/coding/[id]/progress")

    @task(15)
    def t_browse_interview(self):
        params = {"page": random.randint(0, 50), "limit": 20}
        if random.random() < 0.4:
            params["category"] = random.choice(IQ_CATEGORIES)
        if random.random() < 0.2:
            params["difficulty"] = random.choice(["Easy", "Medium", "Hard"])
        self.client.get("/api/v1/hub/interview", params=params, headers=self.headers, name="GET /hub/interview")

    @task(6)
    def t_assessments(self):
        self.client.get("/api/v1/assessments/subjects", headers=self.headers, name="GET /assessments/subjects")

    @task(5)
    def t_vault_browse(self):
        self.client.get("/api/v1/vault/?limit=20", headers=self.headers, name="GET /vault/")
        rt = random.choice(["DSA", "INTERVIEW"])
        self.client.get(f"/api/v1/vault/saved-ids?reference_type={rt}", headers=self.headers, name="GET /vault/saved-ids")

    @task(4)
    def t_onboarding_catalog(self):
        self.client.get("/api/v1/onboarding/catalog", headers=self.headers, name="GET /onboarding/catalog")

    @task(3)
    def t_quiz_inventory(self):
        self.client.get("/api/v1/hub/quiz/inventory", headers=self.headers, name="GET /hub/quiz/inventory")

    # ------------------------------------------------------------- Tier 2: writes

    @task(6)
    def t_coding_progress_write(self):
        pid = random.choice(DSA_IDS)
        status = random.choice(["attempted", "solved"])
        self.client.post(
            f"/api/v1/hub/coding/{pid}/progress",
            json={"status": status},
            headers=self.headers,
            name="POST /hub/coding/[id]/progress",
        )

    @task(4)
    def t_quiz_session(self):
        self.client.post(
            "/api/v1/hub/quiz/session",
            json={"section": "All", "topic": "All", "difficulty": "All", "limit": 5, "replay": True},
            headers=self.headers,
            name="POST /hub/quiz/session",
        )

    @task(5)
    def t_notification_read(self):
        notifs = NOTIFS_BY_USER.get(self.user_id) or []
        if not notifs:
            return
        nid = random.choice(notifs)
        self.client.patch(f"/api/v1/notifications/{nid}/read", headers=self.headers, name="PATCH /notifications/[id]/read")

    @task(3)
    def t_milestone_toggle(self):
        ms = MILESTONES_BY_USER.get(self.user_id) or []
        if not ms:
            return
        mid = random.choice(ms)
        status = random.choice(["pending", "in_progress", "completed"])
        self.client.patch(
            f"/api/v1/roadmap/milestones/{mid}",
            json={"status": status},
            headers=self.headers,
            name="PATCH /roadmap/milestones/[id]",
        )

    @task(3)
    def t_vault_add_then_remove(self):
        pid = random.choice(DSA_IDS)
        with self.client.post(
            "/api/v1/vault/",
            json={"item_type": "BOOKMARK", "reference_type": "DSA", "reference_id": pid, "title": f"Problem {pid}"},
            headers=self.headers,
            name="POST /vault/",
            catch_response=True,
        ) as resp:
            vid = None
            if resp.status_code == 201:
                try:
                    vid = resp.json().get("id")
                except Exception:
                    pass
            resp.success()
        if vid:
            self.client.delete(f"/api/v1/vault/{vid}", headers=self.headers, name="DELETE /vault/[id]")
