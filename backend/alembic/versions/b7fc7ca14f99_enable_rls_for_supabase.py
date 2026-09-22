"""enable_rls_for_supabase

Revision ID: b7fc7ca14f99
Revises: f71487121852
Create Date: 2026-09-23 01:31:21.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b7fc7ca14f99'
down_revision = '294512c6f968'
branch_labels = None
depends_on = None

def upgrade():
    # Enable RLS
    op.execute("ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE dsa_problems ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;")

    # 1. PROFILES (Users can only read/update their own profile)
    op.execute("CREATE POLICY select_own_profile ON profiles FOR SELECT USING (auth.uid() = user_id);")
    op.execute("CREATE POLICY update_own_profile ON profiles FOR UPDATE USING (auth.uid() = user_id);")
    op.execute("CREATE POLICY insert_own_profile ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);")

    # 2. VAULT ITEMS (Users can only manage their own saved items)
    op.execute("CREATE POLICY manage_own_vault_items ON vault_items FOR ALL USING (auth.uid() = user_id);")

    # 3. DSA / QUIZ / INTERVIEW (Publicly readable by authenticated users, NO writes)
    op.execute("CREATE POLICY read_dsa_problems ON dsa_problems FOR SELECT USING (auth.role() = 'authenticated');")
    op.execute("CREATE POLICY read_quiz_questions ON quiz_questions FOR SELECT USING (auth.role() = 'authenticated');")
    op.execute("CREATE POLICY read_interview_questions ON interview_questions FOR SELECT USING (auth.role() = 'authenticated');")

def downgrade():
    op.execute("DROP POLICY IF EXISTS select_own_profile ON profiles;")
    op.execute("DROP POLICY IF EXISTS update_own_profile ON profiles;")
    op.execute("DROP POLICY IF EXISTS insert_own_profile ON profiles;")
    op.execute("DROP POLICY IF EXISTS manage_own_vault_items ON vault_items;")
    op.execute("DROP POLICY IF EXISTS read_dsa_problems ON dsa_problems;")
    op.execute("DROP POLICY IF EXISTS read_quiz_questions ON quiz_questions;")
    op.execute("DROP POLICY IF EXISTS read_interview_questions ON interview_questions;")
    
    op.execute("ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE vault_items DISABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE dsa_problems DISABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE quiz_questions DISABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE interview_questions DISABLE ROW LEVEL SECURITY;")
