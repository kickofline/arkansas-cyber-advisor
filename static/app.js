(async () => {
  await State.init();

  const router = new Router();

  router
    .on('/', () => {
      renderSidebar(router, null);
      const main = document.getElementById('main');
      main.innerHTML = '';
      main.appendChild(renderHome(router));
    })
    .on('/chat', () => {
      renderSidebar(router, null);
      renderChat(router, null, null);
    })
    .on('/chat/:id', ({ id }) => {
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
    .start();
})();
