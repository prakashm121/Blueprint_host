"""manual_update

Revision ID: 0f06122a8c06
Revises: 4382eb22535d
Create Date: 2026-09-27 03:16:11.459135

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f06122a8c06'
down_revision: Union[str, Sequence[str], None] = '4382eb22535d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create skills table
    op.create_table('skills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('skill_key', sa.String(length=80), nullable=False),
        sa.Column('skill_type', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=60), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('skill_key')
    )
    op.create_index(op.f('ix_skills_id'), 'skills', ['id'], unique=False)
    
    # 2. Add nullable skill_id
    op.add_column('user_skill_assessments', sa.Column('skill_id', sa.Integer(), nullable=True))
    
    # 3. Data Migration!
    op.execute("""
        INSERT INTO skills (skill_key, skill_type, category)
        SELECT DISTINCT skill_key, skill_type, category 
        FROM user_skill_assessments 
        WHERE skill_key IS NOT NULL
        ON CONFLICT (skill_key) DO NOTHING;
    """)
    
    op.execute("""
        UPDATE user_skill_assessments usa
        SET skill_id = s.id
        FROM skills s
        WHERE usa.skill_key = s.skill_key;
    """)
    
    # Clean up orphaned rows if any (shouldn't be, but just in case)
    op.execute("DELETE FROM user_skill_assessments WHERE skill_id IS NULL;")
    
    # 4. Enforce NOT NULL and constraints
    op.alter_column('user_skill_assessments', 'skill_id', nullable=False)
    
    op.drop_constraint('uq_usa_user_role_skill', 'user_skill_assessments', type_='unique')
    op.create_index(op.f('ix_user_skill_assessments_skill_id'), 'user_skill_assessments', ['skill_id'], unique=False)
    op.create_unique_constraint('uq_usa_user_skill_role', 'user_skill_assessments', ['user_id', 'skill_id', 'role'])
    op.create_foreign_key(None, 'user_skill_assessments', 'skills', ['skill_id'], ['id'], ondelete='CASCADE')
    
    # Drop old columns
    op.drop_column('user_skill_assessments', 'category')
    op.drop_column('user_skill_assessments', 'skill_type')
    op.drop_column('user_skill_assessments', 'skill_key')

    # 5. Quiz Updates
    op.create_table('user_quiz_question_attempts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.Integer(), nullable=False),
        sa.Column('selected_option', sa.String(length=1), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['question_id'], ['quiz_questions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['user_quiz_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_user_quiz_attempt_user_question', 'user_quiz_question_attempts', ['user_id', 'question_id'], unique=False)
    op.create_index('ix_user_quiz_attempt_user_session', 'user_quiz_question_attempts', ['user_id', 'session_id'], unique=False)
    op.create_index(op.f('ix_user_quiz_question_attempts_id'), 'user_quiz_question_attempts', ['id'], unique=False)
    op.create_index(op.f('ix_user_quiz_question_attempts_question_id'), 'user_quiz_question_attempts', ['question_id'], unique=False)
    op.create_index(op.f('ix_user_quiz_question_attempts_session_id'), 'user_quiz_question_attempts', ['session_id'], unique=False)
    op.create_index(op.f('ix_user_quiz_question_attempts_user_id'), 'user_quiz_question_attempts', ['user_id'], unique=False)

    # 6. User Coding Progress Constraint
    op.execute("DELETE FROM user_coding_progress WHERE id NOT IN (SELECT MIN(id) FROM user_coding_progress GROUP BY user_id, dsa_id);")
    op.create_unique_constraint('uq_user_dsa', 'user_coding_progress', ['user_id', 'dsa_id'])

    # 7. Planner Updates
    op.drop_index('ix_planner_tasks_user_id', table_name='planner_tasks')
    op.drop_index('ix_pt_user_due', table_name='planner_tasks')
    op.create_index('ix_pt_plan_due', 'planner_tasks', ['weekly_plan_id', 'due_date'], unique=False)
    
    op.execute("ALTER TABLE planner_tasks DROP CONSTRAINT IF EXISTS planner_tasks_user_id_fkey;")
    op.execute('ALTER TABLE planner_tasks DROP COLUMN user_id CASCADE;')

    op.drop_column('weekly_plans', 'completed_tasks')
    op.drop_column('weekly_plans', 'total_tasks')
    op.drop_column('weekly_plans', 'completion_percentage')


def downgrade() -> None:
    """Downgrade schema."""
    pass
