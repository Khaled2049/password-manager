/**
 * S3 client wrapper using Fetch API for uploading/downloading vault files
 * via pre-signed URLs with ETag verification for tampering detection
 */
export class S3Client {
  /**
   * Downloads a vault file from S3 using a pre-signed GET URL
   * @param url - Pre-signed GET URL
   * @param expectedEtag - Optional expected ETag to verify against (for tampering detection)
   * @returns Object containing the downloaded data and the ETag from the response
   * @throws Error if ETag mismatch is detected (tampering) or if download fails
   */
  async download(url: string, expectedEtag?: string): Promise<{ data: Uint8Array; etag: string }> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download from S3: ${response.status} ${response.statusText}`);
    }

    // Extract ETag from response headers
    // S3 returns ETag in quotes, so we need to remove them
    let etag = response.headers.get('etag') || response.headers.get('ETag') || '';
    etag = etag.replace(/^"|"$/g, ''); // Remove surrounding quotes

    if (!etag) {
      throw new Error('ETag not found in response headers');
    }

    // Verify ETag matches expected value if provided
    if (expectedEtag !== undefined && etag !== expectedEtag) {
      throw new Error(
        `ETag mismatch detected! Expected: ${expectedEtag}, Got: ${etag}. ` +
        'The file may have been tampered with.'
      );
    }

    // Read response as array buffer and convert to Uint8Array
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    return { data, etag };
  }

  /**
   * Uploads a vault file to S3 using a pre-signed PUT URL
   * @param url - Pre-signed PUT URL
   * @param data - Data to upload as Uint8Array
   * @param expectedEtag - Optional expected ETag to verify against (for optimistic concurrency)
   * @returns The ETag from the response
   * @throws Error if upload fails or ETag mismatch is detected
   */
  async upload(url: string, data: Uint8Array, expectedEtag?: string): Promise<string> {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to S3: ${response.status} ${response.statusText}`);
    }

    // Extract ETag from response headers
    // S3 returns ETag in quotes, so we need to remove them
    let etag = response.headers.get('etag') || response.headers.get('ETag') || '';
    etag = etag.replace(/^"|"$/g, ''); // Remove surrounding quotes

    if (!etag) {
      throw new Error('ETag not found in response headers');
    }

    // Verify ETag matches expected value if provided (for optimistic concurrency)
    if (expectedEtag !== undefined && etag !== expectedEtag) {
      throw new Error(
        `ETag mismatch detected! Expected: ${expectedEtag}, Got: ${etag}. ` +
        'The file may have been modified by another process.'
      );
    }

    return etag;
  }
}

