from ollama import Client
import os

url = os.getenv("OLLAMA_URL", "http://skynet:7869")
print("Connecting to:", url)
client = Client(host=url)
MODEL = "skynet"

def setup_model():
    with open("system_prompt.md", encoding="utf-8") as f:
        system_prompt = f.read()
    resources = {}
    for filename in os.listdir("resources"):
        if filename.endswith(".md"):   
            with open(os.path.join("resources", filename), encoding="utf-8") as f:
                resources[filename] = f.read()

    messages=[{"role": "tool", "content": f"Contents of {name}:\n\n{content}"} for name, content in resources.items()]
    client.create(model=MODEL, from_='gpt-oss:20b', system=system_prompt,
        messages=messages
    )

if __name__ == "__main__":
    setup_model()