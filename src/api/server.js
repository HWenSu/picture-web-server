const express = require("express");
const multer = require("multer");
const cors = require("cors");
const sizeOf = require("image-size");
const path = require("path");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 5000;

const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

// 啟用 CORS
app.use(cors({
  origin: "https://picture-web.vercel.app",
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
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// 上傳路由
app.post("/upload", upload.array("files", 50), (req, res) => {
  const uploadedFiles = req.files;

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileData = uploadedFiles.map((file) => {
    try {
      const dimensions = sizeOf(file.path);
      return {
        height: dimensions.height,
        width: dimensions.width,
        src: {
          large: `${BASE_URL}/uploads/${file.filename}`,
        },
      };
    } catch (error) {
      console.error("Error processing file:", file.filename, error);
      return { error: "Invalid image file" };
    }
  });

  res.json(fileData.filter((item) => !item.error));
});

// 圖片列表路由
app.get("/images", (req, res, next) => {
  const uploadPath = path.join(__dirname, "../../uploads");
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

    const paginatedData = fileData.filter(Boolean).slice((page - 1) * lim$it, page * limit);

    res.json({
      currentPage: page,
      totalPages: Math.ceil(fileData.length / limit),
      totalItems: fileData.length,
      data: paginatedData,
    });
  });
});

// 提供靜態文件
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "https://picture-web.vercel.app");
  },
}));

// 啟動服務
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
