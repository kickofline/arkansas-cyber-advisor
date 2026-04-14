(async () => {
  await State.init();
  await loadPrompts();

  const router = new Router();

  router
    .on('/', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderHome(router));
    })
    .on('/chat', () => {
      const scenario = sessionStorage.getItem('pending_scenario') || null;
      sessionStorage.removeItem('pending_scenario');
      renderSidebar(router, null);
      renderChat(router, null, scenario);
    })
    .on('/chat/:id', ({ id }) => {
      const main = document.getElementById('main');
      if (main && main.dataset.chatId === id) return; // already rendering this chat
      const scenario = sessionStorage.getItem('pending_scenario') || null;
      sessionStorage.removeItem('pending_scenario');
      renderSidebar(router, id);
      renderChat(router, id, scenario);
    })
    .on('/login', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderLogin(router));
    })
    .on('/register', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderRegister(router));
    })
    .on('/admin', () => {
      renderSidebar(router, null);
      renderAdmin(router);
    })
    .start();
})();
