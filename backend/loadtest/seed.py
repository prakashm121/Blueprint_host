"""
seed.py — Builds the local SQLite load-test database and the token map the
Supabase auth stub serves.

The catalog tables (dsa_problems, interview_questions, quiz_questions) are loaded
from the real seed CSVs in backend/csv/ — the same files and the same parsing
logic as scratch_seed_data.py uses to build the real database — so the load test
runs against the actual catalog (real titles, real tag/company distributions,
real HTML content lengths), not synthetic placeholder rows.

Run from backend/:  .venv/Scripts/python.exe -m loadtest.seed
"""
import ast
import csv
import json
import random
import secrets
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from loadtest import bootstrap  # noqa: E402  (must run before any `app` import — sets env + patches types)

bootstrap.strip_postgres_only_indexes()

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.profile import Profile  # noqa: E402
from app.models.planner import WeeklyPlan, PlannerTask  # noqa: E402
from app.models.roadmap import RoleRoadmap, RoadmapMilestone  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.vault import VaultItem, VaultItemType, VaultReferenceType  # noqa: E402
from app.models.hub import DSAProblem, InterviewQuestion, QuizQuestion  # noqa: E402
from app.core.role_skills import ROLE_ASSESSMENT_SKILLS  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "data"
CSV_DIR = Path(__file__).resolve().parent.parent / "csv"

N_USERS = 25
TARGET_ROLES = list(ROLE_ASSESSMENT_SKILLS.keys())
COMPANIES_FALLBACK = ["Google", "Amazon", "Microsoft", "Flipkart", "Atlassian"]


def clean_array_string(val):
    """Same parser as scratch_seed_data.py, for the topic_tags/companies/roles columns."""
    if not val:
        return []
    if val.startswith('['):
        try:
            return ast.literal_eval(val)
        except Exception:
            try:
                return json.loads(val)
            except Exception:
                pass
    return [v.strip() for v in val.split(',') if v.strip()]


def rand_subset(items, k_min=1, k_max=3):
    if not items:
        return []
    k = random.randint(k_min, min(k_max, len(items)))
    return random.sample(items, k)


def seed_catalog(db):
    """Load the real catalog CSVs, exactly as scratch_seed_data.py does for the real DB."""
    dsa_file = CSV_DIR / "ultimate_master_coding_questions.csv"
    print(f"[seed] loading dsa_problems from {dsa_file.name}...")
    with open(dsa_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        mappings = []
        for row in reader:
            try:
                ac_rate = float(row.get('acRate', 0)) if row.get('acRate') else None
            except ValueError:
                ac_rate = None
            mappings.append({
                "frontend_id": int(row['frontend_id']),
                "title": row['title'],
                "titleSlug": row['titleSlug'],
                "difficulty": row['difficulty'],
                "content": row.get('content', ''),
                "topic_tags": clean_array_string(row.get('topic_tags', '[]')),
                "code_snippets": row.get('code_snippets', ''),
                "acRate": ac_rate,
                "companies": clean_array_string(row.get('companies', '[]')),
                "problem_URL": row.get('problem_URL', ''),
                "is_premium": str(row.get('is_premium', 'False')),
            })
    db.bulk_insert_mappings(DSAProblem, mappings)
    db.commit()
    print(f"[seed]   inserted {len(mappings)} dsa_problems")

    quiz_file = CSV_DIR / "seed_quiz_questions.csv"
    print(f"[seed] loading quiz_questions from {quiz_file.name}...")
    with open(quiz_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        mappings = [
            {
                "id": int(row['id']),
                "section": row['section'],
                "topic": row['topic'],
                "difficulty": row['difficulty'],
                "question": row['question'],
                "option_a": row['option_a'], "option_b": row['option_b'],
                "option_c": row['option_c'], "option_d": row['option_d'],
                "correct_ans": row['correct_ans'],
            }
            for row in reader
        ]
    db.bulk_insert_mappings(QuizQuestion, mappings)
    db.commit()
    print(f"[seed]   inserted {len(mappings)} quiz_questions")

    iq_file = CSV_DIR / "seed_interview_questions_clean.csv"
    print(f"[seed] loading interview_questions from {iq_file.name}...")
    with open(iq_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        mappings = [
            {
                "id": int(row['id']),
                "title": row['title'],
                "body": row.get('body', ''),
                "category": row['category'],
                "skill": row.get('skill', ''),
                "difficulty": row['difficulty'],
                "roles": clean_array_string(row.get('roles', '[]')),
                "source": row.get('source', 'curated'),
            }
            for row in reader
        ]
    chunk_size = 5000
    for i in range(0, len(mappings), chunk_size):
        db.bulk_insert_mappings(InterviewQuestion, mappings[i:i + chunk_size])
        db.commit()
    print(f"[seed]   inserted {len(mappings)} interview_questions")


def top_array_values(db, column, limit=30):
    """Most common values inside an ARRAY column (topic_tags / companies / roles),
    sampled from a slice of rows — used so Locust's filter params actually hit
    non-empty results most of the time, like a real user picking from a dropdown."""
    counts = Counter()
    for (arr,) in db.query(column).limit(2000).all():
        counts.update(arr or [])
    return [v for v, _ in counts.most_common(limit)] or COMPANIES_FALLBACK


def seed_users(db, companies, topics, iq_categories):
    tokens = {}
    notifications_by_user = {}
    vault_ids_by_user = {}
    milestones_by_user = {}
    tasks_by_user = {}

    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    dsa_ids = [r.id for r in db.query(DSAProblem.id).limit(500).all()]

    print(f"[seed] inserting {N_USERS} users (+ profiles, plans, roadmaps, notifications, vault)...")
    for i in range(1, N_USERS + 1):
        token = f"loadtest_{secrets.token_hex(16)}"
        supabase_id = f"loadtest-{i:04d}"
        email = f"loadtest.user{i}@example.invalid"
        role = random.choice(TARGET_ROLES)

        user = User(
            supabase_id=supabase_id,
            email=email,
            full_name=f"Load Test User {i}",
            onboarding_step="completed",
            target_role=role,
            target_companies=json.dumps(rand_subset(companies, 1, 3)),
            preparation_status=random.choice(["early", "mid", "late"]),
            onboarding_completed_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()  # get user.id

        db.add(Profile(
            user_id=user.id,
            full_name=user.full_name,
            college_name="Load Test Institute of Technology",
            degree="B.Tech",
            specialization="Computer Science",
            graduation_year=2026,
            cgpa=8.1,
        ))

        # Weekly plan + tasks (so /planner/plans returns real data)
        plan = WeeklyPlan(
            user_id=user.id,
            title="This week's plan",
            week_number=1,
            start_date=week_start,
            end_date=week_start + timedelta(days=6),
            generation_source="manual",
            status="active",
        )
        db.add(plan)
        db.flush()
        task_ids = []
        for t in range(5):
            task = PlannerTask(
                weekly_plan_id=plan.id,
                title=f"Sample planner task {t + 1}",
                category=random.choice(["DSA", "Subjects", "Resume", "Projects"]),
                priority=random.choice(["Low", "Medium", "High"]),
                status=random.choice(["Pending", "Completed"]),
                # NULL rather than a real datetime: SQLite's DateTime(timezone=True) doesn't
                # preserve tzinfo on round-trip (values come back naive), which crashes the
                # aware-datetime comparison in context_builder.py's due-today filter. The real
                # Postgres database doesn't have this gap (confirmed: every committed write path
                # to due_date constructs it tz-aware). due_date is nullable, and the filter
                # already treats NULL as "always due", so this keeps /planner/daily testable here.
                due_date=None,
                estimated_minutes=random.choice([30, 45, 60]),
                display_order=t,
            )
            db.add(task)
            db.flush()
            task_ids.append(task.id)
        tasks_by_user[user.id] = task_ids

        # Roadmap + milestones
        roadmap = RoleRoadmap(user_id=user.id, role=role)
        db.add(roadmap)
        db.flush()
        ms_ids = []
        for m in range(10):
            ms = RoadmapMilestone(
                roadmap_id=roadmap.id,
                title=f"Milestone {m + 1} for {role}",
                description=f"- Step one for milestone {m + 1}\n- Step two\n- Step three",
                category=random.choice(["DSA", "Subjects", "Projects", "Resume"]),
                priority_order=m,
                status=random.choice(["pending", "in_progress", "completed"]),
            )
            db.add(ms)
            db.flush()
            ms_ids.append(ms.id)
        milestones_by_user[user.id] = ms_ids

        # Notifications
        notif_ids = []
        for n in range(6):
            notif = Notification(
                user_id=user.id,
                notification_type=random.choice(["System", "Planner", "Mentor", "Achievement"]),
                title=f"Load test notification {n + 1}",
                body="Sample notification body for load testing.",
                read_at=None if n < 3 else datetime.now(timezone.utc),
            )
            db.add(notif)
            db.flush()
            notif_ids.append(notif.id)
        notifications_by_user[user.id] = notif_ids

        # A few vault bookmarks
        v_ids = []
        for pid in random.sample(dsa_ids, 3):
            v = VaultItem(
                user_id=user.id,
                item_type=VaultItemType.BOOKMARK,
                reference_type=VaultReferenceType.DSA,
                reference_id=pid,
                title=f"Problem {pid}",
            )
            db.add(v)
            db.flush()
            v_ids.append(v.id)
        vault_ids_by_user[user.id] = v_ids

        tokens[token] = {
            "id": supabase_id,
            "aud": "authenticated",
            "role": "authenticated",
            "email": email,
            "email_confirmed_at": datetime.now(timezone.utc).isoformat(),
            "user_metadata": {"full_name": user.full_name},
            # Harness-only field (not a real Supabase response field, harmlessly ignored
            # by get_current_user's .get() lookups): lets locustfile.py map a token
            # straight to the DB user_id, instead of relying on dict insertion order.
            "_user_id": user.id,
        }

        if i % 5 == 0:
            db.commit()
            print(f"[seed]   ...{i}/{N_USERS} users")

    db.commit()
    return tokens, {
        "dsa_ids": dsa_ids,
        "iq_ids": [r.id for r in db.query(InterviewQuestion.id).limit(500).all()],
        "dsa_topics": topics,
        "dsa_companies": companies,
        "iq_categories": iq_categories,
        "notifications_by_user": notifications_by_user,
        "vault_ids_by_user": vault_ids_by_user,
        "milestones_by_user": milestones_by_user,
        "tasks_by_user": tasks_by_user,
    }


def main():
    db_file = Path(bootstrap.DB_PATH)
    if db_file.exists():
        db_file.unlink()
        print(f"[seed] removed old {db_file}")

    Base.metadata.create_all(bind=engine)
    print("[seed] schema created")

    db = SessionLocal()
    try:
        seed_catalog(db)
        topics = top_array_values(db, DSAProblem.topic_tags)
        companies = top_array_values(db, DSAProblem.companies)
        iq_categories = [r[0] for r in db.query(InterviewQuestion.category).distinct().limit(30).all() if r[0]]
        tokens, summary = seed_users(db, companies, topics, iq_categories)
    finally:
        db.close()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "tokens.json").write_text(json.dumps(tokens, indent=2), encoding="utf-8")
    (DATA_DIR / "seed_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[seed] wrote {len(tokens)} tokens -> {DATA_DIR / 'tokens.json'}")
    print(f"[seed] wrote seed summary -> {DATA_DIR / 'seed_summary.json'}")
    print("[seed] done.")


if __name__ == "__main__":
    main()
