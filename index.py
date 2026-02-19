from flask import Flask, Response, request, stream_with_context, send_from_directory
from ollama import Client
import os

app = Flask(__name__, static_folder="frontend", static_url_path="")



url = os.getenv("OLLAMA_URL", "http://skynet:7869")
print("Connecting to:", url)
client = Client(host=url)
MODEL = "skynet"

@app.get("/")
def index():
    return send_from_directory("frontend", "index.html")

@app.get("/stream")
def stream():
    prompt = request.args.get("q", "")

    def gen():
        try:
            chunks = client.chat(
                model=MODEL,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            )

            for chunk in chunks:
                piece = chunk.get("message", {}).get("content", "")
                if piece:
                    yield f"data: {piece}\n\n"

            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: [error] {str(e)}\n\n"
            yield "data: [DONE]\n\n"

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return Response(stream_with_context(gen()), headers=headers)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
