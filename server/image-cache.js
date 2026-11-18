import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const defaultDir = path.resolve(".local/image-cache");
const pending = new Map();
const generations = new Map();
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function imageVersion(file) {
  if (!file?.id || !(file.version || file.modifiedTime || file.md5Checksum))
    throw new Error("Drive-filen saknar versionsinformation.");
  return [
    file.version || "",
    file.modifiedTime || "",
    file.md5Checksum || "",
  ].join(":");
}

export function imageEtag(file) {
  return `"${hash(`${file.id}:${imageVersion(file)}`)}"`;
}

function imageDirectory(fileId, dir) {
  return path.join(dir, hash(fileId));
}

export async function cachedImage(file, download, { dir = defaultDir } = {}) {
  const folder = imageDirectory(file.id, dir);
  const filename = `${hash(imageVersion(file))}.bin`;
  const target = path.join(folder, filename);
  try {
    return await fs.readFile(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const key = target;
  if (pending.has(key)) return pending.get(key);
  const generation = generations.get(folder) || 0;
  const task = (async () => {
    const bytes = await download();
    if (!Buffer.isBuffer(bytes))
      throw new TypeError("Bildhämtningen måste ge bytes.");
    if ((generations.get(folder) || 0) !== generation)
      throw new Error("Bilden ändrades under hämtningen. Försök igen.");
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const temporary = path.join(
      folder,
      `${filename}.${crypto.randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600 });
      if ((generations.get(folder) || 0) !== generation)
        throw new Error("Bilden ändrades under hämtningen. Försök igen.");
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    const entries = await fs.readdir(folder);
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".bin") && entry !== filename)
        .map((entry) => fs.rm(path.join(folder, entry), { force: true })),
    );
    return bytes;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

export async function invalidateImage(fileId, { dir = defaultDir } = {}) {
  const folder = imageDirectory(fileId, dir);
  generations.set(folder, (generations.get(folder) || 0) + 1);
  await fs.rm(folder, { recursive: true, force: true });
}
