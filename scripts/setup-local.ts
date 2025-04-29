import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from "@aws-sdk/client-sqs";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import {
  LambdaClient,
  CreateFunctionCommand,
  CreateEventSourceMappingCommand,
} from "@aws-sdk/client-lambda";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

// 加载本地环境变量
dotenv.config({ path: ".env.local" });

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

const s3 = new S3Client({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // 使用路径样式访问S3
});

const lambda = new LambdaClient({
  endpoint: process.env.ENDPOINT_URL,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function setupLocalResources(): Promise<void> {
  try {
    // 创建 SQS FIFO队列
    console.log("Creating SQS FIFO queue...");
    try {
      await sqs.send(
        new CreateQueueCommand({
          QueueName: "RenderTaskQueue.fifo", // 注意添加.fifo后缀
          Attributes: {
            FifoQueue: "true", // 启用FIFO队列
            ContentBasedDeduplication: "true", // 启用基于内容的去重
          },
        })
      );
      console.log("SQS FIFO queue created successfully");
    } catch (error: any) {
      if (error.name === "QueueAlreadyExists") {
        console.log("SQS FIFO queue already exists");
      } else {
        throw error;
      }
    }

    // 获取队列URL
    const queueUrlResponse = await sqs.send(
      new GetQueueUrlCommand({
        QueueName: "RenderTaskQueue.fifo", // 注意添加.fifo后缀
      })
    );
    const queueUrl = queueUrlResponse.QueueUrl;
    console.log(`Queue URL: ${queueUrl}`);

    // 创建 DynamoDB 表
    console.log("Creating DynamoDB table...");
    try {
      await dynamodb.send(
        new CreateTableCommand({
          TableName: process.env.DYNAMODB_TABLE_NAME,
          KeySchema: [{ AttributeName: "jobId", KeyType: "HASH" }],
          AttributeDefinitions: [
            { AttributeName: "jobId", AttributeType: "S" },
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        })
      );
      console.log("DynamoDB table created successfully");
    } catch (error) {
      if (error instanceof ResourceInUseException) {
        console.log("DynamoDB table already exists");
      } else {
        throw error;
      }
    }

    // 创建 S3 存储桶
    console.log("Creating S3 bucket...");
    try {
      await s3.send(
        new CreateBucketCommand({
          Bucket: process.env.S3_BUCKET_NAME,
        })
      );
      console.log("S3 bucket created successfully");
    } catch (error: any) {
      if (error.name === "BucketAlreadyOwnedByYou") {
        console.log("S3 bucket already exists");
      } else {
        throw error;
      }
    }

    // 创建 Lambda 函数
    console.log("Creating Lambda function...");
    try {
      // 创建一个ZIP文件
      const zip = new AdmZip();

      // 添加编译后的worker代码
      const workerCodePath = path.join(
        __dirname,
        "../dist/src/worker/index.js"
      );
      const workerCode = fs.readFileSync(workerCodePath, "utf-8");
      zip.addFile("index.js", Buffer.from(workerCode));

      // 获取ZIP文件的buffer
      const zipBuffer = zip.toBuffer();

      await lambda.send(
        new CreateFunctionCommand({
          FunctionName: "RenderWorkerFunction",
          Runtime: "nodejs18.x",
          Handler: "index.handler",
          Role: "arn:aws:iam::000000000000:role/lambda-role", // LocalStack 中的默认角色
          Code: {
            ZipFile: zipBuffer,
          },
          Environment: {
            Variables: {
              DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME!,
              S3_BUCKET_NAME: process.env.S3_BUCKET_NAME!,
              ENDPOINT_URL: process.env.ENDPOINT_URL!,
              AWS_REGION: process.env.AWS_REGION!,
              AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,
              AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          },
          Timeout: 300,
          MemorySize: 512,
        })
      );
      console.log("Lambda function created successfully");

      // 创建事件源映射
      await lambda.send(
        new CreateEventSourceMappingCommand({
          FunctionName: "RenderWorkerFunction",
          EventSourceArn: `arn:aws:sqs:${process.env.AWS_REGION}:000000000000:RenderTaskQueue.fifo`,
          BatchSize: 1,
        })
      );
      console.log("Event source mapping created successfully");
    } catch (error: any) {
      if (error.name === "ResourceConflictException") {
        console.log("Lambda function already exists");
      } else {
        throw error;
      }
    }

    console.log("Local resources setup completed successfully!");
  } catch (error) {
    console.error("Error setting up local resources:", error);
    process.exit(1);
  }
}

setupLocalResources();
