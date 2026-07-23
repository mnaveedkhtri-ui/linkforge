import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, nextId, save } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// The dashboard is a private, logged-in app shell — served at /app, kept out of search results.
app.get(['/app', '/app/*splat'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  next();
}

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, company: u.company, createdAt: u.createdAt,
    integrations: u.integrations || { slack: false, zapier: false, sheets: false },
    apiToken: u.apiToken || null,
    webhookUrl: u.webhookUrl || ''
  };
}

function generateToken() {
  return 'lf_' + Array.from({ length: 32 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');
}

// Fire a webhook without blocking the request that triggered it.
function fireWebhook(user, event, payload) {
  if (!user.webhookUrl) return;
  fetch(user.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, payload, sentAt: new Date().toISOString() })
  }).catch(() => {}); // best-effort, don't break the main request if the webhook URL is down
}

// ---------- AUTH ----------
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, company } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password should be at least 6 characters' });

  const existing = db.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: nextId('users'),
    name, email, company: company || '',
    passwordHash,
    createdAt: new Date().toISOString()
  };
  db.data.users.push(user);
  await save();

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.data.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.data.users.find(u => u.id === req.session.userId);
  res.json({ user: user ? publicUser(user) : null });
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const user = db.data.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { name, company } = req.body || {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    user.name = name.trim();
  }
  if (company !== undefined) user.company = company.trim();
  await save();
  res.json({ user: publicUser(user) });
});

// ---------- TEAM AND ROLES ----------
app.get('/api/team', requireAuth, (req, res) => {
  const team = db.data.teamMembers.filter(t => t.userId === req.session.userId);
  res.json({ team });
});

app.post('/api/team', requireAuth, async (req, res) => {
  const { name, email, role } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  const member = {
    id: nextId('teamMembers'),
    userId: req.session.userId,
    name, email, role: role || 'Member',
    createdAt: new Date().toISOString()
  };
  db.data.teamMembers.push(member);
  await save();
  res.json({ member });
});

app.delete('/api/team/:id', requireAuth, async (req, res) => {
  const idx = db.data.teamMembers.findIndex(t => t.id === Number(req.params.id) && t.userId === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Team member not found' });
  db.data.teamMembers.splice(idx, 1);
  await save();
  res.json({ ok: true });
});

// ---------- INTEGRATIONS ----------
const INTEGRATION_KEYS = ['slack', 'zapier', 'sheets'];

app.post('/api/integrations/:key/toggle', requireAuth, async (req, res) => {
  const { key } = req.params;
  if (!INTEGRATION_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown integration' });
  const user = db.data.users.find(u => u.id === req.session.userId);
  if (!user.integrations) user.integrations = { slack: false, zapier: false, sheets: false };
  user.integrations[key] = !user.integrations[key];
  await save();
  res.json({ integrations: user.integrations });
});

// ---------- API KEY AND WEBHOOKS ----------
app.post('/api/api-key/regenerate', requireAuth, async (req, res) => {
  const user = db.data.users.find(u => u.id === req.session.userId);
  user.apiToken = generateToken();
  await save();
  res.json({ apiToken: user.apiToken });
});

app.post('/api/webhook', requireAuth, async (req, res) => {
  const user = db.data.users.find(u => u.id === req.session.userId);
  const { webhookUrl } = req.body || {};
  user.webhookUrl = (webhookUrl || '').trim();
  await save();
  res.json({ webhookUrl: user.webhookUrl });
});

// ---------- PUBLISHERS ----------
app.get('/api/publishers', requireAuth, (req, res) => {
  const { niche, minDr, verifiedOnly } = req.query;
  let list = db.data.publishers;
  if (niche && niche !== 'All niches') list = list.filter(p => p.niche === niche);
  if (minDr) list = list.filter(p => p.dr >= Number(minDr));
  if (verifiedOnly === 'true') list = list.filter(p => p.verified);
  res.json({ publishers: list });
});

// ---------- CAMPAIGNS ----------
app.get('/api/campaigns', requireAuth, (req, res) => {
  const campaigns = db.data.campaigns.filter(c => c.userId === req.session.userId);
  res.json({ campaigns });
});

app.post('/api/campaigns', requireAuth, async (req, res) => {
  const { name, niche, targetDr } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Campaign name is required' });
  const campaign = {
    id: nextId('campaigns'),
    userId: req.session.userId,
    name, niche: niche || '', targetDr: targetDr || 40,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  db.data.campaigns.push(campaign);
  await save();
  res.json({ campaign });
});

// ---------- LEADS / CRM ----------
const STAGES = ['Prospect', 'Contacted', 'Negotiating', 'Placed', 'Live'];

app.get('/api/leads', requireAuth, (req, res) => {
  const leads = db.data.leads.filter(l => l.userId === req.session.userId);
  res.json({ leads, stages: STAGES });
});

app.post('/api/leads', requireAuth, async (req, res) => {
  const { name, domain, dr, campaignId } = req.body || {};
  if (!name || !domain) return res.status(400).json({ error: 'Publisher name and domain are required' });
  const lead = {
    id: nextId('leads'),
    userId: req.session.userId,
    campaignId: campaignId || null,
    name, domain, dr: dr || 40,
    stage: 0,
    createdAt: new Date().toISOString()
  };
  db.data.leads.push(lead);
  await save();
  res.json({ lead });
});

app.patch('/api/leads/:id/stage', requireAuth, async (req, res) => {
  const lead = db.data.leads.find(l => l.id === Number(req.params.id) && l.userId === req.session.userId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { stage } = req.body || {};
  if (stage < 0 || stage >= STAGES.length) return res.status(400).json({ error: 'Invalid stage' });
  const wasLive = STAGES[lead.stage] === 'Live';
  lead.stage = stage;
  await save();
  if (!wasLive && STAGES[stage] === 'Live') {
    const user = db.data.users.find(u => u.id === req.session.userId);
    fireWebhook(user, 'lead.live', { id: lead.id, name: lead.name, domain: lead.domain, dr: lead.dr });
  }
  res.json({ lead });
});

app.delete('/api/leads/:id', requireAuth, async (req, res) => {
  const idx = db.data.leads.findIndex(l => l.id === Number(req.params.id) && l.userId === req.session.userId);
  if (idx === -1) return res.status(404).json({ error: 'Lead not found' });
  db.data.leads.splice(idx, 1);
  await save();
  res.json({ ok: true });
});

// ---------- AI: content generation (real Groq API call) ----------
async function callClaude(messages, system, maxTokens = 1500) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set on the server. Add it to your .env file.');
  }
  // Groq uses the OpenAI-compatible chat completions format.
  const chatMessages = [{ role: 'system', content: system }, ...messages];

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: chatMessages
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Groq API error (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  return stripEmDashes(raw);
}

// Safety net: the model doesn't always follow the "no em dashes" instruction perfectly,
// so we clean up any that slip through rather than relying on the prompt alone.
function stripEmDashes(text) {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, (match) => {
      // If it was written tight against words with no spaces (word—word), treat it like a comma.
      // If it already had spaces around it (word — word), also read naturally as a comma pause.
      return ', ';
    })
    .replace(/,\s*,/g, ',')       // collapse any double commas created by the replacement
    .replace(/,\s*\./g, '.')      // don't leave a comma right before a period
    .replace(/[ \t]+/g, ' ');     // tidy up any double spaces left behind
}

app.post('/api/content/generate', requireAuth, async (req, res) => {
  const { keyword, tone, wordTarget } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'Target keyword or topic is required' });

  const target = Number(wordTarget) || 700;

  const system = `You write SEO-optimized guest post articles for a link building agency's clients. Write the way a skilled human freelance writer actually writes, not the way an AI model defaults to writing. Concretely: use periods and commas for pacing, never em dashes or en dashes. Never use "furthermore", "moreover", "in today's fast-paced world", "unlock", "delve", "landscape", "in conclusion", "it's important to note", or "in essence". Do not start consecutive sentences or paragraphs the same way. Mix short punchy sentences with longer ones. Use contractions naturally (it's, don't, you're). Get specific: name real-sounding numbers, tools, or scenarios instead of vague generalities. Write complete, usable content, not an outline. Hitting the requested word count is critical: undershooting or overshooting by more than 10% is a failure, so plan section lengths before writing and expand with concrete examples, data points, or specifics rather than filler if you're running short.`;

  const prompt = `Write a guest post article about "${keyword}". Tone: ${tone || 'professional but conversational'}. Target length: exactly around ${target} words (acceptable range: ${Math.round(target * 0.9)}-${Math.round(target * 1.1)} words) — this is a hard requirement, count as you go. Structure it as SEO-friendly markdown:
- Start with a single "# " title line (include the main keyword naturally).
- Break the body into 4 to 6 sections, each starting with a "## " subheading (use descriptive, keyword-relevant subheadings, not generic labels like "Introduction" or "Conclusion").
- Write full paragraphs under each subheading, not bullet points, unless a short list genuinely fits.
- End with a short closing section under its own "## " subheading.
Return only the markdown (# and ## for headings), no other markdown formatting like ** or bullets unless a list is truly needed.`;

  try {
    const maxTokens = Math.min(4000, Math.max(2000, Math.round(target * 2.2)));
    const text = await callClaude([{ role: 'user', content: prompt }], system, maxTokens);
    const draft = {
      id: nextId('contentDrafts'),
      userId: req.session.userId,
      keyword, tone: tone || 'professional but conversational',
      body: text,
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
      createdAt: new Date().toISOString()
    };
    db.data.contentDrafts.push(draft);
    await save();
    res.json({ draft });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/content/humanize', requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const system = `You rewrite text so it reads like a skilled human freelance writer wrote it, not an AI model. Replace every em dash or en dash with a period or comma, whichever fits the sentence better. Remove generic AI phrasing like "furthermore", "moreover", "delve", "landscape", "in conclusion", "it's important to note", "in essence". Vary sentence rhythm: some short, some long, not a uniform pattern. Use contractions naturally. Keep the meaning and structure intact. If the text contains markdown headings (lines starting with "#" or "##"), keep those heading lines exactly as they are (same text, same position) and only rewrite the paragraph text under them. Keep the same approximate word count. Return only the rewritten text, no commentary.`;

  try {
    const rewritten = await callClaude([{ role: 'user', content: text }], system, 2000);
    res.json({ text: rewritten });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- AI: copilot chat ----------
app.get('/api/chat', requireAuth, (req, res) => {
  const messages = db.data.chatMessages.filter(m => m.userId === req.session.userId);
  res.json({ messages });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const userMsg = { id: nextId('chatMessages'), userId: req.session.userId, role: 'user', text: message, createdAt: new Date().toISOString() };
  db.data.chatMessages.push(userMsg);

  const history = db.data.chatMessages
    .filter(m => m.userId === req.session.userId)
    .slice(-10)
    .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));

  const userLeads = db.data.leads.filter(l => l.userId === req.session.userId);
  const userCampaigns = db.data.campaigns.filter(c => c.userId === req.session.userId);

  const system = `You are the AI copilot inside LinkForge, a link building and guest posting tool. Speak plainly and directly, like a sharp colleague, not a marketing brochure. No em dashes. No generic AI phrases. Keep replies under 120 words unless the user asks for something long. You can see the user's current pipeline: ${userLeads.length} leads across stages, ${userCampaigns.length} campaigns. Give specific, practical help about link building, outreach, and SEO. You cannot actually send emails or browse the web, so if the user asks for that, say so plainly and suggest what you can do instead.`;

  try {
    const reply = await callClaude(history, system, 600);
    const aiMsg = { id: nextId('chatMessages'), userId: req.session.userId, role: 'ai', text: reply, createdAt: new Date().toISOString() };
    db.data.chatMessages.push(aiMsg);
    await save();
    res.json({ reply: aiMsg });
  } catch (err) {
    await save();
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`LinkForge server running on http://localhost:${PORT}`);
  if (!GROQ_API_KEY) {
    console.log('Warning: GROQ_API_KEY is not set. AI features will not work until you add it to .env');
  }
});
