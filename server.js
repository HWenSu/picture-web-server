const express = require("express");
const multer = require("multer");
const cors = require("cors");
const sizeOf = require("image-size");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 5000;

//啟動 CORS 來取得不同來源的請求
app.use(cors());

// 配置 multer 儲存選項
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath); // 創建上傳目錄（如果不存在）
    }
    cb(null, "uploads/"); // 指定上傳目錄
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // 生成唯一文件名
  },
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // 僅允許特定的圖片格式
    if (
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/gif"
    ) {
      cb(null, true);
    } else {
      cb(new Error("不支援的檔案格式"), false);
    }
  },
});

// 處理上傳路由
app.post("/upload", upload.array("files", 50), (req, res) => {
  const uploadedFiles = req.files;

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileData = uploadedFiles.map((file) => {
    try {
      const dimensions = sizeOf(file.path); // 獲取圖片尺寸
      const displayHeight = (dimensions.height / dimensions.width) * 500

      if (isNaN(displayHeight)) {
        return { error: `Invalid image dimensions: ${file.filename}` }
      }

      return {
        height: dimensions.height,
        width: dimensions.width,
        src: {
          large: `https://localhost:${port}/uploads/${file.filename}`,
        },
      };
    } catch (error) {
      console.error(`Error processing file: ${file.filename}`, error);
      return { error: `Invalid image file: ${file.filename} `};
    }
  });

  // 過濾掉無效的圖片檔案
  const validFiles = fileData.filter((item) => !item.error)
  if (validFiles.length === 0) {
    return res.status(400).json({ error: "沒有有效的圖片檔案上傳。" });
  }

  res.json(validFiles); // 返回有效的圖片信息
});



// 獲取圖片列表的路由, 增加分頁功能
app.get("/images", (req, res) => {
  const uploadPath = path.join(__dirname, "uploads");
  //分頁參數
  const { page = 1, limit = 15 } = req.query
  //計算圖片數量
  const startIndex = (page - 1) * limit
  const endIndex = page * limit

  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      return res.status(500).send("Failed to read images");
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
            large: `https://localhost:${port}/uploads/${file}`,
          },
        };
      } catch (error) {
        console.error(`Error reading image file: ${file}, error`);
        return { error: `Invalid image file: ${file} `};
      }
    });
    // 分頁數據
    const paginatedData = fileData.slice(startIndex, endIndex)

    //返回分頁結果: 返回一個包含當前頁碼、總頁數、總項目數和圖片數據的物件
    res.json({
      currentPage: page,
      totalPages: Math.ceil(files.length / limit),
      totalItems: files.length,
      data: paginatedData,
    })
  });
});

// 靜態提供上傳的檔案
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});