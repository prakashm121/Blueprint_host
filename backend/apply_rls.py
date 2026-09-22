import os
import psycopg
from dotenv import load_dotenv

load_dotenv("E:/WebSite/Blueprint_host/backend/.env")
db_url = os.getenv("DATABASE_URL").replace("postgresql+psycopg://", "postgresql://")

queries = [
    "ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE dsa_problems ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;",
    "DROP POLICY IF EXISTS select_own_profile ON profiles;",
    "DROP POLICY IF EXISTS update_own_profile ON profiles;",
    "DROP POLICY IF EXISTS insert_own_profile ON profiles;",
    "DROP POLICY IF EXISTS manage_own_vault_items ON vault_items;",
    "DROP POLICY IF EXISTS read_dsa_problems ON dsa_problems;",
    "DROP POLICY IF EXISTS read_quiz_questions ON quiz_questions;",
    "DROP POLICY IF EXISTS read_interview_questions ON interview_questions;",
    "CREATE POLICY select_own_profile ON profiles FOR SELECT USING (auth.uid() = user_id);",
    "CREATE POLICY update_own_profile ON profiles FOR UPDATE USING (auth.uid() = user_id);",
    "CREATE POLICY insert_own_profile ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);",
    "CREATE POLICY manage_own_vault_items ON vault_items FOR ALL USING (auth.uid() = user_id);",
    "CREATE POLICY read_dsa_problems ON dsa_problems FOR SELECT USING (auth.role() = 'authenticated');",
    "CREATE POLICY read_quiz_questions ON quiz_questions FOR SELECT USING (auth.role() = 'authenticated');",
    "CREATE POLICY read_interview_questions ON interview_questions FOR SELECT USING (auth.role() = 'authenticated');",
]

try:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for q in queries:
                print(f"Executing: {q}")
                cur.execute(q)
        conn.commit()
    print("RLS Policies Applied Successfully!")
except Exception as e:
    print(f"Error: {e}")
