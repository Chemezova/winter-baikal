/* Зимний Байкал — приложение-путеводитель.
   Содержимое приходит зашифрованным (data/guide.bin, data/img/*.bin) и открывается личным кодом покупателя.
   Экраны рисуются из записей путеводителя: статьи, локации (вкладки), гостиницы, маршруты. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem('wb-' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('wb-' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = s => String(s ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*+/g, '');

/** **жирный**, *курсив*, [текст](адрес) → HTML */
function md(s) {
  let t = esc(s);
  t = t.replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, (m, txt, url) => `<a href="${url.replace(/"/g, '%22')}" target="_blank" rel="noopener">${txt}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
  return t.replace(/\n\n/g, '<br><br>');
}

const ICO = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="18" r=".8"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  pin: '<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  phone: '<path d="M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  bed: '<path d="M3 18v-7M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="11" r="1.8"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;
const flake = '<span class="flake"></span>';

const NERPA = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <g fill="none" stroke="#c9dcee" stroke-width="3"><ellipse cx="37" cy="45" rx="23" ry="14"/><circle cx="27" cy="29" r="17"/><path d="M56 43c4-2 6 0 5 3-1 2-4 2-6 1"/></g>
  <g fill="#ffffff"><ellipse cx="37" cy="45" rx="23" ry="14"/><circle cx="27" cy="29" r="17"/><path d="M56 43c4-2 6 0 5 3-1 2-4 2-6 1z"/></g>
  <ellipse cx="41" cy="54" rx="7" ry="3.2" transform="rotate(-18 41 54)" fill="#e6eff8"/>
  <ellipse cx="16.5" cy="33" rx="2.8" ry="1.6" fill="#f5c4d0" opacity=".8"/><ellipse cx="37.5" cy="33" rx="2.8" ry="1.6" fill="#f5c4d0" opacity=".8"/>
  <circle cx="21" cy="27" r="4.4" fill="#1b2433"/><circle cx="33" cy="27" r="4.4" fill="#1b2433"/>
  <circle cx="22.4" cy="25.5" r="1.4" fill="#fff"/><circle cx="34.4" cy="25.5" r="1.4" fill="#fff"/>
  <ellipse cx="27" cy="33" rx="2.3" ry="1.6" fill="#1b2433"/>
  <path d="M24.6 35.6q2.4 1.8 4.8 0" fill="none" stroke="#1b2433" stroke-width="1.2" stroke-linecap="round"/>
  <g fill="#9fb3c8"><circle cx="21" cy="34.5" r=".8"/><circle cx="19.5" cy="36.5" r=".8"/><circle cx="33" cy="34.5" r=".8"/><circle cx="34.5" cy="36.5" r=".8"/></g>
</svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ---------------- шифрование ---------------- */

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Как в tools/build_app.py: заглавные, кириллица-двойники → латиница, без пробелов и дефисов, с префиксом. */
function normCode(code) {
  const lat = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };
  let c = String(code).toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, ch => lat[ch]).replace(/[^A-Z0-9]/g, '');
  if (c.length === 8) c = 'BAIKAL' + c;
  return c;
}

let KEY = null;

async function unlock(code) {
  const keys = await (await fetch('data/keys.json')).json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64(keys.salt), iterations: keys.iterations, hash: 'SHA-256' }, base, 512));
  const id = hex(await crypto.subtle.digest('SHA-256', bits.slice(32))).slice(0, 24);
  const wrapped = keys.entries[id];
  if (!wrapped) return null;
  const raw = b64(wrapped);
  const wrapKey = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['decrypt']);
  const k = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, wrapKey, raw.slice(12));
  return crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['decrypt']);
}

async function openFile(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, KEY, buf.slice(12));
}

/* ---------------- данные ---------------- */

let D = null;            // весь путеводитель
const imgCache = new Map();

async function loadGuide() {
  D = JSON.parse(new TextDecoder().decode(await openFile('data/guide.bin')));
  D.hotelList = Object.entries(D.hotels).map(([id, h]) => ({ id, ...h }));
}

function imgURL(path) {
  if (!imgCache.has(path)) {
    const file = D.img[path];
    imgCache.set(path, file
      ? openFile('data/img/' + file).then(b => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })))
      : Promise.resolve(''));
  }
  return imgCache.get(path);
}

const img = (path, alt = '') => path ? `<img class="dec" data-img="${esc(path)}" alt="${esc(alt)}">` : '';

const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    showImg(e.target);
  }
}, { rootMargin: '400px 0px' }) : null;

function showImg(el) {
  imgURL(el.dataset.img).then(u => { if (u) { el.src = u; el.onload = () => el.classList.add('ok'); } });
}

function hydrate(root) {
  $$('img[data-img]:not([src])', root).forEach(el => (io ? io.observe(el) : showImg(el)));
}

/* ---------------- избранное и план ---------------- */

let favs = store.get('favs', []);
const isFav = key => favs.includes(key);
function toggleFav(key) {
  favs = isFav(key) ? favs.filter(k => k !== key) : [...favs, key];
  store.set('favs', favs);
  $$(`[data-fav="${key}"]`).forEach(b => b.setAttribute('aria-pressed', isFav(key)));
  toast(isFav(key) ? 'Добавлено в избранное' : 'Убрано из избранного');
}
const favBtn = (key, glass) => `<button class="iconbtn${glass ? ' glass' : ''}" type="button" data-fav="${key}" aria-pressed="${isFav(key)}" aria-label="В избранное">${icon('heart')}</button>`;

/* ---------------- блоки ---------------- */

function mapButtons([lat, lon]) {
  return `<div class="btnrow"><a class="btn" href="https://yandex.ru/maps/?pt=${lon},${lat}&z=14&l=map" target="_blank" rel="noopener">Яндекс Карты</a>`
    + `<a class="btn" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Google</a></div>`;
}
const linkBtns = links => Object.entries(links || {}).map(([t, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join('');
const phoneLinks = phones => `<div class="phones">${(phones || []).map(p => `<a href="tel:${p.replace(/[^\d+]/g, '')}">${icon('phone')}${esc(p)}</a>`).join('')}</div>`;
const snowList = (items, kind = 'list') => `<ul class="snow ${kind}">${(items || []).map(x =>
  `<li>${kind === 'pros' ? '<span class="mark">+</span>' : kind === 'cons' ? '<span class="mark">−</span>' : flake}<span>${md(x)}</span></li>`).join('')}</ul>`;

function block(b) {
  const k = Object.keys(b)[0];
  const v = b[k];
  const id = b.anchor ? ` id="a-${esc(b.anchor)}"` : '';
  switch (k) {
    case 'text': return `<p>${md(v)}</p>`;
    case 'heading': return `<h2${id}>${md(plain(v))}</h2>`;
    case 'subheading': case 'subtitle': return `<h3${id}>${md(plain(v))}</h3>`;
    case 'label': case 'dayno': return `<h4 class="label">${md(v)}</h4>`;
    case 'callout': return `<p class="callout">${md(v)}</p>`;
    case 'caption': return `<p class="muted small">${md(v)}</p>`;
    case 'list': case 'pros': case 'cons': return snowList(v, k);
    case 'photo': return `<figure><div class="frame">${img(v)}</div>${b.caption ? `<figcaption>${md(b.caption)}</figcaption>` : ''}</figure>`;
    case 'gallery': return `<div class="gallery">${v.map(g => `<figure><div class="frame">${img(g.img)}</div>${g.caption ? `<figcaption>${md(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
    case 'map': return `<div class="mapbox">${v.img ? `<div class="frame">${img(v.img)}</div>` : ''}<div class="row">${v.caption ? `<span>${md(v.caption)}</span>` : ''}${linkBtns(v.links)}</div></div>`;
    case 'link': return `<a class="linkbtn" href="${esc(v.url)}" target="_blank" rel="noopener"><span>${md(plain(v.title))}</span>${icon('chev')}</a>`;
    case 'links': return `<div class="stack" style="gap:8px">${v.map(x => `<a class="linkbtn" href="${esc(x.url)}" target="_blank" rel="noopener"><span>${esc(x.title)}${x.note ? `<small>${md(x.note)}</small>` : ''}</span>${icon('chev')}</a>`).join('')}</div>`;
    case 'plate': return `<div class="plate"${v.id ? ` id="a-${esc(v.id)}"` : ''}><h4>${flake}${md(plain(v.title))}</h4>${v.text ? `<p class="small">${md(v.text)}</p>` : ''}${v.hours ? `<div class="hours">${md(v.hours)}</div>` : ''}${v.links ? `<div class="btnrow">${linkBtns(v.links)}</div>` : ''}</div>`;
    case 'sights': return `<div class="sights">${v.map(s => `<div class="sight"><div class="nm">${md(s.name)}${s.where ? `<small>${md(s.where)}</small>` : ''}</div>${mapButtons(s.coords)}</div>`).join('')}</div>`;
    case 'prices': return `<table class="prices">${v.map(x => `<tr><td>${md(x.title)}</td><td>${md(x.price)}</td></tr>`).join('')}</table>`;
    case 'organizers': return v.map(o => `<div class="card"><h4>${md(o.name)}</h4>${o.contact ? `<p class="muted small">${md(o.contact)}</p>` : ''}${phoneLinks(o.phones)}${o.trips ? snowList(o.trips) : ''}${o.links ? `<div class="btnrow">${linkBtns(o.links)}</div>` : ''}</div>`).join('');
    case 'excursion': return `<div class="card">${v.img ? `<div class="frame">${img(v.img)}</div>` : ''}<h4>${md(v.title)}</h4>${v.text ? `<p class="small">${md(v.text)}</p>` : ''}${v.contacts ? phoneLinks(v.contacts.map(c => c.phone)) : ''}${v.links ? `<div class="btnrow">${linkBtns(v.links)}</div>` : ''}</div>`;
    case 'slot': return `<h4 class="label">${md(v)}</h4>`;
    default: return '';
  }
}
const blocks = list => `<div class="blocks">${(list || []).map(block).join('')}</div>`;

/* ---------------- экраны ---------------- */

const groups = () => D.guide.menu;
const groupOf = (kind, id) => groups().find(g => g.items.some(it => it[kind] === id));
const titleOf = (kind, id) => {
  const r = { page: D.pages, place: D.places, route: D.routes }[kind]?.[id];
  if (!r) return id;
  return kind === 'route' ? `Маршрут №${r.number}. ${r.title}` : (r.title || r.name);
};
const TABS = { about: 'Обзор', way: 'Как добраться', stay: 'Где жить', todo: 'Экскурсии и билеты' };
const tabBlocks = v => Array.isArray(v) ? v : (v?.blocks || []);

function topbar(title, extra = '') {
  return `<div class="topbar gut"><button class="iconbtn" type="button" data-back aria-label="Назад">${icon('back')}</button><span class="title">${esc(title)}</span>${extra}</div>`;
}

function hero(cover, eyebrow, title, favKey) {
  return `<div class="hero">${img(cover, title)}<div class="nav gut"><button class="iconbtn glass" type="button" data-back aria-label="Назад">${icon('back')}</button>${favKey ? favBtn(favKey, true) : ''}</div>`
    + `<div class="t gut">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${esc(title)}</h1></div></div>`;
}

function screenHome() {
  const placesGrp = groups().find(g => g.items.some(i => i.place));
  const prep = groups().find(g => g.group.startsWith('Подготовка'));
  const about = groups().find(g => g.group.startsWith('О путеводителе'));
  const plan = store.get('plan', null);
  let planCard;
  if (plan && D.routes[plan.route]) {
    const r = D.routes[plan.route];
    const days = routeDays(r, plan.version);
    const a = new Date(plan.start + 'T12:00:00'), z = new Date(a.getTime() + (days.length - 1) * 864e5);
    const f = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
    planCard = `<a class="plan" href="#/route/${plan.route}"><span class="ic">${icon('cal')}</span><span><b>Мой план: маршрут №${r.number}</b><small>${f.format(a)} — ${f.format(z)} · ${days.length} дн.</small></span></a>`;
  } else {
    planCard = `<a class="plan" href="#/routes"><span class="ic">${icon('cal')}</span><span><b>Спланировать поездку</b><small>Выберите готовый маршрут и даты — план по дням будет всегда под рукой</small></span></a>`;
  }
  return `<div class="topbar gut"><span class="brandline">${flake}${esc(D.guide.title)}</span></div>
  <div class="gut">
    <div class="block stack">
      <button class="searchbar" type="button" data-nerpa>Что ищем? Спросите нерпёнка${NERPA}</button>
      ${planCard}
    </div>
    <div class="block stack">
      <div class="rowhead"><h2>${esc(placesGrp.group)}</h2><a href="#/menu">Все разделы</a></div>
      <div class="carousel">${placesGrp.items.map(it => {
        const p = D.places[it.place];
        return p ? `<a class="pcard" href="#/place/${it.place}/about"><span class="ph">${img(p.cover)}<span>${esc(p.title)}</span></span></a>` : '';
      }).join('')}</div>
    </div>
    <div class="block stack">
      <div class="rowhead"><h2>Готовые маршруты</h2></div>
      ${routeCards()}
    </div>
    <div class="block stack">
      <div class="rowhead"><h2>${esc(prep.group)}</h2></div>
      <div class="tiles">${prep.items.map(it => {
        const p = D.pages[it.page];
        if (!p) return '';
        return `<a class="tile${p.cover ? '' : ' noimg'}" href="#/page/${it.page}">${img(p.cover)}<span>${esc(p.title)}</span></a>`;
      }).join('')}</div>
    </div>
    <div class="block stack" style="padding-bottom:24px">
      <div class="rowhead"><h2>${esc(about.group)}</h2></div>
      <div class="list-links">${about.items.map(it => `<a href="#/page/${it.page}">${flake}${esc(titleOf('page', it.page))}${icon('chev')}</a>`).join('')}</div>
    </div>
  </div>`;
}

function routeCards() {
  return `<div class="stack" style="gap:10px">${Object.entries(D.routes).sort((a, b) => a[1].number - b[1].number).map(([id, r]) =>
    `<a class="rcard" href="#/route/${id}"><span class="ph">${img(r.cover)}</span><span><span class="eyebrow">Маршрут №${r.number} · ${esc(plain(r.subtitle || '').replace(/^Поездк\S* на зимний Байкал на /i, ''))}</span><b>${esc(r.title)}</b><small>${esc(r.where || '')}</small></span></a>`).join('')}</div>`;
}

function anchorsOf(list) {
  return (list || []).filter(b => b.anchor && (b.heading || b.subheading)).map(b => [b.anchor, plain(b.heading || b.subheading)]);
}

let menuOpen = new Set(store.get('menuOpen', []));
function screenMenu() {
  return `<div class="topbar gut"><span class="title">Содержание</span></div>
  <div class="gut"><div class="block"><input class="filter" id="menu-filter" type="search" placeholder="Найти раздел" aria-label="Найти раздел"></div>
  <div id="tree">${menuTree('')}</div><div style="height:24px"></div></div>`;
}

function menuTree(filter) {
  const f = filter.trim().toLowerCase();
  const out = [];
  for (const g of groups()) {
    const rows = [];
    for (const it of g.items) {
      const [kind, id] = Object.entries(it)[0];
      const rec = { page: D.pages, place: D.places, route: D.routes }[kind]?.[id];
      if (!rec) continue;
      const title = titleOf(kind, id);
      let kids = [];
      if (kind === 'place') {
        for (const [tab, name] of Object.entries(TABS)) {
          if (!tabBlocks(rec[tab]).length && !(tab === 'stay' && D.hotelList.some(h => h.place === id))) continue;
          kids.push([`#/place/${id}/${tab}`, name]);
          for (const [a, t] of anchorsOf(tabBlocks(rec[tab]))) if (t !== name && !t.startsWith(name)) kids.push([`#/place/${id}/${tab}?a=${a}`, t]);
        }
      } else if (kind === 'page') {
        kids = anchorsOf(rec.blocks).map(([a, t]) => [`#/page/${id}?a=${a}`, t]);
      }
      const href = kind === 'place' ? `#/place/${id}/about` : `#/${kind}/${id}`;
      const match = !f || title.toLowerCase().includes(f) || kids.some(k => k[1].toLowerCase().includes(f));
      if (!match) continue;
      const key = `${kind}:${id}`;
      const open = kids.length && (f ? true : menuOpen.has(key));
      const th = rec.cover ? `<span class="th">${img(rec.cover)}</span>` : `<span class="th">${flake}</span>`;
      const row = kids.length
        ? `<button class="row" type="button" data-node="${key}" aria-expanded="${!!open}">${th}<b>${esc(title)}</b><span class="chev">${icon('chev')}</span></button>`
        : `<a class="row" href="${href}">${th}<b>${esc(title)}</b><span class="chev">${icon('chev')}</span></a>`;
      const kidsHtml = open ? `<div class="kids">${kind !== 'place' ? `<a class="kid" href="${href}">${flake}Открыть раздел</a>` : ''}${kids.map(([h, t]) => `<a class="kid" href="${h}">${flake}${esc(t)}</a>`).join('')}</div>` : '';
      rows.push(`<div class="node${open ? ' open' : ''}">${row}${kidsHtml}</div>`);
    }
    if (rows.length) out.push(`<div class="eyebrow grp-title">${esc(g.group)}</div>${rows.join('')}`);
  }
  return out.join('') || '<p class="empty">Такого раздела нет. Попробуйте спросить нерпёнка.</p>';
}

function screenPage(id) {
  const p = D.pages[id];
  if (!p) return notFound();
  const g = groupOf('page', id);
  const head = p.cover ? hero(p.cover, g?.group, p.title, `page:${id}`) : topbar(p.title, favBtn(`page:${id}`));
  const list = (p.blocks || []).filter((b, i) => !(i === 0 && b.heading && plain(b.heading) === p.title));
  return `${head}<div class="gut">${p.cover ? '' : `<h1 class="plain-head">${esc(p.title)}</h1>`}${blocks(list)}</div>`;
}

/* --- локация --- */
const hotelState = {};

function screenPlace(id, tab) {
  const p = D.places[id];
  if (!p) return notFound();
  const has = t => tabBlocks(p[t]).length || (t === 'stay' && D.hotelList.some(h => h.place === id));
  const tabs = Object.keys(TABS).filter(has);
  if (!tabs.includes(tab)) tab = tabs[0];
  const g = groupOf('place', id);
  let body;
  if (tab === 'stay') body = staySection(id, p);
  else body = blocks(tabBlocks(p[tab]).filter((b, i) => !(i === 0 && b.heading && Object.values(TABS).some(n => plain(b.heading).startsWith(n.split(' ')[0])))));
  return `${hero(p.cover, g?.group, p.title, `place:${id}`)}
  <nav class="seg gut" aria-label="Разделы локации">${tabs.map(t => `<a href="#/place/${id}/${t}" ${t === tab ? 'aria-current="page"' : ''}>${TABS[t]}</a>`).join('')}</nav>
  <div class="gut">${body}</div>`;
}

function staySection(id, p) {
  const stay = p.stay || {};
  const areas = (!Array.isArray(stay) && stay.areas) || {};
  const all = D.hotelList.filter(h => h.place === id);
  const st = hotelState[id] || (hotelState[id] = { area: 'all', sort: 'rec' });
  const used = Object.keys(areas).filter(a => all.some(h => h.area === a));
  let list = all.filter(h => st.area === 'all' || h.area === st.area);
  if (st.sort === 'price') list = [...list].sort((a, b) => (a.price_from || 1e9) - (b.price_from || 1e9));
  else if (st.sort === 'rating') list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list = [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
  const intro = tabBlocks(stay).filter((b, i) => !(i === 0 && b.heading));
  const word = n => n % 10 === 1 && n % 100 !== 11 ? 'гостиница' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'гостиницы' : 'гостиниц';
  return `${blocks(intro)}
  ${all.length ? `<div class="stack" id="hotels" style="padding-bottom:28px">
    ${used.length > 1 ? `<div class="chips" role="group" aria-label="Район"><button class="chip" type="button" data-area="all" aria-pressed="${st.area === 'all'}">Все</button>${used.map(a => `<button class="chip" type="button" data-area="${a}" aria-pressed="${st.area === a}">${esc(plain(areas[a].name))}</button>`).join('')}</div>` : ''}
    ${st.area !== 'all' && areas[st.area]?.text ? `<p class="areanote">${md(areas[st.area].text)}</p>` : ''}
    <div class="sortrow"><span>${list.length} ${word(list.length)}</span><label>Сортировать: <select data-sort aria-label="Сортировка">
      <option value="rec" ${st.sort === 'rec' ? 'selected' : ''}>как советую</option><option value="price" ${st.sort === 'price' ? 'selected' : ''}>дешевле</option><option value="rating" ${st.sort === 'rating' ? 'selected' : ''}>по оценке</option></select></label></div>
    ${list.map(h => hotelCard(h, st.area === 'all' && used.length > 1 ? plain(areas[h.area]?.name || '') : '')).join('')}
  </div>` : ''}`;
}

function hotelCard(h, areaName) {
  const meta = [];
  if (h.rating) meta.push(`<span class="r"><b>${String(h.rating).replace('.', ',')}</b> Booking</span>`);
  if (h.price_from) meta.push(`<span class="price">от ${h.price_from.toLocaleString('ru-RU')} ₽</span>`);
  const site = h.site ? (/^https?:/.test(h.site) ? h.site : 'http://' + h.site) : '';
  const book = Object.entries(h.booking || {}).map(([k, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener sponsored">${esc(D.partners[k]?.name || k)}</a>`).join('');
  const long = (h.text || '').length > 220;
  return `<article class="hotel" id="h-${h.id}">
    <div class="top"><div><h4>${md(plain(h.name))}</h4>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div>${favBtn(`hotel:${h.id}`)}</div>
    ${areaName ? `<span class="area">${esc(areaName)}</span>` : ''}
    ${h.text ? `<p class="${long ? 'clip' : ''}">${md(h.text)}</p>${long ? '<button class="more" type="button" data-more>Читать полностью</button>' : ''}` : ''}
    ${h.phones?.length ? phoneLinks(h.phones) : ''}
    ${h.address || site ? `<div class="addr">${h.address ? `${esc(h.address)} · <a href="https://yandex.ru/maps/?text=${encodeURIComponent(h.address)}" target="_blank" rel="noopener">на карте</a>` : ''}${site ? `${h.address ? ' · ' : ''}<a href="${esc(site)}" target="_blank" rel="noopener">сайт</a>` : ''}</div>` : ''}
    ${book ? `<div class="btnrow">${book}</div>` : ''}
  </article>`;
}

/* --- маршрут --- */
function routeDays(r, version) {
  const v = r.versions ? (version || 'long') : null;
  return (r.days || []).filter(d => !v || !d.only || d.only === v);
}

function screenRoutes() {
  return `<div class="topbar gut"><span class="title">Готовые маршруты</span></div>
  <div class="gut"><div class="block stack"><p class="small">Готовые маршруты по дням. Выберите дату начала — каждый день получит свою дату, а план можно добавить в календарь телефона.</p>${routeCards()}</div></div>`;
}

const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
const fmtMon = new Intl.DateTimeFormat('ru-RU', { month: 'short', weekday: 'short' });
const openDays = new Set(['0']);

function screenRoute(id) {
  const r = D.routes[id];
  if (!r) return notFound();
  const plan = store.get('plan', null);
  const mine = plan && plan.route === id ? plan : null;
  const version = mine?.version || (r.versions ? 'long' : null);
  const start = mine?.start || '';
  const days = routeDays(r, version);
  const nights = (r.nights || []).map(n => {
    const p = D.places[n.place];
    const name = p ? `<a href="#/place/${n.place}/stay">${esc(p.title)}</a>` : esc(n.place);
    return `${name} — ${esc(n.nights)}${n.note ? ` <span class="muted">(${esc(n.note)})</span>` : ''}`;
  }).join('<br>');
  const s0 = start ? new Date(start + 'T12:00:00') : null;
  return `${hero(r.cover, `Маршрут №${r.number}`, r.title, `route:${id}`)}
  <div class="gut"><div class="block stack">
    ${r.subtitle ? `<p class="muted small">${esc(r.subtitle)}</p>` : ''}
    ${r.versions ? `<div class="versions" role="group" aria-label="Вариант маршрута">${Object.entries(r.versions).map(([k, t]) => `<button class="chip" type="button" data-version="${k}" aria-pressed="${version === k}">${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="daterow">
      <label for="start">Первый день поездки<input type="date" id="start" value="${start}"></label>
      <button class="btn solid" type="button" id="ics" ${start ? '' : 'disabled'}>${icon('cal')}В календарь</button>
    </div>
    <div class="where"><div><b>Где побываете</b>${esc(r.where || '')}</div><div><b>Где ночуете</b>${nights}</div></div>
    ${r.map ? block({ map: r.map }) : ''}
  </div>
  <div class="block"><div class="days">${days.map((d, i) => {
    const date = s0 ? new Date(s0.getTime() + i * 864e5) : null;
    const dt = date ? `<b>${fmtDay.format(date)}</b><small>${fmtMon.format(date)}</small>` : `<b>${i + 1}</b><small>день</small>`;
    const on = openDays.has(String(i));
    return `<div class="day${on ? ' open' : ''}"><button type="button" data-day="${i}" aria-expanded="${on}"><span class="dt">${dt}</span><span class="h"><small>День ${i + 1}</small><b>${esc(plain(d.title))}</b></span><span class="chev">${icon('chev')}</span></button>
      <div class="more" ${on ? '' : 'hidden'}>
        ${d.summary ? `<p class="small muted">${md(d.summary)}</p>` : ''}
        ${Object.entries(d.parts || {}).map(([part, items]) => `<div class="slot"><span>${esc(part)}</span>${snowList(items)}</div>`).join('')}
        ${d.blocks?.length ? blocks(d.blocks) : ''}
        ${d.callout ? `<p class="callout">${md(d.callout)}</p>` : ''}${d.text ? `<p>${md(d.text)}</p>` : ''}
      </div></div>`;
  }).join('')}</div><div style="height:24px"></div></div></div>`;
}

function makeICS(id) {
  const r = D.routes[id];
  const plan = store.get('plan', null);
  const days = routeDays(r, plan?.version);
  const s0 = new Date(plan.start + 'T12:00:00');
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const escI = s => plain(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => {   // строки не длиннее 75 байт, как требует формат календаря
    const out = [];
    let cur = '';
    for (const ch of line) {
      if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' '; }
      cur += ch;
    }
    return [...out, cur].join('\r\n');
  };
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chemezova//Winter Baikal Guide//RU', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escI(`Байкал: маршрут №${r.number}`)}`];
  days.forEach((d, i) => {
    const a = new Date(s0.getTime() + i * 864e5), z = new Date(a.getTime() + 864e5);
    const desc = [d.summary, ...Object.entries(d.parts || {}).map(([p, items]) => `${p.toUpperCase()}:\n${items.map(x => '• ' + plain(x)).join('\n')}`)]
      .filter(Boolean).join('\n\n') + '\n\nПутеводитель «Зимний Байкал», Елена Чемезова';
    lines.push('BEGIN:VEVENT', `UID:${id}-${i + 1}-${ymd(s0)}@baikal-guide`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ymd(a)}`, `DTEND;VALUE=DATE:${ymd(z)}`,
      `SUMMARY:${escI(`Байкал, день ${i + 1}: ${d.title}`)}`, `DESCRIPTION:${escI(desc)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* --- избранное --- */
function screenFav() {
  const rows = favs.map(k => {
    const [kind, id] = k.split(':');
    if (kind === 'hotel') {
      const h = D.hotels[id];
      if (!h) return '';
      return `<a class="favrow" href="#/place/${h.place}/stay?h=${id}">${icon('bed')}<span class="tx"><b>${esc(plain(h.name))}</b><small>${esc(D.places[h.place]?.title || '')}${h.price_from ? ` · от ${h.price_from.toLocaleString('ru-RU')} ₽` : ''}</small></span>${icon('chev')}</a>`;
    }
    const href = kind === 'place' ? `#/place/${id}/about` : `#/${kind}/${id}`;
    const ic = kind === 'route' ? 'cal' : kind === 'place' ? 'pin' : 'doc';
    return `<a class="favrow" href="${href}">${icon(ic)}<span class="tx"><b>${esc(titleOf(kind, id))}</b><small>${{ page: 'Статья', place: 'Локация', route: 'Маршрут' }[kind]}</small></span>${icon('chev')}</a>`;
  }).join('');
  return `<div class="topbar gut"><span class="title">Избранное</span></div><div class="gut"><div class="block">${rows ||
    `<div class="empty">${NERPA}<p>Здесь будут гостиницы, места, статьи и маршруты, отмеченные сердечком. Всё хранится в телефоне и доступно без интернета.</p></div>`}</div></div>`;
}

function notFound() {
  return `${topbar('Не найдено')}<div class="gut"><p class="empty">Такого раздела нет. Вернитесь на <a href="#/home">главную</a>.</p></div>`;
}

/* ---------------- навигация ---------------- */

function parseHash() {
  const [path, query] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
  const params = new URLSearchParams(query || '');
  const [screen, id, tab] = path.split('/');
  return { screen, id, tab, a: params.get('a'), h: params.get('h') };
}

let lastPath = '';
function render() {
  if (!D) return;
  const r = parseHash();
  const view = $('#view');
  const path = location.hash.split('?')[0];
  const screens = {
    home: screenHome, menu: screenMenu, routes: screenRoutes, fav: screenFav,
    page: () => screenPage(r.id), place: () => screenPlace(r.id, r.tab || 'about'), route: () => screenRoute(r.id),
  };
  view.innerHTML = (screens[r.screen] || screenHome)();
  const tab = { home: 'home', menu: 'menu', page: 'menu', place: 'menu', routes: 'routes', route: 'routes', fav: 'fav' }[r.screen] || 'home';
  $$('#tabs a').forEach(a => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  hydrate(view);
  const target = (r.a && document.getElementById('a-' + r.a)) || (r.h && document.getElementById('h-' + r.h));
  if (target) {
    requestAnimationFrame(() => {
      const y = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo(0, y);
      target.classList.add('hl');
    });
  } else if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  document.title = ($('.title', view)?.textContent || $('h1', view)?.textContent || D.guide.title) + ' · Зимний Байкал';
}

window.addEventListener('hashchange', () => { closeSheet(); render(); });

document.addEventListener('click', e => {
  const t = e.target;
  const fav = t.closest('[data-fav]');
  if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
  if (t.closest('[data-back]')) {
    e.preventDefault();
    if (history.length > 1 && document.referrer !== undefined && sessionStorage.getItem('wb-nav')) history.back();
    else location.hash = '#/home';
    return;
  }
  if (t.closest('[data-nerpa]')) { openSheet(); return; }
  const node = t.closest('[data-node]');
  if (node) {
    const k = node.dataset.node;
    menuOpen.has(k) ? menuOpen.delete(k) : menuOpen.add(k);
    store.set('menuOpen', [...menuOpen]);
    $('#tree').innerHTML = menuTree($('#menu-filter')?.value || '');
    hydrate($('#tree'));
    return;
  }
  const area = t.closest('[data-area]');
  if (area) { const { id } = parseHash(); hotelState[id].area = area.dataset.area; render(); return; }
  const more = t.closest('[data-more]');
  if (more) { more.previousElementSibling.classList.remove('clip'); more.remove(); return; }
  const day = t.closest('[data-day]');
  if (day) {
    const k = day.dataset.day;
    openDays.has(k) ? openDays.delete(k) : openDays.add(k);
    const el = day.parentElement;
    el.classList.toggle('open');
    day.setAttribute('aria-expanded', el.classList.contains('open'));
    el.querySelector('.more').hidden = !el.classList.contains('open');
    hydrate(el);
    return;
  }
  const ver = t.closest('[data-version]');
  if (ver) {
    const { id } = parseHash();
    const plan = store.get('plan', null);
    store.set('plan', { route: id, start: plan?.route === id ? plan.start : '', version: ver.dataset.version });
    render();
    return;
  }
  if (t.closest('#ics')) {
    const { id } = parseHash();
    const blob = new Blob([makeICS(id)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `baikal-marshrut-${D.routes[id].number}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Файл календаря готов: откройте его, чтобы добавить дни поездки в календарь телефона.');
    return;
  }
  if (t.closest('a[href^="#/"]')) sessionStorage.setItem('wb-nav', '1');
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-sort]')) { const { id } = parseHash(); hotelState[id].sort = e.target.value; render(); }
  if (e.target.id === 'start') {
    const { id } = parseHash();
    const plan = store.get('plan', null);
    const version = plan?.route === id ? plan.version : (D.routes[id].versions ? 'long' : null);
    if (e.target.value) {
      store.set('plan', { route: id, start: e.target.value, version });
      toast('Даты сохранены — план поездки теперь на главной.');
    } else store.set('plan', null);
    render();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'menu-filter') { $('#tree').innerHTML = menuTree(e.target.value); hydrate($('#tree')); }
  if (e.target.id === 'q') search(e.target.value);
});

/* ---------------- нерпёнок: поиск ---------------- */

let INDEX = null;
function buildIndex() {
  const idx = [];
  const add = (title, crumb, href, list) => {
    let cur = { title, crumb, href, text: [] };
    idx.push(cur);
    for (const b of list || []) {
      const head = b.heading || b.subheading;
      if (head && b.anchor) {
        cur = { title: plain(head), crumb: title, href: href.split('?')[0] + `?a=${b.anchor}`, text: [] };
        idx.push(cur);
        continue;
      }
      if (b.plate) {  // плашка с ценой и часами — отдельный ответ: «нерпинарий», «музей Тальцы»
        idx.push({ title: plain(b.plate.title), crumb: title, href: cur.href, text: [plain(`${b.plate.text || ''} ${b.plate.hours || ''}`)] });
      }
      cur.text.push(plain(JSON.stringify(Object.values(b)).replace(/https?:[^"\\]+/g, '').replace(/[{}[\]"]/g, ' ').replace(/\\n/g, ' ')));
    }
  };
  for (const [id, p] of Object.entries(D.pages)) add(p.title, 'Статья', `#/page/${id}`, p.blocks);
  for (const [id, p] of Object.entries(D.places)) {
    for (const [tab, name] of Object.entries(TABS)) {
      if (tabBlocks(p[tab]).length) add(`${p.title}: ${name.toLowerCase()}`, p.title, `#/place/${id}/${tab}`, tabBlocks(p[tab]));
    }
  }
  for (const [id, r] of Object.entries(D.routes)) {
    add(`Маршрут №${r.number}. ${r.title}`, 'Маршрут', `#/route/${id}`, (r.days || []).map(d => ({ text: `${d.title} ${d.summary || ''} ${Object.values(d.parts || {}).flat().join(' ')}` })));
  }
  for (const h of D.hotelList) {
    idx.push({ title: plain(h.name), crumb: `Гостиница · ${D.places[h.place]?.title || ''}`, href: `#/place/${h.place}/stay?h=${h.id}`,
      text: [`гостиница отель жильё ${h.text || ''} ${h.address || ''}`] });
  }
  for (const e of idx) e.hay = norm(`${e.title} ${e.title} ${e.text.join(' ')}`);
  return idx.filter(e => e.text.length || e.crumb.startsWith('Гостиница'));
}

const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const STOP = new Set(['как', 'где', 'что', 'для', 'это', 'или', 'там', 'есть', 'можно', 'сколько', 'какой', 'какие', 'куда', 'когда']);
const stem = w => w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2));

function search(q) {
  INDEX = INDEX || buildIndex();
  const res = $('#res');
  const words = norm(q).split(/[^a-zа-я0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length) { res.innerHTML = ''; return; }
  const stems = words.map(stem);
  const scored = [];
  for (const e of INDEX) {
    let n = 0;
    for (const s of stems) {
      if (!e.hay.includes(s)) { n = -1; break; }
      // в заголовке — весомее; чем чаще слово в разделе, тем раздел ближе к вопросу
      n += (norm(e.title).includes(s) ? 6 : 0) + Math.min(e.hay.split(s).length - 1, 6);
    }
    if (n > 0) scored.push([n, e]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  res.innerHTML = scored.slice(0, 12).map(([, e]) => {
    const text = e.text.join(' ');
    const pos = norm(text).indexOf(stems[0]);
    const snip = pos >= 0 ? (pos > 60 ? '…' : '') + text.slice(Math.max(0, pos - 60), pos + 120) + '…' : text.slice(0, 160);
    const marked = esc(snip).replace(new RegExp(`(${stems.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi'), '<mark>$1</mark>');
    return `<a href="${e.href}" data-close><small>${esc(e.crumb)}</small><b>${esc(e.title)}</b><span>${marked}</span></a>`;
  }).join('') || '<p class="muted small">Ничего не нашёл. Попробуйте другое слово — например, название места.</p>';
}

const SUGG = ['Как добраться до Ольхона', 'Где жить в Листвянке', 'Нерпинарий', 'Где найти пузырьки', 'Хивус', 'Горячие источники'];
const sheet = $('#sheet');
function openSheet() {
  sheet.hidden = false;
  $('#q').focus({ preventScroll: true });
}
function closeSheet() { sheet.hidden = true; }
$('#nerpa-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
$('#search-form').addEventListener('submit', e => { e.preventDefault(); search($('#q').value); });
$('#sugg').innerHTML = SUGG.map(s => `<button class="chip" type="button">${s}</button>`).join('');
$$('#sugg .chip').forEach(c => c.addEventListener('click', () => { $('#q').value = c.textContent; search(c.textContent); }));

/* ---------------- запуск ---------------- */

$$('[data-nerpa-face]').forEach(el => { el.innerHTML = NERPA; });
$$('[data-ico]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.ico)));

function showApp() {
  $('#lock').hidden = true;
  $('#app').hidden = false;
  $('#tabs').hidden = false;
  $('.nerpa-btn').hidden = false;
  render();
}

async function start(code) {
  const k = await unlock(code);
  if (!k) return false;
  KEY = k;
  await loadGuide();
  $('#cover-note').textContent = D.guide.updated ? `Обновление от ${new Date(D.guide.updated + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
  return true;
}

$('#lock-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#lock-err');
  const btn = $('#lock-go');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Проверяю…';
  try {
    const code = $('#code').value;
    if (await start(code)) {
      store.set('code', normCode(code));
      showApp();
    } else {
      err.textContent = 'Код не подошёл. Проверьте буквы и цифры: код выглядит так — BAIKAL-7K2M-QX9P.';
      err.hidden = false;
    }
  } catch (x) {
    err.textContent = navigator.onLine ? 'Не получилось открыть путеводитель. Попробуйте ещё раз.' : 'Для первого открытия нужен интернет. Потом путеводитель работает и без него.';
    err.hidden = false;
  }
  btn.disabled = false;
  btn.textContent = 'Открыть';
});

$('#open').addEventListener('click', () => {
  $('#cover').hidden = true;
  try { sessionStorage.setItem('wb-cover', '1'); } catch (e) { /* ничего */ }
});

(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let seen = false;
  try { seen = sessionStorage.getItem('wb-cover') === '1'; } catch (e) { /* ничего */ }
  const code = store.get('code', null);
  if (!seen && !location.hash) $('#cover').hidden = false;
  if (code) {
    try { if (await start(code)) { showApp(); return; } } catch (e) { /* покажем ввод кода */ }
  }
  $('#lock').hidden = false;
})();
