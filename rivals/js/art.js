// ============================================================
//  カードの絵
//  画像ファイルを持たないので、モンスターも人物も SVG で描く。
//  100x100 の座標系で描き、カードごとに「絵の種類」と「色」を割り当てる。
// ============================================================

// ---- よく使う部品 ----
const eyes = (x1, x2, y, r, pupil = '#17101a') => `
  <ellipse cx="${x1}" cy="${y}" rx="${r * 1.1}" ry="${r * 1.3}" fill="#fff"/>
  <ellipse cx="${x2}" cy="${y}" rx="${r * 1.1}" ry="${r * 1.3}" fill="#fff"/>
  <circle cx="${x1 + r * .1}" cy="${y + r * .1}" r="${r * .6}" fill="${pupil}"/>
  <circle cx="${x2 + r * .1}" cy="${y + r * .1}" r="${r * .6}" fill="${pupil}"/>
  <circle cx="${x1 - r * .25}" cy="${y - r * .4}" r="${r * .22}" fill="#fff"/>
  <circle cx="${x2 - r * .25}" cy="${y - r * .4}" r="${r * .22}" fill="#fff"/>`;
const smile = (cx, y, w, s = 2.6, col = '#17101a') =>
  `<path d="M${cx - w},${y} Q${cx},${y + w * .75} ${cx + w},${y}" fill="none" stroke="${col}" stroke-width="${s}" stroke-linecap="round"/>`;
const fang = (cx, y, w) =>
  `<path d="M${cx - w},${y} L${cx},${y + w * .9} L${cx + w},${y} Z" fill="#fff" stroke="#17101a" stroke-width="1.2" stroke-linejoin="round"/>`;
const sh = (c, d) => shade(c, d);
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * amt), g = cl(((n >> 8) & 255) * amt), b = cl((n & 255) * amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ============================================================
//  絵の種類
// ============================================================
export const DRAWERS = {};
const A = (k, fn) => { DRAWERS[k] = fn; };

A('slime', (c) => `
  <path d="M50 16 C52 26 60 36 71 45 C81 53 86 62 86 70 C86 80 71 87 50 87 C29 87 14 80 14 70 C14 62 19 53 29 45 C40 36 48 26 50 16 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M34 40 C28 48 25 56 25 63" stroke="${c.light}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>
  ${eyes(40, 60, 62, 5)}${smile(50, 73, 8)}`);

A('metalslime', (c) => `
  <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f2f6fa"/><stop offset=".45" stop-color="${c.main}"/><stop offset="1" stop-color="${sh(c.main,.55)}"/>
  </linearGradient></defs>
  <path d="M50 16 C52 26 60 36 71 45 C81 53 86 62 86 70 C86 80 71 87 50 87 C29 87 14 80 14 70 C14 62 19 53 29 45 C40 36 48 26 50 16 Z"
        fill="url(#mg)" stroke="${sh(c.main,.45)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M33 42 C27 50 24 58 25 64" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>
  ${eyes(40, 60, 62, 5)}${smile(50, 73, 8)}`);

A('bat', (c) => `
  <path d="M50 44 C36 30 18 30 8 40 C18 42 20 50 16 58 C28 58 40 54 50 48 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 44 C64 30 82 30 92 40 C82 42 80 50 84 58 C72 58 60 54 50 48 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M40 26 L44 40 L34 36 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M60 26 L56 40 L66 36 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="50" cy="60" rx="21" ry="19" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  ${eyes(43, 57, 57, 5)}${fang(50, 68, 4)}`);

A('eyeball', (c) => `
  <circle cx="50" cy="55" r="30" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <circle cx="50" cy="55" r="22" fill="#fff"/>
  <circle cx="52" cy="56" r="12" fill="${c.accent}"/>
  <circle cx="52" cy="56" r="6" fill="#17101a"/>
  <circle cx="47" cy="50" r="3.4" fill="#fff"/>
  <path d="M20 40 L32 47 M80 40 L68 47 M26 74 L36 67 M74 74 L64 67" stroke="${sh(c.main,.5)}" stroke-width="3" stroke-linecap="round"/>`);

A('mole', (c) => `
  <ellipse cx="50" cy="62" rx="26" ry="24" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <ellipse cx="50" cy="70" rx="15" ry="13" fill="${c.light}"/>
  <path d="M30 42 L24 26 L40 34 Z M70 42 L76 26 L60 34 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  ${eyes(42, 58, 56, 4.5)}
  <ellipse cx="50" cy="66" rx="4" ry="3" fill="#17101a"/>
  <g transform="rotate(-24 80 44)"><rect x="74" y="20" width="7" height="34" rx="2" fill="#7a5433" stroke="#43291a" stroke-width="1.6"/>
  <rect x="66" y="12" width="23" height="14" rx="3" fill="#9aa3ad" stroke="#4b5560" stroke-width="1.8"/></g>`);

A('panther', (c) => `
  <path d="M18 70 C18 54 30 44 50 44 C70 44 82 54 82 70 C82 80 70 84 50 84 C30 84 18 80 18 70 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <path d="M30 46 L24 28 L42 38 Z M70 46 L76 28 L58 38 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="50" cy="60" rx="24" ry="19" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  ${eyes(41, 59, 56, 5, '#2a0d0d')}
  <path d="M50 64 L46 69 L54 69 Z" fill="#17101a"/>${fang(44, 70, 3)}${fang(56, 70, 3)}
  <path d="M22 58 L10 55 M22 63 L10 64 M78 58 L90 55 M78 63 L90 64" stroke="#e8e0d0" stroke-width="1.8" stroke-linecap="round"/>`);

A('ghost', (c) => `
  <path d="M50 18 C68 18 78 32 78 50 L78 84 L69 76 L60 84 L50 76 L40 84 L31 76 L22 84 L22 50 C22 32 32 18 50 18 Z"
        fill="${c.main}" opacity=".93" stroke="${sh(c.main,.6)}" stroke-width="2" stroke-linejoin="round"/>
  ${eyes(41, 59, 46, 5.5)}
  <ellipse cx="50" cy="62" rx="6" ry="8" fill="#17101a"/>`);

A('candle', (c) => `
  <path d="M50 12 C56 22 60 26 60 32 C60 38 56 42 50 42 C44 42 40 38 40 32 C40 26 44 22 50 12 Z" fill="#ffd36a"/>
  <path d="M50 20 C53 26 55 28 55 32 C55 35 53 37 50 37 C47 37 45 35 45 32 C45 28 47 26 50 20 Z" fill="#fff3c4"/>
  <rect x="36" y="44" width="28" height="40" rx="5" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  ${eyes(44, 56, 58, 4.2)}${smile(50, 68, 6)}`);

A('armor', (c) => `
  <path d="M50 14 C62 14 70 22 70 34 L70 42 L30 42 L30 34 C30 22 38 14 50 14 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <rect x="44" y="24" width="12" height="14" rx="2" fill="#120c14"/>
  <circle cx="47" cy="31" r="2.4" fill="${c.accent}"/><circle cx="53" cy="31" r="2.4" fill="${c.accent}"/>
  <path d="M26 46 L74 46 L70 82 L30 82 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M50 48 L50 80" stroke="${sh(c.main,.62)}" stroke-width="2.4"/>
  <path d="M18 50 L28 46 L30 62 L20 64 Z M82 50 L72 46 L70 62 L80 64 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <path d="M84 30 L92 22 L96 26 L88 34 Z" fill="#c9ced6" stroke="#5b636d" stroke-width="1.6"/>`);

A('golem', (c) => `
  <rect x="24" y="30" width="52" height="46" rx="8" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <rect x="36" y="16" width="28" height="20" rx="5" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  ${eyes(44, 56, 26, 4)}
  <rect x="8" y="36" width="16" height="36" rx="6" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <rect x="76" y="36" width="16" height="36" rx="6" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <path d="M32 44 L44 42 M56 60 L70 58 M34 64 L48 66" stroke="${sh(c.main,.7)}" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="30" y="78" width="16" height="10" rx="3" fill="${sh(c.main,.8)}"/>
  <rect x="54" y="78" width="16" height="10" rx="3" fill="${sh(c.main,.8)}"/>`);

A('dragon', (c) => `
  <path d="M46 52 C30 36 14 30 6 36 C14 40 16 50 12 60 C24 62 38 60 48 56 Z" fill="${c.accent}" stroke="${sh(c.main,.5)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M54 52 C70 36 86 30 94 36 C86 40 84 50 88 60 C76 62 62 60 52 56 Z" fill="${c.accent}" stroke="${sh(c.main,.5)}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="50" cy="64" rx="20" ry="20" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <path d="M34 40 C34 28 42 20 50 20 C58 20 66 28 66 40 C66 48 58 52 50 52 C42 52 34 48 34 40 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <path d="M38 22 L34 10 L46 18 Z M62 22 L66 10 L54 18 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2" stroke-linejoin="round"/>
  ${eyes(43, 57, 36, 4.6, '#3a0a0a')}
  <path d="M44 46 L50 52 L56 46" stroke="#17101a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M44 66 L50 62 L56 66 L52 76 L48 76 Z" fill="${c.light}" opacity=".6"/>`);

A('skeleton', (c) => `
  <path d="M34 34 C34 22 41 14 50 14 C59 14 66 22 66 34 C66 42 62 46 58 48 L42 48 C38 46 34 42 34 34 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.2"/>
  <ellipse cx="43" cy="32" rx="5.5" ry="6.5" fill="#1a1016"/><ellipse cx="57" cy="32" rx="5.5" ry="6.5" fill="#1a1016"/>
  <circle cx="44" cy="33" r="2" fill="${c.accent}"/><circle cx="58" cy="33" r="2" fill="${c.accent}"/>
  <path d="M46 42 L50 46 L54 42" stroke="#1a1016" stroke-width="2" fill="none"/>
  <path d="M42 50 L58 50 L56 56 L44 56 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2"/>
  <path d="M50 56 L50 82" stroke="${c.main}" stroke-width="6" stroke-linecap="round"/>
  <path d="M34 62 L66 62 M36 70 L64 70 M38 78 L62 78" stroke="${c.main}" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M28 54 L20 76" stroke="${c.main}" stroke-width="5" stroke-linecap="round"/>
  <path d="M72 54 L80 76" stroke="${c.main}" stroke-width="5" stroke-linecap="round"/>`);

A('mage', (c) => `
  <path d="M50 8 L72 40 L28 40 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="50" cy="16" r="4" fill="${c.accent}"/>
  <path d="M28 40 L72 40 L80 86 L20 86 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.4" stroke-linejoin="round"/>
  <ellipse cx="50" cy="48" rx="15" ry="12" fill="#2a1a22"/>
  <circle cx="44" cy="48" r="2.8" fill="${c.accent}"/><circle cx="56" cy="48" r="2.8" fill="${c.accent}"/>
  <rect x="76" y="28" width="4" height="54" rx="2" fill="#8a6440" transform="rotate(8 78 55)"/>
  <circle cx="80" cy="28" r="8" fill="${c.accent}" opacity=".85"/>
  <circle cx="80" cy="28" r="4" fill="#fff" opacity=".7"/>`);

A('demon', (c) => `
  <path d="M50 46 C36 34 20 32 12 38 C20 44 22 54 18 62 C30 62 42 56 50 50 Z" fill="${sh(c.main,.7)}" stroke="${sh(c.main,.45)}" stroke-width="2"/>
  <path d="M50 46 C64 34 80 32 88 38 C80 44 78 54 82 62 C70 62 58 56 50 50 Z" fill="${sh(c.main,.7)}" stroke="${sh(c.main,.45)}" stroke-width="2"/>
  <path d="M32 24 L26 8 L42 20 Z M68 24 L74 8 L58 20 Z" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="50" cy="42" rx="20" ry="18" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <path d="M40 34 L48 40 M60 34 L52 40" stroke="#17101a" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="42" cy="42" rx="4" ry="5" fill="${c.accent}"/><ellipse cx="58" cy="42" rx="4" ry="5" fill="${c.accent}"/>
  <path d="M40 52 Q50 60 60 52" fill="none" stroke="#17101a" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M34 60 L66 60 L62 84 L38 84 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>`);

A('mushroom', (c) => `
  <path d="M16 52 C16 32 32 20 50 20 C68 20 84 32 84 52 C84 58 78 60 50 60 C22 60 16 58 16 52 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <ellipse cx="34" cy="38" rx="7" ry="5" fill="${c.light}"/><ellipse cx="62" cy="34" rx="9" ry="6" fill="${c.light}"/>
  <path d="M34 60 L66 60 L62 86 L38 86 Z" fill="#f0e2cc" stroke="#a08a6c" stroke-width="2.2" stroke-linejoin="round"/>
  ${eyes(43, 57, 70, 4.2)}${smile(50, 78, 5)}`);

A('slug', (c) => `
  <path d="M10 76 C10 60 24 50 44 50 C66 50 84 58 84 70 C84 80 70 84 46 84 C24 84 10 82 10 76 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <ellipse cx="66" cy="60" rx="22" ry="19" fill="${c.light}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <path d="M58 42 L54 26 M74 42 L80 26" stroke="${sh(c.main,.55)}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="54" cy="24" r="4" fill="${c.main}"/><circle cx="80" cy="24" r="4" fill="${c.main}"/>
  ${eyes(60, 74, 60, 4.2)}`);

A('hand', (c) => `
  <path d="M30 88 L30 50 C30 44 34 40 38 40 C42 40 44 44 44 50 L44 30 C44 24 48 20 52 20 C56 20 58 24 58 30 L58 44 C58 38 62 34 66 34 C70 34 72 38 72 44 L72 56 C72 74 64 88 50 88 Z"
        fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M20 88 L20 56 C20 50 24 46 28 46 C31 46 32 50 32 56 L32 88 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  ${eyes(42, 58, 62, 4.4)}`);

A('bird', (c) => `
  <path d="M50 50 C34 38 16 36 6 44 C16 50 18 58 14 66 C28 66 42 60 50 54 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <path d="M50 50 C66 38 84 36 94 44 C84 50 82 58 86 66 C72 66 58 60 50 54 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <ellipse cx="50" cy="58" rx="16" ry="22" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <circle cx="50" cy="32" r="14" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  ${eyes(44, 56, 30, 4)}
  <path d="M50 36 L42 44 L58 44 Z" fill="${c.accent}"/>`);

A('box', (c) => `
  <path d="M18 44 C18 30 30 22 50 22 C70 22 82 30 82 44 L82 50 L18 50 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <rect x="18" y="50" width="64" height="34" rx="4" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <rect x="14" y="46" width="72" height="9" rx="3" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2"/>
  <rect x="44" y="52" width="12" height="14" rx="3" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2"/>
  <path d="M26 52 L34 62 M74 52 L66 62" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  ${eyes(36, 64, 38, 4.2)}`);

A('machine', (c) => `
  <rect x="26" y="34" width="48" height="40" rx="6" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <rect x="34" y="14" width="32" height="22" rx="5" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <rect x="40" y="22" width="20" height="7" rx="3" fill="#16181c"/>
  <circle cx="45" cy="25.5" r="2.2" fill="${c.accent}"/><circle cx="55" cy="25.5" r="2.2" fill="${c.accent}"/>
  <rect x="10" y="40" width="14" height="30" rx="4" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.2"/>
  <rect x="76" y="40" width="14" height="30" rx="4" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.2"/>
  <path d="M34 44 L66 44 M34 54 L66 54" stroke="${sh(c.main,.7)}" stroke-width="2.4"/>
  <rect x="32" y="74" width="14" height="12" rx="3" fill="${sh(c.main,.75)}"/>
  <rect x="54" y="74" width="14" height="12" rx="3" fill="${sh(c.main,.75)}"/>`);

A('scorpion', (c) => `
  <ellipse cx="46" cy="66" rx="24" ry="16" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  <path d="M66 58 C78 52 84 38 78 26 C74 34 70 36 66 34" fill="none" stroke="${c.main}" stroke-width="7" stroke-linecap="round"/>
  <path d="M78 24 L72 14 L84 18 Z" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="1.6"/>
  <path d="M24 58 L10 48 M24 66 L8 66 M26 74 L12 82" stroke="${c.main}" stroke-width="4" stroke-linecap="round"/>
  <path d="M68 74 L82 82 M68 66 L84 68" stroke="${c.main}" stroke-width="4" stroke-linecap="round"/>
  ${eyes(38, 52, 62, 4)}`);

A('jelly', (c) => `
  <path d="M20 54 C20 34 34 22 50 22 C66 22 80 34 80 54 C80 60 74 62 50 62 C26 62 20 60 20 54 Z"
        fill="${c.main}" opacity=".9" stroke="${sh(c.main,.55)}" stroke-width="2.5"/>
  <path d="M32 62 C32 74 28 82 24 88 M44 62 C44 76 42 84 40 90 M56 62 C56 76 58 84 60 90 M68 62 C68 74 72 82 76 88"
        fill="none" stroke="${c.main}" stroke-width="3.4" stroke-linecap="round" opacity=".85"/>
  ${eyes(42, 58, 44, 4.6)}`);

A('zombie', (c) => `
  <path d="M36 30 C36 20 42 14 50 14 C58 14 64 20 64 30 L64 40 L36 40 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.2"/>
  <ellipse cx="43" cy="28" rx="4.5" ry="5" fill="#1a1016"/><ellipse cx="57" cy="28" rx="4.5" ry="5" fill="#1a1016"/>
  <circle cx="43" cy="28" r="1.8" fill="${c.accent}"/><circle cx="57" cy="28" r="1.8" fill="${c.accent}"/>
  <path d="M42 36 L58 36" stroke="#1a1016" stroke-width="2" stroke-dasharray="3 3"/>
  <path d="M32 42 L68 42 L64 82 L36 82 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M32 48 L12 56 M68 48 L88 56" stroke="${c.light}" stroke-width="7" stroke-linecap="round"/>
  <path d="M40 52 L48 64 M60 56 L54 70" stroke="${sh(c.main,.7)}" stroke-width="2.4" stroke-linecap="round"/>`);

A('gargoyle', (c) => `
  <path d="M50 48 C38 34 20 30 10 36 C20 42 22 52 18 60 C30 62 42 56 50 52 Z" fill="${sh(c.main,.75)}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <path d="M50 48 C62 34 80 30 90 36 C80 42 78 52 82 60 C70 62 58 56 50 52 Z" fill="${sh(c.main,.75)}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <path d="M36 26 L30 12 L44 22 Z M64 26 L70 12 L56 22 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2"/>
  <path d="M32 40 C32 28 40 22 50 22 C60 22 68 28 68 40 L68 54 L32 54 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.5"/>
  ${eyes(42, 58, 38, 4.6, '#3b0d0d')}
  <path d="M40 48 L60 48 L56 54 L44 54 Z" fill="#fff" stroke="#17101a" stroke-width="1.4"/>
  <rect x="34" y="56" width="32" height="28" rx="5" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4"/>`);

A('knight', (c) => `
  <path d="M34 34 C34 22 41 16 50 16 C59 16 66 22 66 34 L66 44 L34 44 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.4"/>
  <rect x="40" y="26" width="20" height="8" rx="2" fill="#141018"/>
  <circle cx="45" cy="30" r="2.2" fill="${c.accent}"/><circle cx="55" cy="30" r="2.2" fill="${c.accent}"/>
  <path d="M46 10 L54 10 L52 20 L48 20 Z" fill="${c.accent}"/>
  <path d="M30 46 L70 46 L66 84 L34 84 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M50 48 L50 82" stroke="${sh(c.main,.65)}" stroke-width="2.2"/>
  <g transform="rotate(20 84 52)"><rect x="80" y="20" width="6" height="42" rx="2" fill="#dfe6ee" stroke="#6b737d" stroke-width="1.6"/>
  <rect x="74" y="60" width="18" height="6" rx="2" fill="#a07a3c" stroke="#5e441d" stroke-width="1.4"/></g>
  <path d="M8 50 L26 46 L26 74 L8 70 Z" fill="${c.accent}" stroke="${sh(c.accent,.55)}" stroke-width="2" stroke-linejoin="round"/>`);

A('priestess', (c) => `
  <path d="M32 40 C32 26 40 18 50 18 C60 18 68 26 68 40 L68 46 L32 46 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.2"/>
  <ellipse cx="50" cy="42" rx="13" ry="11" fill="#f5dcc0"/>
  <circle cx="45" cy="41" r="2.4" fill="#2a1a20"/><circle cx="55" cy="41" r="2.4" fill="#2a1a20"/>
  ${smile(50, 46, 4, 1.8, '#a8626a')}
  <path d="M30 48 L70 48 L78 86 L22 86 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M50 54 L50 72 M42 60 L58 60" stroke="${c.accent}" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="50" cy="20" r="11" fill="none" stroke="${c.accent}" stroke-width="2.4" opacity=".9"/>`);

A('merchant', (c) => `
  <ellipse cx="50" cy="34" rx="15" ry="13" fill="#f3d9bb" stroke="#c09a72" stroke-width="1.8"/>
  <path d="M34 28 C34 18 42 14 50 14 C58 14 66 18 66 28 L66 30 L34 30 Z" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2"/>
  <circle cx="44" cy="34" r="2.4" fill="#2a1a20"/><circle cx="56" cy="34" r="2.4" fill="#2a1a20"/>
  <path d="M40 40 Q50 46 60 40" fill="none" stroke="#7c5a3a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M28 50 L72 50 L78 86 L22 86 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M60 56 C60 50 68 48 74 52 L84 60 C88 64 86 72 80 72 L66 72 C60 72 58 62 60 56 Z" fill="${c.light}" stroke="${sh(c.main,.55)}" stroke-width="2.2"/>
  <circle cx="74" cy="62" r="5" fill="${c.accent}"/>`);

A('fighter', (c) => `
  <ellipse cx="50" cy="30" rx="14" ry="13" fill="#f3d9bb" stroke="#c09a72" stroke-width="1.8"/>
  <path d="M36 24 C36 14 44 10 50 10 C56 10 64 14 64 24 L64 26 C58 22 42 22 36 26 Z" fill="${c.accent}"/>
  <circle cx="45" cy="30" r="2.4" fill="#2a1a20"/><circle cx="55" cy="30" r="2.4" fill="#2a1a20"/>
  <path d="M36 46 L64 46 L68 80 L32 80 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M36 50 L14 40 L8 52 L28 62 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M64 50 L86 40 L92 52 L72 62 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="11" cy="46" r="8" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2"/>
  <circle cx="89" cy="46" r="8" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2"/>`);

A('fortune', (c) => `
  <path d="M30 42 C30 26 39 18 50 18 C61 18 70 26 70 42 L70 48 L30 48 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.2"/>
  <ellipse cx="50" cy="44" rx="12" ry="10" fill="#f3d9bb"/>
  <circle cx="45" cy="43" r="2.2" fill="#2a1a20"/><circle cx="55" cy="43" r="2.2" fill="#2a1a20"/>
  <path d="M28 52 L72 52 L78 86 L22 86 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="50" cy="68" r="13" fill="${c.accent}" opacity=".75" stroke="#fff" stroke-width="1.6"/>
  <circle cx="45" cy="63" r="3.6" fill="#fff" opacity=".8"/>
  <path d="M50 14 L53 22 L61 24 L53 27 L50 35 L47 27 L39 24 L47 22 Z" fill="${c.accent}"/>`);

A('darklord', (c) => `
  <path d="M50 44 C34 30 14 28 6 36 C16 42 18 54 12 64 C26 66 42 58 50 50 Z" fill="${sh(c.main,.7)}" stroke="${sh(c.main,.45)}" stroke-width="2"/>
  <path d="M50 44 C66 30 86 28 94 36 C84 42 82 54 88 64 C74 66 58 58 50 50 Z" fill="${sh(c.main,.7)}" stroke="${sh(c.main,.45)}" stroke-width="2"/>
  <path d="M30 20 L22 4 L40 16 Z M70 20 L78 4 L60 16 Z" fill="${c.accent}" stroke="${sh(c.accent,.6)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M32 38 C32 24 40 16 50 16 C60 16 68 24 68 38 L68 50 L32 50 Z" fill="${c.main}" stroke="${sh(c.main,.45)}" stroke-width="2.5"/>
  <path d="M38 32 L47 38 M62 32 L53 38" stroke="#17101a" stroke-width="3.2" stroke-linecap="round"/>
  <ellipse cx="41" cy="39" rx="4.4" ry="5.4" fill="${c.accent}"/><ellipse cx="59" cy="39" rx="4.4" ry="5.4" fill="${c.accent}"/>
  <path d="M28 54 L72 54 L78 88 L22 88 Z" fill="${c.main}" stroke="${sh(c.main,.45)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M50 58 L56 70 L50 82 L44 70 Z" fill="${c.accent}" opacity=".8"/>`);

A('hero', (c) => `
  <ellipse cx="50" cy="32" rx="14" ry="13" fill="#f5dcc0" stroke="#c09a72" stroke-width="1.8"/>
  <path d="M36 26 C36 16 44 12 50 12 C56 12 64 16 64 26 L64 28 C58 24 42 24 36 28 Z" fill="${c.accent}"/>
  <circle cx="45" cy="32" r="2.4" fill="#2a1a20"/><circle cx="55" cy="32" r="2.4" fill="#2a1a20"/>
  <path d="M34 46 L66 46 L70 84 L30 84 Z" fill="${c.main}" stroke="${sh(c.main,.5)}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M34 50 L50 58 L66 50" fill="none" stroke="${c.light}" stroke-width="3"/>
  <g transform="rotate(-28 20 50)">
    <rect x="16" y="14" width="7" height="46" rx="2" fill="#e6edf5" stroke="#6b737d" stroke-width="1.8"/>
    <rect x="8" y="58" width="23" height="7" rx="2.5" fill="${c.accent}" stroke="${sh(c.accent,.55)}" stroke-width="1.6"/>
    <rect x="17" y="64" width="5" height="10" rx="2" fill="#8a6a44"/>
  </g>
  <path d="M68 52 L88 46 L88 74 L68 70 Z" fill="${c.light}" stroke="${sh(c.main,.5)}" stroke-width="2" stroke-linejoin="round"/>`);

// ---- 呪文の紋章（効果ごとに描き分ける） ----
A('flame', (c) => `
  <path d="M50 8 C58 26 72 34 72 52 C72 68 62 82 50 82 C38 82 28 68 28 52 C28 34 42 26 50 8 Z"
        fill="#ff7a2a" stroke="#c2410c" stroke-width="2"/>
  <path d="M50 26 C56 38 63 44 63 55 C63 66 57 74 50 74 C43 74 37 66 37 55 C37 44 44 38 50 26 Z" fill="#ffc24a"/>
  <path d="M50 44 C53 51 56 55 56 61 C56 68 53 72 50 72 C47 72 44 68 44 61 C44 55 47 51 50 44 Z" fill="#fff3bd"/>
  <circle cx="50" cy="48" r="34" fill="none" stroke="${c.accent}" stroke-width="1.4" opacity=".35"/>`);

A('burst', (c) => `
  <circle cx="50" cy="50" r="18" fill="#ffd36a"/>
  <circle cx="50" cy="50" r="10" fill="#fff6d8"/>
  ${[0,45,90,135,180,225,270,315].map(a=>`<path d="M50 50 L${(50+Math.cos(a*Math.PI/180)*40).toFixed(1)} ${(50+Math.sin(a*Math.PI/180)*40).toFixed(1)}"
      stroke="#ffb03a" stroke-width="${a%90===0?7:4}" stroke-linecap="round" opacity=".9"/>`).join('')}
  <circle cx="50" cy="50" r="36" fill="none" stroke="${c.accent}" stroke-width="1.6" opacity=".4"/>`);

A('heal', (c) => `
  <circle cx="50" cy="52" r="30" fill="none" stroke="#9ff0c0" stroke-width="2" opacity=".5"/>
  <path d="M42 22 L58 22 L58 42 L78 42 L78 58 L58 58 L58 80 L42 80 L42 58 L22 58 L22 42 L42 42 Z"
        fill="#e8fff2" stroke="#3fae76" stroke-width="2.4" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="7" fill="#bff5d8"/>
  <path d="M24 26 L27 33 L34 36 L27 39 L24 46 L21 39 L14 36 L21 33 Z" fill="#c8ffe2" opacity=".85"/>`);

A('buff', (c) => `
  <path d="M50 14 L74 42 L60 42 L60 62 L40 62 L40 42 L26 42 Z" fill="${c.accent}" stroke="${sh(c.accent,.55)}" stroke-width="2.4" stroke-linejoin="round"/>
  <rect x="34" y="68" width="32" height="10" rx="4" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2"/>
  <path d="M18 56 L24 44 L30 56 M70 56 L76 44 L82 56" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round" opacity=".8"/>`);

A('scroll', (c) => `
  <rect x="22" y="20" width="56" height="60" rx="4" fill="#f0e2c2" stroke="#9a7a46" stroke-width="2.4"/>
  <rect x="16" y="14" width="68" height="10" rx="5" fill="#b08a4c" stroke="#6d5128" stroke-width="2"/>
  <rect x="16" y="76" width="68" height="10" rx="5" fill="#b08a4c" stroke="#6d5128" stroke-width="2"/>
  <path d="M32 36 L68 36 M32 46 L68 46 M32 56 L58 56 M32 66 L62 66" stroke="#8a6a3c" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="68" cy="60" r="9" fill="${c.accent}" opacity=".75"/>`);

A('skull', (c) => `
  <path d="M28 44 C28 28 37 18 50 18 C63 18 72 28 72 44 C72 54 66 60 60 62 L40 62 C34 60 28 54 28 44 Z"
        fill="#e8e2d2" stroke="#8a8272" stroke-width="2.4"/>
  <ellipse cx="41" cy="44" rx="7" ry="8.5" fill="#1a1016"/><ellipse cx="59" cy="44" rx="7" ry="8.5" fill="#1a1016"/>
  <circle cx="42" cy="45" r="2.4" fill="${c.accent}"/><circle cx="60" cy="45" r="2.4" fill="${c.accent}"/>
  <path d="M46 54 L50 60 L54 54" fill="none" stroke="#1a1016" stroke-width="2.2"/>
  <path d="M40 64 L60 64 L58 74 L42 74 Z" fill="#e8e2d2" stroke="#8a8272" stroke-width="2"/>
  <path d="M44 66 L44 72 M50 66 L50 72 M56 66 L56 72" stroke="#8a8272" stroke-width="1.6"/>`);

A('ice', (c) => `
  ${[0,60,120].map(a=>`<g transform="rotate(${a} 50 50)">
    <path d="M50 12 L50 88" stroke="#bfe9ff" stroke-width="6" stroke-linecap="round"/>
    <path d="M50 26 L38 16 M50 26 L62 16 M50 74 L38 84 M50 74 L62 84" stroke="#bfe9ff" stroke-width="4.5" stroke-linecap="round"/>
  </g>`).join('')}
  <circle cx="50" cy="50" r="9" fill="#e8f8ff"/>
  <circle cx="50" cy="50" r="34" fill="none" stroke="#7fd0ff" stroke-width="1.6" opacity=".4"/>`);

A('wind', (c) => `
  <path d="M16 36 C40 26 62 30 70 38 C76 44 72 52 64 50 C58 48 58 42 62 42" fill="none"
        stroke="${c.light}" stroke-width="6" stroke-linecap="round"/>
  <path d="M14 54 C44 44 70 48 80 58 C86 64 82 74 72 72 C64 70 64 62 70 62" fill="none"
        stroke="${c.main}" stroke-width="6" stroke-linecap="round"/>
  <path d="M22 72 C42 66 56 68 62 74" fill="none" stroke="${c.light}" stroke-width="4.5" stroke-linecap="round" opacity=".7"/>`);

A('mana', (c) => `
  <path d="M50 10 L72 40 L50 90 L28 40 Z" fill="url(#mng)" stroke="#1b4c7a" stroke-width="2.4" stroke-linejoin="round"/>
  <defs><linearGradient id="mng" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfe8ff"/><stop offset=".5" stop-color="#4aa3e8"/><stop offset="1" stop-color="#17426b"/>
  </linearGradient></defs>
  <path d="M50 10 L50 90 M28 40 L72 40" stroke="rgba(255,255,255,.45)" stroke-width="2"/>
  <path d="M40 26 L46 20 L44 38 Z" fill="rgba(255,255,255,.6)"/>`);

A('seed', (c) => `
  <ellipse cx="50" cy="62" rx="24" ry="27" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2.4"/>
  <ellipse cx="42" cy="54" rx="7" ry="10" fill="${c.light}" opacity=".7" transform="rotate(-20 42 54)"/>
  <path d="M50 36 C50 24 58 16 70 14 C68 26 60 34 50 36 Z" fill="#6ec26a" stroke="#3a7a38" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 36 L50 22" stroke="#3a7a38" stroke-width="2.4" stroke-linecap="round"/>`);

A('potion', (c) => `
  <path d="M42 14 L58 14 L58 32 L70 56 C74 68 68 84 50 84 C32 84 26 68 30 56 L42 32 Z"
        fill="rgba(255,255,255,.14)" stroke="#cfe3f0" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M33 54 L67 54 C71 66 66 78 50 78 C34 78 29 66 33 54 Z" fill="${c.main}" opacity=".9"/>
  <rect x="39" y="8" width="22" height="9" rx="3" fill="#a07a40" stroke="#6348220" stroke-width="2"/>
  <circle cx="44" cy="64" r="3.4" fill="#fff" opacity=".6"/><circle cx="56" cy="70" r="2.4" fill="#fff" opacity=".45"/>`);

// ---- ユニット以外 ----
A('spell', (c) => `
  <circle cx="50" cy="52" r="30" fill="none" stroke="${c.accent}" stroke-width="2" opacity=".55"/>
  <circle cx="50" cy="52" r="22" fill="none" stroke="${c.accent}" stroke-width="1.4" opacity=".4"/>
  <path d="M50 18 L58 42 L84 52 L58 62 L50 86 L42 62 L16 52 L42 42 Z" fill="${c.main}" opacity=".92"/>
  <path d="M50 30 L55 46 L70 52 L55 58 L50 74 L45 58 L30 52 L45 46 Z" fill="${c.light}" opacity=".9"/>
  <circle cx="50" cy="52" r="6" fill="#fff" opacity=".85"/>`);

A('weapon', (c) => `
  <path d="M50 8 L58 22 L58 62 L42 62 L42 22 Z" fill="#e8eef6" stroke="#6b737d" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 8 L50 62" stroke="#aab4c0" stroke-width="2"/>
  <rect x="26" y="62" width="48" height="9" rx="4" fill="${c.accent}" stroke="${sh(c.accent,.55)}" stroke-width="2"/>
  <rect x="45" y="71" width="10" height="17" rx="4" fill="#8a6a44" stroke="#553f24" stroke-width="2"/>
  <circle cx="50" cy="90" r="6" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2"/>`);

A('dungeon', (c) => `
  <path d="M14 88 L14 44 C14 26 30 14 50 14 C70 14 86 26 86 44 L86 88 Z" fill="${sh(c.main,.55)}" stroke="${sh(c.main,.4)}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M32 88 L32 52 C32 40 40 32 50 32 C60 32 68 40 68 52 L68 88 Z" fill="#100a12" stroke="${c.accent}" stroke-width="2"/>
  <path d="M20 44 L20 88 M80 44 L80 88 M14 60 L86 60" stroke="${sh(c.main,.4)}" stroke-width="2" opacity=".6"/>
  <circle cx="42" cy="66" r="3" fill="${c.accent}" opacity=".9"/>
  <circle cx="58" cy="72" r="2.2" fill="${c.accent}" opacity=".7"/>
  <path d="M26 30 L26 22 L34 22 L34 30 M66 30 L66 22 L74 22 L74 30" fill="none" stroke="${c.accent}" stroke-width="2.2"/>`);

A('leaf', (c) => `
  <path d="M50 86 C50 60 56 34 78 14 C80 44 72 74 50 86 Z" fill="${c.main}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 86 C50 60 44 34 22 14 C20 44 28 74 50 86 Z" fill="${c.light}" stroke="${sh(c.main,.55)}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 88 L50 56" stroke="${sh(c.main,.45)}" stroke-width="3" stroke-linecap="round"/>`);

A('tarot', (c) => `
  <rect x="24" y="12" width="52" height="76" rx="6" fill="${c.main}" stroke="${c.accent}" stroke-width="2.5"/>
  <rect x="31" y="19" width="38" height="62" rx="3" fill="none" stroke="${c.accent}" stroke-width="1.4" opacity=".7"/>
  <circle cx="50" cy="40" r="11" fill="${c.accent}" opacity=".85"/>
  <path d="M50 26 L53 35 L62 38 L53 41 L50 50 L47 41 L38 38 L47 35 Z" fill="#fff" opacity=".85"/>
  <path d="M38 58 L62 58 M40 66 L60 66 M43 74 L57 74" stroke="${c.accent}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`);

// ============================================================
//  カード → 絵の割り当て
// ============================================================
const P = {
  blue:   { main:'#3c8fd6', light:'#7dc0f0', accent:'#ffd85e' },
  navy:   { main:'#2f5fa8', light:'#6a9ad8', accent:'#ffd85e' },
  red:    { main:'#c9453c', light:'#ec7a6c', accent:'#ffd85e' },
  green:  { main:'#4a9e5c', light:'#84cf90', accent:'#ffe27a' },
  purple: { main:'#8a5cc0', light:'#bb95e4', accent:'#ffd85e' },
  violet: { main:'#6b3fa0', light:'#a377d4', accent:'#ff9ad5' },
  gold:   { main:'#d4a03c', light:'#f2cf7c', accent:'#fff0b8' },
  silver: { main:'#b7c2cf', light:'#e6edf5', accent:'#8fd0ff' },
  bone:   { main:'#ddd3bd', light:'#f2ecdc', accent:'#ff6b5e' },
  brown:  { main:'#8a6440', light:'#bd9268', accent:'#ffd85e' },
  grey:   { main:'#7c8494', light:'#aab3c2', accent:'#ffd85e' },
  dark:   { main:'#4a3554', light:'#7a5c8a', accent:'#ff5a4a' },
  pink:   { main:'#d9709c', light:'#f2a6c6', accent:'#fff0b8' },
  teal:   { main:'#3fa3a0', light:'#7fd4d0', accent:'#ffe27a' },
  orange: { main:'#d97a32', light:'#f2ac6e', accent:'#ffe27a' },
  black:  { main:'#3a3040', light:'#5e5268', accent:'#ff4d3d' },
  white:  { main:'#e8e2d4', light:'#fbf7ee', accent:'#ffd85e' },
  lime:   { main:'#8fb63c', light:'#c2dc7e', accent:'#fff0b8' },
};

// 明示的な割り当て（id → [絵, 色]）
const MAP = {
  slime:['slime','blue'], slime_beth:['slime','red'], healslime:['slime','pink'],
  metal_slime:['metalslime','silver'], hagure_metal:['metalslime','gold'], metal_king:['metalslime','gold'],
  behoma_slime:['slime','green'], slime_knight:['knight','blue'], r_slime_tsumuri:['slug','blue'],
  r_tsuchiwarashi:['slime','brown'], box_shiawase:['box','gold'],
  dracky:['bat','red'], mage_dracky:['bat','purple'], n_mihari_dracky:['bat','teal'],
  oomedama:['eyeball','red'], ookiduchi:['mole','brown'], sasoribachi:['scorpion','gold'],
  baby_panther:['panther','brown'], killer_panther:['panther','dark'],
  candle:['candle','orange'], m_hell_ghost:['ghost','purple'], mimic:['box','brown'], hitokuibako:['box','red'],
  samayou_yoroi:['armor','grey'], devil_armor:['armor','dark'], akuma_no_kishi:['armor','red'],
  d_jigoku_yoroi:['armor','violet'], jigoku_no_hasami:['scorpion','red'],
  golem:['golem','brown'], w_goldman:['golem','gold'], r_gold_golem:['golem','gold'],
  dragon:['dragon','green'], great_dragon:['dragon','gold'], keith_dragon:['dragon','purple'],
  yamata:['dragon','red'], ryuuou:['darklord','violet'], ryuuou_true:['dragon','violet'],
  ryuukihei:['knight','navy'], n_dragon_rider:['knight','green'],
  gaikotsu:['skeleton','bone'], shinigami_kizoku:['skeleton','dark'],
  youjutsushi:['mage','teal'], m_mahoutsukai:['mage','purple'], m_babysatan:['demon','red'],
  m_balzack:['demon','green'], m_kenja:['mage','gold'],
  m_silver_devil:['demon','silver'], d_silver_devil:['demon','silver'],
  belial:['demon','violet'], bazuzu:['demon','navy'], atlas:['golem','red'], gigantes:['golem','grey'],
  baramos:['darklord','purple'], zoma:['darklord','navy'], sidoh:['darklord','red'],
  mildrath:['darklord','violet'], estark:['darklord','teal'], dark_dream:['darklord','black'],
  d_deathpisaro:['darklord','violet'], d_kingleo:['panther','gold'], d_hell_battler:['demon','red'],
  obake_kinoko:['mushroom','red'], oonamekuji:['slug','lime'], doronuba:['slug','brown'],
  madhand:['hand','pink'], madhand_token:['hand','pink'],
  chimera:['bird','purple'], hell_condor:['bird','dark'], gargoyle:['gargoyle','grey'],
  killer_machine:['machine','grey'], metal_hunter:['machine','navy'], r_metal_hunter:['machine','navy'],
  shibirekurage:['jelly','teal'], kusattashitai:['zombie','lime'], mummy:['zombie','bone'],
  arakure:['fighter','red'], bostroll:['golem','pink'],
  dokuyazukin:['fighter','dark'], d_death_stalker:['ghost','dark'], d_mage_matango:['mushroom','purple'],
  d_evil_priest:['mage','violet'], w_heishi:['knight','navy'], w_bianca:['priestess','gold'],
  w_kajiya:['merchant','orange'], w_yuukan:['knight','red'], w_terry:['hero','navy'],
  p_sister:['priestess','white'], p_souryo:['priestess','blue'], p_maribel:['priestess','orange'],
  p_god_rider:['knight','white'], p_hagoromo:['priestess','pink'], p_kukule:['hero','white'],
  m_jessica:['fortune','red'], a_budouka:['fighter','orange'], a_brey:['mage','navy'],
  a_kiryu:['fighter','teal'], a_cliff:['knight','white'], a_manya:['fortune','red'],
  a_kenja:['mage','gold'], a_alena:['fighter','pink'],
  r_shonin:['merchant','green'], r_ojiisan:['merchant','brown'], r_torneko:['merchant','gold'],
  f_uranaishi:['fortune','purple'], f_kaeru:['slime','lime'], f_esther:['fortune','teal'],
  f_ohgami:['darklord','purple'], f_ryu_gakusha:['fortune','navy'], f_minea:['fortune','gold'],
  n_mamono_tsukai:['fighter','purple'], w_battle_master:['knight','red'],
  pisaro_knight:['knight','violet'],
  h_loto:['hero','navy'], h_anlucia:['hero','white'], h_laurasia:['hero','red'],
  h_samaltria:['hero','blue'], h_moonbrooke:['fortune','purple'], h_rex:['fighter','orange'],
  h_yangus:['merchant','brown'], h_rosalie:['priestess','violet'], h_manya:['fortune','red'],
};

// 職業ごとの既定色
const CLS_PAL = { warrior:'red', mage:'purple', priest:'blue', martial:'orange',
                  merchant:'green', darkknight:'violet', fortune:'gold', neutral:'grey' };

// 名前からの推測（明示指定が無いカード用）
const GUESS = [
  [/スライム|つむり/, 'slime'], [/ドラキー|こうもり/, 'bat'], [/ゴーレム|ゴールドマン/, 'golem'],
  [/ドラゴン|竜/, 'dragon'], [/よろい|アーマー|さまよう/, 'armor'], [/がいこつ|ホネ|スケルトン/, 'skeleton'],
  [/キノコ|マタンゴ/, 'mushroom'], [/なめくじ|ドロヌーバ/, 'slug'], [/ハンド|手/, 'hand'],
  [/パンサー|レオ|タイガー/, 'panther'], [/ゴースト|おばけ|れい/, 'ghost'], [/マシン|ハンター|メカ/, 'machine'],
  [/くらげ/, 'jelly'], [/したい|ミイラ|ゾンビ/, 'zombie'], [/ガーゴイル/, 'gargoyle'],
  [/デビル|あくま|悪魔|サタン|バトラー/, 'demon'], [/王|魔王|ドレアム|ゾーマ|シドー/, 'darklord'],
  [/兵士|ナイト|騎士|剣士/, 'knight'], [/シスター|僧|天使|巫女/, 'priestess'],
  [/商人|やじ|おやじ|トルネコ|ヤンガス/, 'merchant'], [/使い|まほう|賢者|術/, 'mage'],
  [/武闘|けんじゃ|きとうし|拳/, 'fighter'], [/占い|タロット|星|ミネア/, 'fortune'],
  [/コンドル|ガラス|鳥|キメラ/, 'bird'], [/箱|ミミック/, 'box'], [/はち|サソリ|ハサミ/, 'scorpion'],
];

// 呪文の効果文から紋章を選ぶ
function spellKind(card) {
  const t = (card.text || '') + (card.name || '');
  if (/破壊/.test(t)) return 'skull';
  if (/行動不能|ヒャド|マヒャド|凍/.test(t)) return 'ice';
  if (/すべてに.*ダメージ|全体に.*ダメージ|前列|後列/.test(t)) return 'burst';
  if (/ダメージ/.test(t)) return 'flame';
  if (/回復/.test(t)) return 'heal';
  if (/MP/.test(t)) return 'mana';
  if (/引く|手札に加える|召喚|テンション/.test(t)) return 'scroll';
  if (/\+\d|攻撃力|におうだち|ステルス|速攻|貫通/.test(t)) return 'buff';
  if (/バギ|風/.test(t)) return 'wind';
  return 'spell';
}
function itemKind(card) {
  const t = (card.text || '') + (card.name || '');
  if (/回復|やくそう|せいすい/.test(t)) return 'potion';
  if (/たね|きのみ|葉/.test(t)) return 'seed';
  if (/巻物|ツメ|つばさ/.test(t)) return 'scroll';
  return 'seed';
}

const cache = new Map();

export function artFor(card) {
  if (cache.has(card.id)) return cache.get(card.id);
  let kind, pal;
  const m = MAP[card.id];
  if (m) { kind = m[0]; pal = m[1]; }
  else {
    if (card.type === 'weapon') kind = 'weapon';
    else if (card.type === 'dungeon') kind = 'dungeon';
    else if (card.sub === 'タロット') kind = 'tarot';
    else if (card.sub === '道具') kind = itemKind(card);
    else if (card.type === 'spell') kind = spellKind(card);
    else if (card.type === 'hero') kind = 'hero';
    else {
      kind = 'slime';
      for (const [re, k] of GUESS) if (re.test(card.name)) { kind = k; break; }
    }
    pal = CLS_PAL[card.cls] || 'grey';
  }
  const c = P[pal] || P.grey;
  const body = (DRAWERS[kind] || DRAWERS.slime)(c);
  const svg = `<svg class="art" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  const res = { svg, pal: c, kind };
  cache.set(card.id, res);
  return res;
}

export function artSvg(card) { return artFor(card).svg; }
export function artPalette(card) { return artFor(card).pal; }

// リーダーの肖像（職業ごと）
const LEADER_ART = {
  warrior:   ['hero','red'], mage:['fortune','red'], priest:['hero','white'],
  martial:   ['fighter','pink'], merchant:['merchant','gold'],
  darkknight:['darklord','violet'], fortune:['fortune','gold'], neutral:['hero','navy'],
};
const leaderCache = new Map();
export function leaderSvg(cls) {
  if (leaderCache.has(cls)) return leaderCache.get(cls);
  const [kind, pal] = LEADER_ART[cls] || LEADER_ART.neutral;
  const svg = `<svg class="art" viewBox="8 6 84 84" aria-hidden="true" preserveAspectRatio="xMidYMid slice">` +
    `<rect x="0" y="0" width="100" height="100" fill="${shade(P[pal].main, .35)}"/>` +
    DRAWERS[kind](P[pal]) + `</svg>`;
  leaderCache.set(cls, svg);
  return svg;
}
