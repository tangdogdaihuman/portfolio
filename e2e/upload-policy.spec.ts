import { expect, test } from "@playwright/test";
import { newAdminApi } from "./admin-api";

const IMAGE_LIMIT = 50 * 1024 * 1024;
const VIDEO_LIMIT = 500 * 1024 * 1024;

test("presigned upload rejects images larger than the processing limit", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  try {
    const response = await api.post("/api/upload/presigned", {
      data: {
        contentType: "image/png",
        fileSize: IMAGE_LIMIT + 1,
        requestId: `oversize-${Date.now()}`,
      },
    });

    expect(response.status()).toBe(413);
    const body = await response.json();
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  } finally {
    await api.dispose();
  }
});

test("presigned upload rejects videos larger than the video limit", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  try {
    const response = await api.post("/api/upload/presigned", {
      data: {
        contentType: "video/mp4",
        fileSize: VIDEO_LIMIT + 1,
        requestId: `oversize-video-${Date.now()}`,
      },
    });

    expect(response.status()).toBe(413);
    const body = await response.json();
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  } finally {
    await api.dispose();
  }
});

test("process rejects originalKey outside originals/", async ({ baseURL }) => {
  if (!baseURL) throw new Error("baseURL is required");
  const api = await newAdminApi(baseURL);

  try {
    const response = await api.post("/api/upload/process", {
      data: {
        originalKey: "thumbnails/not-an-original.webp",
        requestId: `bad-key-${Date.now()}`,
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("BAD_REQUEST");
  } finally {
    await api.dispose();
  }
});
