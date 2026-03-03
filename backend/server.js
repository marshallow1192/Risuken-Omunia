const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const app = express();
const port = 3000;

const DELETE_PASSWORD = "omunia-delete";

const { exec } = require('child_process');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
    // アクセスしてきたら、即座に admin.html へ飛ばす！
    res.redirect('/admin.html');
});

// ▼▼▼ 変更：データの保存場所を「docs」から「backend/data」に変更 ▼▼▼
const getDataDir = (category) => {
  return path.join(__dirname, '../docs/articles', 'data', category);
};

// ▼▼▼ 追加：フォルダ内のJSONを全部読んで、1つの配列にする関数 ▼▼▼
function getAllPosts(category) {
  const dirPath = getDataDir(category);

  // フォルダがなければ作る
  if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
  }

  const files = fs.readdirSync(dirPath);
  const allData = files
      .filter(file => file.endsWith('.json')) // JSONファイルだけ選ぶ
      .map(file => {
          try {
            const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
            return JSON.parse(content);
          } catch (e) {
            console.error(`JSON読み込みエラー: ${file}`, e);
            return null;
          }
      })
      .filter(data => data !== null); // エラーだったやつは除外

  // 日付順（新しい順）に並び替える
  return allData.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ▼▼▼ multerの設定 ▼▼▼
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../docs/img/articleimg/'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

app.use('/img', express.static(path.join(__dirname, '../docs/img')));

// ▼▼▼ 画像最適化 ▼▼▼
const optimizeImage = async (filePath) => {
  try {
    const imageBuffer = fs.readFileSync(filePath);
    await sharp(imageBuffer)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
      .then(buffer => fs.writeFileSync(filePath.replace(/\s+/g,""), buffer));
    console.log(`画像を圧縮しました: ${filePath}`);
  } catch (error) {
    console.error('画像圧縮失敗:', error);
  }
};


// ▼▼▼ 画像アップロードAPI ▼▼▼
app.post('/api/upload-image', upload.single('image'), async(req, res) => {
  if (!req.file) return res.status(400).json({ message: 'ファイルがありません' });

  await optimizeImage(req.file.path);
  const newFilePath = req.file.path;
  const imgDir = path.dirname(newFilePath);

  try {
    const newFileHash = getFileHash(newFilePath);
    const newFileSize = req.file.size;
    const files = fs.readdirSync(imgDir);

    for (const file of files) {
      if (file === req.file.filename) continue;
      const existingFilePath = path.join(imgDir, file);
      if (!fs.statSync(existingFilePath).isFile()) continue;
      if (fs.statSync(existingFilePath).size !== newFileSize) continue;

      if (getFileHash(existingFilePath) === newFileHash) {
        console.log(`重複画像を発見: ${file}`);
        fs.unlinkSync(newFilePath);
        return res.json({ url: 'docs/img/articleimg/' + file.replace(/\s+/g,"") });
      }
    }
    const imagePath = 'docs/img/articleimg/' + req.file.filename.replace(/\s+/g,"");
    res.json({ url: imagePath });

  } catch (error) {
    console.error('重複チェックエラー:', error);
    res.json({ url: 'docs/img/articleimg/' + req.file.filename.replace(/\s+/g,"") });
  }
});


// ==================================================
// ▼▼▼ 記事操作API（1記事1ファイル版） ▼▼▼
// ==================================================

// 1. 記事一覧取得 (GET)
app.get('/api/posts', (req, res) => {
  const category = req.query.cat || 'info';
  try {
    const posts = getAllPosts(category);
    res.status(200).json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'データ読み込みエラー' });
  }
});

// 2. 個別記事取得 (GET)
app.get('/api/posts/:id', (req, res) => {
  const category = req.query.cat || 'info';
  const dirPath = getDataDir(category);
  // ID = ファイル名 (例: python-intro) なので、そのまま探す
  const filePath = path.join(dirPath, `${req.params.id}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      res.status(200).json(post);
    } else {
      res.status(404).json({ message: '記事が見つかりません' });
    }
  } catch (error) {
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

// 3. 新規投稿 (POST)
app.post('/api/posts', upload.single('image'), async(req, res) => {
  console.log('受け取ったデータ:', req.body);
  const category = req.body.category || 'info';
  const dirPath = getDataDir(category);

  // フォルダ作成
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  let id;
  // カスタムID（URLに使われる名前）の決定
  if (req.body.customId && req.body.customId.trim() !== '') {
    id = req.body.customId.trim();
    // ファイル重複チェック (id.json があるかどうか)
    if (fs.existsSync(path.join(dirPath, `${id}.json`))) {
      console.log(`⚠️ ID "${id}" は使用済みのため、時間を付与します。`);
      id = `${id}-${Date.now()}`;
    }
  } else {
    // 空欄ならタイムスタンプ
    id = Date.now().toString();
  }

  const filenamePrefix = category === 'tech' ? 'tech' : 'article';
  // リンクはシンプルに "articles/ID.html" 形式にする（お好みで調整可）
  // 連番風にしたければここを調整ですが、ファイル名管理ならIDそのままが綺麗です
  const linkName = `articles/${id}.html`;

  // 本文の画像パス修正
  if (req.body.contentMd) {
    req.body.contentMd = req.body.contentMd.replace(/img\/articleimg\//g, '../img/articleimg/');
    req.body.contentMd = req.body.contentMd.replace(/docs\//g, '');
  }

  const newPost = {
    id: id,
    title: req.body.title,
    date: req.body.date,
    category: category,
    displayDate: req.body.displayDate,
    contentMd: req.body.contentMd,
    link: req.body.link || linkName,
    img: ''
  };

  // 画像処理
  if (req.file) {
    await optimizeImage(req.file.path);
    newPost.img = `../img/articleimg/${req.file.filename.replace(/\s+/g,"")}`;
  } else if (req.body.existingImage) {
    newPost.img = req.body.existingImage;
  }

  try {
    // ★重要：個別のJSONファイルとして保存
    fs.writeFileSync(path.join(dirPath, `${id}.json`), JSON.stringify(newPost, null, 2), 'utf8');

    res.status(200).json({ message: `【${category}】記事(ID:${id})を保存しました！\n「サイトを更新して公開」を押すと反映されます。` });
  } catch (error) {
    console.error('保存エラー:', error);
    res.status(500).json({ message: '保存に失敗しました。' });
  }
});

// 4. 記事更新 (PUT)
app.put('/api/posts/:id', upload.single('image'), async(req, res) => {
  const category = req.body.category || 'info';
  const dirPath = getDataDir(category);
  const filePath = path.join(dirPath, `${req.params.id}.json`);

  try {
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '記事ファイルがありません' });

    const currentPost = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (req.body.contentMd) {
      req.body.contentMd = req.body.contentMd.replace(/img\/articleimg\//g, '../img/articleimg/');
      req.body.contentMd = req.body.contentMd.replace(/docs\//g, '');
    }
    if (req.file) {
      await optimizeImage(req.file.path);
    }

    const updatedPost = {
      ...currentPost,
      ...req.body,
      img: req.file ? `../img/articleimg/${req.file.filename}` : currentPost.img,
      category: category
    };
    
    // 上書き保存
    fs.writeFileSync(filePath, JSON.stringify(updatedPost, null, 2), 'utf8');
    
    res.status(200).json({ message: '記事を更新しました！' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

// 5. 記事削除 (DELETE)
// 5. 記事削除 (DELETE)
app.delete('/api/posts/:id', (req, res) => {
  // ▼▼▼ 追加：パスワードチェック ▼▼▼
  // 画面から送られてきたパスワードが、設定したものと合っているか確認
  if (req.body.password !== DELETE_PASSWORD) {
    return res.status(403).json({ message: 'パスワードが違います！削除できません。' });
  }

  const category = req.query.cat || 'info';
  const dirPath = getDataDir(category);
  const filePath = path.join(dirPath, `${req.params.id}.json`);

  try {
    // JSONファイルの削除
    if (fs.existsSync(filePath)) {
      // まずファイルの中身を読んで、リンク先のHTMLも消す
      const post = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const htmlFilePath = path.join(__dirname, '../docs/', post.link);
      if (fs.existsSync(htmlFilePath)) {
        fs.unlinkSync(htmlFilePath);
      }

      fs.unlinkSync(filePath); // JSON本体を削除
      res.status(200).json({ message: '記事データを削除しました。' });
    } else {
      res.status(404).json({ message: 'ファイルが見つかりません' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '削除失敗' });
  }
});

// お掃除・生成用API
app.delete('/api/images/cleanup', (req, res) => {
  const imgDir = path.join(__dirname, '../docs/img/articleimg');

  try {
    if (!fs.existsSync(imgDir)) return res.json({ message: 'フォルダがありません' });

    const allFiles = fs.readdirSync(imgDir);
    const usedImages = new Set();

    if (fs.existsSync(path.join(__dirname, '../docs/info.json'))) {
      const infoPosts = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/info.json'), 'utf8'));
      collectUsedImages(infoPosts, usedImages);
    }
    if (fs.existsSync(path.join(__dirname, '../docs/tech.json'))) {
      const techPosts = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/tech.json'), 'utf8'));
      collectUsedImages(techPosts, usedImages);
    }

    let deletedCount = 0;
    allFiles.forEach(file => {
      const filePath = path.join(imgDir, file);
      if (!fs.statSync(filePath).isFile()) return;
      if (!usedImages.has(file)) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });

    res.json({ message: `${deletedCount} 個のゴミ画像を削除しました！` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'お掃除失敗' });
  }
});

function collectUsedImages(posts, set) {
  posts.forEach(post => {
    // 1. サムネイル画像は無条件で守る
    if (post.img) {
        set.add(path.basename(post.img));
    }

    // 2. 本文中の画像を守る（最強版）
    if (post.contentMd) {
      // ▼▼▼ ここが変更点！ ▼▼▼
      // 「スペース、改行、カッコ()、引用符"'」 以外の文字が連続していて、
      // 最後に画像拡張子がついているものを全部拾う！
      const matches = post.contentMd.match(/[^ \t\n\r"'\(\)]+\.(jpg|jpeg|png|gif|webp)/gi);

      if (matches) {
        matches.forEach(filename => {
            // ファイル名部分だけを取り出して「使用中リスト」に入れる
            set.add(path.basename(filename));
        });
      }
    }
  });
}

app.post('/api/generate', async (req, res) => {
  try {
    console.log('サイト生成を開始します...');

    // 1. Tech記事をフォルダから全部集めて、docs/tech.json に書き出す（ガッチャンコ！）
    const allTech = getAllPosts('tech');
    fs.writeFileSync(path.join(__dirname, '../docs/tech.json'), JSON.stringify(allTech, null, 2));

    // 2. Info記事も同様にガッチャンコ
    const allInfo = getAllPosts('info');
    fs.writeFileSync(path.join(__dirname, '../docs/info.json'), JSON.stringify(allInfo, null, 2));

    // 3. これまで通り generateArticle.js を動かしてHTMLを作る
    const scriptPath = path.join(__dirname, '../generateArticle.js');
    exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`実行エラー: ${error}`);
        return res.status(500).json({ message: 'サイト生成失敗' });
      }
      console.log(`stdout: ${stdout}`);
      res.status(200).json({ message: '全記事を統合してサイトを更新しました！' });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '生成処理中にエラーが発生しました' });
  }
});

app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});