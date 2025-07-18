const express = require("express");
const sharp = require("sharp");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

// Set up multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save original files in 'uploads/'
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Save original image with timestamp
  },
});

const upload = multer({ storage: storage });

// Serve static files from the 'resized' folder
app.use("/resized", express.static(path.join(__dirname, "resized")));

// Serve static HTML page (ensure this is correct path to the HTML file)
app.use(express.static("public"));

// API to upload and resize multiple images
app.post("/resize", upload.array("images", 10), (req, res) => {
  const { width, height, webp, tiny } = req.body;

  // Validate the width (ensure it's a positive number)
  const widthNum = parseInt(width, 10);
  const heightNum = parseInt(height, 10);

  // If width is not provided, fetch the original width of the first image
  let finalWidth = widthNum;
  let finalHeight = heightNum;

  if (isNaN(finalWidth) || finalWidth <= 0) {
    // Use sharp to get the original metadata of the first image
    sharp(req.files[0].path)
      .metadata()
      .then((metadata) => {
        finalWidth = metadata.width; // Set width to the original width of the image

        // If height is not provided, calculate it based on the aspect ratio
        if (isNaN(finalHeight) || finalHeight <= 0) {
          const aspectRatio = metadata.width / metadata.height;
          finalHeight = Math.round(finalWidth / aspectRatio); // Calculate the height based on aspect ratio
        }

        // Proceed to resize the images using finalWidth and finalHeight
        resizeImages(finalWidth, finalHeight, req.files, webp, tiny, res);
      })
      .catch((err) => {
        console.error("Error getting metadata:", err);
        res.status(500).json({ message: "Error resizing images." });
      });
  } else {
    // If width is provided, just resize
    if (isNaN(finalHeight) || finalHeight <= 0) {
      // If height is not provided, calculate it based on the aspect ratio
      sharp(req.files[0].path)
        .metadata()
        .then((metadata) => {
          const aspectRatio = metadata.width / metadata.height;
          finalHeight = Math.round(finalWidth / aspectRatio); // Calculate the height based on aspect ratio
          resizeImages(finalWidth, finalHeight, req.files, webp, tiny, res);
        })
        .catch((err) => {
          console.error("Error getting metadata:", err);
          res.status(500).json({ message: "Error resizing images." });
        });
    } else {
      resizeImages(finalWidth, finalHeight, req.files, webp, tiny, res);
    }
  }
});

// Function to resize images and apply optional conversions
function resizeImages(width, height, files, webp, tiny, res) {
  const outputPaths = [];

  files.forEach((file) => {
    const inputPath = file.path; // Path of the uploaded image
    let outputPath = `resized/resized_${file.filename}`; // Save resized images in 'resized' folder

    // Ensure the 'resized/webp' and 'resized/tiny' folders exist or create them
    if (!fs.existsSync("resized/webp")) {
      fs.mkdirSync("resized/webp", { recursive: true });
    }
    if (!fs.existsSync("resized/tiny")) {
      fs.mkdirSync("resized/tiny", { recursive: true });
    }

    // Resize and possibly convert to WEBP or compress to Tiny
    let imageProcessor = sharp(inputPath).resize(width, height);

    const fileExt = path.extname(file.originalname).toLowerCase();

    // For WEBP conversion with compression
    if (webp) {
      outputPath = `resized/webp/webp_${file.filename.split(".")[0]}.webp`;
      imageProcessor = imageProcessor.webp({
        quality: 70, // You can adjust the quality (0-100)
        lossless: false, // Set to true for lossless compression
        alphaQuality: 70, // For images with transparency
      });
    }

    // For Tiny compression
    if (tiny) {
      if (fileExt === ".jpg" || fileExt === ".jpeg") {
        // JPEG Compression: 60% quality, progressive scan for better compression
        outputPath = `resized/tiny/tiny_${file.filename.split(".")[0]}.jpg`;
        imageProcessor = imageProcessor.jpeg({
          quality: 60,
          progressive: true,
        });
      } else if (fileExt === ".png") {
        // PNG Compression: Lower quality (lossy) and max compression level
        outputPath = `resized/tiny/tiny_${file.filename.split(".")[0]}.png`;
        imageProcessor = imageProcessor.png({
          quality: 60,
          compressionLevel: 9,
        });
      } else {
        console.log(`Compression not defined for ${fileExt}`);
      }
    }

    // Write the processed image to the appropriate folder
    imageProcessor.toFile(outputPath, (err, info) => {
      if (err) {
        console.error("Error resizing image:", err);
        return res.status(500).json({ message: "Error resizing images." });
      }

      outputPaths.push(outputPath); // Add the resized image path to the array

      // After processing all files
      if (outputPaths.length === files.length) {
        res.json({
          message: "Images resized successfully!",
          files: outputPaths.map((file) => `/resized/${file.split("/")[1]}`), // Return correct URL to access the resized images
        });
      }
    });
  });
}

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
