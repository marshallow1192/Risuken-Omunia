// 必要なライブラリを読み込む
const fs = require('fs');
const ejs = require('ejs');
const { marked } = require('marked'); // ← markedを読み込む

console.log('HTMLファイルの生成を開始します...');

// 1. データのJSONファイルを読み込む
const data = JSON.parse(fs.readFileSync('info.json', 'utf8'));

// 2. テンプレートファイルを読み込む
const template = fs.readFileSync('articleTemplate.ejs', 'utf8');

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
  const outputFilePath = item.link;
  
  // HTMLファイルとして書き出す
  fs.writeFileSync(outputFilePath, renderedHtml, 'utf8');
  
  console.log(`${outputFilePath} を生成しました。`);
});

console.log('HTMLファイルの生成が完了しました！');