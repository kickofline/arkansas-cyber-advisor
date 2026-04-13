from flask import Flask, Response, request, stream_with_context, send_from_directory, session, jsonify
from flask_session import Session
from ollama import Client
import os
import sqlite3
import uuid
import json
import time

app = Flask(__name__, static_folder="frontend", static_url_path="")
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

url = os.getenv("OLLAMA_URL", "http://skynet:7869")
print("Connecting to:", url)
client = Client(host=url)
MODEL = "skynet"

DB_PATH = os.path.join(os.path.dirname(__file__), "conversations.db")


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         TEXT PRIMARY KEY,
                session    TEXT NOT NULL,
                title      TEXT NOT NULL DEFAULT 'New Chat',
                created_at INTEGER NOT NULL,
                messages   TEXT NOT NULL DEFAULT '[]'
            )
        """)


def get_session_id():
    if "_id" not in session:
        session["_id"] = str(uuid.uuid4())
    return session["_id"]


def create_chat(session_id, title="New Chat"):
    chat_id = str(uuid.uuid4())
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "INSERT INTO conversations (id, session, title, created_at, messages) VALUES (?, ?, ?, ?, ?)",
            (chat_id, session_id, title, int(time.time()), "[]")
        )
    return chat_id


def list_chats_db(session_id):
    with sqlite3.connect(DB_PATH) as db:
        rows = db.execute(
            "SELECT id, title, created_at FROM conversations WHERE session=? ORDER BY created_at DESC",
            (session_id,)
        ).fetchall()
    return [{"id": r[0], "title": r[1], "created_at": r[2]} for r in rows]


def get_chat_db(chat_id, session_id):
    with sqlite3.connect(DB_PATH) as db:
        row = db.execute(
            "SELECT id, title, messages FROM conversations WHERE id=? AND session=?",
            (chat_id, session_id)
        ).fetchone()
    if not row:
        return None
    return {"id": row[0], "title": row[1], "messages": json.loads(row[2])}


def save_messages(chat_id, session_id, messages):
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "UPDATE conversations SET messages=? WHERE id=? AND session=?",
            (json.dumps(messages), chat_id, session_id)
        )


def set_title(chat_id, session_id, title):
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "UPDATE conversations SET title=? WHERE id=? AND session=?",
            (title, chat_id, session_id)
        )


def delete_chat_db(chat_id, session_id):
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            "DELETE FROM conversations WHERE id=? AND session=?",
            (chat_id, session_id)
        )


init_db()


@app.get("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.get("/chat/<chat_id>")
def chat_page(chat_id):
    return send_from_directory("frontend", "index.html")


@app.get("/api/chats")
def api_list_chats():
    sid = get_session_id()
    return jsonify({"chats": list_chats_db(sid)})


@app.post("/api/chats")
def api_new_chat():
    sid = get_session_id()
    chat_id = create_chat(sid)
    return jsonify({"id": chat_id, "title": "New Chat"})


@app.get("/api/chats/<chat_id>")
def api_get_chat(chat_id):
    sid = get_session_id()
    chat = get_chat_db(chat_id, sid)
    if not chat:
        return jsonify({"error": "not found"}), 404
    return jsonify(chat)


@app.delete("/api/chats/<chat_id>")
def api_delete_chat(chat_id):
    sid = get_session_id()
    delete_chat_db(chat_id, sid)
    return jsonify({"ok": True})


@app.patch("/api/chats/<chat_id>")
def api_rename_chat(chat_id):
    sid = get_session_id()
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip()
    if title:
        set_title(chat_id, sid, title)
    return jsonify({"ok": True})


@app.post("/stream")
def stream():
    sid = get_session_id()
    body = request.get_json(silent=True) or {}
    chat_id = body.get("chat_id", "")
    prompt = body.get("q", "")

    if not chat_id:
        return jsonify({"error": "no chat_id"}), 400

    chat = get_chat_db(chat_id, sid)
    if chat is None:
        return jsonify({"error": "chat not found"}), 404

    history = chat["messages"]

    if not history:
        title = prompt[:40] + ("..." if len(prompt) > 40 else "")
        set_title(chat_id, sid, title)

    outgoing = history + [{"role": "user", "content": prompt}]
    print(f"[stream] chat={chat_id[:8]} history={len(history)} prompt={prompt!r}")

    def gen():
        try:
            in_progress_response = ""
            for attempt in range(3):
                had_output = False
                print(f"[ollama] attempt={attempt + 1} messages={json.dumps(outgoing, indent=2, ensure_ascii=False)}")
                chunks = client.chat(
                    model=MODEL,
                    messages=outgoing,
                    stream=True,
                )
                chunk_count = 0
                for chunk in chunks:
                    try:
                        piece = chunk.message.content or ""
                        thinking = chunk.message.thinking or ""
                    except AttributeError:
                        piece = chunk.get("message", {}).get("content", "") or ""
                        thinking = chunk.get("message", {}).get("thinking", "") or ""
                    if thinking:
                        had_output = True
                        yield json.dumps({"thinking": thinking}) + "\n"
                    if piece:
                        had_output = True
                        in_progress_response += piece
                        chunk_count += 1
                        yield json.dumps({"text": piece}) + "\n"
                        if chunk_count % 20 == 0:
                            partial = outgoing + [{"role": "assistant", "content": in_progress_response}]
                            save_messages(chat_id, sid, partial)

                # Only retry if the model produced nothing at all (server hiccup)
                if had_output:
                    break
                print(f"[stream] chat={chat_id[:8]} attempt {attempt + 1} truly empty, retrying...")

            print(f"[stream] chat={chat_id[:8]} response_len={len(in_progress_response)}")
            if in_progress_response:
                final = outgoing + [{"role": "assistant", "content": in_progress_response}]
                save_messages(chat_id, sid, final)
            yield json.dumps({"done": True}) + "\n"

        except Exception as e:
            print(f"[stream] chat={chat_id[:8]} ERROR: {e}")
            yield json.dumps({"error": str(e)}) + "\n"
            yield json.dumps({"done": True}) + "\n"

    headers = {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return Response(stream_with_context(gen()), headers=headers)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
