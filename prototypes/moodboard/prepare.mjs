/**
 * Build a small Fashion-MNIST image set and hand the class ids to labels.json.
 * Class ids come from the dataset. This script does not run a retrieval model.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync, gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
const imageDir = join(root, "images");

const CLASS_NAMES = [
  "T-shirt/top",
  "Trouser",
  "Pullover",
  "Dress",
  "Coat",
  "Sandal",
  "Shirt",
  "Sneaker",
  "Bag",
  "Ankle boot",
];

const SOURCES = {
  images: "http://fashion-mnist.s3-website.eu-central-1.amazonaws.com/t10k-images-idx3-ubyte.gz",
  labels: "http://fashion-mnist.s3-website.eu-central-1.amazonaws.com/t10k-labels-idx1-ubyte.gz",
};

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(file, bytes);
  return gunzipSync(bytes);
}

function readIdxImages(buffer) {
  const magic = buffer.readInt32BE(0);
  if (magic !== 2051) throw new Error(`Unexpected image magic ${magic}`);
  const count = buffer.readInt32BE(4);
  const rows = buffer.readInt32BE(8);
  const cols = buffer.readInt32BE(12);
  const pixels = buffer.subarray(16);
  if (pixels.length !== count * rows * cols) throw new Error("Image payload length does not match the header");
  return { count, rows, cols, pixels };
}

function readIdxLabels(buffer) {
  const magic = buffer.readInt32BE(0);
  if (magic !== 2049) throw new Error(`Unexpected label magic ${magic}`);
  const count = buffer.readInt32BE(4);
  return buffer.subarray(8, 8 + count);
}

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(dataDir, { recursive: true });
await mkdir(imageDir, { recursive: true });

const images = readIdxImages(await download(SOURCES.images, join(dataDir, "t10k-images-idx3-ubyte.gz")));
const labels = readIdxLabels(await download(SOURCES.labels, join(dataDir, "t10k-labels-idx1-ubyte.gz")));
if (labels.length !== images.count) throw new Error("Label count does not match image count");

const chosen = new Map(CLASS_NAMES.map((_, classId) => [classId, []]));
for (let index = 0; index < labels.length; index += 1) {
  const classId = labels[index];
  const bucket = chosen.get(classId);
  if (bucket.length < 4) bucket.push(index);
  if ([...chosen.values()].every((bucket) => bucket.length === 4)) break;
}

const queries = [];
const products = [];
for (const [classId, indexes] of chosen) {
  const className = CLASS_NAMES[classId];
  const slug = className.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const [inspiration, ...rest] = indexes;
  const inspirationId = `inspire-${slug}`;
  const inspirationFile = `images/${inspirationId}.png`;
  const start = inspiration * images.rows * images.cols;
  await writeFile(
    join(root, inspirationFile),
    png(images.rows, images.cols, images.pixels.subarray(start, start + images.rows * images.cols)),
  );
  const relevantIds = [];
  for (let nth = 0; nth < rest.length; nth += 1) {
    const source = rest[nth];
    const id = `product-${slug}-${nth + 1}`;
    const file = `images/${id}.png`;
    const offset = source * images.rows * images.cols;
    await writeFile(
      join(root, file),
      png(images.rows, images.cols, images.pixels.subarray(offset, offset + images.rows * images.cols)),
    );
    products.push({ id, file, classId, className, sourceIndex: source });
    relevantIds.push(id);
  }
  queries.push({
    id: inspirationId,
    file: inspirationFile,
    classId,
    className,
    sourceIndex: inspiration,
    relevantIds,
  });
}

await writeFile(join(root, "labels.json"), `${JSON.stringify({
  version: 1,
  source: "fashion-mnist-t10k-class-ids",
  k: 3,
  note: "Relevant products are the other held-out images of the same Fashion-MNIST class. The class id is the dataset label. A retrieval model did not choose these pairs.",
  attribution: "Fashion-MNIST by Zalando Research, MIT License. Images are the first four test-set examples of each class.",
  queries,
  products,
}, null, 2)}\n`);

console.log(`Wrote ${queries.length} inspiration images and ${products.length} product images`);
