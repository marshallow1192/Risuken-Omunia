// 必要なライブラリを読み込む
const fs = require('fs');
const ejs = require('ejs');
const path = require('path')
const { marked } = require('marked');

console.log('HTMLファイルの生成を開始します...');

// 1. データのJSONファイルを読み込む
const data = JSON.parse(fs.readFileSync('../docs/info.json', 'utf8'));

// 2. テンプレートファイルを読み込む
const template = fs.readFileSync('../articleTemplate.ejs', 'utf8');

// 3. データをもとにループ処理でHTMLファイルを一枚ずつ生成
// ★変更点1：index（何番目の記事か）も受け取るように変更
data.forEach((item, index) => {
  
  // ▼▼▼ ナビゲーション用の計算（追加部分） ▼▼▼
  // 記事は新しい順に並んでいる前提です
  
// 1. 前後の記事データを取得
  const nextPostOriginal = index > 0 ? data[index - 1] : null;
  const prevPostOriginal = index < data.length - 1 ? data[index + 1] : null;

  // 2. テンプレート用にデータを加工（ここがポイント！）
  // そのままだと "articles/article9.html" になってしまうので、
  // path.basename() を使って "article9.html" (ファイル名だけ) に変換する

  let nextPost = null;
  if (nextPostOriginal) {
    nextPost = { ...nextPostOriginal }; // データをコピー
    nextPost.link = path.basename(nextPostOriginal.link); // ★ここで "articles/" を消す！
  }

  let prevPost = null;
  if (prevPostOriginal) {
    prevPost = { ...prevPostOriginal }; // データをコピー
    prevPost.link = path.basename(prevPostOriginal.link); // ★ここでも "articles/" を消す！
  }

  // 4. Markdown形式の本文をHTMLに変換する
  // (contentMdがない場合にエラーにならないよう || '' を追加)
  const contentHtml = marked.parse(item.contentMd || '');
  
  // 5. テンプレートに渡すデータをまとめる
  const renderData = {
    ...item,        // 記事データ本体 (template内では post.title などで使う)
    contentHtml: contentHtml, // 変換済みの本文 (template内では content で使う)
    nextPost: nextPost,   // 次の記事データ (なければnull)
    prevPost: prevPost    // 前の記事データ (なければnull)
  };
  
  // EJSを使ってテンプレートにデータを流し込む
  const renderedHtml = ejs.render(template, renderData);
  
  // 出力するファイルパスを指定
  const outputFilePath = "../docs/" + item.link;
  
  // HTMLファイルとして書き出す
  fs.writeFileSync(outputFilePath, renderedHtml, 'utf8');
  
  console.log(`${outputFilePath} を生成しました。`);
});

console.log('HTMLファイルの生成が完了しました！');


// ▼▼▼ サイトマップ生成機能（そのまま維持） ▼▼▼

// サイトのドメイン
const SITE_URL = 'https://risuken-omunia.com';

// 固定ページ（記事以外のページ）のリスト
const staticPages = [
  'index.html',
  'introduction.html',
  'information.html',
  'seminars-list.html',
  // 他に作ったページがあればここに追加
];

// サイトマップのXMLデータを作る
let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

// 1. 固定ページを追加
staticPages.forEach(page => {
  sitemapContent += `
  <url>
    <loc>${SITE_URL}/${page}</loc>
    <priority>0.8</priority>
  </url>`;
});

// 2. 記事ページを追加
data.forEach(item => {
  sitemapContent += `
  <url>
    <loc>${SITE_URL}/${item.link}</loc>
    <lastmod>${item.date}</lastmod>
    <priority>0.6</priority>
  </url>`;
});

sitemapContent += `</urlset>`;

// sitemap.xml を書き出す
fs.writeFileSync('../docs/sitemap.xml', sitemapContent, 'utf8');
console.log('sitemap.xml を生成しました！');