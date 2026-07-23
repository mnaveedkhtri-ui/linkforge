// ---------- Small helpers ----------
async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});
window.closeModal = closeModal;

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ---------- State ----------
let currentUser = null;
let leadsState = [];
let stagesState = ['Prospect', 'Contacted', 'Negotiating', 'Placed', 'Live'];
let publishersState = [];
let campaignsState = [];
let currentDraft = null;

// ---------- Auth screen wiring ----------
document.getElementById('show-signup').addEventListener('click', () => {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-signup-form').style.display = 'block';
});
document.getElementById('show-login').addEventListener('click', () => {
  document.getElementById('auth-signup-form').style.display = 'none';
  document.getElementById('auth-login-form').style.display = 'block';
});

if (window.location.hash === '#signup') {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) document.getElementById('show-signup').click();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    await onLoggedIn(user);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('signup-btn').addEventListener('click', async () => {
  const name = document.getElementById('signup-name').value.trim();
  const company = document.getElementById('signup-company').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';
  try {
    const { user } = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, company, email, password }) });
    await onLoggedIn(user);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

async function onLoggedIn(user) {
  currentUser = user;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'grid';
  document.getElementById('app-footer').style.display = 'flex';
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-avatar').textContent = initials(user.name);
  document.getElementById('home-greeting').textContent = 'Welcome back, ' + user.name.split(' ')[0];
  document.getElementById('settings-name').value = user.name;
  document.getElementById('settings-company').value = user.company || '';
  document.getElementById('settings-email').value = user.email;
  document.getElementById('apikey-value').value = user.apiToken || 'Click Regenerate to create one';
  document.getElementById('webhook-url').value = user.webhookUrl || '';
  renderIntegrations(user.integrations);
  await loadAll();
  await loadTeam();
}

async function checkSession() {
  const { user } = await api('/api/me');
  if (user) await onLoggedIn(user);
}

// ---------- Navigation ----------
const titles = { home: 'Home', copilot: 'AI Copilot', marketplace: 'Publisher Marketplace', crm: 'CRM Pipeline', campaigns: 'Campaigns', content: 'Content Studio', seo: 'SEO Center', reports: 'Reports', settings: 'Settings' };
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const v = item.dataset.view;
    document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
    document.getElementById('view-' + v).classList.add('active');
    document.getElementById('view-title').textContent = titles[v];
  });
});

// ---------- Footer clock ----------
function tickClock() {
  const el = document.getElementById('footer-clock');
  if (el) el.textContent = new Date().toLocaleTimeString();
}
tickClock();
setInterval(tickClock, 1000);

// ---------- Load everything after login ----------
async function loadAll() {
  await Promise.all([loadLeads(), loadPublishers(), loadCampaigns(), loadChatHistory()]);
  renderHome();
}

// ---------- HOME ----------
function renderHome() {
  const liveLeads = leadsState.filter(l => stagesState[l.stage] === 'Live');
  document.getElementById('stat-campaigns').textContent = campaignsState.length;
  document.getElementById('stat-campaigns-note').textContent = campaignsState.length ? 'across your workspace' : 'create your first one';
  document.getElementById('stat-leads').textContent = leadsState.length;
  document.getElementById('stat-leads-note').textContent = leadsState.length ? 'total in pipeline' : 'add leads from the marketplace';
  document.getElementById('stat-live').textContent = liveLeads.length;
  document.getElementById('stat-live-note').textContent = liveLeads.length ? 'published so far' : 'none yet';
  const avgDr = leadsState.length ? Math.round(leadsState.reduce((s, l) => s + (l.dr || 0), 0) / leadsState.length) : null;
  document.getElementById('stat-dr').textContent = avgDr === null ? '-' : avgDr;
  document.getElementById('stat-dr-note').textContent = avgDr === null ? 'no leads yet' : 'across tracked leads';

  const barsEl = document.getElementById('home-stage-bars');
  barsEl.innerHTML = '';
  const maxCount = Math.max(1, ...stagesState.map((s, i) => leadsState.filter(l => l.stage === i).length));
  stagesState.forEach((stage, i) => {
    const count = leadsState.filter(l => l.stage === i).length;
    const row = document.createElement('div');
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-mid); margin-bottom:4px;"><span>${stage}</span><span>${count}</span></div>
      <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:6px; overflow:hidden;">
        <div style="width:${(count / maxCount) * 100}%; height:100%; background:linear-gradient(90deg,var(--teal),var(--violet));"></div>
      </div>`;
    barsEl.appendChild(row);
  });

  const placementsBody = document.getElementById('home-placements-body');
  if (liveLeads.length) {
    placementsBody.innerHTML = liveLeads.map(l => `<tr><td>${l.name}</td><td>${l.domain}</td><td>${l.dr}</td><td><span class="pill green">Live</span></td></tr>`).join('');
  } else {
    placementsBody.innerHTML = '<tr><td colspan="4" class="empty-note">No live placements yet. Move leads to "Live" in the CRM pipeline as they publish.</td></tr>';
  }
}

// ---------- AI COPILOT ----------
async function loadChatHistory() {
  const { messages } = await api('/api/chat');
  const chatEl = document.getElementById('chat-msgs');
  const activityEl = document.getElementById('home-activity');
  if (messages.length) {
    chatEl.innerHTML = messages.map(renderChatBubble).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
    const recent = messages.slice(-4).reverse();
    activityEl.innerHTML = recent.map(m => `<div>${m.role === 'ai' ? 'Copilot' : 'You'}: ${escapeHtml(m.text.slice(0, 90))}${m.text.length > 90 ? '...' : ''}</div>`).join('');
  }
}
function renderChatBubble(m) {
  if (m.role === 'ai') {
    return `<div class="msg ai"><div class="av"></div><div class="bubble">${escapeHtml(m.text)}</div></div>`;
  }
  return `<div class="msg user"><div class="bubble">${escapeHtml(m.text)}</div></div>`;
}
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function sendChat(text) {
  if (!text.trim()) return;
  const chatEl = document.getElementById('chat-msgs');
  chatEl.insertAdjacentHTML('beforeend', renderChatBubble({ role: 'user', text }));
  chatEl.scrollTop = chatEl.scrollHeight;
  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true; sendBtn.textContent = '...';
  try {
    const { reply } = await api('/api/chat', { method: 'POST', body: JSON.stringify({ message: text }) });
    chatEl.insertAdjacentHTML('beforeend', renderChatBubble(reply));
    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (e) {
    chatEl.insertAdjacentHTML('beforeend', renderChatBubble({ role: 'ai', text: 'That request failed: ' + e.message }));
  } finally {
    sendBtn.disabled = false; sendBtn.textContent = 'Send';
  }
}
document.getElementById('chat-send-btn').addEventListener('click', () => {
  const input = document.getElementById('chat-input-el');
  const val = input.value;
  input.value = '';
  sendChat(val);
});
document.getElementById('chat-input-el').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('chat-send-btn').click();
});
document.querySelectorAll('.quick-action').forEach(qa => {
  qa.addEventListener('click', () => sendChat(qa.dataset.prompt));
});

// ---------- PUBLISHER MARKETPLACE ----------
async function loadPublishers() {
  const { publishers } = await api('/api/publishers');
  publishersState = publishers;
  renderPublishers(publishers);
}
function renderPublishers(list) {
  const grid = document.getElementById('pub-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-note">No publishers match these filters.</div>';
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="pub-card">
      <div class="pub-top">
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="pub-icon">${p.name[0]}</div>
          <div>
            <div class="pub-name">${p.name}</div>
            <div class="pub-domain">${p.domain}</div>
          </div>
        </div>
      </div>
      <div class="pub-badges">
        <span class="pill violet">${p.niche}</span>
        ${p.verified ? '<span class="badge-sm verified">Traffic looks real</span>' : '<span class="badge-sm unverified">Unverified</span>'}
      </div>
      <div class="pub-metrics">
        <div>DR<span>${p.dr}</span></div>
        <div>Traffic<span>${Math.round(p.monthlyTraffic / 1000)}K</span></div>
        <div>Turnaround<span>${p.turnaroundDays}d</span></div>
      </div>
      <div class="pub-foot">
        <div class="pub-price">$${p.price} <span>/ post</span></div>
        <button class="btn-sm add-lead-btn" data-id="${p.id}">Add to pipeline</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('.add-lead-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = publishersState.find(x => x.id === Number(btn.dataset.id));
      btn.disabled = true; btn.textContent = 'Adding...';
      try {
        await api('/api/leads', { method: 'POST', body: JSON.stringify({ name: p.name, domain: p.domain, dr: p.dr }) });
        await loadLeads();
        renderHome();
        btn.textContent = 'Added';
      } catch (e) {
        btn.textContent = 'Failed';
      }
    });
  });
}
function applyPublisherFilters() {
  const niche = document.querySelector('.chip[data-niche].on')?.dataset.niche || 'All niches';
  const drOn = document.querySelector('.chip[data-dr].on');
  const verOn = document.querySelector('.chip[data-verified].on');
  let list = publishersState;
  if (niche !== 'All niches') list = list.filter(p => p.niche === niche);
  if (drOn) list = list.filter(p => p.dr >= Number(drOn.dataset.dr));
  if (verOn) list = list.filter(p => p.verified);
  renderPublishers(list);
}
document.querySelectorAll('#pub-filter-bar .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    if (chip.dataset.niche) {
      document.querySelectorAll('#pub-filter-bar .chip[data-niche]').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
    } else {
      chip.classList.toggle('on');
    }
    applyPublisherFilters();
  });
});

// ---------- CRM KANBAN ----------
async function loadLeads() {
  const { leads, stages } = await api('/api/leads');
  leadsState = leads;
  stagesState = stages;
  renderKanban();
}
function renderKanban() {
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = '';
  stagesState.forEach((stage, idx) => {
    const col = document.createElement('div');
    col.className = 'kcol';
    col.dataset.stage = idx;
    const count = leadsState.filter(l => l.stage === idx).length;
    col.innerHTML = `<div class="kcol-head"><span class="title">${stage}</span><span class="count">${count}</span></div><div class="kcol-body" data-stage="${idx}"></div>`;
    if (idx === 0) {
      col.innerHTML += `<div class="kcol-add"><input placeholder="Publisher name" class="new-lead-name"><input placeholder="domain.com" class="new-lead-domain"><button class="new-lead-btn">+ Add lead</button></div>`;
    }
    kanban.appendChild(col);
  });

  leadsState.forEach(l => {
    const body = kanban.querySelector(`.kcol-body[data-stage="${l.stage}"]`);
    if (!body) return;
    const card = document.createElement('div');
    card.className = 'kcard';
    card.draggable = true;
    card.dataset.id = l.id;
    card.innerHTML = `<div class="kname">${l.name}</div><div class="kdomain">${l.domain}</div>
      <div class="kfoot"><span class="pill violet">DR ${l.dr}</span><span class="kdel" data-id="${l.id}">Remove</span></div>`;
    card.addEventListener('dragstart', () => { card.classList.add('dragging'); dragLeadId = l.id; });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    body.appendChild(card);
  });

  kanban.querySelectorAll('.kdel').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('/api/leads/' + el.dataset.id, { method: 'DELETE' });
      await loadLeads();
      renderHome();
    });
  });

  const addBtn = kanban.querySelector('.new-lead-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const nameEl = kanban.querySelector('.new-lead-name');
      const domainEl = kanban.querySelector('.new-lead-domain');
      if (!nameEl.value.trim() || !domainEl.value.trim()) return;
      await api('/api/leads', { method: 'POST', body: JSON.stringify({ name: nameEl.value.trim(), domain: domainEl.value.trim(), dr: 40 }) });
      await loadLeads();
      renderHome();
    });
  }

  kanban.querySelectorAll('.kcol').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('dragover');
      if (dragLeadId == null) return;
      await api(`/api/leads/${dragLeadId}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: Number(col.dataset.stage) }) });
      dragLeadId = null;
      await loadLeads();
      renderHome();
    });
  });
}
let dragLeadId = null;

// ---------- CAMPAIGNS ----------
async function loadCampaigns() {
  const { campaigns } = await api('/api/campaigns');
  campaignsState = campaigns;
  renderCampaigns();
}
function renderCampaigns() {
  const body = document.getElementById('campaigns-body');
  if (!campaignsState.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-note">No campaigns yet. Click "New campaign" to create one.</td></tr>';
    return;
  }
  body.innerHTML = campaignsState.map(c => {
    const leads = leadsState.filter(l => l.campaignId === c.id);
    const live = leads.filter(l => stagesState[l.stage] === 'Live').length;
    return `<tr><td>${c.name}</td><td>${c.niche || '-'}</td><td>${leads.length}</td><td>${live}</td><td><span class="pill green">Active</span></td></tr>`;
  }).join('');
}

document.getElementById('btn-new-campaign').addEventListener('click', () => {
  openModal(`
    <div class="modal-head"><h2>New campaign</h2><div class="modal-close" onclick="closeModal()">&#10005;</div></div>
    <div class="field-sm"><label>Campaign name</label><input id="camp-name" placeholder="e.g. B2B SaaS Q3"></div>
    <div class="field-sm"><label>Niche</label><input id="camp-niche" placeholder="e.g. SaaS &amp; Tech"></div>
    <div class="field-sm"><label>Target DR</label><input id="camp-dr" type="number" value="40"></div>
    <button class="btn-primary" style="width:100%;" id="camp-create-btn">Create campaign</button>
    <div class="form-note" id="camp-error" style="color:var(--red); display:none;"></div>
  `);
  document.getElementById('camp-create-btn').addEventListener('click', async () => {
    const name = document.getElementById('camp-name').value.trim();
    const niche = document.getElementById('camp-niche').value.trim();
    const targetDr = Number(document.getElementById('camp-dr').value) || 40;
    const errEl = document.getElementById('camp-error');
    if (!name) { errEl.textContent = 'Campaign name is required'; errEl.style.display = 'block'; return; }
    try {
      await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name, niche, targetDr }) });
      await loadCampaigns();
      renderHome();
      closeModal();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  });
});

// ---------- CONTENT STUDIO ----------
document.querySelectorAll('#cs-tone-chips .tone-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#cs-tone-chips .tone-chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
  });
});

document.getElementById('cs-generate').addEventListener('click', async () => {
  const keyword = document.getElementById('cs-keyword').value.trim();
  const tone = document.querySelector('#cs-tone-chips .tone-chip.on')?.dataset.tone;
  const wordTarget = document.getElementById('cs-words').value;
  const errEl = document.getElementById('cs-error');
  errEl.style.display = 'none';
  if (!keyword) { errEl.textContent = 'Enter a target keyword or topic first.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('cs-generate');
  const body = document.getElementById('cs-body');
  btn.disabled = true; btn.textContent = 'Generating...';
  body.innerHTML = `<div class="gen-overlay"><div class="dot-pulse"></div> Writing your draft, this can take a few seconds...</div>`;

  try {
    const { draft } = await api('/api/content/generate', { method: 'POST', body: JSON.stringify({ keyword, tone, wordTarget }) });
    currentDraft = draft;
    renderDraft(draft.body);
    document.getElementById('cs-wordcount').textContent = draft.wordCount + ' words';
    document.getElementById('cs-humanize-btn').disabled = false;
    document.getElementById('cs-copy-btn').disabled = false;
  } catch (e) {
    body.innerHTML = `<div style="color:var(--red); font-size:13px; text-align:center; padding:40px;">${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Generate draft';
  }
});

function renderDraft(text) {
  const body = document.getElementById('cs-body');
  const lines = text.trim().split('\n').filter(l => l.trim());
  body.innerHTML = lines.map(line => {
    const t = line.trim();
    if (t.startsWith('## ')) return `<h2>${escapeHtml(t.slice(3).trim())}</h2>`;
    if (t.startsWith('# ')) return `<h1>${escapeHtml(t.slice(2).trim())}</h1>`;
    return `<p>${escapeHtml(t)}</p>`;
  }).join('');
}

document.getElementById('cs-humanize-btn').addEventListener('click', async () => {
  if (!currentDraft) return;
  const btn = document.getElementById('cs-humanize-btn');
  btn.disabled = true; btn.textContent = 'Rewriting...';
  try {
    const { text } = await api('/api/content/humanize', { method: 'POST', body: JSON.stringify({ text: currentDraft.body }) });
    currentDraft.body = text;
    renderDraft(text);
    document.getElementById('cs-wordcount').textContent = text.trim().split(/\s+/).filter(Boolean).length + ' words';
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Rewrite in a more natural voice';
  }
});

document.getElementById('cs-copy-btn').addEventListener('click', () => {
  const text = document.getElementById('cs-body').innerText;
  navigator.clipboard.writeText(text);
  const btn = document.getElementById('cs-copy-btn');
  const old = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => btn.textContent = old, 1200);
});

// ---------- SETTINGS: sub-tab switching ----------
document.querySelectorAll('.settings-nav [data-panel]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav [data-panel]').forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('on'));
    document.getElementById('panel-' + tab.dataset.panel).classList.add('on');
  });
});

// ---------- SETTINGS: General ----------
document.getElementById('settings-save').addEventListener('click', async () => {
  const msg = document.getElementById('settings-msg');
  const name = document.getElementById('settings-name').value.trim();
  const company = document.getElementById('settings-company').value.trim();
  msg.style.color = '';
  try {
    const { user } = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ name, company }) });
    currentUser = user;
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-avatar').textContent = initials(user.name);
    msg.textContent = 'Saved.';
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = e.message;
  }
});

// ---------- SETTINGS: Team and Roles ----------
async function loadTeam() {
  const { team } = await api('/api/team');
  renderTeam(team);
}
function renderTeam(team) {
  const body = document.getElementById('team-body');
  if (!team.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty-note">No team members yet.</td></tr>';
    return;
  }
  body.innerHTML = team.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td><span class="pill violet">${escapeHtml(m.role)}</span></td>
      <td><span class="kdel" data-id="${m.id}" style="cursor:pointer; color:var(--text-low);">Remove</span></td>
    </tr>`).join('');
  body.querySelectorAll('.kdel').forEach(el => {
    el.addEventListener('click', async () => {
      await api('/api/team/' + el.dataset.id, { method: 'DELETE' });
      await loadTeam();
    });
    el.addEventListener('mouseenter', () => el.style.color = 'var(--red)');
    el.addEventListener('mouseleave', () => el.style.color = 'var(--text-low)');
  });
}
document.getElementById('team-add-btn').addEventListener('click', async () => {
  const name = document.getElementById('team-name').value.trim();
  const email = document.getElementById('team-email').value.trim();
  const role = document.getElementById('team-role').value;
  const msg = document.getElementById('team-msg');
  msg.style.color = '';
  if (!name || !email) { msg.style.color = 'var(--red)'; msg.textContent = 'Name and email are required.'; return; }
  try {
    await api('/api/team', { method: 'POST', body: JSON.stringify({ name, email, role }) });
    document.getElementById('team-name').value = '';
    document.getElementById('team-email').value = '';
    msg.textContent = 'Added.';
    await loadTeam();
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = e.message;
  }
});

// ---------- SETTINGS: Integrations ----------
const INTEGRATIONS_META = {
  slack: { name: 'Slack', desc: 'Post pipeline updates to a channel.' },
  zapier: { name: 'Zapier', desc: 'Trigger zaps on new leads and placements.' },
  sheets: { name: 'Google Sheets', desc: 'Sync your pipeline to a spreadsheet.' }
};
function renderIntegrations(integrations) {
  integrations = integrations || { slack: false, zapier: false, sheets: false };
  const grid = document.getElementById('integrations-grid');
  grid.innerHTML = Object.keys(INTEGRATIONS_META).map(key => {
    const meta = INTEGRATIONS_META[key];
    const on = !!integrations[key];
    return `
      <div class="card">
        <h3>${meta.name}</h3>
        <p style="font-size:12.5px; color:var(--text-mid); margin-bottom:14px;">${meta.desc}</p>
        <button class="btn-sm integ-toggle" data-key="${key}" style="${on ? 'background:rgba(79,216,196,0.15); color:var(--teal); border-color:rgba(79,216,196,0.35);' : ''}">
          ${on ? 'Connected \u2013 click to disconnect' : 'Connect'}
        </button>
      </div>`;
  }).join('');
  grid.querySelectorAll('.integ-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { integrations: updated } = await api('/api/integrations/' + btn.dataset.key + '/toggle', { method: 'POST' });
      renderIntegrations(updated);
    });
  });
}

// ---------- SETTINGS: API key and Webhook ----------
document.getElementById('apikey-copy-btn').addEventListener('click', () => {
  const val = document.getElementById('apikey-value').value;
  if (!val || val.startsWith('Click')) return;
  navigator.clipboard.writeText(val);
  const btn = document.getElementById('apikey-copy-btn');
  const old = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => btn.textContent = old, 1200);
});
document.getElementById('apikey-regen-btn').addEventListener('click', async () => {
  const { apiToken } = await api('/api/api-key/regenerate', { method: 'POST' });
  document.getElementById('apikey-value').value = apiToken;
});
document.getElementById('webhook-save-btn').addEventListener('click', async () => {
  const url = document.getElementById('webhook-url').value.trim();
  const msg = document.getElementById('webhook-msg');
  msg.style.color = '';
  try {
    await api('/api/webhook', { method: 'POST', body: JSON.stringify({ webhookUrl: url }) });
    msg.textContent = url ? 'Saved. Move a lead to "Live" in the CRM to test it.' : 'Cleared.';
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = e.message;
  }
});

// ---------- SEO CENTER ----------
document.querySelectorAll('.tool-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.dataset.tool === 'schema') openSchemaGenerator();
    if (card.dataset.tool === 'imageseo') openImageSeo();
    if (card.dataset.tool === 'sitemap') openSitemapTool();
  });
});

function openSchemaGenerator() {
  openModal(`
    <div class="modal-head"><h2>Schema Generator</h2><div class="modal-close" onclick="closeModal()">&#10005;</div></div>
    <div class="field-sm"><label>Schema type</label>
      <select id="sch-type">
        <option value="Organization">Organization</option>
        <option value="Article">Article</option>
        <option value="LocalBusiness">Local Business</option>
        <option value="Product">Product</option>
        <option value="FAQPage">FAQ Page</option>
      </select>
    </div>
    <div id="sch-fields"></div>
    <button class="btn-primary" style="width:100%; margin-top:6px;" id="sch-generate-btn">Generate markup</button>
    <div id="sch-output" style="display:none; margin-top:14px;">
      <textarea id="sch-output-text" readonly style="width:100%; height:180px; font-family:'JetBrains Mono',monospace; font-size:11.5px; background:var(--bg-deep); border:1px solid var(--panel-border); border-radius:8px; color:var(--text-hi); padding:10px;"></textarea>
      <button class="btn-sm" id="sch-copy-btn" style="margin-top:8px;">Copy markup</button>
    </div>
  `);

  const fieldsByType = {
    Organization: [['name', 'Organization name'], ['url', 'Website URL'], ['logo', 'Logo URL']],
    Article: [['headline', 'Headline'], ['author', 'Author name'], ['datePublished', 'Date published (YYYY-MM-DD)'], ['image', 'Image URL']],
    LocalBusiness: [['name', 'Business name'], ['address', 'Street address'], ['telephone', 'Phone number'], ['url', 'Website URL']],
    Product: [['name', 'Product name'], ['description', 'Short description'], ['price', 'Price (e.g. 49.00)'], ['currency', 'Currency (e.g. USD)']],
    FAQPage: [['q1', 'Question 1'], ['a1', 'Answer 1'], ['q2', 'Question 2 (optional)'], ['a2', 'Answer 2 (optional)']]
  };
  function renderFields() {
    const type = document.getElementById('sch-type').value;
    document.getElementById('sch-fields').innerHTML = fieldsByType[type].map(([id, label]) =>
      `<div class="field-sm"><label>${label}</label><input id="sch-${id}"></div>`).join('');
  }
  document.getElementById('sch-type').addEventListener('change', renderFields);
  renderFields();

  document.getElementById('sch-generate-btn').addEventListener('click', () => {
    const type = document.getElementById('sch-type').value;
    const get = id => (document.getElementById('sch-' + id)?.value || '').trim();
    let json;
    if (type === 'Organization') {
      json = { '@context': 'https://schema.org', '@type': 'Organization', name: get('name'), url: get('url'), logo: get('logo') };
    } else if (type === 'Article') {
      json = { '@context': 'https://schema.org', '@type': 'Article', headline: get('headline'), author: { '@type': 'Person', name: get('author') }, datePublished: get('datePublished'), image: get('image') };
    } else if (type === 'LocalBusiness') {
      json = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: get('name'), address: get('address'), telephone: get('telephone'), url: get('url') };
    } else if (type === 'Product') {
      json = { '@context': 'https://schema.org', '@type': 'Product', name: get('name'), description: get('description'), offers: { '@type': 'Offer', price: get('price'), priceCurrency: get('currency') } };
    } else if (type === 'FAQPage') {
      const items = [[get('q1'), get('a1')], [get('q2'), get('a2')]].filter(([q, a]) => q && a);
      json = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
    }
    const markup = `<script type="application/ld+json">\n${JSON.stringify(json, null, 2)}\n<\/script>`;
    document.getElementById('sch-output-text').value = markup;
    document.getElementById('sch-output').style.display = 'block';
  });

  document.getElementById('sch-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('sch-output-text').value);
    const btn = document.getElementById('sch-copy-btn');
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = old, 1200);
  });
}

function openImageSeo() {
  openModal(`
    <div class="modal-head"><h2>Image SEO</h2><div class="modal-close" onclick="closeModal()">&#10005;</div></div>
    <div class="form-note" style="margin-bottom:12px;">Runs fully in your browser. Nothing is uploaded anywhere.</div>
    <input type="file" id="imgseo-file" accept="image/*" style="margin-bottom:14px;">
    <div id="imgseo-results"></div>
  `);
  document.getElementById('imgseo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const issues = [];
      const suggestedAlt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\b\w/g, c => c.toUpperCase());
      if (/^(img|image|dsc|photo)[-_]?\d+$/i.test(file.name.replace(/\.[^/.]+$/, ''))) {
        issues.push('Filename is generic (like a camera default). Rename it to something descriptive before publishing, e.g. "' + suggestedAlt.toLowerCase().replace(/\s+/g, '-') + '.jpg".');
      }
      if (file.size > 300 * 1024) {
        issues.push(`File is ${(file.size / 1024).toFixed(0)}KB. Large images slow page load, which hurts SEO. Aim for under 200-300KB (compress with a tool like Squoosh or TinyPNG).`);
      }
      if (img.width > 2000 || img.height > 2000) {
        issues.push(`Dimensions are ${img.width}x${img.height}px. Unless this is a hero banner, resize closer to the display size to save bandwidth.`);
      }
      if (!['image/jpeg', 'image/webp', 'image/avif'].includes(file.type)) {
        issues.push(`Format is ${file.type || 'unknown'}. For photos, WebP or JPEG usually compress better than PNG for the same visual quality.`);
      }
      document.getElementById('imgseo-results').innerHTML = `
        <div class="card" style="margin-top:6px;">
          <img src="${url}" style="max-width:100%; max-height:160px; border-radius:8px; margin-bottom:12px;">
          <div class="field-sm"><label>Suggested alt text</label><input id="imgseo-alt" value="${escapeHtml(suggestedAlt)}"></div>
          <div style="font-size:11.5px; color:var(--text-low); margin-bottom:6px;">${img.width}x${img.height}px &middot; ${(file.size / 1024).toFixed(0)}KB &middot; ${file.type || 'unknown type'}</div>
          ${issues.length ? '<div class="studio-list">' + issues.map(i => `<div class="li" style="color:var(--amber);">${escapeHtml(i)}</div>`).join('') + '</div>' : '<div class="form-note" style="color:var(--teal);">No obvious SEO issues found.</div>'}
        </div>`;
    };
    img.src = url;
  });
}

function openSitemapTool() {
  openModal(`
    <div class="modal-head"><h2>Sitemap and Robots</h2><div class="modal-close" onclick="closeModal()">&#10005;</div></div>
    <div class="field-sm"><label>Site URL</label><input id="sm-domain" placeholder="https://example.com"></div>
    <div class="field-sm"><label>Page paths (one per line)</label><textarea id="sm-paths" rows="5" placeholder="/
/pricing
/blog/guest-posting-guide"></textarea></div>
    <button class="btn-primary" style="width:100%;" id="sm-generate-btn">Generate</button>
    <div id="sm-output" style="display:none; margin-top:14px;"></div>
  `);
  document.getElementById('sm-generate-btn').addEventListener('click', () => {
    const domain = document.getElementById('sm-domain').value.trim().replace(/\/$/, '');
    const paths = document.getElementById('sm-paths').value.split('\n').map(p => p.trim()).filter(Boolean);
    if (!domain || !paths.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      paths.map(p => `  <url>\n    <loc>${domain}${p.startsWith('/') ? p : '/' + p}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join('\n') +
      `\n</urlset>`;
    const robots = `User-agent: *\nAllow: /\n\nSitemap: ${domain}/sitemap.xml`;
    document.getElementById('sm-output').style.display = 'block';
    document.getElementById('sm-output').innerHTML = `
      <div class="field-sm"><label>sitemap.xml</label><textarea readonly style="height:140px; font-family:'JetBrains Mono',monospace; font-size:11px;">${escapeHtml(sitemap)}</textarea></div>
      <button class="btn-sm sm-copy" data-target="sitemap" style="margin-bottom:14px;">Copy sitemap.xml</button>
      <div class="field-sm"><label>robots.txt</label><textarea readonly style="height:70px; font-family:'JetBrains Mono',monospace; font-size:11px;">${escapeHtml(robots)}</textarea></div>
      <button class="btn-sm sm-copy" data-target="robots">Copy robots.txt</button>
    `;
    document.querySelectorAll('.sm-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.target === 'sitemap' ? sitemap : robots;
        navigator.clipboard.writeText(text);
        const old = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => btn.textContent = old, 1200);
      });
    });
  });
}

// ---------- Boot ----------
checkSession();
