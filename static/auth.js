function renderLogin(router) {
  const el = document.createElement('div');
  el.className = 'auth-page';
  el.innerHTML = `
    <div class="auth-card">
      <h2>Sign In</h2>
      <div class="form-error" id="login-error" style="display:none"></div>
      <div class="field"><label>Email</label><input type="email" id="login-email" autocomplete="email" /></div>
      <div class="field"><label>Password</label><input type="password" id="login-pass" autocomplete="current-password" /></div>
      <button class="btn btn-primary" style="width:100%" id="login-btn">Sign In</button>
      <div class="auth-link">No account? <a href="#/register">Create one</a></div>
    </div>
  `;

  const emailEl = el.querySelector('#login-email');
  const passEl  = el.querySelector('#login-pass');
  const errEl   = el.querySelector('#login-error');
  const btn     = el.querySelector('#login-btn');

  async function doLogin() {
    errEl.style.display = 'none';
    btn.disabled = true;
    const { data, status } = await API.login(emailEl.value.trim(), passEl.value);
    btn.disabled = false;
    if (status === 200) {
      State.user = data;
      await maybeMigrate();
      router.navigate('/');
    } else {
      errEl.textContent = data?.error || 'Login failed';
      errEl.style.display = 'block';
    }
  }

  btn.addEventListener('click', doLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  return el;
}

function renderRegister(router) {
  const el = document.createElement('div');
  el.className = 'auth-page';
  el.innerHTML = `
    <div class="auth-card">
      <h2>Create Account</h2>
      <div class="form-error" id="reg-error" style="display:none"></div>
      <div class="field"><label>Email</label><input type="email" id="reg-email" autocomplete="email" /></div>
      <div class="field"><label>Password <span style="color:var(--text-muted);font-size:12px">(min 8 characters)</span></label><input type="password" id="reg-pass" autocomplete="new-password" /></div>
      <button class="btn btn-primary" style="width:100%" id="reg-btn">Create Account</button>
      <div class="auth-link">Already have an account? <a href="#/login">Sign in</a></div>
    </div>
  `;

  const emailEl = el.querySelector('#reg-email');
  const passEl  = el.querySelector('#reg-pass');
  const errEl   = el.querySelector('#reg-error');
  const btn     = el.querySelector('#reg-btn');

  async function doRegister() {
    errEl.style.display = 'none';
    btn.disabled = true;
    const { data, status } = await API.register(emailEl.value.trim(), passEl.value);
    btn.disabled = false;
    if (status === 201) {
      State.user = data;
      await maybeMigrate();
      router.navigate('/');
    } else {
      errEl.textContent = data?.error || 'Registration failed';
      errEl.style.display = 'block';
    }
  }

  btn.addEventListener('click', doRegister);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  return el;
}

async function maybeMigrate() {
  const localChats = LocalChats.all();
  if (localChats.length === 0) return;
  await API.migrate(localChats);
  LocalChats.clear();
}
