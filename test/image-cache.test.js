import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cachedImage,
  imageEtag,
  invalidateImage,
} from "../server/image-cache.js";

test("same Drive version uses the local image and a new version replaces it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "matrik-image-cache-"));
  try {
    let downloads = 0;
    const first = {
      id: "drive-file",
      version: "1",
      modifiedTime: "2026-01-01T00:00:00Z",
    };
    const second = {
      ...first,
      version: "2",
      modifiedTime: "2026-01-02T00:00:00Z",
    };
    const download = async () => Buffer.from(`image-${++downloads}`);
    const initial = await Promise.all(
      Array.from({ length: 4 }, () => cachedImage(first, download, { dir })),
    );
    assert(initial.every((bytes) => bytes.toString() === "image-1"));
    assert.equal(
      (await cachedImage(first, download, { dir })).toString(),
      "image-1",
    );
    assert.equal(downloads, 1);
    assert.notEqual(imageEtag(first), imageEtag(second));
    assert.notEqual(
      imageEtag(first),
      imageEtag({ ...first, modifiedTime: "2026-01-03T00:00:00Z" }),
    );
    assert.equal(
      (await cachedImage(second, download, { dir })).toString(),
      "image-2",
    );
    assert.equal(downloads, 2);
    const folder = path.join(dir, (await fs.readdir(dir))[0]);
    assert.equal(
      (await fs.readdir(folder)).filter((name) => name.endsWith(".bin")).length,
      1,
    );
    await invalidateImage(second.id, { dir });
    assert.equal(
      (await cachedImage(second, download, { dir })).toString(),
      "image-3",
    );
    assert.equal(downloads, 3);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("different Drive IDs never share cache entries", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "matrik-image-cache-"));
  try {
    const one = { id: "one", modifiedTime: "2026-01-01" };
    const two = { id: "two", modifiedTime: "2026-01-01" };
    assert.notEqual(imageEtag(one), imageEtag(two));
    assert.equal(
      (
        await cachedImage(one, async () => Buffer.from("one"), { dir })
      ).toString(),
      "one",
    );
    assert.equal(
      (
        await cachedImage(two, async () => Buffer.from("two"), { dir })
      ).toString(),
      "two",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
