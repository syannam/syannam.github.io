const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CONTENT_DIR = path.join(ROOT, 'content');
const POSTS_DIR = path.join(ROOT, 'posts');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function renderMarkdown(mdContent) {
  return marked(mdContent);
}

const BASE_TEMPLATE = fs.readFileSync(path.join(TEMPLATES_DIR, 'base.html'), 'utf-8');

function wrapInBase({ title, meta, nav, body }) {
  return BASE_TEMPLATE
    .replace('<!-- INJECT:title -->', title)
    .replace('<!-- INJECT:meta -->', meta || '')
    .replace('<!-- INJECT:nav -->', nav)
    .replace('<!-- INJECT:body -->', body);
}

const INDEX_NAV = `<nav class="fixed-nav" id="fixedNav">
    <a href="#hero" class="nav-link active" data-section="hero">Home</a>
    <a href="#journey" class="nav-link" data-section="journey">Journey</a>
    <a href="/blog/" class="nav-link">Blog</a>
  </nav>`;

const BLOG_NAV = `<nav class="fixed-nav scrolled" id="fixedNav">
    <a href="/" class="nav-link">Home</a>
    <a href="/#journey" class="nav-link">Journey</a>
    <a href="/blog/" class="nav-link active">Blog</a>
  </nav>`;

function buildIndex() {
  let bodyTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'index.html'), 'utf-8');

  if (fs.existsSync(CONTENT_DIR)) {
    const contentFiles = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
    for (const file of contentFiles) {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
      const { data, content } = matter(raw);
      const section = data.section || path.basename(file, '.md');
      const html = renderMarkdown(content);
      bodyTemplate = bodyTemplate.replace(`<!-- INJECT:${section} -->`, html);
    }
  }

  const meta = `<meta name="description" content="Personal site" />
  <link rel="canonical" href="/" />`;

  const page = wrapInBase({
    title: 'Home',
    meta,
    nav: INDEX_NAV,
    body: bodyTemplate,
  });

  ensureDir(DIST);
  fs.writeFileSync(path.join(DIST, 'index.html'), page);
  console.log('✓ Built index.html');
}

function formatDate(date) {
  if (date instanceof Date) {
    const iso = date.toISOString().split('T')[0];
    const [y, m, d] = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
  }
  return String(date || '');
}

function buildBlog() {
  const blogDir = path.join(DIST, 'blog');
  ensureDir(blogDir);

  const posts = [];
  if (fs.existsSync(POSTS_DIR)) {
    const postFiles = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
    for (const file of postFiles) {
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
      const { data, content } = matter(raw);
      if (!data.date) continue;
      const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
      posts.push({
        ...data,
        date: formatDate(data.date),
        slug,
        content,
      });
    }
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    for (const post of posts) {
      const postHtml = renderMarkdown(post.content);
      const page = buildPostPage(post, postHtml);
      fs.writeFileSync(path.join(blogDir, `${post.slug}.html`), page);
      console.log(`✓ Built blog/${post.slug}.html`);
    }
  }

  const blogIndex = buildBlogIndex(posts);
  fs.writeFileSync(path.join(blogDir, 'index.html'), blogIndex);
  console.log('✓ Built blog/index.html');
}

function buildBlogIndex(posts) {
  const postList =
    posts.length === 0
      ? '<p class="section-lead">Coming soon.</p>'
      : posts
          .map(
            (p) => `
      <article class="blog-post-card">
        <h2><a href="/blog/${p.slug}.html">${p.title}</a></h2>
        <p class="post-date">${p.date || ''}</p>
        ${p.description ? `<p>${p.description}</p>` : ''}
      </article>`
          )
          .join('\n');

  const body = `
  <section class="parallax-section">
    <div class="section-content" style="padding-top: 120px;">
      <div class="content-wrapper visible">
        <h1 class="section-title">Blog</h1>
        ${postList}
      </div>
    </div>
  </section>`;

  return wrapInBase({
    title: 'Blog',
    meta: `<meta name="description" content="Blog" />`,
    nav: BLOG_NAV,
    body,
  });
}

function buildPostPage(post, contentHtml) {
  const body = `
  <section class="parallax-section">
    <div class="section-content" style="padding-top: 120px;">
      <div class="content-wrapper visible">
        <p class="role-meta"><a href="/blog/">← Back to blog</a> · ${post.date || ''}</p>
        ${contentHtml}
      </div>
    </div>
  </section>`;

  const desc = (post.description || '').replace(/"/g, '&quot;');
  const title = (post.title || '').replace(/"/g, '&quot;');

  return wrapInBase({
    title: `${post.title || 'Blog'}`,
    meta: `<meta name="description" content="${desc}" />
  <meta property="og:title" content="${title}" />`,
    nav: BLOG_NAV,
    body,
  });
}

function copyStatic() {
  ensureDir(DIST);
  for (const asset of ['styles.css', 'CNAME', 'images', 'icons']) {
    const src = path.join(ROOT, asset);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(DIST, asset));
    }
  }
  console.log('✓ Copied static assets');
}

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}

copyStatic();
buildIndex();
buildBlog();

console.log('\nDone! Output in dist/');
