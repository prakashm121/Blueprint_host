import os

file_path = r"E:\WebSite\Blueprint_host\backend\app\workers\celery_app.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

target = """celery_app.conf.beat_schedule = {
    "process-outbox-every-10-seconds": {
        "task": "app.workers.celery_tasks.process_outbox_task",
        "schedule": 10.0,
    },"""

replacement = """celery_app.conf.beat_schedule = {
    "process-outbox-evenings": {
        "task": "app.workers.celery_tasks.process_outbox_task",
        "schedule": crontab(minute=0, hour="18-23"),
    },"""

content = content.replace(target, replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated celery_app.py successfully!")
