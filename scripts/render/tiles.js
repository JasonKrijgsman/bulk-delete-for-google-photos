/*
 * Made-up "photos" for the demo pictures: colourful CSS gradients that suggest
 * hills, sea and soft light. Never real photos. The same seed always gives the
 * same tiles, so the rendered images only change when the code changes.
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SKIES = [
    ['#ffd3a5', '#fd6585'], ['#a1c4fd', '#c2e9fb'], ['#fbc2eb', '#a6c1ee'], ['#84fab0', '#8fd3f4'],
    ['#fccb90', '#d57eeb'], ['#f6d365', '#fda085'], ['#89f7fe', '#66a6ff'], ['#ffecd2', '#fcb69f'],
    ['#e0c3fc', '#8ec5fc'], ['#fa709a', '#fee140'], ['#30cfd0', '#330867'], ['#ff9a9e', '#fecfef'],
    ['#667eea', '#764ba2'], ['#a8edea', '#fed6e3'], ['#5ee7df', '#b490ca'], ['#f093fb', '#f5576c']
  ];
  const GROUNDS = ['#2d6a4f', '#40916c', '#1b4332', '#3a5a40', '#5e548e', '#355070', '#6d597a',
    '#264653', '#2a9d8f', '#bc6c25', '#7f5539', '#1d3557'];
  const SEAS = [['#2b6cb0', '#0b2545'], ['#2a9d8f', '#1b4332'], ['#3f37c9', '#240046'], ['#0077b6', '#03045e']];

  function sun(x, y, size) {
    return 'radial-gradient(circle at ' + x + '% ' + y + '%, rgba(255,255,255,0.95) 0 ' + size +
      '%, rgba(255,255,255,0.3) ' + (size + 1) + '%, rgba(255,255,255,0) ' + (size + 9) + '%)';
  }

  // Returns a function that gives the CSS background of the next tile.
  function create(seed) {
    const rng = mulberry32(seed);
    const pick = function (list) { return list[Math.floor(rng() * list.length)]; };
    return function next() {
      const sky = pick(SKIES);
      const kind = rng();
      const sx = 15 + Math.round(rng() * 70);
      const sy = 12 + Math.round(rng() * 26);
      if (kind < 0.42) {
        const h1 = 38 + Math.round(rng() * 22);
        const h2 = 30 + Math.round(rng() * 22);
        const x1 = 10 + Math.round(rng() * 30);
        const x2 = 60 + Math.round(rng() * 30);
        return [
          'radial-gradient(75% ' + h2 + '% at ' + x2 + '% 100%, ' + pick(GROUNDS) + ' 97%, rgba(0,0,0,0) 100%)',
          'radial-gradient(90% ' + h1 + '% at ' + x1 + '% 100%, ' + pick(GROUNDS) + ' 97%, rgba(0,0,0,0) 100%)',
          sun(sx, sy, 5 + Math.round(rng() * 3)),
          'linear-gradient(180deg, ' + sky[0] + ', ' + sky[1] + ')'
        ].join(', ');
      }
      if (kind < 0.7) {
        const sea = pick(SEAS);
        const line = 52 + Math.round(rng() * 14);
        return [
          sun(sx, Math.min(sy, line - 12), 6),
          'linear-gradient(180deg, ' + sky[0] + ' 0%, ' + sky[1] + ' ' + line + '%, ' + sea[0] + ' ' + line +
            '.5%, ' + sea[1] + ' 100%)'
        ].join(', ');
      }
      const layers = [];
      for (let i = 0; i < 3; i++) {
        const cx = Math.round(rng() * 100);
        const cy = Math.round(rng() * 100);
        const r = 10 + Math.round(rng() * 14);
        layers.push('radial-gradient(circle at ' + cx + '% ' + cy + '%, rgba(255,255,255,0.42) 0 ' + r +
          '%, rgba(255,255,255,0) ' + (r + 1) + '%)');
      }
      layers.push('linear-gradient(' + (100 + Math.round(rng() * 80)) + 'deg, ' + sky[0] + ', ' + sky[1] + ')');
      return layers.join(', ');
    };
  }

  root.DemoTiles = { create: create, mulberry32: mulberry32 };
})(window);
