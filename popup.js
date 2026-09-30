'use strict';

// ── Estado global ─────────────────────────────────────────────────────────────
let darkMode     = false;
let CONFIG       = null;
let configLoaded = false;
let currentModule = null;

const CONFIG_URL = 'https://stive.com.br/BAPM2/adm/config.json';

const DEFAULT_CONFIG = {
  version: '2.1',
  lastUpdate: '2025-04-01',
  patterns: {
    itemPatterns:      ['ITEM DOEPM', 'ITEM DOPM', 'ITEM DO DOPM', 'ITEM PARA DOPM'],
    authorityTitles:   ['Comandante','Chefe','Diretor','Assistente','SUBCOMANDANTE','COMANDANTE','CHEFE','DIRETOR','ASSISTENTE','RESP'],
    textStartPatterns: ['Por terem','Por ter','Que sempre','PELA CONTRIBUIÇÃO','Pelo ter'],
    textEndPatterns:   ['Documento Assinado','RNMM'],
    rgPatterns:        ['(\\b\\d{2}[.,]\\d{3}\\b)','(\\b\\d{5}\\b)'],
    customInitials:    '\nRNMM.'
  },
  fieldSelectors: {
    textField:          '#textoElogio',
    authorityField:     '#autoridade',
    rgField:            "input[name='rg']",
    addButtonSelector:  "input[value='Adicionar']"
  },
  timings: {
    rgProcessingDelay: 2000,
    fieldFocusDelay:   500,
    buttonClickDelay:  300
  }
};

const MODULES = {
  'register-compliments': {
    name: 'Cadastrar Elogios',
    icon: 'fas fa-award',
    path: 'modules/register-compliments/index.html',
    active: true,
    hostPermissions: ['sei.go.gov.br','sisp.ssp.go.gov.br']
  },
  'filter-rg': {
    name: 'Filtrar RGs',
    icon: 'fas fa-filter',
    path: 'modules/filter-rg/index.html',
    active: false,
    hostPermissions: ['sisp.ssp.go.gov.br']
  },
  'register-courses': {
    name: 'Cadastrar Cursos',
    icon: 'fas fa-graduation-cap',
    path: 'modules/register-courses/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br','sisp.ssp.go.gov.br']
  },
  'register-certificates': {
    name: 'Cadastrar Certificados',
    icon: 'fas fa-certificate',
    path: 'modules/register-certificates/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br','sisp.ssp.go.gov.br']
  },
  'remove-spacing': {
    name: 'Remover Espaços',
    icon: 'fas fa-broom',
    path: 'modules/remove-spacing/index.html',
    active: false,
    hostPermissions: ['sei.go.gov.br']
  },
  'extension-settings': {
    name: 'Configurações',
    icon: 'fas fa-cog',
    path: 'modules/extension-settings/index.html',
    active: false,
    hostPermissions: ['*']
  }
};

// ── Inicialização ─────────────────────────────────────────────────────────────
async function initApp() {
  splash(true, 'Iniciando Super DOPM…');
  await loadConfig();
  loadPreferences();
  setupEvents();
  checkActiveTab();
  updateModuleGrid();
}

// ── Configuração ──────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch(CONFIG_URL, { method: 'GET', headers: { Accept: 'application/json' }, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    if (!validateConfig(cfg)) throw new Error('Config inválida');
    CONFIG = cfg;
    notify('Configurações carregadas do servidor', 'success');
  } catch (e) {
    CONFIG = DEFAULT_CONFIG;
    notify('Usando configuração local', 'info');
  }
  configLoaded = true;
  splash(false);
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  for (const s of ['patterns','fieldSelectors','timings']) {
    if (!cfg[s] || typeof cfg[s] !== 'object') return false;
  }
  return true;
}

// ── Eventos ───────────────────────────────────────────────────────────────────
function setupEvents() {
  document.getElementById('home-button')?.addEventListener('click', goHome);
  document.getElementById('darkModeToggle')?.addEventListener('click', toggleDark);
  document.getElementById('moduleBackButton')?.addEventListener('click', goHome);

  document.querySelectorAll('.module-card').forEach(card => {
    const id = card.dataset.module;
    if (!id) return;
    card.addEventListener('click', () => {
      if (MODULES[id]?.active) loadModule(id);
      else notify(`"${MODULES[id]?.name}" ainda não disponível`, 'info');
    });
  });
}

// ── Navegação ─────────────────────────────────────────────────────────────────
function loadModule(id) {
  if (!MODULES[id]?.active) {
    notify(`"${MODULES[id]?.name}" ainda não disponível`, 'info');
    return;
  }
  currentModule = id;

  const home      = document.getElementById('home-page');
  const container = document.getElementById('module-container');
  const title     = document.getElementById('moduleTitle');
  const content   = document.getElementById('module-content');

  home.style.display      = 'none';
  container.style.display = 'block';
  title.innerHTML = `<i class="${MODULES[id].icon}"></i> ${MODULES[id].name}`;

  // Passa a config via postMessage logo após o iframe carregar
  content.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src          = MODULES[id].path;
  iframe.style.cssText = 'width:100%;height:600px;border:none;';

  iframe.addEventListener('load', () => {
    // Envia CONFIG para o módulo assim que ele carregar
    try {
      iframe.contentWindow.postMessage({ type: 'INIT_CONFIG', config: CONFIG }, '*');
    } catch(_) {}
    if (darkMode) {
      try { iframe.contentDocument.body.classList.add('dark-mode'); } catch(_) {}
    }
  });

  content.appendChild(iframe);
}

function goHome() {
  const home      = document.getElementById('home-page');
  const container = document.getElementById('module-container');
  const content   = document.getElementById('module-content');

  home.style.display      = 'block';
  container.style.display = 'none';
  content.innerHTML       = '';
  currentModule           = null;
  updateModuleGrid();
  checkActiveTab();
}

// ── Aba ativa ─────────────────────────────────────────────────────────────────
function checkActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url = tab?.url || '';
    const ok  = url.startsWith('https://sei.go.gov.br') || url.startsWith('https://sisp.ssp.go.gov.br');

    document.getElementById('main-content').style.display    = ok ? 'block' : 'none';
    document.getElementById('warning-section').style.display = ok ? 'none'  : 'block';

    if (ok) {
      const host = new URL(url).hostname;
      for (const [id, mod] of Object.entries(MODULES)) {
        mod.active = id === 'register-compliments'
          ? mod.hostPermissions.some(h => host.includes(h))
          : false;
      }
      updateModuleGrid();
    }
  });
}

function updateModuleGrid() {
  document.querySelectorAll('.module-card').forEach(card => {
    const id  = card.dataset.module;
    const mod = MODULES[id];
    if (!mod) return;
    const badge = card.querySelector('.status-badge');
    const status = card.querySelector('.module-status');
    if (mod.active) {
      status.classList.add('active');
      badge.textContent = 'Ativo';
      card.style.opacity = '1';
    } else {
      status.classList.remove('active');
      badge.textContent = 'Em breve';
      card.style.opacity = '0.7';
    }
  });
}

// ── Notificação ───────────────────────────────────────────────────────────────
function notify(msg, type = 'success') {
  const el = document.getElementById('notification');
  const msgEl = document.getElementById('notification-message');
  if (!el || !msgEl) return;

  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  el.querySelector('i').className = `fas ${icons[type] || icons.info}`;
  el.className = `notification ${type}`;
  msgEl.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Splash ────────────────────────────────────────────────────────────────────
function splash(show, msg = null) {
  const el = document.getElementById('splash-screen');
  if (!el) return;
  if (msg) {
    const sub = el.querySelector('.splash-subtitle');
    if (sub) sub.textContent = msg;
  }
  if (show) {
    const bar = el.querySelector('.splash-loading-bar');
    if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = 'loading 1.5s ease-in-out forwards'; }
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

// ── Tema escuro ───────────────────────────────────────────────────────────────
function toggleDark() {
  darkMode = !darkMode;
  document.body.classList.toggle('dark-mode', darkMode);
  const btn = document.getElementById('darkModeToggle');
  if (btn) btn.innerHTML = darkMode ? '<i class="fas fa-sun"></i> Modo claro' : '<i class="fas fa-moon"></i> Modo escuro';
  localStorage.setItem('darkMode', darkMode);

  const iframe = document.querySelector('#module-content iframe');
  if (iframe) {
    try {
      iframe.contentDocument.body.classList.toggle('dark-mode', darkMode);
      iframe.contentWindow.postMessage({ type: 'DARK_MODE', enabled: darkMode }, '*');
    } catch(_) {}
  }
  notify(`Modo ${darkMode ? 'escuro' : 'claro'} ativado`, 'info');
}

function loadPreferences() {
  darkMode = localStorage.getItem('darkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark-mode');
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.innerHTML = '<i class="fas fa-sun"></i> Modo claro';
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
