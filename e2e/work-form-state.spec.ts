import { expect, test } from "@playwright/test";
import type { UploadedFile } from "../lib/upload-client";
import {
  appendUploadedFiles,
  createEmptyWorkFormState,
  moveUploadedFile,
  patchWorkFormState,
  removeUploadedFile,
} from "../components/admin/work-form-state";

function makeFile(name: string): UploadedFile {
  return {
    imageUrl: `https://example.com/${name}.png`,
    thumbUrl: `https://example.com/${name}.webp`,
    size: 1024,
    mediaType: "image",
    fileName: name,
    originalFileName: `${name}.png`,
  };
}

test("上传完成后保留上传期间的最新表单输入", () => {
  const started = patchWorkFormState(createEmptyWorkFormState(), {
    title: "old",
    uploading: true,
    uploadProgress: "上传中",
    uploadTotal: 1,
    uploadDone: 0,
  });

  const typedLater = patchWorkFormState(started, {
    title: "latest title",
    tags: "角色,3D",
  });

  const completed = appendUploadedFiles(typedLater, [makeFile("cover")]);

  expect(completed.title).toBe("latest title");
  expect(completed.tags).toBe("角色,3D");
  expect(completed.uploadedFiles).toEqual([makeFile("cover")]);
  expect(completed.uploading).toBe(false);
  expect(completed.uploadProgress).toBe("");
  expect(completed.uploadTotal).toBe(0);
  expect(completed.uploadDone).toBe(0);
});

test("拖拽图片后封面索引跟随目标位置调整", () => {
  const state = patchWorkFormState(createEmptyWorkFormState(), {
    uploadedFiles: [makeFile("a"), makeFile("b"), makeFile("c")],
    coverIndex: 1,
  });

  const moved = moveUploadedFile(state, 0, 2);

  expect(moved.uploadedFiles.map((file) => file.fileName)).toEqual(["b", "c", "a"]);
  expect(moved.coverIndex).toBe(0);
});

test("删除当前封面前面的图片时封面索引前移", () => {
  const state = patchWorkFormState(createEmptyWorkFormState(), {
    uploadedFiles: [makeFile("a"), makeFile("b"), makeFile("c")],
    coverIndex: 2,
  });

  const removed = removeUploadedFile(state, 1);

  expect(removed.uploadedFiles.map((file) => file.fileName)).toEqual(["a", "c"]);
  expect(removed.coverIndex).toBe(1);
});
