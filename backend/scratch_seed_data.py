import sys
import os
import csv
import json
import ast

sys.path.append(r"E:\WebSite\Blueprint\backend")

from app.db.session import SessionLocal
from app.models.hub import DSAProblem, InterviewQuestion, QuizQuestion

def clean_array_string(val):
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

def seed():
    db = SessionLocal()
    
    # 1. DSA Problems
    print("Seeding DSA Problems...")
    dsa_count = db.query(DSAProblem).count()
    if dsa_count == 0:
        dsa_file = r"E:\WebSite\Blueprint\backend\csv\ultimate_master_coding_questions.csv"
        with open(dsa_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            mappings = []
            for row in reader:
                try:
                    acRate = float(row.get('acRate', 0)) if row.get('acRate') else None
                except:
                    acRate = None
                
                mappings.append({
                    "frontend_id": int(row['frontend_id']),
                    "title": row['title'],
                    "titleSlug": row['titleSlug'],
                    "difficulty": row['difficulty'],
                    "content": row.get('content', ''),
                    "topic_tags": clean_array_string(row.get('topic_tags', '[]')),
                    "code_snippets": row.get('code_snippets', ''),
                    "acRate": acRate,
                    "companies": clean_array_string(row.get('companies', '[]')),
                    "problem_URL": row.get('problem_URL', ''),
                    "is_premium": str(row.get('is_premium', 'False'))
                })
            db.bulk_insert_mappings(DSAProblem, mappings)
            db.commit()
            print(f"Inserted {len(mappings)} DSA problems.")
    else:
        print(f"DSA Problems already seeded ({dsa_count}).")

    # 2. Quiz Questions
    print("Seeding Quiz Questions...")
    quiz_count = db.query(QuizQuestion).count()
    if quiz_count == 0:
        quiz_file = r"E:\WebSite\Blueprint\backend\csv\seed_quiz_questions.csv"
        with open(quiz_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            mappings = []
            for row in reader:
                mappings.append({
                    "id": int(row['id']),
                    "section": row['section'],
                    "topic": row['topic'],
                    "difficulty": row['difficulty'],
                    "question": row['question'],
                    "option_a": row['option_a'],
                    "option_b": row['option_b'],
                    "option_c": row['option_c'],
                    "option_d": row['option_d'],
                    "correct_ans": row['correct_ans'],
                })
            db.bulk_insert_mappings(QuizQuestion, mappings)
            db.commit()
            print(f"Inserted {len(mappings)} Quiz questions.")
    else:
        print(f"Quiz Questions already seeded ({quiz_count}).")

    # 3. Interview Questions
    print("Seeding Interview Questions...")
    int_count = db.query(InterviewQuestion).count()
    if int_count == 0:
        int_file = r"E:\WebSite\Blueprint\backend\csv\seed_interview_questions_clean.csv"
        with open(int_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            mappings = []
            for row in reader:
                mappings.append({
                    "id": int(row['id']),
                    "title": row['title'],
                    "body": row.get('body', ''),
                    "category": row['category'],
                    "skill": row.get('skill', ''),
                    "difficulty": row['difficulty'],
                    "roles": clean_array_string(row.get('roles', '[]')),
                    "source": row.get('source', 'curated')
                })
            
            # Since there are 33k rows, bulk insert in chunks of 5000 to save memory
            chunk_size = 5000
            for i in range(0, len(mappings), chunk_size):
                chunk = mappings[i:i+chunk_size]
                db.bulk_insert_mappings(InterviewQuestion, chunk)
                db.commit()
            print(f"Inserted {len(mappings)} Interview questions.")
    else:
        print(f"Interview Questions already seeded ({int_count}).")

if __name__ == "__main__":
    seed()
