const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const sizeOf = require("image-size");
const admin = require("firebase-admin");

dotenv.config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const auth = admin.auth();

const app = express();
const port = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;
const uploadPath = path.join(__dirname, "uploads");
const metadataPath = path.join(__dirname, "metadata");

// 確保 `uploads` 和 `metadata` 資料夾存在
[uploadPath, metadataPath].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 允許來自 Zeabur 的 CORS 請求
const allowedOrigins = ["https://picture-web.vercel.app"]; // 你的前端網址


// CORS 設定，允許跨域請求
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

// ✅ 處理 `OPTIONS` 預檢請求
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "https://picture-web.vercel.app");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  return res.status(204).send();
});

app.use(cors(corsOptions));

// 提供靜態圖片
app.use("/uploads", express.static(uploadPath, {
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// **🔹 Firebase Auth 驗證會員**
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null; // 允許訪客模式
    return next();
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken; // 會員資料
    console.log("✅ Token 驗證成功", decodedToken);
    next();
  } catch (error) {
    console.error("❌ Token 驗證失敗:", error);
    req.user = null; // 設定為訪客
    next();
  }
};

// **🔹 設定 Multer (圖片上傳)**
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// **🔹 處理圖片壓縮 & 儲存 metadata**
const processFile = async (file, body, userId) => {
  try {
    const compressedFileName = `compressed-${file.filename}`;
    const compressedFilePath = path.join(uploadPath, compressedFileName);
    const metadataFilePath = path.join(metadataPath, `${compressedFileName}.json`);

    await sharp(file.path).jpeg({ quality: 80 }).toFile(compressedFilePath);
    fs.unlinkSync(file.path);

    const dimensions = sizeOf(compressedFilePath);
    const metadata = {
      userId,
      title: body.title || "Untitled",
      description: body.description || "No description",
      tags: body.tags ? body.tags.split(",") : [],
      category: body.category,
      height: dimensions.height,
      width: dimensions.width,
      src: { large: `${BASE_URL}/uploads/${compressedFileName}` },
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));

    return metadata;
  } catch (error) {
    console.error("❌ 錯誤處理文件:", error);
    return { error: "Invalid image file" };
  }
};

// **🔹 會員上傳圖片**
app.post("/upload", authenticateUser, upload.single("file"), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const fileData = await processFile(req.file, req.body, req.user.uid);
    res.json(fileData);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// **🔹 會員查看自己的圖片**
app.get("/images", authenticateUser, (req, res) => {
  if (!req.user) return res.json({ data: [] }); // 訪客直接返回空陣列

  const userId = req.user.uid;
  console.log(`📢 查詢會員 ${userId} 上傳的圖片`);

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;

  fs.readdir(uploadPath, (err, files) => {
    if (err) return res.status(500).json({ error: "Failed to read images" });

    const fileData = files
      .filter(file => file.startsWith("compressed-"))
      .map(file => {
        const filePath = path.join(uploadPath, file);
        const metadataFilePath = path.join(metadataPath, `${file}.json`);

        if (!fs.existsSync(metadataFilePath)) return null;

        let metadata = JSON.parse(fs.readFileSync(metadataFilePath, "utf8"));

        if (metadata.userId !== userId) return null; // 過濾掉非會員的圖片

        try {
          const dimensions = sizeOf(filePath);
          return {
            ...metadata,
            displayHeight: (dimensions.height / dimensions.width) * 900,
            height: dimensions.height,
            width: dimensions.width,
            src: { large: `${BASE_URL}/uploads/${file}` },
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .slice((page - 1) * limit, page * limit);

    res.json({ data: fileData });
  });
});

// **🔹 訪客透過 `/user/:userId` 查詢會員相簿**
app.get("/user/:userId", (req, res) => {
  const userId = req.params.userId;
  console.log(`📢 查詢會員相簿：${userId}`);

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;

  fs.readdir(uploadPath, (err, files) => {
    if (err) return res.status(500).json({ error: "Failed to read images" });

    const fileData = files
      .filter(file => file.startsWith("compressed-"))
      .map(file => {
        const filePath = path.join(uploadPath, file);
        const metadataFilePath = path.join(metadataPath, `${file}.json`);

        if (!fs.existsSync(metadataFilePath)) return null;

        let metadata = JSON.parse(fs.readFileSync(metadataFilePath, "utf8"));

        if (metadata.userId !== userId) return null; // 只回傳該會員的圖片

        try {
          const dimensions = sizeOf(filePath);
          return {
            ...metadata,
            displayHeight: (dimensions.height / dimensions.width) * 900,
            height: dimensions.height,
            width: dimensions.width,
            src: { large: `${BASE_URL}/uploads/${file}` },
          };
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .slice((page - 1) * limit, page * limit);

    res.json({ data: fileData });
  });
});

app.listen(port, () => console.log(`🚀 Server running on ${BASE_URL}`));
