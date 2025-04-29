import express from "express";
import { v4 as uuidv4 } from "uuid";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { JobStatus } from "../types";
import dotenv from "dotenv";

// 加载本地环境变量
dotenv.config({ path: ".env.local" });

const app = express();
app.use(express.json());

const sqs = new SQSClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const dynamodb = new DynamoDBClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const QUEUE_URL = process.env.SQS_QUEUE_URL!;
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;

// 创建渲染任务
app.post("/jobs", async (req, res): Promise<void> => {
  try {
    const { designId, userId, camera } = req.body;

    if (!designId || !userId || !camera) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const jobId = uuidv4();
    const now = new Date().toISOString();

    // 创建任务数据对象
    const jobData = {
      jobId,
      designId,
      userId,
      camera,
      status: JobStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    // 保存到DynamoDB
    const putItemCommand = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        jobId: { S: jobData.jobId },
        designId: { S: jobData.designId },
        userId: { S: jobData.userId },
        camera: { S: JSON.stringify(jobData.camera) },
        status: { S: jobData.status },
        createdAt: { S: jobData.createdAt },
        updatedAt: { S: jobData.updatedAt },
      },
    });

    await dynamodb.send(putItemCommand);

    // 发送任务到SQS队列
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(jobData),
      MessageGroupId: "global-render-tasks",
      MessageDeduplicationId: jobId,
    });
    await sqs.send(sendMessageCommand);

    res.status(201).json({ jobId });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// 查询任务状态
app.get("/jobs/:jobId", async (req, res): Promise<void> => {
  try {
    const { jobId } = req.params;

    const getItemCommand = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { jobId: { S: jobId } },
    });
    const result = await dynamodb.send(getItemCommand);

    if (!result.Item) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const job = {
      jobId: result.Item.jobId.S,
      designId: result.Item.designId.S,
      userId: result.Item.userId.S,
      camera: JSON.parse(result.Item.camera.S!),
      status: result.Item.status.S,
      resultUrl: result.Item.resultUrl?.S,
      error: result.Item.error?.S,
      createdAt: result.Item.createdAt.S,
      updatedAt: result.Item.updatedAt.S,
    };

    res.json(job);
  } catch (error) {
    console.error("Error getting job:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
