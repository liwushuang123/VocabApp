const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const publicDir = path.join(__dirname, "..", "public");
const svgPath = path.join(publicDir, "icon.svg");
const svg = fs.readFileSync(svgPath);

async function generate() {
  await sharp(svg).resize(512, 512).png().toFile(path.join(publicDir, "icon-512.png"));
  console.log("✓ icon-512.png");

  await sharp(svg).resize(192, 192).png().toFile(path.join(publicDir, "icon-192.png"));
  console.log("✓ icon-192.png");

  await sharp(svg).resize(180, 180).png().toFile(path.join(publicDir, "apple-touch-icon.png"));
  console.log("✓ apple-touch-icon.png");

  await sharp(svg).resize(32, 32).png().toFile(path.join(publicDir, "favicon.ico"));
  console.log("✓ favicon.ico");

  console.log("\nAll icons generated!");
}

generate().catch(console.error);
