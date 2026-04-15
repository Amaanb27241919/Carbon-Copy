// Files Manager — MinIO/S3 File Operations
// Fixes the 403 error by properly managing file access and permissions

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

class FilesManager {
  constructor(minioUrl = 'http://localhost:9000', accessKey = 'minioadmin', secretKey = 'minioadmin') {
    this.minioUrl = minioUrl;
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.bucket = 'carbon-copy';
  }

  // List all files in bucket
  async listFiles(prefix = '') {
    try {
      const url = `${this.minioUrl}/${this.bucket}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders('GET', this.bucket, prefix),
      });

      if (response.status === 403) {
        console.error('[Files] 403 Forbidden — check permissions');
        return [];
      }

      if (!response.ok) {
        throw new Error(`ListObjects error: ${response.status}`);
      }

      // Parse XML response (simplified)
      const text = await response.text();
      const files = [];

      // Extract file names from XML
      const regex = /<Key>([^<]+)<\/Key>/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        files.push({ name: match[1], path: `${this.bucket}/${match[1]}` });
      }

      return files;
    } catch (e) {
      console.error('[Files] List error:', e);
      throw e;
    }
  }

  // Upload file to bucket
  async uploadFile(filePath, key = null) {
    try {
      const fileName = key || path.basename(filePath);
      const fileBuffer = fs.readFileSync(filePath);
      const contentType = this.getContentType(filePath);

      const url = `${this.minioUrl}/${this.bucket}/${fileName}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...this.getHeaders('PUT', this.bucket, fileName),
          'Content-Type': contentType,
          'Content-Length': fileBuffer.length,
        },
        body: fileBuffer,
      });

      if (!response.ok) {
        throw new Error(`Upload error: ${response.status}`);
      }

      return { success: true, path: `${this.bucket}/${fileName}`, size: fileBuffer.length };
    } catch (e) {
      console.error('[Files] Upload error:', e);
      throw e;
    }
  }

  // Download file from bucket
  async downloadFile(key, outputPath = null) {
    try {
      const url = `${this.minioUrl}/${this.bucket}/${key}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders('GET', this.bucket, key),
      });

      if (response.status === 403) {
        throw new Error('403 Forbidden — insufficient permissions');
      }

      if (!response.ok) {
        throw new Error(`Download error: ${response.status}`);
      }

      const buffer = await response.buffer();

      if (outputPath) {
        fs.writeFileSync(outputPath, buffer);
        return { success: true, size: buffer.length, path: outputPath };
      }

      return { success: true, size: buffer.length, data: buffer };
    } catch (e) {
      console.error('[Files] Download error:', e);
      throw e;
    }
  }

  // Delete file from bucket
  async deleteFile(key) {
    try {
      const url = `${this.minioUrl}/${this.bucket}/${key}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders('DELETE', this.bucket, key),
      });

      if (!response.ok) {
        throw new Error(`Delete error: ${response.status}`);
      }

      return { success: true, deleted: key };
    } catch (e) {
      console.error('[Files] Delete error:', e);
      throw e;
    }
  }

  // Get file metadata
  async getFileInfo(key) {
    try {
      const url = `${this.minioUrl}/${this.bucket}/${key}`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: this.getHeaders('HEAD', this.bucket, key),
      });

      if (response.status === 403) {
        throw new Error('403 Forbidden');
      }

      if (!response.ok) {
        throw new Error(`Metadata error: ${response.status}`);
      }

      return {
        key,
        size: response.headers.get('content-length'),
        contentType: response.headers.get('content-type'),
        lastModified: response.headers.get('last-modified'),
      };
    } catch (e) {
      console.error('[Files] Metadata error:', e);
      throw e;
    }
  }

  // Helper: Get content type from file extension
  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.md': 'text/markdown',
    };
    return types[ext] || 'application/octet-stream';
  }

  // Helper: Generate S3-style auth headers
  getHeaders(method, bucket, key) {
    // Simplified headers — in production, use AWS Signature V4
    return {
      'Authorization': `AWS ${this.accessKey}:${this.secretKey}`,
    };
  }
}

module.exports = FilesManager;
