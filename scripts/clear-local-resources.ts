import {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, PurgeQueueCommand } from "@aws-sdk/client-sqs";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import dotenv from "dotenv";

// 加载本地环境变量
dotenv.config({ path: ".env.local" });

// 创建DynamoDB客户端
const dynamodb = new DynamoDBClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// 创建SQS客户端
const sqs = new SQSClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// 创建S3客户端
const s3 = new S3Client({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // 使用路径样式访问S3
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
const QUEUE_URL = process.env.SQS_QUEUE_URL!;
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

async function clearLocalResources() {
  try {
    console.log("开始清空本地资源...");

    // 清空DynamoDB表
    console.log("清空DynamoDB表...");
    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await dynamodb.send(scanCommand);

    if (response.Items && response.Items.length > 0) {
      console.log(`找到 ${response.Items.length} 个任务，正在删除...`);

      for (const item of response.Items) {
        if (item.jobId && item.jobId.S) {
          const deleteCommand = new DeleteItemCommand({
            TableName: TABLE_NAME,
            Key: { jobId: { S: item.jobId.S } },
          });

          await dynamodb.send(deleteCommand);
          console.log(`已删除任务: ${item.jobId.S}`);
        }
      }

      console.log("DynamoDB表已清空");
    } else {
      console.log("DynamoDB表中没有任务");
    }

    // 清空SQS队列
    console.log("清空SQS队列...");
    try {
      const purgeCommand = new PurgeQueueCommand({
        QueueUrl: QUEUE_URL,
      });

      await sqs.send(purgeCommand);
      console.log("SQS队列已清空");
    } catch (error) {
      console.error("清空SQS队列时出错:", error);
    }

    // 清空S3存储桶
    console.log("清空S3存储桶...");
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
      });

      const listResponse = await s3.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        console.log(`找到 ${listResponse.Contents.length} 个对象，正在删除...`);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: listResponse.Contents.map((item) => ({ Key: item.Key! })),
          },
        });

        await s3.send(deleteCommand);
        console.log("S3存储桶已清空");
      } else {
        console.log("S3存储桶中没有对象");
      }
    } catch (error) {
      console.error("清空S3存储桶时出错:", error);
    }

    console.log("所有本地资源已清空");
  } catch (error) {
    console.error("清空本地资源时出错:", error);
  }
}

// 运行清空函数
clearLocalResources();
