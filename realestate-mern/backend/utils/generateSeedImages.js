// Generates a set of original, hand-composed SVG illustrations depicting
// Nepali-style properties (traditional Newari homes, hill bungalows, modern
// Kathmandu houses, apartments, commercial buildings, villas, and land plots).
// These replace generic stock-photo placeholders in the seed data with
// artwork that actually reflects the Nepali real-estate context - and,
// being original vector illustrations rather than photographs, they carry
// no licensing risk.
//
// Run with: node utils/generateSeedImages.js
// Output: backend/uploads/seed-images/*.svg

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'uploads', 'seed-images');
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 800;
const H = 600;

// ---- shared palette (kept close to the site's navy/brass/sage/brick theme) ----
const SKY_TOP = '#AFCBDD';
const SKY_BOTTOM = '#EFE4C8';
const HILL_FAR = '#93AA9A';
const HILL_MID = '#5F7D68';
const GROUND = '#7C9473';
const PATH_COLOR = '#C9B48C';
const SNOW = '#F7F4EE';
const SNOW_SHADE = '#C9D6DD';
const WOOD = '#5A3A26';
const WOOD_DARK = '#3E2717';
const BRICK = '#9C4B36';
const BRICK_DARK = '#7C3826';
const ROOF_TERRACOTTA = '#8B4B33';
const ROOF_SLATE = '#586066';
const CREAM_WALL = '#EFE6D3';
const WHITE_WALL = '#F5F1E6';

// ---------- reusable fragments ----------

const defsSky = () => `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${SKY_TOP}" />
      <stop offset="100%" stop-color="${SKY_BOTTOM}" />
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GROUND}" />
      <stop offset="100%" stop-color="#5F7A57" />
    </linearGradient>
  </defs>`;

const sceneOpen = () => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defsSky()}
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)" />`;

const sceneClose = () => `</svg>`;

// Distant snow-capped Himalayan range
const himalayas = (yBase = 210) => `
  <g opacity="0.55" fill="${SNOW}">
    <polygon points="20,${yBase} 90,${yBase - 90} 150,${yBase - 40} 230,${yBase - 110} 300,${yBase - 50} 380,${yBase - 95} 450,${yBase - 35} 520,${yBase - 80} 600,${yBase - 30} 680,${yBase - 70} 760,${yBase - 20} 800,${yBase - 45} 800,${yBase} 20,${yBase}" />
  </g>
  <g opacity="0.35" fill="${SNOW_SHADE}">
    <polygon points="90,${yBase - 90} 108,${yBase - 55} 72,${yBase - 55}" />
    <polygon points="230,${yBase - 110} 250,${yBase - 70} 208,${yBase - 70}" />
    <polygon points="380,${yBase - 95} 398,${yBase - 60} 362,${yBase - 60}" />
    <polygon points="520,${yBase - 80} 536,${yBase - 50} 504,${yBase - 50}" />
  </g>`;

const hills = () => `
  <polygon points="0,260 120,215 260,250 400,205 540,245 680,210 800,240 800,340 0,340" fill="${HILL_FAR}" opacity="0.65" />
  <polygon points="0,320 160,285 340,315 520,280 700,310 800,290 800,${H} 0,${H}" fill="${HILL_MID}" opacity="0.8" />`;

const groundStrip = (y = 400) => `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#ground)" />`;

const dirtPath = (x1, y1, x2, y2, width = 40) => `
  <polygon points="${x1 - width / 2},${y1} ${x1 + width / 2},${y1} ${x2 + width / 4},${y2} ${x2 - width / 4},${y2}" fill="${PATH_COLOR}" opacity="0.7" />`;

const tree = (x, y, scale = 1) => `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <rect x="-4" y="0" width="8" height="26" fill="${WOOD_DARK}" />
    <ellipse cx="0" cy="-18" rx="26" ry="30" fill="#3E6B47" />
    <ellipse cx="-14" cy="-6" rx="16" ry="18" fill="#4A7A52" />
    <ellipse cx="14" cy="-10" rx="16" ry="18" fill="#4A7A52" />
  </g>`;

const prayerFlags = (x, y, width) => `
  <g opacity="0.85">
    <path d="M ${x} ${y} Q ${x + width / 2} ${y + 22} ${x + width} ${y}" stroke="${WOOD_DARK}" stroke-width="1.5" fill="none" />
    ${Array.from({ length: 8 }).map((_, i) => {
      const t = i / 7;
      const px = x + t * width;
      const py = y + Math.sin(t * Math.PI) * 22;
      const colors = ['#B8863B', '#F7F4EE', '#3C6E52', '#A6472F', '#1B3B52'];
      return `<rect x="${px - 3}" y="${py}" width="6" height="8" fill="${colors[i % colors.length]}" />`;
    }).join('')}
  </g>`;

const signboard = (x, y, line1, line2 = '') => `
  <g>
    <rect x="${x - 2}" y="${y + 30}" width="4" height="40" fill="${WOOD_DARK}" />
    <rect x="${x + 46}" y="${y + 30}" width="4" height="40" fill="${WOOD_DARK}" />
    <rect x="${x - 10}" y="${y}" width="70" height="34" fill="${WHITE_WALL}" stroke="${WOOD_DARK}" stroke-width="2" />
    <text x="${x + 25}" y="${y + 15}" font-family="Georgia, serif" font-size="9" font-weight="700" fill="${BRICK_DARK}" text-anchor="middle">${line1}</text>
    ${line2 ? `<text x="${x + 25}" y="${y + 27}" font-family="Georgia, serif" font-size="8" fill="${WOOD_DARK}" text-anchor="middle">${line2}</text>` : ''}
  </g>`;

const boundaryPillars = (y, count = 6) => {
  const spacing = W / count;
  return Array.from({ length: count })
    .map((_, i) => `<rect x="${i * spacing + spacing / 2 - 4}" y="${y - 22}" width="8" height="26" fill="${CREAM_WALL}" stroke="${WOOD_DARK}" stroke-width="1.5" />`)
    .join('');
};

const sun = () => `<circle cx="700" cy="90" r="34" fill="#F7E3B5" opacity="0.9" />`;

// ---------- building illustrations ----------

// Multi-tier Newari heritage house (brick, carved wood windows, tiered tiled roof)
const newariHouse = (roofTint = ROOF_TERRACOTTA) => `
  <g transform="translate(280, 220)">
    <rect x="0" y="120" width="240" height="170" fill="${BRICK}" />
    <rect x="0" y="120" width="240" height="170" fill="${BRICK_DARK}" opacity="0.15" />
    <!-- carved wood window bands per floor -->
    ${[150, 195, 240].map((wy) => `
      <rect x="10" y="${wy}" width="220" height="8" fill="${WOOD}" />
      ${[30, 80, 130, 180].map((wx) => `<rect x="${wx}" y="${wy + 8}" width="30" height="30" fill="${WOOD_DARK}" /><rect x="${wx + 4}" y="${wy + 12}" width="22" height="22" fill="#C9A876" opacity="0.5" />`).join('')}
    `).join('')}
    <!-- ground floor door -->
    <rect x="105" y="250" width="34" height="40" fill="${WOOD_DARK}" />
    <!-- tiered pagoda-style roof -->
    <polygon points="-24,120 120,50 264,120" fill="${roofTint}" />
    <rect x="-14" y="112" width="268" height="10" fill="${WOOD_DARK}" />
    <polygon points="30,50 120,10 210,50" fill="${roofTint}" opacity="0.9" />
    <rect x="24" y="44" width="192" height="8" fill="${WOOD_DARK}" />
    <rect x="115" y="0" width="10" height="14" fill="${WOOD_DARK}" />
  </g>`;

// Contemporary flat/pitched roof concrete house
const modernHouse = () => `
  <g transform="translate(230, 240)">
    <rect x="0" y="90" width="200" height="150" fill="${WHITE_WALL}" />
    <rect x="0" y="90" width="200" height="20" fill="${CREAM_WALL}" />
    <rect x="20" y="130" width="50" height="50" fill="#7FA7B8" opacity="0.8" />
    <rect x="130" y="130" width="50" height="50" fill="#7FA7B8" opacity="0.8" />
    <rect x="85" y="180" width="30" height="60" fill="${WOOD_DARK}" />
    <rect x="-10" y="70" width="220" height="24" fill="${WOOD_DARK}" opacity="0.85" />
    <rect x="0" y="240" width="200" height="8" fill="#B8B0A0" />
    <!-- balcony rail -->
    <rect x="20" y="120" width="160" height="6" fill="${WOOD_DARK}" opacity="0.6" />
  </g>`;

// Simple single-storey bungalow with veranda
const bungalow = () => `
  <g transform="translate(210, 270)">
    <rect x="0" y="60" width="240" height="90" fill="${CREAM_WALL}" />
    <polygon points="-20,60 120,10 260,60" fill="${ROOF_TERRACOTTA}" />
    <rect x="-10" y="52" width="260" height="10" fill="${WOOD_DARK}" />
    <rect x="10" y="90" width="220" height="12" fill="${WOOD}" opacity="0.8" />
    <rect x="20" y="102" width="4" height="48" fill="${WOOD_DARK}" />
    <rect x="216" y="102" width="4" height="48" fill="${WOOD_DARK}" />
    <rect x="100" y="102" width="40" height="48" fill="${WOOD_DARK}" />
    <rect x="40" y="110" width="35" height="35" fill="#7FA7B8" opacity="0.8" />
    <rect x="165" y="110" width="35" height="35" fill="#7FA7B8" opacity="0.8" />
  </g>`;

// Multi-storey apartment block with balconies
const apartmentBuilding = (accent = '#D3A75E') => `
  <g transform="translate(210, 130)">
    <rect x="0" y="0" width="260" height="270" fill="${WHITE_WALL}" />
    ${[0, 1, 2, 3].map((row) => Array.from({ length: 5 }).map((_, col) => `
      <rect x="${18 + col * 48}" y="${20 + row * 62}" width="34" height="40" fill="#7FA7B8" opacity="0.75" />
      <rect x="${16 + col * 48}" y="${62 + row * 62}" width="38" height="6" fill="${accent}" opacity="0.7" />
    `).join('')).join('')}
    <rect x="100" y="230" width="60" height="40" fill="${WOOD_DARK}" />
  </g>`;

// Storefront-style commercial building
const commercialBuilding = () => `
  <g transform="translate(190, 200)">
    <rect x="0" y="80" width="300" height="160" fill="${CREAM_WALL}" />
    <rect x="0" y="80" width="300" height="16" fill="${BRICK}" />
    <rect x="20" y="120" width="70" height="90" fill="#9AC2D1" opacity="0.85" />
    <rect x="115" y="120" width="70" height="90" fill="#9AC2D1" opacity="0.85" />
    <rect x="210" y="120" width="70" height="90" fill="#9AC2D1" opacity="0.85" />
    <rect x="0" y="60" width="300" height="24" fill="${BRICK_DARK}" />
    <rect x="10" y="230" width="20" height="10" fill="${WOOD_DARK}" opacity="0.4" />
  </g>`;

// Two-storey villa with garden wall and gate
const villa = () => `
  <g transform="translate(190, 200)">
    <rect x="40" y="60" width="230" height="180" fill="${WHITE_WALL}" />
    <rect x="40" y="60" width="230" height="14" fill="${CREAM_WALL}" />
    <rect x="60" y="90" width="45" height="45" fill="#7FA7B8" opacity="0.8" />
    <rect x="205" y="90" width="45" height="45" fill="#7FA7B8" opacity="0.8" />
    <rect x="130" y="150" width="50" height="90" fill="${WOOD_DARK}" />
    <rect x="60" y="160" width="45" height="45" fill="#7FA7B8" opacity="0.8" />
    <rect x="205" y="160" width="45" height="45" fill="#7FA7B8" opacity="0.8" />
    <polygon points="30,60 155,10 280,60" fill="${ROOF_SLATE}" />
    <!-- garden wall + gate -->
    <rect x="0" y="230" width="330" height="10" fill="${CREAM_WALL}" />
    <rect x="140" y="210" width="50" height="30" fill="${WOOD_DARK}" opacity="0.6" />
  </g>`;

// Stone-and-timber Pahadi hill house (terraced hillside)
const hillHouse = () => `
  <g>
    <!-- terraces -->
    <polygon points="0,380 800,340 800,400 0,420" fill="#6E8D67" opacity="0.9" />
    <polygon points="0,420 800,400 800,460 0,480" fill="#628060" opacity="0.9" />
  </g>
  <g transform="translate(260, 250)">
    <rect x="0" y="70" width="200" height="110" fill="#8A8578" />
    <rect x="0" y="70" width="200" height="30" fill="#787368" />
    <rect x="0" y="100" width="200" height="80" fill="${WOOD}" opacity="0.55" />
    <polygon points="-16,70 100,30 216,70" fill="#5F6B4E" />
    <rect x="-8" y="64" width="216" height="8" fill="${WOOD_DARK}" />
    <rect x="80" y="130" width="30" height="50" fill="${WOOD_DARK}" />
    <rect x="30" y="115" width="28" height="28" fill="#7FA7B8" opacity="0.75" />
    <rect x="142" y="115" width="28" height="28" fill="#7FA7B8" opacity="0.75" />
  </g>`;

// Terai-style single-storey plastered home with wide veranda
const teraiHouse = () => `
  <g transform="translate(220, 290)">
    <rect x="0" y="50" width="260" height="90" fill="#E8D9B5" />
    <polygon points="-20,50 130,15 280,50" fill="#7A6A3F" />
    <rect x="-10" y="44" width="280" height="8" fill="${WOOD_DARK}" />
    <rect x="10" y="80" width="240" height="10" fill="${WOOD}" opacity="0.7" />
    <rect x="20" y="90" width="4" height="40" fill="${WOOD_DARK}" />
    <rect x="236" y="90" width="4" height="40" fill="${WOOD_DARK}" />
    <rect x="115" y="92" width="34" height="38" fill="${WOOD_DARK}" />
    <rect x="45" y="98" width="30" height="26" fill="#7FA7B8" opacity="0.7" />
    <rect x="185" y="98" width="30" height="26" fill="#7FA7B8" opacity="0.7" />
  </g>`;

// ---------- full scene composers ----------

const withLandscape = ({ includeHimalayas = true, includeSun = true } = {}) => `
  ${includeSun ? sun() : ''}
  ${includeHimalayas ? himalayas() : ''}
  ${hills()}
  ${groundStrip()}
`;

const scenes = {
  'modern-house-kathmandu': () => `${sceneOpen()}
    ${withLandscape()}
    ${tree(90, 470, 1.1)}
    ${modernHouse()}
    ${tree(700, 480, 0.9)}
    ${dirtPath(400, 600, 400, 470, 60)}
  ${sceneClose()}`,

  'family-house-greenery': () => `${sceneOpen()}
    ${withLandscape()}
    ${tree(650, 460, 1.3)}
    ${tree(60, 480, 1.1)}
    ${bungalow()}
    ${tree(730, 500, 0.8)}
  ${sceneClose()}`,

  'riverside-bungalow': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false })}
    <rect x="0" y="430" width="800" height="60" fill="#8FB6C9" opacity="0.55" />
    ${bungalow()}
    ${tree(670, 460, 1)}
  ${sceneClose()}`,

  'apartment-building-a': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false })}
    ${apartmentBuilding('#D3A75E')}
    ${tree(120, 470, 1)}
    ${tree(700, 470, 1)}
  ${sceneClose()}`,

  'apartment-building-b': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false })}
    ${apartmentBuilding('#3C6E52')}
    ${tree(90, 480, 0.9)}
  ${sceneClose()}`,

  'commercial-building': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false, includeSun: false })}
    ${commercialBuilding()}
    <rect x="0" y="470" width="800" height="10" fill="#B8B0A0" opacity="0.6" />
  ${sceneClose()}`,

  'villa-elegant': () => `${sceneOpen()}
    ${withLandscape()}
    ${tree(80, 460, 1.2)}
    ${villa()}
    ${tree(730, 470, 1)}
  ${sceneClose()}`,

  'newari-heritage-bhaktapur': () => `${sceneOpen()}
    ${withLandscape()}
    ${newariHouse(ROOF_TERRACOTTA)}
    ${prayerFlags(60, 130, 220)}
  ${sceneClose()}`,

  'newari-heritage-patan': () => `${sceneOpen()}
    ${withLandscape()}
    ${newariHouse('#6E4A33')}
    ${prayerFlags(520, 110, 220)}
  ${sceneClose()}`,

  'hill-house-pahadi': () => `${sceneOpen()}
    ${himalayas(180)}
    ${hillHouse()}
    ${tree(120, 500, 1)}
    ${tree(660, 510, 1.1)}
  ${sceneClose()}`,

  'terai-style-home': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false })}
    ${tree(100, 480, 1.2)}
    ${teraiHouse()}
    ${tree(680, 500, 1)}
  ${sceneClose()}`,

  'land-residential-plot': () => `${sceneOpen()}
    ${withLandscape()}
    ${boundaryPillars(500, 7)}
    ${signboard(80, 300, 'FOR SALE', 'Residential Plot')}
    ${tree(700, 470, 1)}
  ${sceneClose()}`,

  'land-commercial-corner': () => `${sceneOpen()}
    ${withLandscape({ includeHimalayas: false })}
    <rect x="0" y="470" width="800" height="20" fill="#B8B0A0" />
    <rect x="0" y="490" width="800" height="4" fill="#F7F4EE" opacity="0.6" />
    ${boundaryPillars(430, 8)}
    ${signboard(600, 260, 'COMMERCIAL', 'Corner Plot')}
  ${sceneClose()}`,

  'land-view-plot-pokhara': () => `${sceneOpen()}
    ${himalayas(230)}
    <rect x="0" y="380" width="800" height="40" fill="#6C93A6" opacity="0.5" />
    ${hills()}
    ${groundStrip()}
    ${signboard(340, 300, 'FOR SALE', 'View Plot')}
    ${prayerFlags(560, 300, 160)}
  ${sceneClose()}`,

  'land-agricultural': () => `${sceneOpen()}
    ${himalayas(200)}
    <g>
      <polygon points="0,340 800,320 800,370 0,390" fill="#9CAF52" opacity="0.85" />
      <polygon points="0,390 800,370 800,420 0,440" fill="#8CA047" opacity="0.85" />
      <polygon points="0,440 800,420 800,470 0,490" fill="#7C9040" opacity="0.85" />
      <polygon points="0,490 800,470 800,${H} 0,${H}" fill="#6E8235" opacity="0.85" />
    </g>
    <g transform="translate(120, 380)">
      <rect x="0" y="30" width="70" height="45" fill="${CREAM_WALL}" />
      <polygon points="-8,30 35,8 78,30" fill="${ROOF_TERRACOTTA}" />
    </g>
    ${tree(680, 400, 1)}
  ${sceneClose()}`,
};

for (const [name, build] of Object.entries(scenes)) {
  const svg = build();
  fs.writeFileSync(path.join(OUT_DIR, `${name}.svg`), svg, 'utf8');
  console.log(`Generated: ${name}.svg`);
}

console.log(`\nDone. ${Object.keys(scenes).length} seed images written to ${OUT_DIR}`);
