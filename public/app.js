const form = document.getElementById("f");
const q = document.getElementById("q");
const out = document.getElementById("out");
const btn = document.getElementById("btn");

let buffer = "";

function render() {
  out.innerHTML = marked.parse(buffer);
  out.scrollTop = out.scrollHeight;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = q.value.trim();
  if (!text) return;

  buffer = "";
  out.innerHTML = "";
  btn.disabled = true;
  q.disabled = true;

  const es = new EventSource("/stream?q=" + encodeURIComponent(text));

  es.onmessage = (ev) => {
    if (ev.data === "[DONE]") {
      es.close();
      btn.disabled = false;
      q.disabled = false;
      q.value = "";
      q.focus();
      return;
    }

    buffer += ev.data;
    render();
  };

  es.onerror = () => {
    es.close();
    buffer += "\n\n[stream error]\n";
    render();
    btn.disabled = false;
    q.disabled = false;
  };
});

q.focus();
