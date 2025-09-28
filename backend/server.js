const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer'); // multerを読み込む

const app = express();
const port = 3000;

app.use(cors());
// JSONデータとURLエンコードされたデータを受け取る設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ▼▼▼ multerの設定 ▼▼▼
const storage = multer.diskStorage({
  // ファイルの保存先を指定
  destination: function (req, file, cb) {
    cb(null, '../img/'); // ルートのuploadsフォルダを指定
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
app.use('/img', express.static(path.join(__dirname, '..', 'img')));


// ▼▼▼ POSTリクエストのルートを修正 ▼▼▼
// upload.single('image') ミドルウェアを追加
app.post('/api/posts', upload.single('image'), (req, res) => {
  console.log('受け取ったテキストデータ:', req.body);
  console.log('受け取ったファイル:', req.file);

  // 1. 新しい投稿データをテキスト部分から取得
  const newPost = req.body;

  // 2. アップロードされた画像のパスを追加
  if (req.file) {
    newPost.img = `/img/${req.file.filename}`;
  } else {
    newPost.img = '/img/activity-default.jpg'; // 画像がない場合のデフォルト
  }

  const dataPath = path.join(__dirname, '..', 'info.json');

  try {
    const currentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const idNum = currentData[0]["idNum"]+1;
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
  const dataPath = path.join(__dirname, '..', 'info.json');
  try {
    const data = fs.readFileSync(dataPath, 'utf8');
    res.status(200).json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ message: 'データの読み込みに失敗しました。' });
  }
});

// ...app.get('/api/posts', ...) の下に追加...

// GETリクエストを '/api/posts/:id' というURLで受け付ける (一件取得用)
app.get('/api/posts/:id', (req, res) => {
  const dataPath = path.join(__dirname, '..', 'info.json');
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
  const dataPath = path.join(__dirname, '..', 'info.json');
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
      image: req.file ? `/uploads/${req.file.filename}` : allPosts[postIndex].image // 画像が更新されていればパスを更新
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
  const dataPath = path.join(__dirname, '..', 'info.json');
  try {
    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // ▼▼▼ ここからが変更点 ▼▼▼

    // 1. 削除対象の記事を見つけて、ファイル名（link）を取得する
    const postToDelete = allPosts.find(p => p.idNum == req.params.id);
    
    // もし削除対象が見つからなければ、エラーを返す
    if (!postToDelete) {
      return res.status(404).json({ message: '削除対象の記事が見つかりません。' });
    }
    const htmlFilePath = path.join(__dirname, '..', postToDelete.link);

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

// サーバーを起動
app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});