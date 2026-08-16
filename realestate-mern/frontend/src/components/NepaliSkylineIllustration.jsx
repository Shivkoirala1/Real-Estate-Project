import React from 'react';

// An original, stylized silhouette of a Kathmandu Valley skyline: distant hills,
// a tiered pagoda-style temple, and a row of traditional Newari houses with
// sloped tiled roofs. Built as flat vector shapes (not a photo or reproduction
// of any specific artwork) so it can freely take the site's navy/brass palette.
const NepaliSkylineIllustration = ({ className = '' }) => (
  <svg
    viewBox="0 0 1600 640"
    preserveAspectRatio="xMidYMax slice"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Distant hills */}
    <polygon
      points="0,300 120,240 260,285 420,210 560,270 720,225 880,275 1040,220 1200,270 1360,230 1500,265 1600,235 1600,640 0,640"
      fill="#F7F4EE"
      opacity="0.05"
    />
    {/* Mid hills */}
    <polygon
      points="0,380 180,340 360,365 540,325 720,360 900,335 1080,365 1260,330 1440,360 1600,335 1600,640 0,640"
      fill="#F7F4EE"
      opacity="0.07"
    />

    {/* Row of traditional Newari houses, left cluster */}
    <g fill="#F7F4EE" opacity="0.09">
      {[
        { x: 60, w: 90, h: 120 },
        { x: 160, w: 70, h: 95 },
        { x: 240, w: 100, h: 140 },
        { x: 350, w: 75, h: 105 },
      ].map((h, i) => (
        <g key={i} transform={`translate(${h.x}, ${430 - h.h})`}>
          {/* body */}
          <rect x="0" y={h.h * 0.28} width={h.w} height={h.h * 0.72} />
          {/* sloped roof with eave overhang */}
          <polygon
            points={`-8,${h.h * 0.3} ${h.w / 2},0 ${h.w + 8},${h.h * 0.3}`}
          />
          <rect x={-10} y={h.h * 0.28} width={h.w + 20} height="6" />
        </g>
      ))}
    </g>

    {/* Central tiered pagoda temple */}
    <g fill="#B8863B" opacity="0.85" transform="translate(1120, 155)">
      {/* spire finial */}
      <rect x="-3" y="-40" width="6" height="40" />
      <circle cx="0" cy="-44" r="6" />
      {/* tier 5 (top) */}
      <polygon points="-46,10 0,-24 46,10" />
      <rect x="-30" y="10" width="60" height="18" />
      {/* tier 4 */}
      <polygon points="-68,44 0,4 68,44" />
      <rect x="-46" y="44" width="92" height="20" />
      {/* tier 3 */}
      <polygon points="-92,84 0,40 92,84" />
      <rect x="-64" y="84" width="128" height="22" />
      {/* tier 2 */}
      <polygon points="-118,128 0,80 118,128" />
      <rect x="-84" y="128" width="168" height="24" />
      {/* tier 1 / base roof */}
      <polygon points="-146,176 0,124 146,176" />
      <rect x="-108" y="176" width="216" height="28" />
      {/* plinth */}
      <rect x="-128" y="204" width="256" height="26" />
    </g>

    {/* Row of traditional Newari houses, right cluster */}
    <g fill="#F7F4EE" opacity="0.09">
      {[
        { x: 1290, w: 85, h: 100 },
        { x: 1385, w: 105, h: 135 },
        { x: 1495, w: 75, h: 90 },
      ].map((h, i) => (
        <g key={i} transform={`translate(${h.x}, ${430 - h.h})`}>
          <rect x="0" y={h.h * 0.28} width={h.w} height={h.h * 0.72} />
          <polygon points={`-8,${h.h * 0.3} ${h.w / 2},0 ${h.w + 8},${h.h * 0.3}`} />
          <rect x={-10} y={h.h * 0.28} width={h.w + 20} height="6" />
        </g>
      ))}
    </g>

    {/* Ground line */}
    <rect x="0" y="428" width="1600" height="2" fill="#F7F4EE" opacity="0.08" />

    {/* Prayer flag garland strung across the sky, a small authentic touch */}
    <path d="M 40 60 Q 400 140 900 70 T 1560 90" stroke="#B8863B" strokeWidth="1.5" fill="none" opacity="0.3" />
    {Array.from({ length: 14 }).map((_, i) => {
      const t = i / 13;
      const x = 40 + t * 1520;
      const y = 60 + Math.sin(t * Math.PI) * -75 + t * 30;
      const colors = ['#B8863B', '#F7F4EE', '#3C6E52', '#A6472F'];
      return <rect key={i} x={x - 4} y={y} width="8" height="10" fill={colors[i % colors.length]} opacity="0.35" />;
    })}
  </svg>
);

export default NepaliSkylineIllustration;
