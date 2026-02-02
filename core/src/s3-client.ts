export interface DownloadResult {
  data: Uint8Array;
  etag: string;
  contentLength: number;
  lastModified?: string;
}

export interface UploadOptions {
  ifMatch?: string;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

export interface DownloadOptions {
  expectedEtag?: string;
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number) => void;
}

export class S3ClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "S3ClientError";
  }
}

export class S3Client {
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly timeout: number;

  constructor(options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
  }) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelay = options?.retryDelay ?? 1000;
    this.timeout = options?.timeout ?? 30000;
  }

  /**
   * Downloads a vault file from S3 using a pre-signed GET URL
   * @param url
   * @param options
   * @returns
   * @throws
   */
  async download(
    url: string,
    options: DownloadOptions = {},
  ): Promise<DownloadResult> {
    const { expectedEtag, signal, onProgress } = options;

    return this.retryOperation(async () => {
      // Create timeout signal
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(
        () => timeoutController.abort(),
        this.timeout,
      );

      // Combine user signal with timeout signal
      const combinedSignal = this.combineSignals([
        signal,
        timeoutController.signal,
      ]);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new S3ClientError(
            `Failed to download from S3: ${response.statusText}`,
            response.status,
            this.getErrorCode(response.status),
          );
        }

        // Extract and normalize ETag
        const etag = this.extractETag(response.headers);
        if (!etag) {
          throw new S3ClientError("ETag not found in response headers");
        }

        // Verify ETag if expected value provided
        if (expectedEtag && etag !== expectedEtag) {
          throw new S3ClientError(
            `ETag mismatch detected! Expected: ${expectedEtag}, Got: ${etag}. ` +
              "The file may have been tampered with or modified.",
            undefined,
            "ETAG_MISMATCH",
          );
        }

        // Get content length for validation
        const contentLength = this.getContentLength(response.headers);
        const lastModified = response.headers.get("Last-Modified") || undefined;

        // Read response with progress tracking
        const data = await this.readResponseWithProgress(
          response,
          contentLength,
          onProgress,
        );

        // Validate downloaded size matches Content-Length
        if (contentLength && data.length !== contentLength) {
          throw new S3ClientError(
            `Size mismatch: Expected ${contentLength} bytes, got ${data.length} bytes`,
            undefined,
            "SIZE_MISMATCH",
          );
        }

        return {
          data,
          etag,
          contentLength: data.length,
          lastModified,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw this.handleError(error);
      }
    });
  }

  /**
   * Uploads a vault file to S3 using a pre-signed PUT URL
   *
   * @param url - Pre-signed PUT URL
   * @param data - Data to upload as Uint8Array
   * @param options - Upload options including optimistic locking and progress tracking
   * @returns The ETag from the successful upload
   * @throws S3ClientError if upload fails, precondition fails, or network error occurs
   */
  async upload(
    url: string,
    data: Uint8Array,
    options: UploadOptions = {},
  ): Promise<string> {
    const { ifMatch, signal, onProgress } = options;

    if (!data || data.length === 0) {
      throw new S3ClientError("Cannot upload empty data");
    }

    return this.retryOperation(async () => {
      // Create timeout signal
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(
        () => timeoutController.abort(),
        this.timeout,
      );

      // Combine user signal with timeout signal
      const combinedSignal = this.combineSignals([
        signal,
        timeoutController.signal,
      ]);

      try {
        // Build headers with conditional update support
        const headers: Record<string, string> = {
          "Content-Type": "application/octet-stream",
          "Content-Length": data.length.toString(),
        };

        // Add If-Match header for optimistic locking
        // This tells S3: "only upload if current ETag matches this value"
        if (ifMatch) {
          headers["If-Match"] = ifMatch;
        }

        const response = await fetch(url, {
          method: "PUT",
          headers,
          body: data,
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        // Handle 412 Precondition Failed (ETag mismatch)
        if (response.status === 412) {
          throw new S3ClientError(
            "Upload failed: File was modified by another process (ETag mismatch)",
            412,
            "PRECONDITION_FAILED",
          );
        }

        if (!response.ok) {
          throw new S3ClientError(
            `Failed to upload to S3: ${response.statusText}`,
            response.status,
            this.getErrorCode(response.status),
          );
        }

        // Extract ETag from response
        const etag = this.extractETag(response.headers);
        if (!etag) {
          throw new S3ClientError("ETag not found in response headers");
        }

        // Notify completion if progress callback exists
        if (onProgress) {
          onProgress(data.length, data.length);
        }

        return etag;
      } catch (error) {
        clearTimeout(timeoutId);
        throw this.handleError(error);
      }
    }, false); // Don't retry 412 errors
  }

  /**
   * Extracts and normalizes ETag from response headers
   */
  private extractETag(headers: Headers): string | null {
    let etag = headers.get("etag") || headers.get("ETag");
    if (!etag) return null;

    // Remove surrounding quotes that S3 adds
    return etag.replace(/^["']|["']$/g, "");
  }

  /**
   * Gets content length from response headers
   */
  private getContentLength(headers: Headers): number | null {
    const length = headers.get("Content-Length");
    return length ? parseInt(length, 10) : null;
  }

  /**
   * Reads response body with progress tracking
   */
  private async readResponseWithProgress(
    response: Response,
    contentLength: number | null,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array> {
    if (!onProgress || !response.body) {
      // No progress tracking needed or not available
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    const total = contentLength || 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (onProgress) {
          onProgress(loaded, total || loaded);
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Combine all chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Combines multiple abort signals into one
   */
  private combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal) {
        if (signal.aborted) {
          controller.abort();
          break;
        }
        signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    return controller.signal;
  }

  /**
   * Retries an operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    shouldRetry: boolean = true,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (
          !shouldRetry ||
          (error instanceof S3ClientError &&
            (error.code === "PRECONDITION_FAILED" ||
              error.code === "ETAG_MISMATCH" ||
              error.statusCode === 403 || // Forbidden
              error.statusCode === 404)) // Not Found
        ) {
          throw error;
        }

        // Don't retry if it's an abort
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        // Last attempt - throw the error
        if (attempt === this.maxRetries) {
          throw error;
        }

        // Wait before retrying with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Handles and normalizes errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof S3ClientError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return new S3ClientError(
          "Operation was cancelled",
          undefined,
          "ABORTED",
        );
      }

      if (error.message.includes("Failed to fetch")) {
        return new S3ClientError(
          "Network error: Unable to connect to S3. Check your internet connection.",
          undefined,
          "NETWORK_ERROR",
        );
      }

      return new S3ClientError(error.message);
    }

    return new S3ClientError("An unknown error occurred");
  }

  /**
   * Maps HTTP status codes to error codes
   */
  private getErrorCode(status: number): string {
    switch (status) {
      case 400:
        return "BAD_REQUEST";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 412:
        return "PRECONDITION_FAILED";
      case 500:
        return "INTERNAL_ERROR";
      case 503:
        return "SERVICE_UNAVAILABLE";
      default:
        return "UNKNOWN_ERROR";
    }
  }
}
