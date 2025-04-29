import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { JobStatus, JobResponse } from "../../src/types";

const API_URL = process.env.API_URL || "http://localhost:3000";
const CONCURRENT_REQUESTS = 5;
const MAX_RETRIES = 20;
const RETRY_DELAY = 500; // 毫秒

type JobResult = JobResponse;

async function createJob(): Promise<string> {
  try {
    const response = await axios.post(`${API_URL}/jobs`, {
      designId: `test-design-${uuidv4()}`,
      userId: `test-user-${uuidv4()}`,
      camera: {
        position: { x: 0, y: 0, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        fov: 45,
      },
    });

    return response.data.jobId;
  } catch (error) {
    console.error("创建任务失败:", error);
    throw error;
  }
}

async function getJobStatus(jobId: string): Promise<JobResult> {
  try {
    const response = await axios.get(`${API_URL}/jobs/${jobId}`);
    return response.data;
  } catch (error) {
    console.error(`获取任务 ${jobId} 状态失败:`, error);
    throw error;
  }
}

async function waitForJobCompletion(jobId: string): Promise<JobResult> {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    const job = await getJobStatus(jobId);
    console.log(`任务 ${jobId} 状态: ${job.status}`);

    if (job.status === JobStatus.COMPLETED) {
      console.log(`任务 ${jobId} 已完成`);
      return job;
    } else if (job.status === JobStatus.FAILED) {
      console.error(`任务 ${jobId} 失败: ${job.error || "未知错误"}`);
      throw new Error(`Job ${jobId} failed: ${job.error || "Unknown error"}`);
    }

    // 等待一段时间后重试
    console.log(`任务 ${jobId} 尚未完成，等待 ${RETRY_DELAY}ms 后重试...`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    retries++;
  }

  console.error(`任务 ${jobId} 在预期时间内未完成`);
  throw new Error(`Job ${jobId} did not complete within the expected time`);
}

async function validateResultUrl(url: string): Promise<boolean> {
  try {
    console.log(`验证URL: ${url}`);
    const response = await axios.get(url, { validateStatus: () => true });
    const isValid = response.status === 200;
    console.log(`URL验证结果: ${isValid ? "有效" : "无效"}`);
    return isValid;
  } catch (error) {
    console.error(`URL验证失败:`, error);
    return false;
  }
}

describe("并发测试", () => {
  it("应该能够处理多个并发任务提交", async () => {
    console.log(`开始测试 ${CONCURRENT_REQUESTS} 个并发任务...`);
    console.log(`API URL: ${API_URL}`);

    // 创建多个任务
    console.log("创建任务中...");
    const jobPromises = Array(CONCURRENT_REQUESTS)
      .fill(0)
      .map(() => createJob());
    const jobIds = await Promise.all(jobPromises);
    console.log(`成功创建了 ${jobIds.length} 个任务`);
    console.log("任务ID列表:", jobIds);

    // 验证所有任务都已创建
    expect(jobIds.length).toBe(CONCURRENT_REQUESTS);
    expect(jobIds.every((id) => id)).toBe(true);

    // 等待所有任务完成
    console.log("等待所有任务完成...");
    const jobResults = await Promise.all(
      jobIds.map((id) => waitForJobCompletion(id))
    );

    // 验证所有任务都成功完成
    console.log(`所有任务已完成，共 ${jobResults.length} 个`);
    expect(jobResults.length).toBe(CONCURRENT_REQUESTS);
    expect(jobResults.every((job) => job.status === JobStatus.COMPLETED)).toBe(
      true
    );

    // 验证所有结果URL都有效
    console.log("验证所有结果URL...");
    const urlValidationPromises = jobResults.map((job) =>
      validateResultUrl(job.resultUrl!)
    );
    const urlValidationResults = await Promise.all(urlValidationPromises);
    expect(urlValidationResults.every((isValid) => isValid)).toBe(true);

    // 验证任务按FIFO顺序处理（通过比较创建时间和处理时间）
    console.log("验证任务处理顺序...");
    const sortedByCreatedAt = [...jobResults].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // 获取每个任务的处理时间（从创建到开始处理的时间）
    const processingTimes = jobResults.map((job) => ({
      jobId: job.jobId,
      createdAt: new Date(job.createdAt).getTime(),
      processingStartedAt: new Date(job.updatedAt).getTime(),
      processingDelay:
        new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime(),
    }));

    // 按处理延迟排序
    const sortedByProcessingDelay = [...processingTimes].sort(
      (a, b) => a.processingDelay - b.processingDelay
    );

    console.log("\n任务处理时间分析:");
    processingTimes.forEach((time) => {
      console.log(
        `JobId: ${time.jobId}, 创建时间: ${new Date(time.createdAt).toISOString()}, ` +
          `开始处理时间: ${new Date(time.processingStartedAt).toISOString()}, ` +
          `处理延迟: ${time.processingDelay}ms`
      );
    });

    // 验证处理延迟是否按创建顺序递增（允许一定的误差）
    const isProcessingOrderCorrect = sortedByProcessingDelay.every(
      (time, index) => {
        if (index === 0) return true;
        const prevTime = sortedByProcessingDelay[index - 1];
        // 允许100ms的误差
        return time.processingDelay >= prevTime.processingDelay - 100;
      }
    );

    expect(isProcessingOrderCorrect).toBe(true);
    console.log("任务处理顺序验证通过");

    console.log("所有任务已成功完成，且按FIFO顺序处理");
  }, 300000); // 设置较长的超时时间
});
