from ollama import Client

client = Client(host="http://skynet:7869")

resp = client.chat(
    model="gpt-oss:20b",
    messages=[{"role": "user", "content": "Hello from Python over LAN"}],
)
print(resp["message"]["content"])