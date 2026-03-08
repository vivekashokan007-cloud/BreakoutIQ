// ===================== CONFIG & STATE =====================
// Global constants, state variables, and shared utility functions

// ===================== NSE DATA UPLOAD & ANALYSIS =====================
const NSE_STORAGE_KEY  = 'breakoutiq_nse_data';   // kept for migration only
const NSE_NAMES_KEY    = 'breakoutiq_nse_names';
const NSE_SAVEDAT_KEY  = 'breakoutiq_nse_savedat';

// ===================== AUXILIARY DATA (Phase 2 + 4) =====================
const DELIVERY_KEY     = 'breakoutiq_delivery';   // { SYM: deliveryPct }
const ASM_KEY          = 'breakoutiq_asm';        // JSON array of ASM/GSM symbols
const W52_KEY          = 'breakoutiq_52w';        // { SYM: { high52, low52 } }

// ===================== MARKET HEALTH (Phase 3) =====================
const MARKET_HEALTH_KEY = 'breakoutiq_market_health';

// marketHealth: merged state — manual inputs + auto-computed breadth
// Manual: saved by user each Saturday from Upstox / NSE website
// Auto:   computed from Bhavcopy data on every scan
let marketHealth = {
  // — Manual (user-entered) —
  niftyClose : null,   // NIFTY 50 weekly close (number)
  indiaVix   : null,   // India VIX reading (number)
  fiiFlow    : null,   // FII net flow ₹Cr (positive = buying, negative = selling)
  // — Auto-computed on every scan —
  adRatio       : null, // advance / decline ratio (today)
  pctAboveMA20  : null, // % of EQ stocks above MA20
  pctAboveMA50  : null, // % of EQ stocks above MA50
  rollingWR     : null, // % of last 20 days with A/D > 1 (market quality proxy)
  lastComputedDate : null
};

// Delivery data: loaded from CM Security-wise Delivery Positions file
// { 'RELIANCE': 64.2, 'INFY': 38.1, ... }
let deliveryData = {};

// ASM/GSM symbols: stocks under SEBI enhanced surveillance — excluded from all scans
// Loaded from NSE ASM/GSM list file
let asmSymbols = new Set();

// 52-week high/low: official NSE-adjusted values (split/bonus-adjusted, more accurate than DIY)
// { 'RELIANCE': { high52: 3217.90, low52: 2220.35 }, ... }
let w52Data = {};

// ===================== DATA & STATE =====================
let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
let trades = JSON.parse(localStorage.getItem('trades') || '[]');
let scanResults = [];

// Stock database (NSE stocks with realistic data)
const STOCKS = [
  { sym:'RELIANCE', name:'Reliance Industries', sector:'Energy', cap:'Large', basePrice:2840, basePE:28 },
  { sym:'TCS', name:'Tata Consultancy Services', sector:'IT', cap:'Large', basePrice:3920, basePE:30 },
  { sym:'HDFCBANK', name:'HDFC Bank', sector:'Banking', cap:'Large', basePrice:1580, basePE:20 },
  { sym:'INFY', name:'Infosys', sector:'IT', cap:'Large', basePrice:1720, basePE:26 },
  { sym:'BHARTIARTL', name:'Bharti Airtel', sector:'Telecom', cap:'Large', basePrice:1340, basePE:50 },
  { sym:'WIPRO', name:'Wipro Limited', sector:'IT', cap:'Large', basePrice:480, basePE:22 },
  { sym:'SUNPHARMA', name:'Sun Pharmaceutical', sector:'Pharma', cap:'Large', basePrice:1650, basePE:35 },
  { sym:'DRREDDY', name:'Dr. Reddy\'s Laboratories', sector:'Pharma', cap:'Large', basePrice:5800, basePE:25 },
  { sym:'HCLTECH', name:'HCL Technologies', sector:'IT', cap:'Large', basePrice:1640, basePE:28 },
  { sym:'TATAMOTORS', name:'Tata Motors', sector:'Auto', cap:'Large', basePrice:920, basePE:12 },
  { sym:'LTIM', name:'LTIMindtree', sector:'IT', cap:'Mid', basePrice:5200, basePE:32 },
  { sym:'BEL', name:'Bharat Electronics', sector:'Defence', cap:'Mid', basePrice:280, basePE:38 },
  { sym:'HAL', name:'Hindustan Aeronautics', sector:'Defence', cap:'Large', basePrice:3800, basePE:30 },
  { sym:'BHEL', name:'Bharat Heavy Electricals', sector:'CAPGOODS', cap:'Large', basePrice:280, basePE:60 },
  { sym:'ABB', name:'ABB India', sector:'CAPGOODS', cap:'Large', basePrice:7200, basePE:75 },
  { sym:'SIEMENS', name:'Siemens India', sector:'CAPGOODS', cap:'Large', basePrice:6500, basePE:70 },
  { sym:'LTTS', name:'L&T Technology Services', sector:'IT', cap:'Mid', basePrice:4800, basePE:34 },
  { sym:'POLYCAB', name:'Polycab India', sector:'CAPGOODS', cap:'Mid', basePrice:5400, basePE:42 },
  { sym:'TORNTPHARM', name:'Torrent Pharmaceuticals', sector:'Pharma', cap:'Mid', basePrice:2800, basePE:38 },
  { sym:'AUROPHARMA', name:'Aurobindo Pharma', sector:'Pharma', cap:'Mid', basePrice:1150, basePE:18 },
  { sym:'PERSISTENT', name:'Persistent Systems', sector:'IT', cap:'Mid', basePrice:4600, basePE:55 },
  { sym:'KPITTECH', name:'KPIT Technologies', sector:'IT', cap:'Mid', basePrice:1450, basePE:60 },
  { sym:'ZOMATO', name:'Zomato', sector:'Consumer', cap:'Large', basePrice:220, basePE:200 },
  { sym:'NAUKRI', name:'Info Edge (Naukri)', sector:'IT', cap:'Mid', basePrice:6200, basePE:80 },
  { sym:'CAMS', name:'CAMS', sector:'Fintech', cap:'Mid', basePrice:2900, basePE:48 },
  { sym:'IRCTC', name:'IRCTC', sector:'Infra', cap:'Mid', basePrice:780, basePE:55 },
  { sym:'DIXON', name:'Dixon Technologies', sector:'Consumer Electronics', cap:'Mid', basePrice:12000, basePE:90 },
  { sym:'AMBER', name:'Amber Enterprises', sector:'Consumer Electronics', cap:'Mid', basePrice:3800, basePE:55 },
  { sym:'TRENT', name:'Trent Limited', sector:'Retail', cap:'Mid', basePrice:5200, basePE:150 },
  { sym:'DMART', name:'Avenue Supermarts', sector:'Retail', cap:'Large', basePrice:3800, basePE:80 },
];

function getRandFloat(min, max) { return Math.random() * (max - min) + min; }
function getRandInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateStockData(stock) {
  const priceVariance = getRandFloat(0.85, 1.15);
  const price = +(stock.basePrice * priceVariance).toFixed(2);
  const change = getRandFloat(-3, 4.5);
  const volRatio = getRandFloat(0.5, 3.5);
  const rsi = getRandFloat(30, 85);
  const atr = price * getRandFloat(0.015, 0.04);
  const consolidating = Math.random() > 0.4;
  const nearHigh = Math.random() > 0.45;
  const volumeBreakout = volRatio >= 1.5;

  // Breakout score based on Varsity criteria
  let score = 0;
  if (consolidating) score += 25;
  if (nearHigh) score += 15;
  if (volumeBreakout) score += 25;
  if (rsi >= 50 && rsi <= 75) score += 15;
  if (change > 0.5) score += 10;
  if (volRatio >= 2) score += 10;
  // Bug fix: only apply noise if base score > 0, and keep it additive-only to avoid inflating no-signal stocks
  if (score > 0) score = Math.min(score + getRandInt(-3, 8), 98);

  // Pattern detection
  const patterns = ['Bull Flag', 'Cup & Handle', 'Resistance Breakout', 'Volume Spike', 'Range Breakout', 'Pennant', '52W High Attempt'];
  const pattern = score >= 70 ? patterns[getRandInt(0,4)] : patterns[getRandInt(4,6)];

  const target1 = +(price * 1.06).toFixed(2);
  const target2 = +(price * 1.12).toFixed(2);
  const sl = +(price * (1 - getRandFloat(0.03, 0.06))).toFixed(2);
  // Bug fix: compute R:R directly with explicit numbers, not string division
  const riskPerShareRaw = price - sl;
  const rewardPerShareRaw = target1 - price;
  const rr = riskPerShareRaw > 0 ? (rewardPerShareRaw / riskPerShareRaw).toFixed(1) : '0';

  return { ...stock, price, change: +change.toFixed(2), volRatio: +volRatio.toFixed(2), rsi: +rsi.toFixed(1), atr: +atr.toFixed(2), score, pattern, target1, target2, sl, rr, consolidating, nearHigh, volumeBreakout };
}

// ---- Date formatter (YYYYMMDD → '01 Jan 2026') ----
function formatDateKey(key) {
  if (!key || key.startsWith('UNKNOWN')) return 'Unknown date';
  // key is YYYYMMDD
  const y = key.substring(0,4), m = key.substring(4,6), d = key.substring(6,8);
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[+m] || m} ${y}`;
}

function showNotif(title, msg, isError) {
  const n = document.getElementById('notification');
  document.getElementById('notif-title').textContent = title;
  document.getElementById('notif-msg').textContent = msg;
  n.style.borderColor = isError ? 'var(--danger)' : 'var(--accent2)';
  n.style.color = isError ? 'var(--danger)' : 'var(--accent2)';
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 3000);
}
