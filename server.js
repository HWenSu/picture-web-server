const express = require("express");
const multer = require("multer");
const cors = require("cors");
const sizeOf = require("image-size");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 5000;

//啟動 CORS 來取得不同的請求
app.use(cors());

// 配置 multer 存储选项
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath); // 创建上传目录（如果不存在）
    }
    cb(null, "uploads/"); // 指定上传目录
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // 生成唯一文件名
  },
});

// 创建一个文件过滤器函数
const fileFilter = (req, file, cb) => {
  // 只允许上传 jpeg, jpg, png 格式的文件
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/jpg" ||
    file.mimetype === "image/png"
  ) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPG, JPEG, and PNG are allowed!"),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter, // 使用文件过滤器
});

// 处理文件上传的路由
app.post("/upload", upload.array("files", 10), (req, res) => {
  const uploadedFiles = req.files;

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileData = uploadedFiles.map((file) => {
    try {
      const dimensions = sizeOf(file.path); // 获取图片尺寸
      return {
        displayHeight: (dimensions.height / dimensions.width) * 500, // 假设显示宽度为500的情况下计算显示高度
        height: dimensions.height,
        width: dimensions.width,
        src: {
          large: `http://localhost:${port}/uploads/${file.filename}`,
        }, // 改变格式为 { src: { large: url } }
      };
    } catch (error) {
      console.error(`Error processing file: ${file.filename}`, error);
      return { error: `Invalid image file: ${file.filename}` };
    }
  });

  res.json(fileData); // 返回图片信息
});

// 获取图片列表的路由
app.get("/images", (req, res) => {
  const uploadPath = path.join(__dirname, "uploads");

  fs.readdir(uploadPath, (err, files) => {
    if (err) {
      return res.status(500).send("Failed to read images");
    }

    const fileData = files.map((file) => {
      const filePath = path.join(uploadPath, file);
      try {
        const dimensions = sizeOf(filePath);
        return {
          displayHeight: (dimensions.height / dimensions.width) * 500, // 计算显示高度
          height: dimensions.height,
          width: dimensions.width,
          src: {
            large: `http://localhost:${port}/uploads/${file}`,
          }, // 改变格式为 { src: { large: url } }
        };
      } catch (error) {
        console.error(`Error reading image file: ${file}`, error);
        return { error: `Invalid image file: ${file}` };
      }
    });

    res.json(fileData);
  });
});

// 静态提供上传的文件
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
