const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // multerを読み込む
const crypto = require('crypto'); // ← これを追加（インストール不要、標準機能です）

const app = express();
const port = 3000;

app.use(cors());
// JSONデータとURLエンコードされたデータを受け取る設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const getFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
};

// ▼▼▼ multerの設定 ▼▼▼
const storage = multer.diskStorage({
  // ファイルの保存先を指定
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../docs/img/articleimg/')); // ルートのuploadsフォルダを指定
  },
  // ファイル名を指定 (ファイル名の重複を防ぐため、タイムスタンプを付与)
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });
// ▲▲▲ multerの設定 ▲▲▲

// ▼▼▼ uploadsフォルダを静的ファイルとして配信する設定 ▼▼▼
// これにより http://localhost:3000/uploads/画像ファイル名 でアクセスできる
app.use('/img', express.static(path.join(__dirname, '../docs/img')));

// ▼▼▼ 【修正版】画像アップロード用API（重複チェック機能付き） ▼▼▼
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'ファイルがありません' });
  }

  const newFilePath = req.file.path; // 今保存されたファイルのパス
  console.log("hello world!!!!!!")
  console.log(newFilePath)
  const imgDir = path.dirname(newFilePath); // 保存先フォルダ (docs/img)
  console.log(imgDir)

  try {
    // 1. 今アップロードされたファイルの「指紋（ハッシュ）」と「サイズ」を取得
    const newFileHash = getFileHash(newFilePath);
    const newFileSize = req.file.size;

    // 2. フォルダ内の他のファイルをチェック
    const files = fs.readdirSync(imgDir);

    for (const file of files) {
      // 自分自身（今保存したファイル）はスキップ
      if (file === req.file.filename) continue;

      const existingFilePath = path.join(imgDir, file);
      // フォルダかファイルか確認（念のため）
      const stats = fs.statSync(existingFilePath);
      if (!stats.isFile()) continue;

      // 【高速化】まずはファイルサイズが同じかチェック（サイズが違えば中身も絶対違うから）
      if (stats.size !== newFileSize) continue;

      // サイズが同じ場合だけ、中身（指紋）を計算して比較
      const existingHash = getFileHash(existingFilePath);

      if (newFileHash === existingHash) {
        // ★★★ 重複発見！ ★★★
        console.log(`重複画像が見つかりました: ${file} と同じです。新しいファイルを削除します。`);

        // 3. 今アップロードしたファイルを削除（無かったことにする）
        fs.unlinkSync(newFilePath);

        // 4. 代わりに「昔からあるファイル」のパスを返す
        return res.json({ url: 'docs/img/articleimg/' + file });
      }
    }

    // 重複がなければ、そのまま新しいファイルのパスを返す
    const imagePath = 'docs/img/articleimg/' + req.file.filename;
    res.json({ url: imagePath });

  } catch (error) {
    console.error('重複チェック中にエラー:', error);
    // エラーが出てもとりあえずアップロードは成功にしておく（安全策）
    res.json({ url: 'docs/img/articleimg/' + req.file.filename });
  }
});

// ▼▼▼ POSTリクエストのルートを修正 ▼▼▼
// upload.single('image') ミドルウェアを追加
app.post('/api/posts', upload.single('image'), (req, res) => {
  // let tempbody = req.body
  // const article = tempbody.replace("![画像の説明](docs/img/articleimg/","![画像の説明](img/articleimg/")
  // let tempbody = req.body
  if (req.body.contentMd) {
    // "docs/img/" という文字があったら、全部 "img/" に書き換える
    req.body.contentMd = req.body.contentMd.replace(/docs\/img\//g, 'img/');
  }

  console.log('受け取ったテキストデータ:',req.body);
  console.log('受け取ったファイル:', req.file);

  // 1. 新しい投稿データをテキスト部分から取得
  const newPost = req.body;

  // 2. アップロードされた画像のパスを追加
  if (req.file) {
    newPost.img = `img/articleimg/${req.file.filename}`;
  } else {
    newPost.img = 'img/activity-default.jpg'; // 画像がない場合のデフォルト
  }

  const dataPath = path.join(__dirname, '..', 'docs/info.json');

const aryMax = function (a, b) {return Math.max(a, b);}

  try {
    const currentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    let idNumList = currentData.map(item => item.idNum);
    const idNum = idNumList.reduce(aryMax)+1;
    newPost.idNum = idNum;
    newPost.link = `report${idNum}.html`;
    currentData.unshift(newPost); // 新しい投稿を配列の先頭に追加
    const newJsonData = JSON.stringify(currentData, null, 2);
    fs.writeFileSync(dataPath, newJsonData, 'utf8');

    res.status(200).json({ message: '投稿が成功しました！' });
  } catch (error) {
    console.error('エラー:', error);
    res.status(500).json({ message: 'サーバーでエラーが発生しました。' });
  }
});

app.get('/api/posts', (req, res) => {
  const dataPath = path.join(__dirname, '../docs/info.json'); // パスも念のため修正
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const posts = JSON.parse(rawData); // ★先にJSON（配列）に変換する！

    // 配列になってからソートする
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json(posts);
  } catch (error) {
    console.error(error); // エラー内容をログに出すようにしておくと便利
    res.status(500).json({ message: 'データの読み込みに失敗しました。' });
  }
});

// ...app.get('/api/posts', ...) の下に追加...

// GETリクエストを '/api/posts/:id' というURLで受け付ける (一件取得用)
app.get('/api/posts/:id', (req, res) => {
  const dataPath = path.join(__dirname, '..', 'docs/info.json');
  try {
    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    // URLの:idと一致する記事を探す
    const post = allPosts.find(p => p.idNum == req.params.id);
    if (post) {
      res.status(200).json(post);
    } else {
      res.status(404).json({ message: '記事が見つかりません。' });
    }
  } catch (error) {
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

app.put('/api/posts/:id', upload.single('image'), (req, res) => {
  const dataPath = path.join(__dirname, '..', 'docs/info.json');
  try {
    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const postIndex = allPosts.findIndex(p => p.idNum == req.params.id);

    if (postIndex === -1) {
      return res.status(404).json({ message: '更新対象の記事が見つかりません。' });
    }

    // 既存のデータを取得し、新しいデータで上書き
    const updatedPost = {
      ...allPosts[postIndex], // 既存のデータをコピー
      ...req.body, // 新しいテキストデータで上書き
      image: req.file ? `img/articleimg/${req.file.filename}` : allPosts[postIndex].image // 画像が更新されていればパスを更新
    };
    // 配列の該当箇所を新しいデータに差し替え
    allPosts[postIndex] = updatedPost;

    fs.writeFileSync(dataPath, JSON.stringify(allPosts, null, 2), 'utf8');
    res.status(200).json({ message: '記事を更新しました！' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

app.delete('/api/posts/:id', (req, res) => {
  const dataPath = path.join(__dirname, '..', 'docs/info.json');
  try {
    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // ▼▼▼ ここからが変更点 ▼▼▼

    // 1. 削除対象の記事を見つけて、ファイル名（link）を取得する
    const postToDelete = allPosts.find(p => p.idNum == req.params.id);

    // もし削除対象が見つからなければ、エラーを返す
    if (!postToDelete) {
      return res.status(404).json({ message: '削除対象の記事が見つかりません。' });
    }
    const htmlFilePath = path.join(__dirname, '../docs/', postToDelete.link);

    // 2. 記事リストから対象の記事を除外する (既存のロジック)
    const updatedPosts = allPosts.filter(p => p.idNum != req.params.id);
    fs.writeFileSync(dataPath, JSON.stringify(updatedPosts, null, 2), 'utf8');

    // 3. 実際にHTMLファイルを削除する
    //    fs.existsSync()でファイルが本当に存在するか念のため確認
    if (fs.existsSync(htmlFilePath)) {
      fs.unlinkSync(htmlFilePath); // ファイルを同期的に削除
      console.log(`${htmlFilePath} を削除しました。`);
    } else {
      console.log(`${htmlFilePath} は見つかりませんでしたが、JSONデータは削除されました。`);
    }

    // ▲▲▲ ここまでが変更点 ▲▲▲

    res.status(200).json({ message: '記事データとHTMLファイルを削除しました。' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
});
// ▼▼▼ server.js の /api/images/cleanup 部分 ▼▼▼

// ▼▼▼ 未使用画像の削除（articleimgフォルダ限定版） ▼▼▼
app.delete('/api/images/cleanup', (req, res) => {
  // ターゲットを 'docs/img/articleimg' に限定！
  const imgDir = path.join(__dirname, '../docs/img/articleimg');
  const dataPath = path.join(__dirname, '../docs/info.json');

  try {
    // フォルダが存在しない場合のガード
    if (!fs.existsSync(imgDir)) {
      return res.json({ message: 'まだ記事用の画像フォルダ(articleimg)がありません。' });
    }

    // 1. articleimgフォルダ内の全ファイルを取得
    const allFiles = fs.readdirSync(imgDir);

    // 2. 記事データを見て「使われている画像」のファイル名リストを作る
    const posts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const usedImages = new Set();

    posts.forEach(post => {
      // (A) サムネイル画像 (例: "img/articleimg/photo.jpg")
      if (post.img) {
        // パスがどうなっていても、ファイル名(photo.jpg)だけを取り出して登録
        usedImages.add(path.basename(post.img));
      }

      // (B) 本文内の画像
      if (post.contentMd) {
        // 本文中の "img/..." っぽい文字列を全部探す
        const matches = post.contentMd.match(/img\/[a-zA-Z0-9_\-\.\/]+/g);
        if (matches) {
          matches.forEach(match => {
             // これもファイル名だけを取り出して登録
            usedImages.add(path.basename(match));
          });
        }
      }
    });

    // 3. 削除実行
    let deletedCount = 0;
    allFiles.forEach(file => {
      const filePath = path.join(imgDir, file);

      // 念のためファイル以外（フォルダなど）は無視
      if (!fs.statSync(filePath).isFile()) return;

      // 「使われているリスト」になければ削除！
      if (!usedImages.has(file)) {
        fs.unlinkSync(filePath);
        console.log(`未使用画像を削除しました: ${file}`);
        deletedCount++;
      }
    });

    res.json({ message: `articleimgフォルダから ${deletedCount} 個のゴミ画像を削除しました！` });

  } catch (error) {
    console.error('お掃除中にエラー:', error);
    res.status(500).json({ message: '画像のお掃除に失敗しました。' });
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});