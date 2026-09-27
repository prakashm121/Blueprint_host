import asyncio
import hashlib
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import Optional, AsyncGenerator

from google import genai
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.ai.gateway import ai_gateway

logger = logging.getLogger("blueprint.quiz_generator")

# ─────────────────────────────────────────────────────────────────────────────
# QUIZ TAXONOMY (Embedded for Render compatibility)
# ─────────────────────────────────────────────────────────────────────────────
QUIZ_TAXONOMY = {
    "AI & ML": [
        "Data Science Concepts",
        "Supervised Learning",
        "Unsupervised Learning",
        "Reinforcement Learning",
        "Model Evaluation (Precision, Recall, F1, ROC)",
        "Neural Networks (ANN, CNN, RNN, LSTM, Transformers)",
        "Optimization (SGD, Adam, Gradient Descent)",
        "NLP Basics (Tokenization, Lemmatization, Stemming)",
        "Word Embeddings (Word2Vec, GloVe, BERT, etc.)",
        "Large Language Models (GPT, Gemini, LLaMA, etc.)",
        "Image Classification",
        "Object Detection (YOLO, Faster R-CNN)",
        "OpenCV Basics",
        "Image Segmentation",
        "Hugging Face Transformers",
        "LangChain / RAG Systems",
        "Model Deployment (Flask, FastAPI, Docker)",
        "Model Monitoring",
        "CI/CD for ML",
        "Recommendation Systems",
        "Time Series Forecasting",
        "NumPy",
        "Pandas",
        "Scikit-learn",
        "TensorFlow",
        "PyTorch",
        "Keras",
        "LightGBM",
        "XGBoost",
        "CatBoost",
        "Matplotlib",
        "Seborn",
        "Plotly",
        "NLTK",
        "SpaCy",
        "HuggingFace",
        "OpenCV",
        "YOLO",
        "Detectron2",
        "Hadoop",
        "Spark",
        "Spark MLlib",
        "Flink",
        "Storm",
        "Samza",
        "Mliflow",
        "RAPIDS",
        "Jupyter",
        "Google Colab",
        "ML",
        "Python",
        "Deep Learning",
        "Models",
        "Concepts",
        "Preprocessing",
        "Training",
        "ML Formula",
        "ML Basics"
    ],
    "Backend": [
        "Spring",
        "Spring Boot",
        "Struts",
        "ASP.NET",
        "ASP.NET Core",
        "Django",
        "Flask",
        "FastAPI",
        "Express.js",
        "NestJS",
        "Meteor.js",
        "Koa.js",
        "Laravel",
        "Symfony",
        "CodeIgniter",
        "CakePHP",
        "Ruby on Rails",
        "Sinatra",
        "Grails",
        "PlayFramework",
        "Phoenix",
        "ColdFusion"
    ],
    "Behavioral": [
        "Communication",
        "Leadership",
        "Teamwork",
        "Conflict Resolution",
        "Problem Solving",
        "Situational Judgment",
        "Interview Communication",
        "Negotiation",
        "Talent Acquisition",
        "Performance Management"
    ],
    "Blockchain": [
        "Ethereum",
        "Hyperledger",
        "Smart Contracts",
        "Polkadot",
        "Solana",
        "IPFS",
        "Bitcoin",
        "Ethereum / Smart Contracts",
        "Web3.js / Ethers.js",
        "Consensus Mechanisms (PoW, PoS)",
        "Blockchain Security"
    ],
    "Core Subjects": [
        "OOP",
        "Operating Systems",
        "DSA"
    ],
        "DSA": [
        "Arrays & Strings",
        "Linked Lists",
        "Stacks & Queues",
        "Trees & BST",
        "Graphs",
        "Heaps & Priority Queues",
        "Hash Tables",
        "Sorting & Searching",
        "Dynamic Programming",
        "Greedy Algorithms",
        "Backtracking",
        "Bit Manipulation",
        "Two Pointers",
        "Sliding Window"
    ],
    "Data Analytics & BI": [
        "Tableau",
        "Power BI",
        "Looker",
        "QlikView"
    ],
    "Database": [
        "SQL Server",
        "BigQuery",
        "Cassandra",
        "PostgreSQL",
        "MariaDB",
        "Oracle",
        "MySQL",
        "IBM Db2",
        "SQLite",
        "Microsoft Access",
        "Teradata",
        "MongoDB",
        "CouchDB",
        "Neo4j",
        "Firebase",
        "Firestore",
        "Redis",
        "Memcached",
        "HBase",
        "InfluxDB",
        "TimescaleDB",
        "RocksDB",
        "LevelDB",
        "Snowflake",
        "Hive",
        "Pig",
        "Delta Lake",
        "AWS Lake Formation"
    ],
    "DevOps": [
        "Docker",
        "Kubernetes",
        "OpenShift",
        "Vagrant",
        "Jenkins",
        "Ansible",
        "Puppet",
        "Chef",
        "Terraform",
        "Prometheus",
        "Grafana",
        "ELK Stack",
        "Nagios",
        "Zabbix",
        "Consul",
        "etcd",
        "Nginx",
        "Git",
        "GitHub",
        "GitLab",
        "Bitbucket",
        "Maven"
    ],
    "Emerging Tech": [
        "Arduino",
        "Raspberry Pi",
        "MQTT",
        "AWS Greengrass",
        "Azure IoT Edge",
        "Cirq",
        "IBM Qiskit",
        "Unity3D",
        "Unreal Engine",
        "ARKit",
        "ARCore",
        "AWS Lambda",
        "Azure Functions",
        "Google Cloud Functions",
        "Cloudflare Workers",
        "Akamai Edge"
    ],
    "Frontend": [
        "HTML",
        "CSS",
        "React.js",
        "Next.js",
        "Remix",
        "Angular",
        "Keycloak",
        "AngularJS",
        "Vue.js",
        "Nuxt.js",
        "Svelte",
        "SolidJS",
        "Alpine.js",
        "Stencil.js",
        "Backbone.js",
        "Knockout.js",
        "jQuery",
        "jQuery Mobile",
        "React Native",
        "Flutter",
        "Ionic",
        "Xamarin",
        "Cordova",
        "PhoneGap",
        "Android",
        "iOS",
        "Sass",
        "Less",
        "Tailwind",
        "Bootstrap",
        "Material UI",
        "Webpack",
        "Vite",
        "Parcel",
        "Gulp",
        "Grunt"
    ],
    "Programming Languages": [
        "C",
        "C++",
        "Java",
        "Python",
        "C#",
        "Go",
        "Rust",
        "Scala",
        "Kotlin",
        "Swift",
        "PHP",
        "JavaScript",
        "TypeScript",
        "Dart",
        "Ruby",
        "Haskell",
        "Lisp",
        "Clojure",
        "F#",
        "Perl",
        "Shell",
        "PowerShell",
        "VB.NET",
        "Visual Basic",
        "COBOL",
        "Fortran",
        "Pascal",
        "Tcl",
        "R",
        "Julia",
        "MATLAB",
        "Octave",
        "SAS",
        "Assembly",
        "CUDA",
        "Verilog",
        "VHDL",
        "Ada",
        "Solidity",
        "Q#",
        "WebAssembly"
    ],
    "Security & Networking": [
        "Networking Fundamentals",
        "Information Security Basics",
        "Ethical Hacking & Penetration Testing",
        "Incident Response & Digital Forensics",
        "Threat Intelligence & Risk Management",
        "Cloud Security",
        "Network Security",
        "Security Compliance & Governance",
        "Cryptography",
        "Encryption",
        "OAuth",
        "JWT",
        "SAML",
        "TLS/SSL",
        "Metasploit",
        "Wireshark",
        "Burp Suite",
        "DNS",
        "HTTP/HTTPS",
        "Firewalls",
        "Nessus",
        "HashiCorp Vault"
    ],
    "System Design": [
        "REST API",
        "gRPC",
        "GraphQL",
        "WebSockets",
        "SOAP",
        "Apache Airflow",
        "Luigi",
        "Talend",
        "Informatica",
        "Kafka",
        "RabbitMQ",
        "ActiveMQ",
        "Load Balancers",
        "Jetty",
        "Yarn",
        "Gradle",
        "Composer",
        "IntelliJ",
        "Ant",
        "PyCharm"
    ],
    "Testing & QA": [
        "JUnit",
        "TestNG",
        "PyTest",
        "Unittest",
        "Mocha",
        "Chai",
        "Jest",
        "QUnit",
        "Selenium",
        "Cypress",
        "Playwright",
        "Robot Framework",
        "Postman",
        "Newman",
        "RestAssured",
        "Cucumber",
        "Behave",
        "SpecFlow",
        "Karma"
    ],
    "UI/UX & Design": [
        "Figma",
        "Sketch",
        "Adobe XD",
        "InVision",
        "Axure RP",
        "Balsamiq",
        "Adobe Photoshop",
        "Adobe Creative Suite",
        "Adobe Illustrator",
        "Proto.io"
    ],
    "DevOps Engineer": [
        "Docker",
        "Kubernetes",
        "CI/CD",
        "Terraform",
        "Monitoring",
        "Git",
        "Pipelines",
        "Security",
        "Cloud"
    ],
    "React Engineer": [
        "Hooks",
        "State",
        "JSX",
        "Routing",
        "Lifecycle",
        "Redux",
        "Optimization",
        "Testing",
        "Components"
    ],
    "SAP Engineer": [
        "ABAP",
        "HANA",
        "BASIS",
        "FI",
        "CO",
        "MM",
        "SD",
        "Fiori",
        "Security"
    ],
    "Numerical Ability": [
        "Percentages",
        "Profit and Loss",
        "Simple Interest",
        "Compound Interest",
        "Speed and Distance",
        "Time and Work",
        "Ratio and Proportion",
        "Averages",
        "Algebra",
        "Mensuration",
        "Number Series",
        "Permutation and Combination",
        "Probability",
        "HCF and LCM",
        "Mixtures",
        "Clocks",
        "Calendars",
        "Pipes and Cisterns",
        "Ages",
        "Boats and Streams",
        "Aptitude",
        "Number Systems",
        "Data Interpretation",
        "Logarithms",
        "Surds and Indices"
    ],
    "Logical Reasoning": [
        "Series",
        "Coding-Decoding",
        "Blood Relations",
        "Syllogisms",
        "Seating Arrangement",
        "Direction Sense",
        "Analogies",
        "Classification",
        "Statement and Conclusions",
        "Statement and Assumptions",
        "Puzzles",
        "Cause and Effect",
        "Cubes and Dice",
        "Data Sufficiency",
        "Critical Reasoning",
        "Input-Output",
        "Venn Diagrams",
        "Matrix Reasoning",
        "Logical"
    ],
    "Verbal Ability": [
        "Vocabulary",
        "Fill in the Blanks",
        "Reading Comprehension",
        "Grammar",
        "Para Jumbles",
        "Idioms and Phrases",
        "Sentence Improvement",
        "Word Analogy",
        "Error Spotting",
        "One Word Substitution",
        "Cloze Test",
        "Miscellaneous"
    ]
}

VALID_SECTIONS = set(QUIZ_TAXONOMY.keys())
VALID_DIFFICULTIES = {"Easy", "Medium", "Hard"}
VALID_CORRECT = {"A", "B", "C", "D"}

LOW_THRESHOLD = 30
GENERATION_BATCH = 20

TOPIC_TO_SECTION = {}
for section, topics in QUIZ_TAXONOMY.items():
    for topic in topics:
        TOPIC_TO_SECTION[topic.lower()] = (section, topic)

class UnsupportedCareerScope(Exception):
    pass

def resolve_career_to_quiz_scope(category: str | None, skill: str | None) -> dict:
    """Find the best matching existing section/topic for a free-form career skill."""
    if skill:
        match = TOPIC_TO_SECTION.get(skill.lower())
        if match:
            return {"section": match[0], "topic": match[1]}
            
        if "React" in skill or "Redux" in skill: return {"section": "React Engineer", "topic": "Components"}
        if "Python" in skill: return {"section": "AI & ML", "topic": "Python"}
        if "Docker" in skill or "Kubernetes" in skill: return {"section": "DevOps Engineer", "topic": "Cloud"}
        if "SQL" in skill or "Postgre" in skill:
            raise UnsupportedCareerScope("No compatible quiz scope exists for Database/SQL currently.")

    if category in ("AI & ML", "Data Scientist"): return {"section": "AI & ML", "topic": "Concepts"}
    if category in ("DevOps", "Security & Networking"): return {"section": "DevOps Engineer", "topic": "Cloud"}
    if category == "Frontend": return {"section": "React Engineer", "topic": "JSX"}
        
    raise UnsupportedCareerScope(f"No compatible quiz scope exists for category: {category} / skill: {skill}")

@dataclass
class QuestionCandidate:
    section: str
    topic: str
    difficulty: str
    question: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_ans: str

    @property
    def question_hash(self) -> str:
        return hashlib.sha256(_normalise_text(self.question).encode()).hexdigest()

def _normalise_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())

def build_generation_prompt(section: str, topic: str, difficulty: str, count: int, existing_questions: list[str], role: str | None = None, category: str | None = None, skill: str | None = None) -> str:
    allowed_topics = QUIZ_TAXONOMY.get(section, [])
    
    career_context = ""
    if role or category or skill:
        career_context = f"\nCAREER CONTEXT:\n  Role: {role or 'Not specified'}\n  Category: {category or 'Not specified'}\n  Skill: {skill or 'Not specified'}\nCreate questions that test practical knowledge for this Role/Skill, while ensuring the stored database taxonomy strictly uses the DATABASE SCOPE.\n"
        
    avoid_block = ""
    if existing_questions:
        avoid_block = "\n\nQUESTIONS ALREADY IN DATABASE (do not repeat or rephrase these!):\n" + "\n".join(f"- {c}" for c in existing_questions[:40])

    return f"""You are an expert question writer for a placement platform.
Generate exactly {count} unique multiple-choice questions.{career_context}
DATABASE SCOPE:
  Section: {section}
  Topic: {topic}
  Difficulty: {difficulty}

STRICT RULES:
1. section must be exactly: "{section}"
2. topic must be exactly: "{topic}"
3. difficulty must be exactly: "{difficulty}"
4. question must be grammatically correct, ending with a question mark or colon.
5. option_a, b, c, d must be meaningfully distinct.
6. correct_ans must be exactly one of: "A", "B", "C", "D".
7. Do NOT include "All of the above" or "None of the above".
8. Do NOT repeat the same concept with different wording.
{avoid_block}

Return ONLY a valid JSON array. No markdown, no explanation.

Schema for each element:
{{
  "section": "{section}",
  "topic": "{topic}",
  "difficulty": "{difficulty}",
  "question": "<complete question>",
  "option_a": "<first option>",
  "option_b": "<second option>",
  "option_c": "<third option>",
  "option_d": "<fourth option>",
  "correct_ans": "<A|B|C|D>"
}}
"""

def _validate_candidate(raw: dict, section: str, topic: str, difficulty: str) -> Optional[QuestionCandidate]:
    try:
        required = ["section", "topic", "difficulty", "question", "option_a", "option_b", "option_c", "option_d", "correct_ans"]
        for f in required:
            if not raw.get(f): return None

        if raw["section"] != section or raw["difficulty"] != difficulty or raw["topic"] != topic: return None
        if raw["correct_ans"].upper() not in VALID_CORRECT: return None
        
        opts = [raw["option_a"], raw["option_b"], raw["option_c"], raw["option_d"]]
        if len(set(o.strip().lower() for o in opts)) < 4: return None

        return QuestionCandidate(
            section=raw["section"], topic=raw["topic"], difficulty=difficulty,
            question=raw["question"].strip(), option_a=raw["option_a"].strip(),
            option_b=raw["option_b"].strip(), option_c=raw["option_c"].strip(),
            option_d=raw["option_d"].strip(), correct_ans=raw["correct_ans"].upper()
        )
    except Exception:
        return None

async def _call_gemini_for_questions(prompt: str, timeout_s: float = 120.0) -> list[dict]:
    # We append a reminder to output JSON since we are not passing a strict schema to the gateway
    response_text = await ai_gateway.generate(
        task="quiz_generation",
        prompt=prompt + "\n\nIMPORTANT: Return ONLY a valid JSON array.",
        timeout=timeout_s
    )
    
    # If the gateway returned a Pydantic object (if someone modifies it later), convert to list
    if not isinstance(response_text, str):
        # In case the gateway returns something else, we handle it
        try:
            return response_text.dict() if hasattr(response_text, "dict") else list(response_text)
        except Exception:
            return response_text

    text = response_text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"```$", "", text.strip())
    return json.loads(text)

def _get_existing_hashes(db: Session, section: str, topic: str) -> set[str]:
    rows = db.execute(
        text("SELECT question FROM quiz_questions WHERE section = :s AND topic = :t"),
        {"s": section, "t": topic}
    ).fetchall()
    return {hashlib.sha256(_normalise_text(r[0]).encode()).hexdigest() for r in rows if r[0]}

def _get_existing_questions(db: Session, section: str, topic: str, difficulty: str, limit: int = 50) -> list[str]:
    rows = db.execute(
        text("SELECT question FROM quiz_questions WHERE section = :s AND topic = :t AND difficulty = :d ORDER BY id DESC LIMIT :l"),
        {"s": section, "t": topic, "d": difficulty, "l": limit}
    ).fetchall()
    return [r[0] for r in rows]

def _insert_questions(db: Session, candidates: list[QuestionCandidate]) -> int:
    inserted = 0
    for c in candidates:
        try:
            db.execute(
                text(
                    "INSERT INTO quiz_questions "
                    "(section, topic, difficulty, question, option_a, option_b, option_c, option_d, correct_ans) "
                    "VALUES (:s, :t, :d, :q, :a, :b, :c, :o, :ans)"
                ),
                {"s": c.section, "t": c.topic, "d": c.difficulty, "q": c.question, 
                 "a": c.option_a, "b": c.option_b, "c": c.option_c, "o": c.option_d, "ans": c.correct_ans}
            )
            inserted += 1
        except Exception as e:
            logger.warning(f"Insert failed: {e}")
            db.rollback()
    db.commit()
    return inserted

async def stream_generate_questions(
    db: Session, section: str, topic: str, difficulty: str,
    role: str | None = None, category: str | None = None, skill: str | None = None,
) -> AsyncGenerator[str, None]:
    yield 'data: {"status": "Resolving context & avoiding duplicates..."}\n\n'
    await asyncio.sleep(0.5)

    existing_hashes = _get_existing_hashes(db, section, topic)
    existing_questions = _get_existing_questions(db, section, topic, difficulty)

    yield f'data: {{"status": "Prompting AI to generate {GENERATION_BATCH} candidates..."}}\n\n'
    prompt = build_generation_prompt(section, topic, difficulty, GENERATION_BATCH, existing_questions, role, category, skill)

    try:
        raw_items = await _call_gemini_for_questions(prompt)
    except Exception as e:
        yield f'data: {{"error": "AI generation failed: {str(e)}"}}\n\n'
        return

    if not isinstance(raw_items, list):
        yield 'data: {"error": "AI did not return a valid list"}\n\n'
        return

    yield 'data: {"status": "Validating and removing duplicates..."}\n\n'
    valid_candidates = []
    for raw in raw_items:
        if not isinstance(raw, dict): continue
        candidate = _validate_candidate(raw, section, topic, difficulty)
        if candidate is None: continue
        h = candidate.question_hash
        if h in existing_hashes: continue
        existing_hashes.add(h)
        valid_candidates.append(candidate)

    if not valid_candidates:
        yield 'data: {"error": "AI failed to generate valid, non-duplicate questions"}\n\n'
        return

    yield f'data: {{"status": "Saving {len(valid_candidates)} validated questions..."}}\n\n'
    inserted = _insert_questions(db, valid_candidates)
    yield f'data: {{"status": "complete", "inserted": {inserted}}}\n\n'

def get_inventory_summary(db: Session) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT section, topic, difficulty, COUNT(*) as cnt "
            "FROM quiz_questions "
            "GROUP BY section, topic, difficulty "
            "ORDER BY section, topic, difficulty"
        )
    ).fetchall()
    return [{"section": r[0], "topic": r[1], "difficulty": r[2], "count": int(r[3]), "low": int(r[3]) < LOW_THRESHOLD} for r in rows]

async def bulk_restock_questions(db: Session, max_scopes: int = 1) -> dict:
    inventory = get_inventory_summary(db)
    existing_scopes = {(r["section"], r["topic"], r["difficulty"]) for r in inventory}
    missing_scopes = []
    for section, topics in QUIZ_TAXONOMY.items():
        for topic in topics:
            for difficulty in VALID_DIFFICULTIES:
                if (section, topic, difficulty) not in existing_scopes:
                    missing_scopes.append({"section": section, "topic": topic, "difficulty": difficulty, "count": 0, "low": True})
    
    all_scopes = inventory + missing_scopes
    low_scopes = sorted([s for s in all_scopes if s["low"]], key=lambda x: x["count"])
    
    if not low_scopes:
        return {"status": "complete", "scopes_processed": 0, "message": "All pools well stocked."}
        
    targets = low_scopes[:max_scopes]
    results = []
    for scope in targets:
        existing_hashes = _get_existing_hashes(db, scope["section"], scope["topic"])
        existing_questions = _get_existing_questions(db, scope["section"], scope["topic"], scope["difficulty"])
        prompt = build_generation_prompt(scope["section"], scope["topic"], scope["difficulty"], GENERATION_BATCH, existing_questions)
        try:
            raw_items = await _call_gemini_for_questions(prompt)
            if isinstance(raw_items, list):
                valid_candidates = []
                for raw in raw_items:
                    if not isinstance(raw, dict): continue
                    c = _validate_candidate(raw, scope["section"], scope["topic"], scope["difficulty"])
                    if c and c.question_hash not in existing_hashes:
                        existing_hashes.add(c.question_hash)
                        valid_candidates.append(c)
                inserted = _insert_questions(db, valid_candidates)
                results.append({"scope": scope, "inserted": inserted})
        except Exception as e:
            logger.error(f"Failed bulk generation for {scope}: {e}")
            
    return {"status": "complete", "scopes_processed": len(results), "results": results}
