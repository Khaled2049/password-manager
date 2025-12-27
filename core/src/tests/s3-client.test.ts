import { describe, it, expect, beforeEach, vi } from "vitest";
import { S3Client } from "./s3-client";

// Mock global fetch
global.fetch = vi.fn();

describe("S3Client", () => {
  let s3Client: S3Client;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    s3Client = new S3Client();
    mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  describe("download", () => {
    it("should download data from S3 successfully", async () => {
      const url = "https://s3.amazonaws.com/bucket/key?signature=xyz";
      const expectedData = new Uint8Array([1, 2, 3, 4, 5]);
      const expectedEtag = "abc123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
        arrayBuffer: async () => expectedData.buffer,
      });

      const result = await s3Client.download(url);

      expect(mockFetch).toHaveBeenCalledWith(url);
      expect(result.data).toEqual(expectedData);
      expect(result.etag).toBe(expectedEtag);
    });

    it("should handle ETag without quotes", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const expectedData = new Uint8Array([1, 2, 3]);
      const expectedEtag = "etag-without-quotes";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: expectedEtag,
        }),
        arrayBuffer: async () => expectedData.buffer,
      });

      const result = await s3Client.download(url);

      expect(result.etag).toBe(expectedEtag);
    });

    it("should handle ETag with uppercase header name", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const expectedData = new Uint8Array([1, 2, 3]);
      const expectedEtag = "etag-value";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          ETag: `"${expectedEtag}"`,
        }),
        arrayBuffer: async () => expectedData.buffer,
      });

      const result = await s3Client.download(url);

      expect(result.etag).toBe(expectedEtag);
    });

    it("should verify ETag matches expected value", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const expectedEtag = "expected-etag";
      const actualEtag = "expected-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${actualEtag}"`,
        }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

      const result = await s3Client.download(url, expectedEtag);

      expect(result.etag).toBe(actualEtag);
    });

    it("should throw error if ETag mismatch detected", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const expectedEtag = "expected-etag";
      const actualEtag = "different-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${actualEtag}"`,
        }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

      await expect(s3Client.download(url, expectedEtag)).rejects.toThrow(
        "ETag mismatch detected"
      );
    });

    it("should throw error if download fails", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(s3Client.download(url)).rejects.toThrow(
        "Failed to download from S3: 404 Not Found"
      );
    });

    it("should throw error if ETag is missing from response", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({}),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

      await expect(s3Client.download(url)).rejects.toThrow(
        "ETag not found in response headers"
      );
    });

    it("should handle empty data", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const expectedEtag = "etag123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
        arrayBuffer: async () => new Uint8Array(0).buffer,
      });

      const result = await s3Client.download(url);

      expect(result.data.length).toBe(0);
      expect(result.etag).toBe(expectedEtag);
    });

    it("should handle large data", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const largeData = new Uint8Array(100000).fill(42);
      const expectedEtag = "large-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
        arrayBuffer: async () => largeData.buffer,
      });

      const result = await s3Client.download(url);

      expect(result.data.length).toBe(100000);
      expect(result.data).toEqual(largeData);
    });
  });

  describe("upload", () => {
    it("should upload data to S3 successfully", async () => {
      const url = "https://s3.amazonaws.com/bucket/key?signature=xyz";
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const expectedEtag = "upload-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
      });

      const result = await s3Client.upload(url, data);

      expect(mockFetch).toHaveBeenCalledWith(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: data,
      });
      expect(result).toBe(expectedEtag);
    });

    it("should handle ETag without quotes", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);
      const expectedEtag = "etag-no-quotes";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: expectedEtag,
        }),
      });

      const result = await s3Client.upload(url, data);

      expect(result).toBe(expectedEtag);
    });

    it("should handle ETag with uppercase header name", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);
      const expectedEtag = "etag-uppercase";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          ETag: `"${expectedEtag}"`,
        }),
      });

      const result = await s3Client.upload(url, data);

      expect(result).toBe(expectedEtag);
    });

    it("should verify ETag matches expected value for optimistic concurrency", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);
      const expectedEtag = "expected-etag";
      const actualEtag = "expected-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${actualEtag}"`,
        }),
      });

      const result = await s3Client.upload(url, data, expectedEtag);

      expect(result).toBe(actualEtag);
    });

    it("should throw error if ETag mismatch detected (optimistic concurrency)", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);
      const expectedEtag = "expected-etag";
      const actualEtag = "different-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${actualEtag}"`,
        }),
      });

      await expect(s3Client.upload(url, data, expectedEtag)).rejects.toThrow(
        "ETag mismatch detected"
      );
    });

    it("should throw error if upload fails", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      await expect(s3Client.upload(url, data)).rejects.toThrow(
        "Failed to upload to S3: 403 Forbidden"
      );
    });

    it("should throw error if ETag is missing from response", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array([1, 2, 3]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({}),
      });

      await expect(s3Client.upload(url, data)).rejects.toThrow(
        "ETag not found in response headers"
      );
    });

    it("should handle empty data upload", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const data = new Uint8Array(0);
      const expectedEtag = "empty-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
      });

      const result = await s3Client.upload(url, data);

      expect(mockFetch).toHaveBeenCalledWith(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: data,
      });
      expect(result).toBe(expectedEtag);
    });

    it("should handle large data upload", async () => {
      const url = "https://s3.amazonaws.com/bucket/key";
      const largeData = new Uint8Array(100000).fill(42);
      const expectedEtag = "large-upload-etag";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          etag: `"${expectedEtag}"`,
        }),
      });

      const result = await s3Client.upload(url, largeData);

      expect(mockFetch).toHaveBeenCalledWith(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: largeData,
      });
      expect(result).toBe(expectedEtag);
    });
  });
});
