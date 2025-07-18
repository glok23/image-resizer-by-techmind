const express = require("express");
const sharp = require("sharp");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

// Ensure required folders exist
const ensureFolder = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

ensureFolder("uploads");
ensureFolder("resized");
ensureFolder("resized/webp");
ensureFolder("resized/tiny");

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) cb(null, true);
  else cb(new Error("Only image files are allowed (jpg, png, webp)."));
};

const upload = multer({ storage, fileFilter });

// Serve static files
app.use("/resized", express.static(path.join(__dirname, "resized")));
app.use(express.static("public"));

// Resize API
app.post("/resize", upload.array("images", 10), async (req, res) => {
  const { width, height, webp, tiny } = req.body;

  if (webp && tiny) {
    return res
      .status(400)
      .json({ message: "Choose either WEBP or Tiny compression, not both." });
  }

  const widthNum = parseInt(width, 10);
  const heightNum = parseInt(height, 10);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No images uploaded." });
  }

  const outputFiles = [];

  try {
    for (const file of req.files) {
      const inputPath = file.path;
      const ext = path.extname(file.originalname).toLowerCase();
      const fileName = path.parse(file.filename).name;

      const metadata = await sharp(inputPath).metadata();

      // Auto width/height logic (per image)
      let resizeOptions = {};

      if (widthNum > 0 && heightNum > 0) {
        resizeOptions.width = widthNum;
        resizeOptions.height = heightNum;
      } else if (widthNum > 0) {
        resizeOptions.width = widthNum;
        resizeOptions.height = Math.round(
          widthNum * (metadata.height / metadata.width)
        );
      } else if (heightNum > 0) {
        resizeOptions.height = heightNum;
        resizeOptions.width = Math.round(
          heightNum * (metadata.width / metadata.height)
        );
      } else {
        resizeOptions.width = metadata.width;
        resizeOptions.height = metadata.height;
      }

      let outputPath = `resized/resized_${file.filename}`;
      let imageProcessor = sharp(inputPath).resize(resizeOptions);

      // Apply WebP conversion
      if (webp) {
        outputPath = `resized/webp/webp_${fileName}.webp`;
        imageProcessor = imageProcessor.webp({ quality: 70 });
      }

      // Apply Tiny compression
      else if (tiny) {
        if (ext === ".jpg" || ext === ".jpeg") {
          outputPath = `resized/tiny/tiny_${fileName}.jpg`;
          imageProcessor = imageProcessor.jpeg({
            quality: 60,
            progressive: true,
          });
        } else if (ext === ".png") {
          outputPath = `resized/tiny/tiny_${fileName}.png`;
          imageProcessor = imageProcessor.png({
            quality: 60,
            compressionLevel: 9,
          });
        }
      }

      // Save processed image
      await imageProcessor.toFile(outputPath);
      outputFiles.push("/" + outputPath.replace(/\\/g, "/"));

      // Delete temp upload
      fs.unlink(inputPath, (err) => {
        if (err) console.error("Failed to delete temp upload:", err);
      });
    }

    res.json({
      message: "Images resized successfully!",
      files: outputFiles,
    });
  } catch (error) {
    console.error("Image processing error:", error);
    res.status(500).json({ message: "Error processing images." });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
