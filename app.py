"""
TOLC-ITA-L2 Preparation Platform
Flask Backend Application
"""

import json
import os
import sqlite3
import random
from datetime import datetime, date
from flask import Flask, render_template, jsonify, request, session
import firebase_admin
from firebase_admin import credentials, firestore, auth

app = Flask(__name__)
app.secret_key = os.urandom(24)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, "data")
DB_PATH     = os.path.join(BASE_DIR, "database", "database.db")
FIREBASE_KEY = os.path.join(BASE_DIR, "lotc-46ff1-firebase-adminsdk-fbsvc-021a9c18db.json")

# ─── Firebase Admin Setup ─────────────────────────────────────────────────────
firebase_app = None
db_firestore = None

if os.path.exists(FIREBASE_KEY):
    try:
        cred = credentials.Certificate(FIREBASE_KEY)
        firebase_app = firebase_admin.initialize_app(cred)
        try:
            db_firestore = firestore.client()
            print("[Firebase] Admin SDK & Firestore client initialized successfully (lotc-46ff1).")
        except Exception as fe:
            print(f"[Firebase] Admin initialized, Firestore note: {fe}")
    except Exception as e:
        print(f"[Firebase] Error initializing Firebase Admin: {e}")
else:
    print(f"[Firebase] Key file missing: {FIREBASE_KEY}")

# ─── Load JSON data files ─────────────────────────────────────────────────────
def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

QUESTIONS  = load_json("questions.json")
STUDY_PLAN = load_json("study_plan.json")

# ─── Database helpers ─────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create tables if they don't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cur  = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS progress (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT    NOT NULL,
            day_number      INTEGER,
            section         TEXT,
            completed       INTEGER DEFAULT 0,
            completed_at    TEXT,
            UNIQUE(session_id, day_number, section)
        );

        CREATE TABLE IF NOT EXISTS test_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT    NOT NULL,
            category        TEXT,
            difficulty      TEXT,
            total_questions INTEGER,
            correct_answers INTEGER,
            score_percent   REAL,
            weak_areas      TEXT,
            taken_at        TEXT
        );

        CREATE TABLE IF NOT EXISTS question_attempts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT    NOT NULL,
            question_id     INTEGER,
            was_correct     INTEGER,
            attempted_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS streak (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id      TEXT    NOT NULL UNIQUE,
            current_streak  INTEGER DEFAULT 0,
            last_active     TEXT
        );
    """)
    conn.commit()
    conn.close()

def get_or_create_session():
    """Ensure a session_id exists in Flask session."""
    if "session_id" not in session:
        import uuid
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]

def get_stats(session_id):
    """Fetch aggregated stats for a session."""
    conn = get_db()
    cur  = conn.cursor()

    # Total questions answered
    cur.execute(
        "SELECT COUNT(*) FROM question_attempts WHERE session_id=?",
        (session_id,)
    )
    total_q = cur.fetchone()[0]

    # Correct answers
    cur.execute(
        "SELECT COUNT(*) FROM question_attempts WHERE session_id=? AND was_correct=1",
        (session_id,)
    )
    correct_q = cur.fetchone()[0]

    # Accuracy
    accuracy = round((correct_q / total_q * 100) if total_q > 0 else 0, 1)

    # Days completed
    cur.execute(
        "SELECT COUNT(DISTINCT day_number) FROM progress WHERE session_id=? AND completed=1 AND day_number IS NOT NULL",
        (session_id,)
    )
    days_done = cur.fetchone()[0]

    # Best score
    cur.execute(
        "SELECT MAX(score_percent) FROM test_results WHERE session_id=?",
        (session_id,)
    )
    best_score = cur.fetchone()[0] or 0

    # Current streak
    cur.execute(
        "SELECT current_streak FROM streak WHERE session_id=?",
        (session_id,)
    )
    row = cur.fetchone()
    streak = row[0] if row else 0

    # Category accuracy
    cat_stats = {}
    categories = ["grammar", "vocabulary", "verbs", "prepositions", "pronouns", "reading", "mixed"]
    for cat in categories:
        # Get all question IDs for this category
        cat_q_ids = [q["id"] for q in QUESTIONS if q.get("category") == cat]
        if not cat_q_ids:
            continue
        placeholders = ",".join("?" * len(cat_q_ids))
        cur.execute(
            f"SELECT COUNT(*), SUM(was_correct) FROM question_attempts WHERE session_id=? AND question_id IN ({placeholders})",
            [session_id] + cat_q_ids
        )
        row2 = cur.fetchone()
        if row2 and row2[0] > 0:
            pct = round((row2[1] or 0) / row2[0] * 100, 1)
            cat_stats[cat] = {"total": row2[0], "accuracy": pct}

    conn.close()
    return {
        "total_questions": total_q,
        "correct_answers": correct_q,
        "accuracy": accuracy,
        "days_completed": days_done,
        "best_score": round(best_score, 1),
        "streak": streak,
        "category_stats": cat_stats
    }

def get_weak_areas(session_id, threshold=70):
    """Return categories with accuracy below threshold."""
    stats = get_stats(session_id)
    weak = []
    for cat, data in stats["category_stats"].items():
        if data["accuracy"] < threshold:
            weak.append({"category": cat, "accuracy": data["accuracy"]})
    weak.sort(key=lambda x: x["accuracy"])
    return weak

def update_streak(session_id):
    """Update the daily streak for a session."""
    today = date.today().isoformat()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("SELECT current_streak, last_active FROM streak WHERE session_id=?", (session_id,))
    row = cur.fetchone()
    if not row:
        cur.execute(
            "INSERT INTO streak (session_id, current_streak, last_active) VALUES (?,1,?)",
            (session_id, today)
        )
    else:
        last_active = row["last_active"]
        streak      = row["current_streak"]
        from datetime import timedelta
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        if last_active == today:
            pass  # Already counted today
        elif last_active == yesterday:
            streak += 1
            cur.execute(
                "UPDATE streak SET current_streak=?, last_active=? WHERE session_id=?",
                (streak, today, session_id)
            )
        else:
            # Streak broken
            cur.execute(
                "UPDATE streak SET current_streak=1, last_active=? WHERE session_id=?",
                (today, session_id)
            )
    conn.commit()
    conn.close()

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    sid   = get_or_create_session()
    stats = get_stats(sid)
    weak  = get_weak_areas(sid)
    plan  = STUDY_PLAN["days"]

    # Determine current day (first incomplete day, or day 1)
    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "SELECT day_number FROM progress WHERE session_id=? AND completed=1 AND day_number IS NOT NULL",
        (sid,)
    )
    completed_days = {row[0] for row in cur.fetchall()}
    conn.close()

    current_day = 1
    for d in range(1, 11):
        if d not in completed_days:
            current_day = d
            break
    else:
        current_day = 10

    # Motivational message
    pct = stats["days_completed"] * 10
    if pct == 0:
        motivation = "Benvenuto! Il tuo percorso inizia oggi. 🚀"
    elif pct < 30:
        motivation = "Ottimo inizio! La costanza è la chiave del successo."
    elif pct < 50:
        motivation = "Stai andando bene! Continua così."
    elif pct == 50:
        motivation = "Sei a metà del percorso! 🎯 Rimani concentrato."
    elif pct < 80:
        motivation = f"Ancora {10 - stats['days_completed']} giorni! Ce la fai!"
    elif pct < 100:
        motivation = "Quasi alla fine! Hai migliorato tantissimo. 💪"
    else:
        motivation = "Hai completato il percorso! In bocca al lupo per l'esame! 🏆"

    return render_template(
        "index.html",
        stats=stats,
        weak_areas=weak,
        current_day=current_day,
        completed_days=list(completed_days),
        plan=plan,
        motivation=motivation,
        progress_pct=pct
    )

@app.route("/plan")
def plan():
    sid           = get_or_create_session()
    conn          = get_db()
    cur           = conn.cursor()
    cur.execute(
        "SELECT day_number FROM progress WHERE session_id=? AND completed=1 AND day_number IS NOT NULL",
        (sid,)
    )
    completed_days = {row[0] for row in cur.fetchall()}
    conn.close()
    return render_template(
        "plan.html",
        plan=STUDY_PLAN["days"],
        completed_days=list(completed_days)
    )

@app.route("/day/<int:day_number>")
def day(day_number):
    if day_number < 1 or day_number > 10:
        return render_template("404.html"), 404
    sid  = get_or_create_session()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "SELECT day_number FROM progress WHERE session_id=? AND completed=1 AND day_number IS NOT NULL",
        (sid,)
    )
    completed_days = {row[0] for row in cur.fetchall()}
    conn.close()

    day_data = next((d for d in STUDY_PLAN["days"] if d["day"] == day_number), None)
    if not day_data:
        return render_template("404.html"), 404

    # Get day-specific questions (sample)
    day_questions = [q for q in QUESTIONS if q.get("day") == day_number and "text" not in q]
    random.shuffle(day_questions)
    practice_qs   = day_questions[:10]

    return render_template(
        "day.html",
        day_data=day_data,
        day_number=day_number,
        completed_days=list(completed_days),
        practice_questions=json.dumps(practice_qs),
        is_completed=(day_number in completed_days)
    )

@app.route("/test")
def test():
    sid = get_or_create_session()
    return render_template("test.html")

@app.route("/exam")
def exam():
    sid        = get_or_create_session()
    category   = request.args.get("category", "mixed")
    difficulty = request.args.get("difficulty", "all")
    limit      = int(request.args.get("limit", 20))
    timed      = request.args.get("timed", "false") == "true"
    time_limit = int(request.args.get("time_limit", 0))

    return render_template(
        "exam.html",
        category=category,
        difficulty=difficulty,
        limit=limit,
        timed=timed,
        time_limit=time_limit
    )

@app.route("/simulation")
def simulation():
    sid = get_or_create_session()
    return render_template("simulation.html")

@app.route("/results")
def results():
    sid = get_or_create_session()
    # Get the latest test result
    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM test_results WHERE session_id=? ORDER BY taken_at DESC LIMIT 1",
        (sid,)
    )
    result = cur.fetchone()
    conn.close()

    if result:
        result_dict = dict(result)
        result_dict["weak_areas"] = json.loads(result_dict.get("weak_areas") or "[]")
    else:
        result_dict = None

    stats = get_stats(sid)
    return render_template("results.html", result=result_dict, stats=stats)

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/conversazione")
def conversazione():
    return render_template("conversazione.html")

# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.route("/api/questions")
def api_questions():
    """
    GET /api/questions?category=grammar&difficulty=medium&limit=20&day=3
    Returns a JSON array of shuffled questions.
    """
    category   = request.args.get("category", "all")
    difficulty = request.args.get("difficulty", "all")
    limit      = int(request.args.get("limit", 20))
    day        = request.args.get("day", None)

    qs = QUESTIONS.copy()

    # Filter by category
    if category != "all" and category != "mixed":
        qs = [q for q in qs if q.get("category") == category]

    # Filter by difficulty
    if difficulty != "all":
        qs = [q for q in qs if q.get("difficulty") == difficulty]

    # Filter by day
    if day:
        qs = [q for q in qs if q.get("day") == int(day)]

    # Exclude reading questions that need text context (handled separately)
    qs = [q for q in qs if "text_id" not in q]

    random.shuffle(qs)
    qs = qs[:limit]

    return jsonify(qs)

@app.route("/api/reading-questions")
def api_reading_questions():
    """Return reading comprehension questions grouped by text."""
    limit = int(request.args.get("limit", 10))
    reading_qs = [q for q in QUESTIONS if q.get("category") == "reading"]

    # Group by text_id
    texts = {}
    for q in reading_qs:
        tid = q.get("text_id", 0)
        if tid not in texts:
            texts[tid] = {"text": q.get("text", ""), "questions": []}
        q_copy = {k: v for k, v in q.items() if k != "text"}
        texts[tid]["questions"].append(q_copy)

    # Pick a random text
    text_ids = list(texts.keys())
    if not text_ids:
        return jsonify([])

    chosen = random.choice(text_ids)
    result = texts[chosen]
    result["questions"] = result["questions"][:limit]
    return jsonify(result)

@app.route("/api/progress", methods=["GET"])
def api_get_progress():
    sid   = get_or_create_session()
    stats = get_stats(sid)
    conn  = get_db()
    cur   = conn.cursor()
    cur.execute(
        "SELECT day_number FROM progress WHERE session_id=? AND completed=1 AND day_number IS NOT NULL",
        (sid,)
    )
    completed_days = [row[0] for row in cur.fetchall()]
    conn.close()
    return jsonify({**stats, "completed_days": completed_days})

@app.route("/api/progress/day", methods=["POST"])
def api_complete_day():
    """Mark a study day as completed."""
    sid  = get_or_create_session()
    data = request.get_json()
    day_number = data.get("day_number")
    if not day_number:
        return jsonify({"error": "day_number required"}), 400

    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        """INSERT INTO progress (session_id, day_number, section, completed, completed_at)
           VALUES (?,?,?,1,?)
           ON CONFLICT(session_id, day_number, section) DO UPDATE SET completed=1, completed_at=excluded.completed_at""",
        (sid, day_number, "full_day", datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    update_streak(sid)
    return jsonify({"success": True, "day": day_number})

@app.route("/api/submit-result", methods=["POST"])
def api_submit_result():
    """Save a completed test result and record per-question attempts."""
    sid  = get_or_create_session()
    data = request.get_json()

    category        = data.get("category", "mixed")
    difficulty      = data.get("difficulty", "all")
    total_questions = data.get("total_questions", 0)
    correct_answers = data.get("correct_answers", 0)
    score_percent   = data.get("score_percent", 0)
    question_log    = data.get("question_log", [])  # [{id, was_correct}]

    # Compute weak areas
    cat_wrong = {}
    for entry in question_log:
        qid = entry.get("id")
        q   = next((x for x in QUESTIONS if x["id"] == qid), None)
        if q:
            cat = q.get("category", "unknown")
            if cat not in cat_wrong:
                cat_wrong[cat] = {"correct": 0, "total": 0}
            cat_wrong[cat]["total"] += 1
            if entry.get("was_correct"):
                cat_wrong[cat]["correct"] += 1

    weak_areas = []
    for cat, vals in cat_wrong.items():
        if vals["total"] > 0:
            pct = round(vals["correct"] / vals["total"] * 100, 1)
            if pct < 70:
                weak_areas.append({"category": cat, "accuracy": pct})
    weak_areas.sort(key=lambda x: x["accuracy"])

    conn = get_db()
    cur  = conn.cursor()

    # Save test result
    cur.execute(
        """INSERT INTO test_results
           (session_id, category, difficulty, total_questions, correct_answers, score_percent, weak_areas, taken_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (sid, category, difficulty, total_questions, correct_answers,
         score_percent, json.dumps(weak_areas), datetime.now().isoformat())
    )

    # Save individual attempts
    now = datetime.now().isoformat()
    for entry in question_log:
        cur.execute(
            """INSERT INTO question_attempts (session_id, question_id, was_correct, attempted_at)
               VALUES (?,?,?,?)""",
            (sid, entry.get("id"), 1 if entry.get("was_correct") else 0, now)
        )

    conn.commit()
    conn.close()
    update_streak(sid)

    return jsonify({
        "success": True,
        "score_percent": score_percent,
        "weak_areas": weak_areas
    })

@app.route("/api/reset", methods=["POST"])
def api_reset():
    """Reset all progress for the current session."""
    sid  = get_or_create_session()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("DELETE FROM progress WHERE session_id=?", (sid,))
    cur.execute("DELETE FROM test_results WHERE session_id=?", (sid,))
    cur.execute("DELETE FROM question_attempts WHERE session_id=?", (sid,))
    cur.execute("DELETE FROM streak WHERE session_id=?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/firebase/status", methods=["GET"])
def api_firebase_status():
    """Check Firebase Admin SDK initialization status."""
    is_active = firebase_app is not None
    project_id = None
    client_email = None
    
    if os.path.exists(FIREBASE_KEY):
        try:
            with open(FIREBASE_KEY, 'r', encoding='utf-8') as f:
                data = json.load(f)
                project_id = data.get("project_id")
                client_email = data.get("client_email")
        except Exception:
            pass

    return jsonify({
        "status": "connected" if is_active else "disconnected",
        "project_id": project_id or "lotc-46ff1",
        "client_email": client_email,
        "firestore": db_firestore is not None
    })

# ─── Error handlers ───────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return render_template("404.html"), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error", "detail": str(e)}), 500

# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("  TOLC-ITA-L2 Preparation Platform")
    print("  http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, port=5000)
