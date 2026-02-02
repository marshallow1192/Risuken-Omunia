const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const app = express();
const port = 3000;

const { exec } = require('child_process');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const getFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
};

// カテゴリに応じたファイルパス取得
const getFilePath = (category) => {
  return category === 'tech' ? '../docs/tech.json' : '../docs/info.json';
};

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
// ▼▼▼ 記事操作API ▼▼▼
// ==================================================

// 1. 記事一覧取得 (GET)
app.get('/api/posts', (req, res) => {
  const category = req.query.cat || 'info';
  const dataPath = path.join(__dirname, getFilePath(category));

  try {
    if (!fs.existsSync(dataPath)) {
      return res.json([]);
    }
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const posts = JSON.parse(rawData);
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.status(200).json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'データ読み込みエラー' });
  }
});

// 2. 個別記事取得 (GET)
app.get('/api/posts/:id', (req, res) => {
  const category = req.query.cat || 'info';
  const dataPath = path.join(__dirname, getFilePath(category));

  try {
    if (!fs.existsSync(dataPath)) return res.status(404).json({ message: 'ファイルなし' });
    
    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
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

// 3. 新規投稿 (POST) ★ここを修正しました★
app.post('/api/posts', upload.single('image'), async(req, res) => {
  console.log('受け取ったデータ:', req.body);
  const category = req.body.category || 'info'; 
  const dataPath = path.join(__dirname, getFilePath(category));

  // ★修正1：データを先に読み込んで、最大IDを計算する
  let currentData = [];
  if (fs.existsSync(dataPath)) {
    currentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }

  // 既存のIDの中から最大値を探す（なければ0）
  // 念のため Number() で数値化してから比較します
  const maxId = currentData.length > 0 
    ? Math.max(...currentData.map(p => Number(p.idNum) || 0)) 
    : 0;
  
  // 新しいIDは 最大値 + 1
  const newId = maxId + 1;


  // ★修正2：カテゴリに応じてファイル名を変える
  // techなら "articles/tech1.html", infoなら "articles/article1.html"
  const filenamePrefix = category === 'tech' ? 'tech' : 'article';
  const newLink = `articles/${filenamePrefix}${newId}.html`;


  // 本文のパス置換
  if (req.body.contentMd) {
    req.body.contentMd = req.body.contentMd.replace(/docs\/img\//g, '../img/');
  }

  // 新しい投稿データ作成
  const newPost = req.body;
  newPost.idNum = newId;  // 連番ID
  newPost.link = newLink; // 新しい命名規則のリンク
  newPost.category = category;

  // 画像処理
  if (req.file) {
    await optimizeImage(req.file.path);
    newPost.img = `../img/articleimg/${req.file.filename.replace(/\s+/g,"")}`;
  } else {
    newPost.img = ''; 
  }

  try {
    // 先頭に追加して保存
    currentData.unshift(newPost);
    fs.writeFileSync(dataPath, JSON.stringify(currentData, null, 2), 'utf8');

    res.status(200).json({ message: `【${category}】記事(ID:${newId})を投稿しました！` });
  } catch (error) {
    console.error('投稿エラー:', error);
    res.status(500).json({ message: '保存に失敗しました。' });
  }
});

// 4. 記事更新 (PUT)
app.put('/api/posts/:id', upload.single('image'), async(req, res) => {
  const category = req.body.category || 'info';
  
  if (req.body.contentMd) {
    req.body.contentMd = req.body.contentMd.replace(/docs\/img\//g, '../img/');
  }

  const targetCategory = req.query.cat || req.body.category || 'info';
  const dataPath = path.join(__dirname, getFilePath(targetCategory));

  try {
    if (!fs.existsSync(dataPath)) return res.status(404).json({ message: 'ファイルなし' });

    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const postIndex = allPosts.findIndex(p => p.idNum == req.params.id);

    if (postIndex === -1) {
      return res.status(404).json({ message: '更新対象の記事が見つかりません。' });
    }

    if (req.file) {
      await optimizeImage(req.file.path);
    }

    const updatedPost = {
      ...allPosts[postIndex],
      ...req.body,
      img: req.file ? `../img/articleimg/${req.file.filename}` : allPosts[postIndex].img,
      category: targetCategory
    };
    
    allPosts[postIndex] = updatedPost;
    fs.writeFileSync(dataPath, JSON.stringify(allPosts, null, 2), 'utf8');
    
    res.status(200).json({ message: '記事を更新しました！' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
});

// 5. 記事削除 (DELETE)
app.delete('/api/posts/:id', (req, res) => {
  const category = req.query.cat || 'info';
  const dataPath = path.join(__dirname, getFilePath(category));

  try {
    if (!fs.existsSync(dataPath)) return res.status(404).json({ message: 'ファイルなし' });

    const allPosts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const postToDelete = allPosts.find(p => p.idNum == req.params.id);

    if (!postToDelete) {
      return res.status(404).json({ message: '削除対象が見つかりません。' });
    }

    // HTMLファイルの削除
    const htmlFilePath = path.join(__dirname, '../docs/', postToDelete.link);
    if (fs.existsSync(htmlFilePath)) {
      fs.unlinkSync(htmlFilePath);
      console.log(`${htmlFilePath} を削除しました。`);
    }

    // JSONから削除
    const updatedPosts = allPosts.filter(p => p.idNum != req.params.id);
    fs.writeFileSync(dataPath, JSON.stringify(updatedPosts, null, 2), 'utf8');

    res.status(200).json({ message: '記事とHTMLを削除しました。' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'サーバーエラー' });
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
    if (post.img) set.add(path.basename(post.img));
    if (post.contentMd) {
      const matches = post.contentMd.match(/img\/[a-zA-Z0-9_\-\.\/]+/g);
      if (matches) {
        matches.forEach(match => set.add(path.basename(match)));
      }
    }
  });
}

app.post('/api/generate', (req, res) => {
  const scriptPath = path.join(__dirname, '../generateArticle.js');
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`実行エラー: ${error}`);
      return res.status(500).json({ message: 'サイト生成失敗' });
    }
    console.log(`stdout: ${stdout}`);
    res.status(200).json({ message: 'サイト更新完了！' });
  });
});

app.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});