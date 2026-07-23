# LinkForge

A real, working link-building tool: signup and login, a CRM pipeline you can drag leads through, a publisher list, and an AI copilot and content generator that actually calls Groq (Llama 3.3). No fake demo data driving the features, everything is stored in a real database file and updates live.

## What's real here

- Public landing page: SEO-optimized marketing homepage at `/` — meta tags, Open Graph/Twitter cards, JSON-LD (SoftwareApplication + FAQ) structured data, semantic HTML, `robots.txt`, and `sitemap.xml`
- Accounts: signup and login with hashed passwords and real sessions, now served at `/app` (kept out of search results — it's your private dashboard, not marketing content)
- CRM pipeline: leads are stored per user, drag and drop between stages saves to the database
- Publisher marketplace: seeded sample list you can filter and add to your pipeline
- AI Copilot chat: calls the Groq API for real answers about your pipeline
- Content Studio: generates a real guest post draft with Groq, and can rewrite it in a more natural voice
- Campaigns: real records tied to your leads

## Before you deploy: replace the placeholder domain

The landing page (`public/index.html`), `public/robots.txt`, and `public/sitemap.xml` all reference a placeholder domain: `https://www.linkforge-example.com`. Find-and-replace every instance of that string with your real domain once you have one, or search engines will index the wrong canonical URL. The same file also links out to `/assets/og-image.png` (already generated) for social share previews — swap it for a real product screenshot whenever you have one.

## What's not wired up yet

- Sending actual outreach emails isn't built in. The copilot can draft the text, but you'd send it yourself or wire up an email API.

## What was removed

Competitor Guest Post Finder, Expired Opportunities, and most of the SEO Center (Keyword Research, Backlink Gap, Technical Audit, Rank Tracking, Content Gap) needed a live backlink/keyword data provider (Ahrefs, Moz, SE Ranking, etc.) to show real results, and none is connected in this build — so those pages were taken out rather than leaving disabled placeholders in the nav. SEO Center now only shows the tools that run fully locally: Schema Generator, Image SEO, and Sitemap/Robots.

If you later get API access to a backlink data provider, those features can be added back as real, working tools rather than stubs.

## Requirements

- Node.js 18 or newer
- A free Groq API key if you want the AI Copilot and Content Studio to work (get one at console.groq.com/keys, no credit card needed)

## Run it locally

```bash
npm install
cp .env.example .env
```

Open `.env` and paste in your `GROQ_API_KEY`, and change `SESSION_SECRET` to any random string.

```bash
npm run seed   # only needed once, fills the publisher marketplace with sample data
npm start
```

Open `http://localhost:3000`, create an account, and you're in.

## How the data is stored

This uses a single JSON file at `data/db.json` as the database, no separate database server to install. It's fine for one workspace or a small team. If you outgrow it later, swap `db.js` for a real database (Postgres, MySQL, whatever you prefer) — the rest of the app talks to `db.js` through a few simple functions, so the change stays contained.

## Deploying it live

Since you're handling hosting, here's the short version for a few common options.

**Render, Railway, or any Node host**
1. Push this folder to a GitHub repo.
2. Create a new Node web service pointing at that repo.
3. Set the start command to `npm start`.
4. Add environment variables `GROQ_API_KEY` and `SESSION_SECRET` in the host's dashboard.
5. Deploy. Your app will be live at whatever URL the host gives you.

**A plain VPS (DigitalOcean, Hetzner, etc.)**
1. Install Node 18+ on the server.
2. Copy this folder over (or `git clone` your repo).
3. Run `npm install`, create `.env` with your real values.
4. Run the app with a process manager so it stays up, for example `npx pm2 start server.js --name linkforge`.
5. Put Nginx or Caddy in front of it for HTTPS and your domain.

One thing to know: `data/db.json` lives on that server's disk. If your host wipes the filesystem on redeploy (some free tiers do), your data disappears with it. For anything you care about long-term, either use a host with persistent disk or move to a real database.

## Project structure

```
server.js       the whole backend: auth, campaigns, leads, publishers, AI endpoints
db.js           tiny database wrapper (JSON file based)
seed.js         fills the publisher marketplace with sample data
public/
  index.html    public SEO landing page (served at /)
  app.html      the logged-in dashboard shell (served at /app, noindex)
  app.js        dashboard frontend logic
  robots.txt    allows the landing page, blocks /app and /api from search engines
  sitemap.xml   lists the landing page for search engines
  favicon.svg   brand mark used across both pages
  assets/og-image.png   social share preview image
data/db.json    where your data actually lives
```

## Security note before you make this public

The session secret in `.env.example` is a placeholder. Change it to a long random string before deploying anywhere real people will use, and never commit your real `.env` file.
