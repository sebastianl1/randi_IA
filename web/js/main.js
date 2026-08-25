// RANDI — SPA entry: hash router + montaje de vistas.
import * as api from './api.js';
import * as compat from './compat.js';
import { detectHardware } from './hardware.js';

const ROUTES = ['#/', '#/models', '#/chat'];

const app = document.getElementById('app');

window.__RANDI = { api, compat, detectHardware, state: {} };

function renderNav(active) {
  const nav = document.getElementById('nav');
  nav.innerHTML = `
    <a class="brand" href="#/">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
      <span>RANDI</span>
    </a>
    <nav class="nav-links">
      <a href="#/" data-nav="home" class="${active === 'home' ? 'active' : ''}">Home</a>
      <a href="#/models" data-nav="models" class="${active === 'models' ? 'active' : ''}">Modelos</a>
      <a href="#/chat" data-nav="chat" class="${active === 'chat' ? 'active' : ''}">Chat</a>
    </nav>
    <button class="theme-toggle" id="themeToggle" aria-label="Cambiar tema">◐</button>`;
}

export async function boot() {
  renderNav('home');
  // Tema
  const savedTheme = localStorage.getItem('randi-theme') || 'dark';
  document.documentElement.classList.toggle('light', savedTheme === 'light');
  document.getElementById('themeToggle').addEventListener('click', () => {
    const light = document.documentElement.classList.toggle('light');
    localStorage.setItem('randi-theme', light ? 'light' : 'dark');
  });

  const route = () => location.hash || '#/';
  const activeKey = () => (route() === '#/chat' ? 'chat' : route() === '#/models' ? 'models' : 'home');

  // Pre-cargar hardware (server-side + navegador)
  let hw = {};
  try {
    hw = await api.getHardware();
  } catch (e) { /* si no hay servidor, usamos deteccion del navegador */ }
  if (!hw.ram_gb && hw.gpu_vram_gb == null) {
    try { hw = await detectHardware(); } catch (e) {}
  }
  window.__RANDI.state.hardware = hw;

  async function render() {
    renderNav(activeKey());
    const r = route();
    let view = null;
    if (r === '#/models') {
      const m = await import('./views/models.js');
      view = await m.default(app, hw);
    } else if (r === '#/chat') {
      const m = await import('./views/chat.js');
      view = await m.default(app, hw);
    } else if (r.startsWith('#/model/')) {
      const m = await import('./views/model.js');
      const id = decodeURIComponent(r.slice('#/model/'.length));
      view = await m.default(app, hw, id);
    } else {
      const m = await import('./views/home.js');
      view = await m.default(app, hw);
    }
    // scroll to top
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  await render();
}
