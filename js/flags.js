// Simplified national flags drawn on canvas.
window.HOA = window.HOA || {};

// prettier-ignore
HOA.FLAGS = {
  UKR: ['h', '#0057b7', '#ffd700'], RUS: ['h', '#ffffff', '#0039a6', '#d52b1e'], BLR: ['h', '#c8313e', '#c8313e', '#4aa657'],
  POL: ['h', '#ffffff', '#dc143c'], DEU: ['h', '#000000', '#dd0000', '#ffce00'], FRA: ['v', '#0055a4', '#ffffff', '#ef4135'],
  ITA: ['v', '#009246', '#ffffff', '#ce2b37'], ESP: ['h', '#aa151b', '#f1bf00', '#f1bf00', '#aa151b'], SVK: ['h', '#ffffff', '#0b4ea2', '#ee1c25'],
  HUN: ['h', '#ce2939', '#ffffff', '#477050'], ROU: ['v', '#002b7f', '#fcd116', '#ce1126'], BGR: ['h', '#ffffff', '#00966e', '#d62612'],
  NLD: ['h', '#ae1c28', '#ffffff', '#21468b'], BEL: ['v', '#000000', '#fdda24', '#ef3340'], LUX: ['h', '#ed2939', '#ffffff', '#00a1de'],
  LTU: ['h', '#fdb913', '#006a44', '#c1272d'], LVA: ['h', '#9e3039', '#9e3039', '#ffffff', '#9e3039', '#9e3039'], EST: ['h', '#0072ce', '#000000', '#ffffff'],
  AUT: ['h', '#ed2939', '#ffffff', '#ed2939'], IRL: ['v', '#169b62', '#ffffff', '#ff883e'], PRT: ['v', '#006600', '#006600', '#ff0000', '#ff0000', '#ff0000'],
  IRN: ['h', '#239f40', '#ffffff', '#da0000'], IRQ: ['h', '#ce1126', '#ffffff', '#000000'], SYR: ['h', '#007a3d', '#ffffff', '#000000'],
  EGY: ['h', '#ce1126', '#ffffff', '#000000'], SRB: ['h', '#c6363c', '#0c4076', '#ffffff'], HRV: ['h', '#ff0000', '#ffffff', '#171796'],
  SVN: ['h', '#ffffff', '#0000ff', '#ff0000'], MDA: ['v', '#0046ae', '#ffd200', '#cc092f'], ARM: ['h', '#d90012', '#0033a0', '#f2a800'],
  AZE: ['h', '#00b5e2', '#ef3340', '#509e2f'], ARG: ['h', '#74acdf', '#ffffff', '#74acdf'], MEX: ['v', '#006847', '#ffffff', '#ce1126'],
  IND: ['h', '#ff9933', '#ffffff', '#138808'], ISR: ['h', '#ffffff', '#0038b8', '#ffffff', '#ffffff', '#0038b8', '#ffffff'],
  NGA: ['v', '#008751', '#ffffff', '#008751'], COL: ['h', '#fcd116', '#fcd116', '#003893', '#ce1126'], CHL: ['h', '#ffffff', '#d52b1e'],
  PER: ['v', '#d91023', '#ffffff', '#d91023'], VEN: ['h', '#ffcc00', '#00247d', '#cf142b'], THA: ['h', '#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931'],
  IDN: ['h', '#ce1126', '#ffffff'], UZB: ['h', '#0099b5', '#ffffff', '#1eb53a'], TJK: ['h', '#cc0000', '#ffffff', '#006600'],
  MNG: ['v', '#c4272f', '#015197', '#c4272f'], AFG: ['v', '#000000', '#000000', '#ffffff'], YEM: ['h', '#ce1126', '#ffffff', '#000000'],
  KOS: ['h', '#244aa5'], SAU: ['h', '#006c35'], QAT: ['v', '#ffffff', '#8a1538', '#8a1538', '#8a1538'], KWT: ['h', '#007a3d', '#ffffff', '#ce1126'],
  ARE: ['h', '#00732f', '#ffffff', '#000000'], LBN: ['h', '#ed1c24', '#ffffff', '#ffffff', '#ed1c24'], JOR: ['h', '#000000', '#ffffff', '#007a3d'],
  MKD: ['h', '#d20000'], ALB: ['h', '#e41e20'], KGZ: ['h', '#e8112d'], CUB: ['h', '#002a8f', '#ffffff', '#002a8f', '#ffffff', '#002a8f'],
  FIN: ['nordic', '#ffffff', '#002f6c'], SWE: ['nordic', '#006aa7', '#fecc00'], NOR: ['nordic', '#ba0c2f', '#ffffff', '#00205b'],
  DNK: ['nordic', '#c8102e', '#ffffff'], ISL: ['nordic', '#02529c', '#ffffff', '#dc1e35'],
  CHE: ['cross', '#d52b1e', '#ffffff'], GEO: ['cross', '#ffffff', '#ff0000'],
  JPN: ['disc', '#ffffff', '#bc002d'], BGD: ['disc', '#006a4e', '#f42a41'], KOR: ['disc', '#ffffff', '#cd2e3a'], KAZ: ['disc', '#00afca', '#fec50c'],
  CHN: ['star', '#ee1c25', '#ffff00'], VNM: ['star', '#da251d', '#ffff00', 'center'], TWN: ['canton', '#fe0000', '#000095'],
  USA: ['usa'], GBR: ['uk'], AUS: ['canton', '#012169', '#012169'], NZL: ['canton', '#012169', '#012169'],
  CAN: ['v', '#d52b1e', '#ffffff', '#ffffff', '#d52b1e'], CZE: ['cze'], TUR: ['tur', '#e30a17'], PAK: ['tur', '#01411c'],
  GRC: ['grc'], BRA: ['bra'], PRK: ['h', '#024fa2', '#ed1c27', '#ed1c27', '#024fa2'], ZAF: ['h', '#e03c31', '#007749', '#001489'],
  BIH: ['h', '#002395'], MNE: ['h', '#c40308'], ETH: ['h', '#078930', '#fcdd09', '#da121a'], DZA: ['v', '#006233', '#ffffff'], MAR: ['h', '#c1272d'],
};

HOA._flagCache = {};
HOA.flagURL = function (tag, w, h) {
  const key = tag + w + 'x' + h;
  if (HOA._flagCache[key]) return HOA._flagCache[key];
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  HOA.drawFlag(ctx, tag, w, h);
  return (HOA._flagCache[key] = c.toDataURL());
};

HOA.drawFlag = function (ctx, tag, w, h) {
  const f = HOA.FLAGS[tag];
  const S = HOA.S;
  const col = S && S.countries[tag] ? S.countries[tag].color : '#777';
  if (!f) {
    ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.round(h * 0.45)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tag.startsWith('X') ? '•' : tag, w / 2, h / 2 + 1);
    return;
  }
  const [kind, ...cs] = f;
  if (kind === 'h' || kind === 'v') {
    const n = cs.length;
    cs.forEach((c, i) => {
      ctx.fillStyle = c;
      if (kind === 'h') ctx.fillRect(0, (i * h) / n, w, h / n + 0.5);
      else ctx.fillRect((i * w) / n, 0, w / n + 0.5, h);
    });
    if (tag === 'IND') { ctx.strokeStyle = '#000080'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w / 2, h / 2, h / 8, 0, 7); ctx.stroke(); }
    if (tag === 'CAN') { ctx.fillStyle = '#d52b1e'; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.2); ctx.lineTo(w * 0.62, h * 0.55); ctx.lineTo(w / 2, h * 0.75); ctx.lineTo(w * 0.38, h * 0.55); ctx.fill(); }
    if (tag === 'ISR') { ctx.strokeStyle = '#0038b8'; ctx.lineWidth = 1; HOA.star6(ctx, w / 2, h / 2, h * 0.17); }
    return;
  }
  switch (kind) {
    case 'nordic': {
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      const t = h * 0.2, x = w * 0.36;
      ctx.fillStyle = cs[1]; ctx.fillRect(0, h / 2 - t / 2 - (cs[2] ? t * 0.25 : 0), w, t * (cs[2] ? 1.5 : 1)); ctx.fillRect(x - t / 2 - (cs[2] ? t * 0.25 : 0), 0, t * (cs[2] ? 1.5 : 1), h);
      if (cs[2]) { ctx.fillStyle = cs[2]; ctx.fillRect(0, h / 2 - t / 2, w, t); ctx.fillRect(x - t / 2, 0, t, h); }
      break;
    }
    case 'cross':
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cs[1]; ctx.fillRect(w / 2 - h * 0.1, h * 0.15, h * 0.2, h * 0.7); ctx.fillRect(w / 2 - h * 0.35, h * 0.4, h * 0.7, h * 0.2);
      break;
    case 'disc':
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cs[1]; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.3, 0, 7); ctx.fill();
      if (tag === 'KOR') { ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI); ctx.fill(); }
      break;
    case 'star':
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cs[1]; ctx.beginPath();
      if (cs[2]) HOA.star(ctx, w / 2, h / 2, h * 0.3, h * 0.12); else HOA.star(ctx, w * 0.17, h * 0.27, h * 0.16, h * 0.065);
      ctx.fill();
      break;
    case 'canton':
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = cs[1]; ctx.fillRect(0, 0, w / 2, h / 2);
      if (tag === 'AUS' || tag === 'NZL') { ctx.fillStyle = '#fff'; ctx.beginPath(); HOA.star(ctx, w * 0.75, h * 0.6, h * 0.1, h * 0.04); ctx.fill(); HOA.miniUK(ctx, w / 2, h / 2); }
      break;
    case 'usa': {
      for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#b22234'; ctx.fillRect(0, (i * h) / 13, w, h / 13 + 0.5); }
      ctx.fillStyle = '#3c3b6e'; ctx.fillRect(0, 0, w * 0.4, (h * 7) / 13);
      ctx.fillStyle = '#fff';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) ctx.fillRect(w * 0.03 + c * w * 0.075, h * 0.05 + r * h * 0.12, 1, 1);
      break;
    }
    case 'uk': HOA.miniUK(ctx, w, h); break;
    case 'cze':
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = '#d7141a'; ctx.fillRect(0, h / 2, w, h / 2);
      ctx.fillStyle = '#11457e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w / 2, h / 2); ctx.lineTo(0, h); ctx.fill();
      break;
    case 'tur':
      ctx.fillStyle = cs[0]; ctx.fillRect(0, 0, w, h);
      if (tag === 'PAK') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w * 0.25, h); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * 0.42, h / 2, h * 0.25, 0, 7); ctx.fill();
      ctx.fillStyle = cs[0]; ctx.beginPath(); ctx.arc(w * 0.46, h / 2, h * 0.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); HOA.star(ctx, w * 0.62, h / 2, h * 0.1, h * 0.04); ctx.fill();
      break;
    case 'grc':
      for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#0d5eaf'; ctx.fillRect(0, (i * h) / 9, w, h / 9 + 0.5); }
      ctx.fillStyle = '#0d5eaf'; ctx.fillRect(0, 0, w * 0.37, (h * 5) / 9);
      ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.15, 0, w * 0.07, (h * 5) / 9); ctx.fillRect(0, h * 0.22, w * 0.37, h * 0.11);
      break;
    case 'bra':
      ctx.fillStyle = '#009c3b'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffdf00'; ctx.beginPath(); ctx.moveTo(w * 0.1, h / 2); ctx.lineTo(w / 2, h * 0.1); ctx.lineTo(w * 0.9, h / 2); ctx.lineTo(w / 2, h * 0.9); ctx.fill();
      ctx.fillStyle = '#002776'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.22, 0, 7); ctx.fill();
      break;
  }
};
HOA.miniUK = function (ctx, w, h) {
  ctx.fillStyle = '#012169'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = h * 0.2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.strokeStyle = '#c8102e'; ctx.lineWidth = h * 0.07;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(w / 2 - h * 0.17, 0, h * 0.34, h); ctx.fillRect(0, h / 2 - h * 0.17, w, h * 0.34);
  ctx.fillStyle = '#c8102e'; ctx.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h); ctx.fillRect(0, h / 2 - h * 0.1, w, h * 0.2);
};
HOA.star6 = function (ctx, x, y, r) {
  ctx.beginPath();
  for (const off of [0, Math.PI]) {
    for (let i = 0; i < 3; i++) {
      const a = off - Math.PI / 2 + (i * 2 * Math.PI) / 3;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  ctx.stroke();
};
