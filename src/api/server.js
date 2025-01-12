const express = require("express");
const multer = require("multer");
const cors = require("cors");
const sizeOf = require("image-size");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const sharp = require("sharp");


const app = express();
const port = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;
const uploadPath = path.join(__dirname, "uploads");

console.log("__dirname:", __dirname);
console.log("Resolved uploads path:", uploadPath);

// 確保 uploads 資料夾存在
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log(`Uploads folder created at: ${uploadPath}`);
} else {
  console.log(`Uploads folder already exists at: ${uploadPath}`);
}

// 啟用 CORS
app.use(cors({
  origin: ["https://picture-web.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// 健康檢查路由
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// 配置 multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// 上傳路由
app.post("/upload", upload.array("files", 50), async (req, res) => {
  const uploadedFiles = req.files;

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileDataPromises = uploadedFiles.map(async (file) => {
    try {
      const compressedFilePath = path.join(uploadPath, `compressed-${file.filename}`)
      //使用sharp壓縮圖片，設置目標大小為 2MB
      await sharp(file.path)
        .jpeg({quality: 80}) //壓縮質量為80
        .toFile(compressedFilePath)

      //刪除原始文件
      fs.unlinkSync(file.path)

      //返回壓縮後的圖片信息
      const dimensions = sizeOf(compressedFilePath);
      return {
        height: dimensions.height,
        width: dimensions.width,
        src: {
          large: `${BASE_URL}/uploads/compressed-${file.filename}`,
        },
      };
    } catch (error) {
      console.error("Error processing file:", file.filename, error);
      return { error: "Invalid image file" };
    }
    
  });
  
  //等所有圖片壓縮完成後才返回
  const fileData = await Promise.all(fileDataPromises);

  res.json(fileData.filter((item) => !item.error));
});

// 圖片列表路由
app.get("/images", (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;

  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      console.error("Failed to read images:", err);
      return res.status(500).json({ error: "Failed to read images" });
    }

    const fileData = files.map((file) => {
      const filePath = path.join(uploadPath, file);
      try {
        const dimensions = sizeOf(filePath);
        return {
          displayHeight: (dimensions.height / dimensions.width) * 900,
          height: dimensions.height,
          width: dimensions.width,
          src: {
            large: `${BASE_URL}/uploads/${file}`,
          },
        };
      } catch (error) {
        console.error(`Error reading image file: ${file}`, error);
        return null;
      }
    });

    const paginatedData = fileData.filter(Boolean).slice((page - 1) * limit, page * limit);

    res.json({
      currentPage: page,
      totalPages: Math.ceil(fileData.length / limit),
      totalItems: fileData.length,
      data: paginatedData,
    });
  });
});

// 提供靜態文件
app.use("/uploads", express.static(uploadPath, {
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
  },
}));

// 設置 CSP
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", BASE_URL, "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    },
  })
);

// 啟動服務
app.listen(port, () => {
  console.log(`Server running on ${BASE_URL}`);
});
