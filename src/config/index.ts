import dotenv from 'dotenv';

dotenv.config();

export const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    sqs: {
      queueUrl: process.env.SQS_QUEUE_URL || '',
    },
    s3: {
      bucketName: process.env.S3_BUCKET_NAME || 'render-results',
    },
    dynamodb: {
      tableName: process.env.DYNAMODB_TABLE_NAME || 'render-jobs',
    },
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
  worker: {
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '1000', 10),
  },
}; 