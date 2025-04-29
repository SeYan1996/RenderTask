import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { JobStatus } from "../types";
import dotenv from "dotenv";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

// 加载本地环境变量
dotenv.config({ path: ".env.local" });

const dynamodb = new DynamoDBClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const s3 = new S3Client({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // 使用路径样式访问S3
});

const sqs = new SQSClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const QUEUE_URL = process.env.SQS_QUEUE_URL!;

async function processJob(jobId: string) {
  try {
    console.log(`开始处理任务: ${jobId}`);

    // 获取任务详情
    const getItemCommand = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { jobId: { S: jobId } },
    });
    const job = await dynamodb.send(getItemCommand);

    if (!job.Item) {
      throw new Error(`Job ${jobId} not found`);
    }

    console.log(`任务 ${jobId} 详情:`, JSON.stringify(job.Item, null, 2));

    // 更新状态为处理中
    const updateProcessingCommand = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": { S: JobStatus.PROCESSING },
        ":updatedAt": { S: new Date().toISOString() },
      },
    });
    await dynamodb.send(updateProcessingCommand);
    console.log(`任务 ${jobId} 状态已更新为处理中`);

    // 模拟渲染过程
    console.log(`任务 ${jobId} 开始渲染...`);
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 500)
    );
    console.log(`任务 ${jobId} 渲染完成`);

    // 生成随机结果
    const result = `Rendered result for job ${jobId} at ${new Date().toISOString()}`;

    // 上传结果到S3
    const putObjectCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `results/${jobId}.txt`,
      Body: result,
      ContentType: "text/plain",
    });
    await s3.send(putObjectCommand);
    console.log(`任务 ${jobId} 结果已上传到S3`);

    // 更新状态为完成
    const updateCompletedCommand = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { jobId: { S: jobId } },
      UpdateExpression:
        "SET #status = :status, resultUrl = :resultUrl, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": { S: JobStatus.COMPLETED },
        ":resultUrl": {
          S: `http://localhost:4566/${BUCKET_NAME}/results/${jobId}.txt`,
        },
        ":updatedAt": { S: new Date().toISOString() },
      },
    });
    await dynamodb.send(updateCompletedCommand);
    console.log(`任务 ${jobId} 状态已更新为完成`);

    console.log(`成功处理任务 ${jobId}`);
  } catch (error) {
    console.error(`处理任务 ${jobId} 时出错:`, error);

    // 更新状态为失败
    const updateItemCommand = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { jobId: { S: jobId } },
      UpdateExpression:
        "SET #status = :status, #updatedAt = :updatedAt, #errorMsg = :errorMsg",
      ExpressionAttributeNames: {
        "#status": "status",
        "#updatedAt": "updatedAt",
        "#errorMsg": "error",
      },
      ExpressionAttributeValues: {
        ":status": { S: JobStatus.FAILED },
        ":updatedAt": { S: new Date().toISOString() },
        ":errorMsg": {
          S: error instanceof Error ? error.message : "Unknown error",
        },
      },
    });
    await dynamodb.send(updateItemCommand);
    console.log(`任务 ${jobId} 状态已更新为失败`);
  }
}

export const handler: SQSHandler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const jobData = JSON.parse(record.body);
    const jobId = jobData.jobId;
    console.log(`处理任务: ${jobId}, 创建时间: ${jobData.createdAt}`);
    await processJob(jobId);
  }
};

// 本地开发模式
async function pollQueue() {
  console.log("开始轮询SQS队列...");

  while (true) {
    try {
      const receiveMessageCommand = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1, // 一次只处理一条消息
        WaitTimeSeconds: 20,
      });

      const response = await sqs.send(receiveMessageCommand);

      if (response.Messages && response.Messages.length > 0) {
        console.log(`收到 ${response.Messages.length} 条消息`);

        for (const message of response.Messages) {
          if (message.Body && message.ReceiptHandle) {
            const jobData = JSON.parse(message.Body);
            const jobId = jobData.jobId;
            console.log(`处理任务: ${jobId}, 创建时间: ${jobData.createdAt}`);

            await processJob(jobId);

            // 删除已处理的消息
            const deleteMessageCommand = new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle,
            });

            await sqs.send(deleteMessageCommand);
            console.log(`已删除消息: ${jobId}`);

            // 添加小延迟，确保消息按顺序处理
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      } else {
        console.log("队列中没有消息，继续轮询...");
      }
    } catch (error) {
      console.error("轮询队列时出错:", error);
      // 出错后等待一段时间再继续
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// 如果是本地开发环境，启动轮询
if (process.env.NODE_ENV !== "prod") {
  console.log("本地开发模式启动");
  pollQueue().catch((error) => {
    console.error("轮询过程中发生错误:", error);
    process.exit(1);
  });
}
