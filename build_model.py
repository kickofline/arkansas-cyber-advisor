from ollama import Client
import os

url = os.getenv("OLLAMA_URL", "http://skynet:7869")
print("Connecting to:", url)
client = Client(host=url)
MODEL = "skynet"

TEMPLATE = """\
{{- if .System }}<|start|>system<|message|>{{ .System }}<|end|>
{{ end -}}
{{- range .Messages }}<|start|>{{ .Role }}<|message|>{{ .Content }}<|end|>
{{ end -}}
<|start|>assistant<|message|>"""

def setup_model():
    with open("system_prompt.md", encoding="utf-8") as f:
        system_prompt = f.read()

    resources = {}
    for filename in sorted(os.listdir("resources")):
        if filename.endswith(".md"):
            with open(os.path.join("resources", filename), encoding="utf-8") as f:
                resources[filename] = f.read()

    if resources:
        system_prompt += "\n\n# Reference Material\n\n"
        for name, content in resources.items():
            system_prompt += f"## {name}\n\n{content}\n\n"

    client.create(
        model=MODEL,
        from_="gpt-oss:20b",
        system=system_prompt,
        template=TEMPLATE,
    )
    print(f"Model '{MODEL}' created with system prompt and {len(resources)} resources.")

if __name__ == "__main__":
    setup_model()
