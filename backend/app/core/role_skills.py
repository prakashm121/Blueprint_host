"""
role_skills.py  Single source of truth for role-specific assessment skill taxonomy.

Maps every role -> category -> list of {key, label} skill definitions.
- key:   snake_case, stable for DB storage and query filtering
- label: human-readable display string shown in UI and AI prompts

Used by:
  - app/api/assessments.py          -- validate/upsert skill confidence
  - app/api/onboarding.py           -- seed role-specific skills after roadmap generation
  - app/services/context_builder.py -- build weak/strong area lists for AI prompts
  - app/services/ai_service.py      -- build role-aware prompt tables
"""

from __future__ import annotations

ROLE_ASSESSMENT_SKILLS: dict[str, dict[str, list[dict[str, str]]]] = {
    "Backend Engineer": {
        "Backend": [
            {"key": "fastapi",      "label": "FastAPI"},
            {"key": "django",       "label": "Django"},
            {"key": "flask",        "label": "Flask"},
            {"key": "spring_boot",  "label": "Spring Boot"},
            {"key": "express_js",   "label": "Express.js"},
            {"key": "nest_js",      "label": "NestJS"},
            {"key": "rest_api",     "label": "REST API"},
            {"key": "graphql",      "label": "GraphQL"},
            {"key": "grpc",         "label": "gRPC"},
        ],
        "Database": [
            {"key": "postgresql",   "label": "PostgreSQL"},
            {"key": "mysql",        "label": "MySQL"},
            {"key": "mongodb",      "label": "MongoDB"},
            {"key": "redis",        "label": "Redis"},
            {"key": "sql",          "label": "SQL"},
            {"key": "cassandra",    "label": "Cassandra"},
        ],
        "System Design": [
            {"key": "load_balancers",  "label": "Load Balancers"},
            {"key": "kafka",           "label": "Kafka"},
            {"key": "rabbitmq",        "label": "RabbitMQ"},
            {"key": "caching",         "label": "Caching Strategies"},
            {"key": "microservices",   "label": "Microservices"},
            {"key": "api_gateway",     "label": "API Gateway"},
        ],
        "DevOps": [
            {"key": "docker",       "label": "Docker"},
            {"key": "kubernetes",   "label": "Kubernetes"},
            {"key": "nginx",        "label": "Nginx"},
            {"key": "git",          "label": "Git"},
            {"key": "ci_cd",        "label": "CI/CD"},
        ],
        "Core Subjects": [
            {"key": "oop",               "label": "OOP"},
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "dbms",              "label": "DBMS"},
            {"key": "computer_networks", "label": "Computer Networks"},
            {"key": "dsa",               "label": "DSA"},
        ],
    },

    "Frontend Engineer": {
        "Frontend": [
            {"key": "html",         "label": "HTML"},
            {"key": "css",          "label": "CSS"},
            {"key": "javascript",   "label": "JavaScript"},
            {"key": "typescript",   "label": "TypeScript"},
            {"key": "react_js",     "label": "React.js"},
            {"key": "next_js",      "label": "Next.js"},
            {"key": "vue_js",       "label": "Vue.js"},
            {"key": "tailwind",     "label": "Tailwind CSS"},
            {"key": "vite",         "label": "Vite"},
            {"key": "webpack",      "label": "Webpack"},
        ],
        "UI/UX & Design": [
            {"key": "figma",              "label": "Figma"},
            {"key": "responsive_design",  "label": "Responsive Design"},
            {"key": "accessibility",      "label": "Accessibility (a11y)"},
        ],
        "Core Subjects": [
            {"key": "oop",               "label": "OOP"},
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "dsa",               "label": "DSA"},
            {"key": "computer_networks", "label": "Computer Networks"},
        ],
        "DevOps": [
            {"key": "git",   "label": "Git"},
            {"key": "ci_cd", "label": "CI/CD"},
        ],
    },

    "Full Stack Engineer": {
        "Frontend": [
            {"key": "react_js",   "label": "React.js"},
            {"key": "next_js",    "label": "Next.js"},
            {"key": "javascript", "label": "JavaScript"},
            {"key": "typescript", "label": "TypeScript"},
            {"key": "tailwind",   "label": "Tailwind CSS"},
        ],
        "Backend": [
            {"key": "rest_api",  "label": "REST API"},
            {"key": "graphql",   "label": "GraphQL"},
            {"key": "fastapi",   "label": "FastAPI"},
            {"key": "django",    "label": "Django"},
            {"key": "express_js","label": "Express.js"},
            {"key": "nest_js",   "label": "NestJS"},
        ],
        "Database": [
            {"key": "postgresql", "label": "PostgreSQL"},
            {"key": "mongodb",    "label": "MongoDB"},
            {"key": "redis",      "label": "Redis"},
            {"key": "sql",        "label": "SQL"},
        ],
        "System Design": [
            {"key": "microservices",  "label": "Microservices"},
            {"key": "load_balancers", "label": "Load Balancers"},
            {"key": "caching",        "label": "Caching Strategies"},
        ],
        "DevOps": [
            {"key": "docker",     "label": "Docker"},
            {"key": "kubernetes", "label": "Kubernetes"},
            {"key": "git",        "label": "Git"},
            {"key": "ci_cd",      "label": "CI/CD"},
        ],
        "Core Subjects": [
            {"key": "oop",               "label": "OOP"},
            {"key": "dsa",               "label": "DSA"},
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "dbms",              "label": "DBMS"},
            {"key": "computer_networks", "label": "Computer Networks"},
        ],
    },

    "Data Engineer": {
        "Database": [
            {"key": "sql",        "label": "SQL"},
            {"key": "postgresql", "label": "PostgreSQL"},
            {"key": "mysql",      "label": "MySQL"},
            {"key": "bigquery",   "label": "BigQuery"},
            {"key": "snowflake",  "label": "Snowflake"},
            {"key": "hive",       "label": "Hive"},
            {"key": "cassandra",  "label": "Cassandra"},
        ],
        "AI & ML": [
            {"key": "apache_spark", "label": "Apache Spark"},
            {"key": "hadoop",       "label": "Hadoop"},
            {"key": "pandas",       "label": "Pandas"},
        ],
        "System Design": [
            {"key": "kafka",          "label": "Kafka"},
            {"key": "apache_airflow", "label": "Apache Airflow"},
            {"key": "etl_pipelines",  "label": "ETL Pipelines"},
            {"key": "data_warehouse", "label": "Data Warehousing"},
        ],
        "Data Analytics & BI": [
            {"key": "power_bi", "label": "Power BI"},
            {"key": "tableau",  "label": "Tableau"},
        ],
        "Programming Languages": [
            {"key": "python", "label": "Python"},
            {"key": "scala",  "label": "Scala"},
            {"key": "java",   "label": "Java"},
        ],
        "DevOps": [
            {"key": "docker",     "label": "Docker"},
            {"key": "kubernetes", "label": "Kubernetes"},
            {"key": "git",        "label": "Git"},
        ],
        "Core Subjects": [
            {"key": "dsa",               "label": "DSA"},
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "dbms",              "label": "DBMS"},
        ],
    },

    "Data Scientist": {
        "AI & ML": [
            {"key": "supervised_learning",   "label": "Supervised Learning"},
            {"key": "unsupervised_learning", "label": "Unsupervised Learning"},
            {"key": "model_evaluation",      "label": "Model Evaluation (Precision, Recall, F1, ROC)"},
            {"key": "feature_engineering",   "label": "Feature Engineering"},
            {"key": "scikit_learn",          "label": "Scikit-learn"},
            {"key": "pandas",                "label": "Pandas"},
            {"key": "numpy",                 "label": "NumPy"},
            {"key": "matplotlib",            "label": "Matplotlib / Seaborn"},
        ],
        "Data Analytics & BI": [
            {"key": "power_bi", "label": "Power BI"},
            {"key": "tableau",  "label": "Tableau"},
        ],
        "Database": [
            {"key": "sql",        "label": "SQL"},
            {"key": "postgresql", "label": "PostgreSQL"},
        ],
        "Programming Languages": [
            {"key": "python", "label": "Python"},
            {"key": "r_lang", "label": "R"},
        ],
        "Core Subjects": [
            {"key": "dsa",        "label": "DSA"},
            {"key": "statistics", "label": "Statistics & Probability"},
        ],
    },

    "ML Engineer": {
        "AI & ML": [
            {"key": "supervised_learning",   "label": "Supervised Learning"},
            {"key": "unsupervised_learning", "label": "Unsupervised Learning"},
            {"key": "neural_networks",       "label": "Neural Networks (ANN, CNN, RNN, LSTM, Transformers)"},
            {"key": "model_evaluation",      "label": "Model Evaluation (Precision, Recall, F1, ROC)"},
            {"key": "model_deployment",      "label": "Model Deployment (Flask, FastAPI, Docker)"},
            {"key": "model_monitoring",      "label": "Model Monitoring"},
            {"key": "llms",                  "label": "Large Language Models (GPT, Gemini, LLaMA)"},
            {"key": "langchain_rag",         "label": "LangChain / RAG Systems"},
            {"key": "pytorch",               "label": "PyTorch"},
            {"key": "tensorflow",            "label": "TensorFlow"},
            {"key": "scikit_learn",          "label": "Scikit-learn"},
            {"key": "pandas",                "label": "Pandas"},
            {"key": "numpy",                 "label": "NumPy"},
        ],
        "Backend": [
            {"key": "fastapi", "label": "FastAPI"},
            {"key": "flask",   "label": "Flask"},
        ],
        "Database": [
            {"key": "postgresql", "label": "PostgreSQL"},
            {"key": "mongodb",    "label": "MongoDB"},
            {"key": "redis",      "label": "Redis"},
        ],
        "System Design": [
            {"key": "kafka",          "label": "Kafka"},
            {"key": "load_balancers", "label": "Load Balancers"},
            {"key": "rest_api",       "label": "REST API"},
        ],
        "Programming Languages": [
            {"key": "python", "label": "Python"},
            {"key": "cpp",    "label": "C++"},
        ],
        "Core Subjects": [
            {"key": "statistics",        "label": "Statistics & Probability"},
            {"key": "linear_algebra",    "label": "Linear Algebra"},
            {"key": "dsa",               "label": "DSA"},
            {"key": "operating_systems", "label": "Operating Systems"},
        ],
    },

    "DevOps Engineer": {
        "DevOps": [
            {"key": "docker",        "label": "Docker"},
            {"key": "kubernetes",    "label": "Kubernetes"},
            {"key": "terraform",     "label": "Terraform"},
            {"key": "ansible",       "label": "Ansible"},
            {"key": "jenkins",       "label": "Jenkins"},
            {"key": "github_actions","label": "GitHub Actions"},
            {"key": "ci_cd",         "label": "CI/CD Pipelines"},
            {"key": "nginx",         "label": "Nginx"},
            {"key": "prometheus",    "label": "Prometheus"},
            {"key": "grafana",       "label": "Grafana"},
            {"key": "elk_stack",     "label": "ELK Stack"},
        ],
        "Security & Networking": [
            {"key": "networking_fundamentals", "label": "Networking Fundamentals"},
            {"key": "tls_ssl",                 "label": "TLS/SSL"},
            {"key": "firewalls",               "label": "Firewalls"},
            {"key": "cloud_security",          "label": "Cloud Security"},
        ],
        "Programming Languages": [
            {"key": "python", "label": "Python"},
            {"key": "shell",  "label": "Shell / Bash"},
            {"key": "go",     "label": "Go"},
        ],
        "Core Subjects": [
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "computer_networks", "label": "Computer Networks"},
            {"key": "dsa",               "label": "DSA"},
        ],
    },

    "Software Engineer": {
        "Backend": [
            {"key": "rest_api",   "label": "REST API"},
            {"key": "fastapi",    "label": "FastAPI"},
            {"key": "django",     "label": "Django"},
            {"key": "spring_boot","label": "Spring Boot"},
            {"key": "express_js", "label": "Express.js"},
        ],
        "Database": [
            {"key": "postgresql", "label": "PostgreSQL"},
            {"key": "mysql",      "label": "MySQL"},
            {"key": "mongodb",    "label": "MongoDB"},
            {"key": "redis",      "label": "Redis"},
            {"key": "sql",        "label": "SQL"},
        ],
        "System Design": [
            {"key": "microservices",  "label": "Microservices"},
            {"key": "load_balancers", "label": "Load Balancers"},
            {"key": "caching",        "label": "Caching Strategies"},
            {"key": "kafka",          "label": "Kafka"},
        ],
        "DevOps": [
            {"key": "docker",     "label": "Docker"},
            {"key": "kubernetes", "label": "Kubernetes"},
            {"key": "git",        "label": "Git"},
            {"key": "ci_cd",      "label": "CI/CD"},
        ],
        "Core Subjects": [
            {"key": "oop",               "label": "OOP"},
            {"key": "dsa",               "label": "DSA"},
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "dbms",              "label": "DBMS"},
            {"key": "computer_networks", "label": "Computer Networks"},
        ],
    },

    "QA Engineer": {
        "Testing & QA": [
            {"key": "selenium",        "label": "Selenium"},
            {"key": "cypress",         "label": "Cypress"},
            {"key": "playwright",      "label": "Playwright"},
            {"key": "jest",            "label": "Jest"},
            {"key": "pytest",          "label": "PyTest"},
            {"key": "junit",           "label": "JUnit"},
            {"key": "postman",         "label": "Postman"},
            {"key": "rest_assured",    "label": "RestAssured"},
            {"key": "cucumber",        "label": "Cucumber / BDD"},
            {"key": "robot_framework", "label": "Robot Framework"},
        ],
        "Programming Languages": [
            {"key": "python",     "label": "Python"},
            {"key": "javascript", "label": "JavaScript"},
            {"key": "java",       "label": "Java"},
        ],
        "Database": [
            {"key": "sql",        "label": "SQL"},
            {"key": "postgresql", "label": "PostgreSQL"},
        ],
        "DevOps": [
            {"key": "git",   "label": "Git"},
            {"key": "ci_cd", "label": "CI/CD"},
        ],
        "Core Subjects": [
            {"key": "dsa",               "label": "DSA"},
            {"key": "operating_systems", "label": "Operating Systems"},
        ],
    },

    "Security Engineer": {
        "Security & Networking": [
            {"key": "networking_fundamentals", "label": "Networking Fundamentals"},
            {"key": "ethical_hacking",         "label": "Ethical Hacking & Penetration Testing"},
            {"key": "incident_response",       "label": "Incident Response & Digital Forensics"},
            {"key": "threat_intelligence",     "label": "Threat Intelligence & Risk Management"},
            {"key": "cloud_security",          "label": "Cloud Security"},
            {"key": "network_security",        "label": "Network Security"},
            {"key": "cryptography",            "label": "Cryptography"},
            {"key": "oauth_jwt",               "label": "OAuth / JWT / SAML"},
            {"key": "tls_ssl",                 "label": "TLS/SSL"},
            {"key": "metasploit",              "label": "Metasploit"},
            {"key": "burp_suite",              "label": "Burp Suite"},
            {"key": "wireshark",               "label": "Wireshark"},
        ],
        "Backend": [
            {"key": "rest_api", "label": "REST API"},
            {"key": "fastapi",  "label": "FastAPI"},
            {"key": "django",   "label": "Django"},
        ],
        "Programming Languages": [
            {"key": "python", "label": "Python"},
            {"key": "cpp",    "label": "C++"},
            {"key": "java",   "label": "Java"},
        ],
        "Core Subjects": [
            {"key": "operating_systems", "label": "Operating Systems"},
            {"key": "computer_networks", "label": "Computer Networks"},
            {"key": "dsa",               "label": "DSA"},
        ],
    },

    "UI/UX Designer": {
        "UI/UX & Design": [
            {"key": "figma",             "label": "Figma"},
            {"key": "adobe_xd",          "label": "Adobe XD"},
            {"key": "sketch",            "label": "Sketch"},
            {"key": "invision",          "label": "InVision"},
            {"key": "prototyping",       "label": "Prototyping"},
            {"key": "wireframing",       "label": "Wireframing"},
            {"key": "user_research",     "label": "User Research"},
            {"key": "usability_testing", "label": "Usability Testing"},
            {"key": "responsive_design", "label": "Responsive Design"},
            {"key": "accessibility",     "label": "Accessibility (a11y)"},
            {"key": "design_systems",    "label": "Design Systems"},
        ],
        "Frontend": [
            {"key": "html",       "label": "HTML"},
            {"key": "css",        "label": "CSS"},
            {"key": "javascript", "label": "JavaScript"},
        ],
    },

    "HR": {
        "Behavioral": [
            {"key": "communication",           "label": "Communication"},
            {"key": "leadership",              "label": "Leadership"},
            {"key": "teamwork",                "label": "Teamwork"},
            {"key": "conflict_resolution",     "label": "Conflict Resolution"},
            {"key": "problem_solving",         "label": "Problem Solving"},
            {"key": "situational_judgment",    "label": "Situational Judgment"},
            {"key": "interview_communication", "label": "Interview Communication"},
            {"key": "negotiation",             "label": "Negotiation"},
            {"key": "talent_acquisition",      "label": "Talent Acquisition"},
            {"key": "performance_management",  "label": "Performance Management"},
        ],
    },
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def get_valid_keys(role: str) -> set[str]:
    """Return the flat set of all valid skill keys for a given role."""
    return {
        s["key"]
        for cat_skills in ROLE_ASSESSMENT_SKILLS.get(role, {}).values()
        for s in cat_skills
    }


def get_key_to_label(role: str) -> dict[str, str]:
    """Return a mapping of skill_key -> display label for a given role."""
    return {
        s["key"]: s["label"]
        for cat_skills in ROLE_ASSESSMENT_SKILLS.get(role, {}).values()
        for s in cat_skills
    }


def get_category_for_key(role: str, skill_key: str) -> str | None:
    """Return the category name for a given skill_key in a role, or None if not found."""
    for category, skills in ROLE_ASSESSMENT_SKILLS.get(role, {}).items():
        for s in skills:
            if s["key"] == skill_key:
                return category
    return None


def get_skills_in_category(role: str, category: str) -> list[dict[str, str]]:
    """Return the list of {key, label} dicts for a role's category."""
    return ROLE_ASSESSMENT_SKILLS.get(role, {}).get(category, [])


def get_common_keys(old_role: str, new_role: str) -> set[str]:
    """Return skill keys that exist in both old_role and new_role (for role-change logic)."""
    return get_valid_keys(old_role) & get_valid_keys(new_role)
