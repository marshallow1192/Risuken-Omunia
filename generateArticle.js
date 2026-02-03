const fs = require('fs');
const ejs = require('ejs');
const { marked } = require('marked');
const path = require('path');

console.log('記事ページの生成を開始します...');

// 1. テンプレートの読み込み
// generateArticle.js と同じ場所にある articleTemplate.ejs を探す
const templatePath = path.join(__dirname, 'articleTemplate.ejs');
let template;

try {
  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, 'utf8');
  } else {
    throw new Error('articleTemplate.ejs が見つかりません');
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// ▼▼▼ 設定：読み込むデータの場所 ▼▼▼
// 一覧ページの更新は不要なので、JSONの場所だけでOKです
const targets = [
  {
    json: 'docs/info.json',       // お知らせデータ
    categoryName: 'お知らせ'
  },
  {
    json: 'docs/tech.json',       // 解説記事データ
    categoryName: '解説記事'
  }
];

// ▼▼▼ メイン処理：記事ページを作る ▼▼▼
targets.forEach(target => {
  const jsonPath = path.join(__dirname, target.json);

  // ファイルがない場合はスキップ
  if (!fs.existsSync(jsonPath)) {
    console.log(`[スキップ] ${target.categoryName} のデータがありません (${target.json})`);
    return;
  }

  console.log(`\n--- ${target.categoryName} の生成 ---`);

  // データを読み込む
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // 日付順に並べ替え（念のため）
  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 記事を1つずつHTMLにする
  data.forEach((item, index) => {
    // 前後の記事を特定（ページ内リンク用）
    const nextPostOriginal = index > 0 ? data[index - 1] : null;
    const prevPostOriginal = index < data.length - 1 ? data[index + 1] : null;

    // リンクパスの調整（ファイル名だけにする）
    const nextPost = nextPostOriginal ? { ...nextPostOriginal, link: path.basename(nextPostOriginal.link) } : null;
    const prevPost = prevPostOriginal ? { ...prevPostOriginal, link: path.basename(prevPostOriginal.link) } : null;

    // MarkdownをHTMLに変換
    const contentHtml = marked.parse(item.contentMd || '');

    // テンプレートにデータを渡す
    const renderData = {
      ...item,      // ★修正点：titleなどを直接参照できるように展開して渡す
      post: item,   // post.title と書く用
      contentMd: contentHtml,
      nextPost: nextPost,
      prevPost: prevPost
    };

    // HTMLを生成
    const renderedHtml = ejs.render(template, renderData);

    // 保存先のパスを作成 (例: docs/articles/article1.html)
    const outputFilePath = path.join(__dirname, 'docs', item.link);
    const outputDir = path.dirname(outputFilePath);
    
    // フォルダがなければ作る
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // ファイル書き出し
    fs.writeFileSync(outputFilePath, renderedHtml, 'utf8');
  });
  
  console.log(`${data.length} 件の記事を生成しました。`);
});


// ▼▼▼ サイトマップ生成（SEO用） ▼▼▼
// 検索エンジン用にsitemap.xmlだけは作っておきます
console.log('\n--- サイトマップ生成 ---');
const SITE_URL = 'https://risuken-omunia.com';
const staticPages = ['index.html', 'introduction.html', 'information.html', 'tech.html', 'seminars-list.html'];

let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

// 固定ページ
staticPages.forEach(page => {
  sitemapContent += `
  <url>
    <loc>${SITE_URL}/${page}</loc>
    <priority>0.8</priority>
  </url>`;
});

// 全記事ページ
targets.forEach(target => {
  const jsonPath = path.join(__dirname, target.json);
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data.forEach(item => {
      sitemapContent += `
  <url>
    <loc>${SITE_URL}/${item.link}</loc>
    <lastmod>${item.date}</lastmod>
    <priority>0.6</priority>
  </url>`;
    });
  }
});

sitemapContent += `</urlset>`;

// サイトマップの保存
const sitemapPath = path.join(__dirname, 'docs/sitemap.xml');
// フォルダ確認
if (!fs.existsSync(path.dirname(sitemapPath))) {
  fs.mkdirSync(path.dirname(sitemapPath), { recursive: true });
}

fs.writeFileSync(sitemapPath, sitemapContent, 'utf8');
console.log('sitemap.xml を生成しました。');
console.log('完了！');