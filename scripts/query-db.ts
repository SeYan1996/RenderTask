import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import dotenv from "dotenv";

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

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;

async function queryJobs() {
  try {
    console.log("查询所有任务...");

    const scanCommand = new ScanCommand({
      TableName: TABLE_NAME,
    });

    const response = await dynamodb.send(scanCommand);

    if (response.Items && response.Items.length > 0) {
      console.log(`找到 ${response.Items.length} 个任务:`);

      response.Items.forEach((item, index) => {
        console.log(`\n任务 ${index + 1}:`);
        console.log(`  JobId: ${item.jobId.S}`);
        console.log(`  状态: ${item.status.S}`);
        console.log(`  创建时间: ${item.createdAt.S}`);
        console.log(`  更新时间: ${item.updatedAt.S}`);

        if (item.resultUrl?.S) {
          console.log(`  结果URL: ${item.resultUrl.S}`);
        }

        if (item.error?.S) {
          console.log(`  错误: ${item.error.S}`);
        }
      });
    } else {
      console.log("没有找到任何任务");
    }
  } catch (error) {
    console.error("查询数据库时出错:", error);
  }
}

// 运行查询
queryJobs();
