function renderHome(router) {
  const el = document.createElement('div');
  el.className = 'home-wrap';
  el.innerHTML = `
    <div class="home">
      <h2>${APP_LOGO_SVG} Arkansas Cyber Advisor</h2>
      <p class="subtitle">Free cybersecurity guidance for every Arkansas resident.</p>

      <div class="home-input-wrap">
        <div class="input-card">
          <textarea id="home-input" rows="1" placeholder="Ask anything about cybersecurity…"></textarea>
          <div class="input-card-footer">
            <div class="input-card-right">
              <button class="send-btn" id="home-send-btn" title="Send">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="8" y1="14" x2="8" y2="2"/><polyline points="3 7 8 2 13 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="scenario-grid">
        ${PROMPTS.map((p, i) => `
          <div class="scenario-card" data-i="${i}">
            <div class="icon">${p.icon}</div>
            <div class="label">${p.label}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const homeInput = el.querySelector('#home-input');
  const homeSendBtn = el.querySelector('#home-send-btn');

  function submitHome() {
    const text = homeInput.value.trim();
    if (!text) return;
    sessionStorage.setItem('pending_scenario', text);
    router.navigate('/chat');
  }

  homeInput.addEventListener('input', () => {
    homeInput.style.height = 'auto';
    homeInput.style.height = Math.min(homeInput.scrollHeight, 200) + 'px';
  });
  homeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitHome(); }
  });
  homeSendBtn.addEventListener('click', submitHome);

  el.querySelectorAll('.scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = PROMPTS[parseInt(card.dataset.i)];
      startScenarioChat(prompt, router);
    });
  });

  return el;
}

async function startScenarioChat(prompt, router) {
  sessionStorage.setItem('pending_scenario', prompt.text);
  router.navigate('/chat');
}
