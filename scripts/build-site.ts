// Builds the public SEO part of feedarte.com from the in-app knowledge base:
//   landing/guides/index.html, landing/guides/<slug>/index.html, landing/help-media/*,
//   landing/404.html, landing/sitemap.xml
// Run after changing web/src/help/articles.ts or help media:  npm run build:site
import fs from 'node:fs';
import path from 'node:path';
import { ARTICLES, GROUPS, type Article } from '../web/src/help/articles';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'landing');
const SITE = 'https://feedarte.com';
const APP = 'https://app.feedarte.com';
const TODAY = new Date().toISOString().slice(0, 10);

/** Search-oriented title (≤ ~60 chars) and description (≤ ~155) per article. */
const SEO: Record<string, { title: string; description: string; h1?: string }> = {
  start: { title: 'Як запустити каталожну рекламу з брендованими креативами', description: 'Покроково: від товарного фіду магазину до реклами каталогу в Meta і TikTok з ціною, знижкою й логотипом на кожному фото.' },
  feeds: { title: 'Товарний фід XML, YML, CSV: підключення й автооновлення', description: 'Які фіди товарів підходять для каталожної реклами (Google Merchant RSS, YML Rozetka/Prom, CSV) і як налаштувати автоматичне оновлення.' },
  designs: { title: 'Формати креативів для каталогу: 1:1, 4:5, 9:16 і шаблони', description: 'Який формат обрати для стрічки, сторіз і Reels у каталожній рекламі Meta та TikTok і як почати з готового шаблону.' },
  'editor-basics': { title: 'Редактор креативів для товарного фіду: основи', description: 'Як працювати в редакторі Feedarte: шари, поля фіду як змінні, попередній перегляд на реальних товарах і публікація.' },
  text: { title: 'Текст на креативах каталогу: автопідгін і свої шрифти', description: 'Як назва й ціна товару підлаштовуються під довжину тексту, формат цін і як підключити власні брендові шрифти.' },
  images: { title: 'Фото товару, логотипи брендів і фони на креативах', description: 'Як вписати фото товару в дизайн, додати динамічні логотипи брендів і фонові зображення для каталожної реклами.' },
  conditions: { title: 'Умови показу: бейджі знижок і новинок у каталозі', description: 'Показуйте «−30%», «Новинка» чи «Останні розміри» лише тим товарам, яким це підходить — правила на будь-яке поле фіду.' },
  attach: { title: 'Прив’язка елементів: ціна завжди під назвою товару', description: 'Як прив’язати ціну чи бейдж до назви, щоб макет не ламався на довгих і коротких назвах товарів.' },
  view: { title: 'Безпечні зони Stories, Reels і TikTok для креативів', description: 'Які зони кадру закриває інтерфейс Stories, Reels і TikTok, і як тримати ціну й логотип у видимій частині.' },
  output: { title: 'Вихідний фід для Meta і TikTok: налаштування', description: 'Налаштування фіду з готовими креативами: один товар на групу розмірів, посилання товару, додаткові зображення.' },
  'meta-connect': { title: 'Як підключити фід у Meta Commerce Manager і match rate', description: 'Підключення фіду як data source у Commerce Manager, розклад оновлення, обрізання зображень і чому catalog match rate 0%.' },
  'meta-catalog': { title: 'Кілька креативів в одному каталозі Meta: Image number', description: 'Як тримати різні дизайни для стрічки й сторіз в одному каталозі Meta без дублів товарів: Image templates і Image number 0–19.' },
  stories: { title: 'Каталожна реклама в Stories на весь екран 9:16', description: 'Чому Meta показує каталог у сторіз у рамці і як отримати 4:5 у стрічці та 9:16 у Stories з одного каталогу.' },
  direct: { title: 'Реклама каталогу з переходом в Instagram Direct', description: 'Як вести клік з каталожної реклами в Instagram Direct з готовим повідомленням про товар і подією пікселя через Conversions API.' },
  tiktok: { title: 'Як підключити каталог товарів у TikTok Ads', description: 'Підключення XML-фіду з брендованими креативами в TikTok Catalog: тип каталогу, розклад оновлення і формат 9:16.' },
  import: { title: 'Імпорт макета креативу з Figma або картинки', description: 'Перенесіть готовий макет каталожного креативу з Figma чи скріншоту в редактор і прив’яжіть шари до полів фіду.' },
  transfer: { title: 'Передача проєкту Feedarte іншому акаунту', description: 'Як передати проєкт з фідами й дизайнами клієнту чи колезі без перепідключення каталогів у Meta і TikTok.' },
  billing: { title: 'Ціна Feedarte: 14 днів безкоштовно, далі 990 ₴/міс', description: 'Скільки коштує сервіс креативів для каталожної реклами, як почати безкоштовний тріал, оплата на ФОП і що буде після закінчення доступу.' },
  faq: { title: 'Каталожна реклама Meta: часті проблеми й рішення', description: 'Дублікати розмірів у каруселі, обрізання 4:5 до квадрата, сторіз у рамці, match rate 0% — причини й рішення.' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (href: string) => href.replace(/^\/help\/([a-z0-9-]+)/, '/guides/$1/').replace(/^\/help$/, '/guides/');

function inline(text: string): string {
  let out = '';
  let last = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out += `<strong>${esc(t.slice(2, -2))}</strong>`;
    else if (t.startsWith('`')) out += `<code>${esc(t.slice(1, -1))}</code>`;
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      const h = link(href);
      out += h.startsWith('/') ? `<a href="${esc(h)}">${esc(label)}</a>` : `<a href="${esc(h)}" rel="noopener" target="_blank">${esc(label)}</a>`;
    }
    last = m.index + t.length;
  }
  return out + esc(text.slice(last));
}

function body(src: string): string {
  return src
    .trim()
    .split(/\n\s*\n/)
    .map((b) => {
      const lines = b.split('\n');
      if (lines[0].startsWith('## ')) {
        const rest = lines.slice(1).join('\n');
        return `<h2>${inline(lines[0].slice(3))}</h2>` + (rest ? body(rest) : '');
      }
      if (lines.every((l) => /^!\[[^\]]*\]\([^)]+\)$/.test(l.trim())))
        return lines
          .map((l) => {
            const [, alt, src] = l.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/)!;
            return `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>`;
          })
          .join('');
      if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      if (lines.every((l) => /^\d+\. /.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
      // numbered list interrupted by an image line
      if (lines.some((l) => /^\d+\. /.test(l)) && lines.every((l) => /^\d+\. /.test(l) || /^!\[/.test(l.trim())))
        return lines.map((l) => (/^!\[/.test(l.trim()) ? body(l) : `<ol start="${parseInt(l)}"><li>${inline(l.replace(/^\d+\. /, ''))}</li></ol>`)).join('');
      if (lines[0].startsWith('> ') || lines[0].startsWith('! ')) {
        const warn = lines[0].startsWith('! ');
        return `<aside class="note${warn ? ' warn' : ''}"><b>${warn ? 'Важливо' : 'Порада'}</b><p>${inline(lines.map((l) => l.replace(/^[>!] /, '')).join(' '))}</p></aside>`;
      }
      const firstList = lines.findIndex((l) => l.startsWith('- ') || /^\d+\. /.test(l));
      if (firstList > 0) return body(lines.slice(0, firstList).join(' ') + '\n\n' + lines.slice(firstList).join('\n'));
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .join('\n');
}

/** Plain text of markdown (for JSON-LD answers). */
const plain = (s: string) =>
  s.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|`/g, '').replace(/^[>!-] |^\d+\. /gm, '').replace(/\s+/g, ' ').trim();

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF9A4D"/><stop offset="1" stop-color="#FF5A0A"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M11 24V12.5A4.5 4.5 0 0 1 15.5 8H20" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M8.5 15.5h9" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="22.5" cy="21.5" r="2.6" fill="#fff"/></svg>`;

function page(o: { title: string; description: string; canonical: string; ld: object[]; main: string; noindex?: boolean; ogType?: string }): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${o.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${o.canonical}">
<link rel="alternate" hreflang="uk" href="${o.canonical}">
<link rel="alternate" hreflang="x-default" href="${o.canonical}">`}
<meta property="og:type" content="${o.ogType ?? 'article'}">
<meta property="og:site_name" content="Feedarte">
<meta property="og:locale" content="uk_UA">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${o.canonical}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0A0A0B">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/inter-cyr.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script>(function(){try{var m=document.cookie.match(/(?:^|; )fa_theme=(light|dark)/);var t=(m&&m[1])||localStorage.getItem('fa_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}})();</script>
${o.ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="logo" href="/" aria-label="Feedarte — на головну">${LOGO}Feedarte</a>
  <nav class="nav-links" aria-label="Основна навігація"><a href="/#features">Можливості</a><a href="/#catalog">Meta-каталог</a><a href="/guides/">Гайди</a><a href="/#pricing">Ціна</a></nav>
  <div class="nav-cta">
    <button class="theme-btn" id="theme-btn" type="button" aria-label="Перемкнути тему" title="Світла / темна тема"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
    <a class="btn btn-text" href="${APP}/login">Увійти</a>
    <a class="btn btn-primary" href="${APP}/register">Почати безкоштовно</a>
  </div>
</div></header>
<main>${o.main}</main>
<footer><div class="wrap">
  <a class="logo" href="/">${LOGO}Feedarte</a>
  <span>© ${new Date().getFullYear()} · Креативи для каталожної реклами Meta і TikTok</span>
  <nav aria-label="Нижня навігація"><a href="/guides/">Гайди</a><a href="/#faq">FAQ</a><a href="${APP}/login">Увійти</a></nav>
</div></footer>
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}

const ORG = { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Feedarte', url: `${SITE}/`, logo: `${SITE}/favicon-192.png` };
const crumbs = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

const cta = `<section class="cta-box"><div><h2>Спробуйте на своєму каталозі</h2><p>Підключіть фід, оберіть шаблон і отримайте готовий фід з креативами для Meta і TikTok. Перші 14 днів — безкоштовно.</p></div><a class="btn btn-primary btn-lg" href="${APP}/register">Почати безкоштовно</a></section>`;

function articlePage(a: Article): string {
  const seo = SEO[a.slug] ?? { title: a.title, description: a.summary };
  const url = `${SITE}/guides/${a.slug}/`;
  const related = ARTICLES.filter((x) => x.group === a.group && x.slug !== a.slug).slice(0, 4);
  const ld: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: seo.title,
      name: a.title,
      description: seo.description,
      inLanguage: 'uk',
      url,
      mainEntityOfPage: url,
      dateModified: TODAY,
      image: `${SITE}/og.png`,
      author: ORG,
      publisher: ORG,
    },
    crumbs([['Feedarte', `${SITE}/`], ['Гайди', `${SITE}/guides/`], [a.title, url]]),
  ];
  if (a.slug === 'faq') {
    const qa = a.body.split(/\n(?=## )/).filter((s) => s.startsWith('## ')).map((s) => {
      const [q, ...rest] = s.split('\n');
      return { '@type': 'Question', name: q.slice(3).trim(), acceptedAnswer: { '@type': 'Answer', text: plain(rest.join('\n')) } };
    });
    ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa });
  }
  const main = `<div class="wrap guide">
  <nav class="crumbs mono" aria-label="Хлібні крихти"><a href="/">Feedarte</a><span>/</span><a href="/guides/">Гайди</a><span>/</span><span>${esc(a.group)}</span></nav>
  <article class="prose">
    <h1>${esc(seo.h1 ?? a.title)}</h1>
    <p class="lead">${esc(a.summary)}</p>
    ${body(a.body)}
  </article>
  ${cta}
  ${related.length ? `<section class="related"><h2 class="mono">Ще в розділі «${esc(a.group)}»</h2><div class="cards">${related.map((r) => `<a class="card" href="/guides/${r.slug}/"><b>${esc(r.title)}</b><span>${esc(r.summary)}</span></a>`).join('')}</div></section>` : ''}
</div>`;
  return page({ title: `${seo.title} | Feedarte`, description: seo.description, canonical: url, ld, main });
}

function indexPage(): string {
  const url = `${SITE}/guides/`;
  const main = `<div class="wrap guide">
  <nav class="crumbs mono" aria-label="Хлібні крихти"><a href="/">Feedarte</a><span>/</span><span>Гайди</span></nav>
  <h1>Гайди з каталожної реклами Meta і TikTok</h1>
  <p class="lead">Як оформити товари в каталозі брендованими креативами, підключити фід у Commerce Manager і TikTok, показувати сторіз на весь екран і вести клієнтів у Direct.</p>
  ${GROUPS.map((g) => {
    const list = ARTICLES.filter((a) => a.group === g);
    return list.length ? `<section class="group"><h2 class="mono">${esc(g)}</h2><div class="cards">${list.map((a) => `<a class="card" href="/guides/${a.slug}/"><b>${esc(a.title)}</b><span>${esc(a.summary)}</span></a>`).join('')}</div></section>` : '';
  }).join('\n')}
  ${cta}
</div>`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Гайди Feedarte', url, inLanguage: 'uk', publisher: ORG },
    crumbs([['Feedarte', `${SITE}/`], ['Гайди', url]]),
  ];
  return page({ title: 'Гайди з каталожної реклами Meta і TikTok | Feedarte', description: 'Покрокові інструкції: креативи для каталогу Meta, підключення фіду в Commerce Manager і TikTok, сторіз 9:16, Image templates, Instagram Direct.', canonical: url, ld, main, ogType: 'website' });
}

function notFound(): string {
  const main = `<div class="wrap guide nf"><p class="mono accent">404</p><h1>Сторінку не знайдено</h1><p class="lead">Можливо, посилання застаріло. Почніть з головної або перегляньте гайди.</p><div class="row"><a class="btn btn-primary btn-lg" href="/">На головну</a><a class="btn btn-ghost btn-lg" href="/guides/">Гайди</a></div></div>`;
  return page({ title: 'Сторінку не знайдено | Feedarte', description: 'Сторінку не знайдено.', canonical: `${SITE}/404`, ld: [], main, noindex: true, ogType: 'website' });
}

// ---------- write ----------
fs.rmSync(path.join(OUT, 'guides'), { recursive: true, force: true });
for (const a of ARTICLES) {
  const dir = path.join(OUT, 'guides', a.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), articlePage(a));
}
fs.writeFileSync(path.join(OUT, 'guides', 'index.html'), indexPage());
fs.writeFileSync(path.join(OUT, '404.html'), notFound());

// help media used by the articles
const mediaSrc = path.join(ROOT, 'web', 'public', 'help-media');
const mediaOut = path.join(OUT, 'help-media');
fs.rmSync(mediaOut, { recursive: true, force: true });
fs.cpSync(mediaSrc, mediaOut, { recursive: true });

const urls: [string, string][] = [
  [`${SITE}/`, '1.0'],
  [`${SITE}/guides/`, '0.8'],
  ...ARTICLES.map((a): [string, string] => [`${SITE}/guides/${a.slug}/`, ['meta-catalog', 'stories', 'meta-connect', 'direct', 'start', 'faq', 'tiktok'].includes(a.slug) ? '0.7' : '0.5']),
];
fs.writeFileSync(
  path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`,
);
console.log(`site: ${ARTICLES.length} guides, sitemap ${urls.length} urls`);
