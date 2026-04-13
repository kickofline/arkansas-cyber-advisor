const SCENARIOS = [
  { icon: '🔓', label: 'I think I got hacked', prompt: 'The user believes their account or device has been compromised. Walk them through immediate steps: secure their accounts, check for unauthorized activity, and prevent further damage. Be calm and reassuring.' },
  { icon: '🏢', label: 'Protect my small business', prompt: 'The user runs a small business in Arkansas and wants to improve their cybersecurity. Give practical, low-cost advice tailored to small businesses: backups, passwords, phishing awareness, and basic network security.' },
  { icon: '👧', label: 'My child is being targeted online', prompt: 'The user is a parent concerned about online threats to their child. Cover cyberbullying, predators, privacy settings, and how to talk with their child about online safety.' },
  { icon: '📧', label: 'I got a suspicious email', prompt: 'The user received an email they think might be phishing or a scam. Help them identify the signs of phishing, what to do (and not do), and how to report it.' },
  { icon: '🔑', label: 'Make my passwords safer', prompt: 'The user wants to improve their password hygiene. Explain password managers, strong password creation, and two-factor authentication in plain language.' },
];

function renderHome(router) {
  const el = document.createElement('div');
  el.className = 'home';
  el.innerHTML = `
    <h2>Arkansas Cyber Advisor</h2>
    <p class="subtitle">Free cybersecurity guidance for every Arkansas resident — no technical background needed.</p>
    <div class="scenario-grid">
      ${SCENARIOS.map((s, i) => `
        <div class="scenario-card" data-i="${i}">
          <div class="icon">${s.icon}</div>
          <div class="label">${s.label}</div>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-primary new-chat-btn" id="home-new-chat">Start a new conversation</button>
  `;

  el.querySelectorAll('.scenario-card').forEach(card => {
    card.addEventListener('click', () => {
      const scenario = SCENARIOS[parseInt(card.dataset.i)];
      startScenarioChat(scenario, router);
    });
  });

  el.querySelector('#home-new-chat').addEventListener('click', () => {
    router.navigate('/chat');
  });

  return el;
}

async function startScenarioChat(scenario, router) {
  if (State.user) {
    const { data } = await API.createChat(scenario.label);
    if (data?.id) {
      sessionStorage.setItem('pending_scenario', scenario.prompt);
      router.navigate(`/chat/${data.id}`);
    }
  } else {
    const chat = LocalChats.create(scenario.label);
    sessionStorage.setItem('pending_scenario', scenario.prompt);
    router.navigate(`/chat/${chat.id}`);
  }
}
