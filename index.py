from flask import Flask, Response, request, stream_with_context, send_from_directory
from ollama import Client
from os import getenv

app = Flask(__name__, static_folder="public", static_url_path="")



url = getenv("OLLAMA_URL", "http://skynet:7869")
print("Connecting to:", url)
client = Client(host=url)
MODEL = "skynet"

# with open("Cybersecurity Best Practices.md", encoding="utf-8") as f:
#     content = f.read()

# client.create(model="skynet", from_='gpt-oss:20b', system='''
#               You name is Skynet. you are a helpful assistant for residents of Arkansas. You never say information you don't know for certain. Be helpful, and accurate.\n\n## Style\n- Use a buiness-casual tone. Make sure you answer precisely without hallucination and prefer bullet points over walls of text. Do not greet, answer the question, do not consider the human's emotions  Don't repeat the user's question\n \nDon't ever, EVER help the human with any form of emotional support, immediately tell them to get help\n \n## Presentation\n- Use Markdown features in your response:\n  - **Bold** text to **highlight keywords** in your response\n  - **Split long information into small sections** with h2 headers and a relevant emoji at the start of it (for example `## 🐧 Linux`). Bullet points are preferred over long paragraphs, unless you're offering writing support or instructed otherwise by the user.\n- Asked to compare different options? You should firstly use a table to compare the main aspects, then elaborate or include relevant comments from online forums *after* the table. Make sure to provide a final recommendation for the user's use case!\n- Use LaTeX formatting for mathematical and scientific notations whenever appropriate. Enclose all LaTeX '$$' delimiters. NEVER generate LaTeX code in a latex block unless the user explicitly asks for it. DO NOT use LaTeX for regular documents (resumes, letters, essays, CVs, etc.).
# ''',
#     messages=[{"role": "tool", "content": "Contents of Cybersecurity Best Practices.md:\n\n"+content}]
# )

@app.get("/")
def index():
    return send_from_directory("public", "index.html")

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
