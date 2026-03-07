// ===================== NSE HOLIDAY CALENDAR 2025-2030 =====================
// Source: NSE official circulars. Update yearly from nseindia.com/resources/exchange-communication-holidays

// =====================================================================
//  NSE HOLIDAY CALENDAR 2025–2030
// =====================================================================
const NSE_HOLIDAYS = new Set([
  // 2025 — Source: NSE Circular NSE/CMTR/65587 dated Dec 13, 2024
  '20250226', // Mahashivratri
  '20250314', // Holi
  '20250331', // Id-Ul-Fitr (Ramadan Eid)
  '20250410', // Shri Mahavir Jayanti
  '20250414', // Dr. Baba Saheb Ambedkar Jayanti
  '20250418', // Good Friday
  '20250501', // Maharashtra Day
  '20250815', // Independence Day
  '20250827', // Ganesh Chaturthi
  '20251002', // Mahatma Gandhi Jayanti / Dussehra
  '20251021', // Diwali Laxmi Pujan
  '20251022', // Diwali Balipratipada
  '20251105', // Prakash Gurpurb Sri Guru Nanak Dev
  '20251225', // Christmas
  // 2026 — Source: NSE official holiday page (nseindia.com/resources/exchange-communication-holidays)
  // Weekend holidays skipped (Mahashivratri Feb15-Sun, Id-Ul-Fitr Mar21-Sat, Independence Day Aug15-Sat, Diwali Laxmi Pujan Nov8-Sun)
  '20260115', // Municipal Corporation Election - Maharashtra
  '20260126', // Republic Day
  '20260303', // Holi
  '20260326', // Shri Ram Navami
  '20260331', // Shri Mahavir Jayanti
  '20260403', // Good Friday
  '20260414', // Dr. Baba Saheb Ambedkar Jayanti
  '20260501', // Maharashtra Day
  '20260528', // Bakri Id
  '20260626', // Muharram
  '20260914', // Ganesh Chaturthi
  '20261002', // Mahatma Gandhi Jayanti
  '20261020', // Dussehra
  '20261110', // Diwali Balipratipada
  '20261124', // Prakash Gurpurb Sri Guru Nanak Dev
  '20261225', // Christmas
  // 2027
  '20270126','20270319','20270329','20270330','20270414','20270501',
  '20270815','20271002','20271028','20271112','20271225',
  // 2028
  '20280126','20280307','20280417','20280501','20280815','20281002',
  '20281016','20281031','20281225',
  // 2029
  '20290126','20290226','20290402','20290501','20290815','20291002','20291225',
  // 2030
  '20300126','20300322','20300501','20300815','20301002','20301225',
]);

function isNSETradingDay(ds) {
  const y=+ds.slice(0,4),m=+ds.slice(4,6)-1,d=+ds.slice(6,8);
  const dow = new Date(y,m,d).getDay();
  return dow !== 0 && dow !== 6 && !NSE_HOLIDAYS.has(ds);
}

function getExpectedTradingDays(fromDS, toDS) {
  const res = [];
  let cur = new Date(+fromDS.slice(0,4), +fromDS.slice(4,6)-1, +fromDS.slice(6,8));
  const end = new Date(+toDS.slice(0,4), +toDS.slice(4,6)-1, +toDS.slice(6,8));
  while (cur <= end) {
    const ds = cur.getFullYear().toString()
      + String(cur.getMonth()+1).padStart(2,'0')
      + String(cur.getDate()).padStart(2,'0');
    if (isNSETradingDay(ds)) res.push(ds);
    cur.setDate(cur.getDate()+1);
  }
  return res;
}
