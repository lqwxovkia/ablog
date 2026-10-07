// ============================================================
// 静态博客生成器
// 输入: content/posts/*.md (Markdown + front-matter) 与 content/about.md
// 输出: dist/  (Cloudflare Pages 的构建产物目录)
//
// 本地预览:  npm run build && npm run serve   (然后打开 http://localhost:4321)
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const POSTS = path.join(ROOT, 'content', 'posts');
const PAGES = path.join(ROOT, 'content');
const PUBLIC = path.join(ROOT, 'public');
const STYLE = path.join(ROOT, 'src', 'style.css');

marked.setOptions({ gfm: true, breaks: false });

// ---------- 小工具 ----------
const readText = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => JSON.parse(readText(p));
const site = readJSON(path.join(ROOT, 'site.config.json'));

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toDateString(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    // 用 UTC 分量，避免时区导致日期前后偏移一天
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`;
  }
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(value).trim();
}

function slugOf(name) {
  // 文件名去掉扩展名，空格转连字符，去掉不适合进 URL 的字符
  return String(name)
    .replace(/\.md$/i, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[/\\?#%&]/g, '');
}

function normalizeTags(value) {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : String(value).split(/[,，、]/);
  return arr.map((t) => String(t).trim()).filter(Boolean);
}

const urlOfPost = (slug) => `/posts/${encodeURIComponent(slug)}.html`;
const abs = (p) => (site.url || '').replace(/\/$/, '') + p;

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ---------- HTML 模板 ----------
function layout({ title, description, content, canonical, isHome = false }) {
  const pageTitle = isHome ? site.title : `${title} - ${site.title}`;
  const desc = description || site.description || '';
  const nav = (site.nav || [])
    .map((n) => `<a href="${escapeHtml(n.path)}">${escapeHtml(n.title)}</a>`)
    .join('');
  return `<!doctype html>
<html lang="${escapeHtml(site.lang || 'zh-CN')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="author" content="${escapeHtml(site.author || '')}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="/rss.xml">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="site-title" href="/">${escapeHtml(site.title)}</a>
    <nav class="site-nav">${nav}</nav>
  </div>
</header>
<main class="wrap">${content}</main>
<footer class="site-footer">
  <div class="wrap">
    <p>© ${new Date().getFullYear()} ${escapeHtml(site.author || site.title)} · ${escapeHtml(site.footer || '')}</p>
  </div>
</footer>
</body>
</html>`;
}

function postCard(post) {
  const tags = (post.tags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('');
  return `<article class="post-card">
  <h2 class="post-card-title"><a href="${urlOfPost(post.slug)}">${escapeHtml(post.title)}</a></h2>
  <div class="post-meta">${post.date ? `<time>${escapeHtml(post.date)}</time>` : ''}${tags ? ` <span class="dot">·</span> ${tags}` : ''}</div>
  ${post.summary ? `<p class="post-summary">${escapeHtml(post.summary)}</p>` : ''}
</article>`;
}

// ---------- 读取内容 ----------
function loadPosts() {
  if (!fs.existsSync(POSTS)) return [];
  const posts = [];
  for (const file of fs.readdirSync(POSTS)) {
    if (!/\.md$/i.test(file)) continue;
    const raw = readText(path.join(POSTS, file));
    const { data: fm, content } = matter(raw);
    if (fm.draft === true) continue;
    const slug = (fm.slug && String(fm.slug).trim()) || slugOf(file);
    posts.push({
      slug,
      title: fm.title || slug,
      date: toDateString(fm.date),
      summary: fm.summary || fm.description || '',
      tags: normalizeTags(fm.tags),
      html: marked.parse(content),
    });
  }
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return posts;
}

// ---------- 生成 ----------
function build() {
  rimraf(DIST);
  fs.mkdirSync(DIST, { recursive: true });

  const posts = loadPosts();

  // 首页
  const homeInner = posts.length
    ? posts.map(postCard).join('\n')
    : '<p class="empty">还没有文章。去 Pages CMS 里写第一篇吧。</p>';
  fs.writeFileSync(
    path.join(DIST, 'index.html'),
    layout({ title: site.title, description: site.description, content: homeInner, canonical: abs('/'), isHome: true })
  );

  // 文章页
  fs.mkdirSync(path.join(DIST, 'posts'), { recursive: true });
  for (const post of posts) {
    const tags = (post.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const inner = `<article class="post">
  <h1 class="post-title">${escapeHtml(post.title)}</h1>
  <div class="post-meta">${post.date ? `<time>${escapeHtml(post.date)}</time>` : ''}${tags ? ` <span class="dot">·</span> ${tags}` : ''}</div>
  <div class="post-content">${post.html}</div>
  <p class="back"><a href="/">← 返回首页</a></p>
</article>`;
    fs.writeFileSync(
      path.join(DIST, 'posts', `${post.slug}.html`),
      layout({
        title: post.title,
        description: post.summary,
        content: inner,
        canonical: abs(urlOfPost(post.slug)),
      })
    );
  }

  // 单页 (content/about.md -> /about.html)
  for (const file of fs.existsSync(PAGES) ? fs.readdirSync(PAGES) : []) {
    if (!/\.md$/i.test(file)) continue;
    const base = file.replace(/\.md$/i, '');
    const { data: fm, content } = matter(readText(path.join(PAGES, file)));
    const inner = `<article class="post">
  <h1 class="post-title">${escapeHtml(fm.title || base)}</h1>
  <div class="post-content">${marked.parse(content)}</div>
</article>`;
    fs.writeFileSync(
      path.join(DIST, `${base}.html`),
      layout({ title: fm.title || base, description: fm.description, content: inner, canonical: abs(`/${base}.html`) })
    );
  }

  // 404
  fs.writeFileSync(
    path.join(DIST, '404.html'),
    layout({ title: '页面不存在', content: '<article class="post"><h1 class="post-title">404</h1><p>找不到这个页面。<a href="/">回首页</a></p></article>' })
  );

  // RSS
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${escapeHtml(abs(urlOfPost(p.slug)))}</link>
      <guid>${escapeHtml(abs(urlOfPost(p.slug)))}</guid>
      ${p.date ? `<pubDate>${new Date(p.date + 'T00:00:00Z').toUTCString()}</pubDate>` : ''}
      <description>${escapeHtml(p.summary)}</description>
    </item>`
    )
    .join('\n');
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(site.title)}</title>
    <link>${escapeHtml(site.url || '')}</link>
    <description>${escapeHtml(site.description || '')}</description>
    <language>${escapeHtml(site.lang || 'zh-CN')}</language>
${items}
  </channel>
</rss>`;
  fs.writeFileSync(path.join(DIST, 'rss.xml'), rss);

  // sitemap
  const urls = [abs('/'), abs('/about.html'), ...posts.map((p) => abs(urlOfPost(p.slug)))];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);

  // 样式
  fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
  if (fs.existsSync(STYLE)) fs.copyFileSync(STYLE, path.join(DIST, 'assets', 'style.css'));

  // 静态资源
  copyDir(PUBLIC, DIST);

  console.log(`✓ 构建完成: ${posts.length} 篇文章 -> ${path.relative(ROOT, DIST)}/`);
}

// ---------- 本地预览服务器 ----------
function serve(port = 4321) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
  };
  http
    .createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      let file = path.join(DIST, p);
      if (!file.startsWith(DIST)) return res.writeHead(403).end('403');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, '404.html');
      res.writeHead(fs.existsSync(file) ? (file.endsWith('404.html') ? 404 : 200) : 404, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      });
      res.end(fs.readFileSync(file));
    })
    .listen(port, () => console.log(`→ 本地预览: http://localhost:${port}`));
}

build();
if (process.argv.includes('--serve')) serve();
