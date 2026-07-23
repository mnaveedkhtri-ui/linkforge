import { db, save } from './db.js';

const niches = ['SaaS & Tech', 'Finance', 'Health', 'Marketing', 'E-commerce', 'Productivity'];

const names = [
  ['TechDaily', 'techdaily.io'], ['Growth Weekly', 'growthweekly.com'],
  ['SaaS Insider', 'saasinsider.co'], ['MarketMinds', 'marketminds.io'],
  ['The Startup Ledger', 'startupledger.com'], ['FinTech Pulse', 'fintechpulse.net'],
  ['Wealth Signals', 'wealthsignals.co'], ['Healthline Voices', 'healthlinevoices.com'],
  ['Wellness Weekly', 'wellnessweekly.co'], ['The Marketing Loop', 'themarketingloop.com'],
  ['Conversion Notes', 'conversionnotes.io'], ['Shopify Circle', 'shopifycircle.com'],
  ['Retail Rewired', 'retailrewired.com'], ['Founder Notes', 'foundernotes.co'],
  ['B2B Growth Lab', 'b2bgrowthlab.com'], ['Remote Work Digest', 'remoteworkdigest.com'],
  ['Ops Weekly', 'opsweekly.io'], ['DevTools Review', 'devtoolsreview.com'],
  ['Cloud Native News', 'cloudnativenews.io'], ['Indie Hackers Corner', 'indiehackerscorner.com'],
  ['Content Compass', 'contentcompass.co'], ['Data Driven Digest', 'datadrivendigest.com'],
  ['UX Notes', 'uxnotes.io'], ['Bootstrap Weekly', 'bootstrapweekly.com']
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const publishers = names.map(([name, domain], i) => {
  const dr = rand(35, 82);
  const traffic = rand(4, 480) * 1000;
  const price = rand(80, 650);
  return {
    id: i + 1,
    name,
    domain,
    niche: pick(niches),
    dr,
    monthlyTraffic: traffic,
    replyRateEstimate: rand(15, 55),
    price,
    turnaroundDays: rand(3, 14),
    verified: dr > 50 && traffic > 20000
  };
});

db.data.publishers = publishers;
await save();
console.log(`Seeded ${publishers.length} publishers.`);
