'use strict';

const Minio = require('minio');

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;

if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'data-server',
    message: 'MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables must be set',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
}

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

/**
 * Ensure a bucket exists, creating it if necessary.
 * @param {string} name - Bucket name
 */
const ensureBucket = async (name) => {
  try {
    const exists = await minioClient.bucketExists(name);
    if (!exists) {
      await minioClient.makeBucket(name, 'us-east-1');
      console.log(JSON.stringify({
        level: 'info',
        service: 'data-server',
        message: `Created MinIO bucket: ${name}`,
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'data-server',
      message: 'Failed to ensure MinIO bucket',
      bucket: name,
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
    throw err;
  }
};

/**
 * Upload a file buffer to MinIO.
 * @param {string} bucket - Target bucket
 * @param {string} key - Object key/path
 * @param {Buffer} buffer - File contents
 * @param {string} contentType - MIME type
 * @returns {Promise<void>}
 */
const uploadFile = async (bucket, key, buffer, contentType) => {
  try {
    await minioClient.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'data-server',
      message: 'MinIO upload error',
      bucket,
      key,
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
    throw err;
  }
};

/**
 * Download a file from MinIO as a readable stream.
 * @param {string} bucket - Source bucket
 * @param {string} key - Object key/path
 * @returns {Promise<import('stream').Readable>}
 */
const downloadFile = async (bucket, key) => {
  try {
    return await minioClient.getObject(bucket, key);
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'data-server',
      message: 'MinIO download error',
      bucket,
      key,
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
    throw err;
  }
};

module.exports = { uploadFile, downloadFile, ensureBucket, minioClient };
