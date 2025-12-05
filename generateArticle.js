// 必要なライブラリを読み込む
const fs = require('fs');
const ejs = require('ejs');
const { marked } = require('marked'); // ← markedを読み込む

console.log('HTMLファイルの生成を開始します...');

// 1. データのJSONファイルを読み込む
const data = JSON.parse(fs.readFileSync('../docs/info.json', 'utf8'));

// 2. テンプレートファイルを読み込む
const template = fs.readFileSync('../articleTemplate.ejs', 'utf8');

// 3. データをもとにループ処理でHTMLファイルを一枚ずつ生成
data.forEach(item => {
  // ▼▼▼ ここからが変更点 ▼▼▼

  // 4. Markdown形式の本文をHTMLに変換する
  const contentHtml = marked.parse(item.contentMd);
  
  // 5. 元のデータに、変換後のHTMLを追加した新しいオブジェクトを作成
  const renderData = {
    ...item, // 元のデータ（title, dateなど）をすべてコピー
    contentHtml: contentHtml // 変換したHTMLを追加
  };

  // ▲▲▲ ここまでが変更点 ▲▲▲
  
  // EJSを使ってテンプレートにデータを流し込む
  const renderedHtml = ejs.render(template, renderData);
  
  // 出力するファイルパスを指定
  const outputFilePath = "../docs/"+item.link;
  
  // HTMLファイルとして書き出す
  fs.writeFileSync(outputFilePath, renderedHtml, 'utf8');
  
  console.log(`${outputFilePath} を生成しました。`);
});

console.log('HTMLファイルの生成が完了しました！');

// ▼▼▼ 既存のコードの下に追加（サイトマップ生成機能） ▼▼▼

// サイトのドメイン（自分のURLに書き換えてください）
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

// 2. 記事ページを追加（dataは上で読み込んだjsonデータ）
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