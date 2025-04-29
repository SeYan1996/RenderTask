import axios from "axios";

const API_URL = "http://localhost:3000";

interface CreateJobResponse {
  jobId: string;
  status: string;
}

interface JobStatus {
  jobId: string;
  status: string;
  resultUrl?: string;
  error?: string;
}

async function testCreateJob(): Promise<string> {
  try {
    const response = await axios.post<CreateJobResponse>(`${API_URL}/jobs`, {
      designId: "test-design-1",
      userId: "test-user-1",
      camera: {
        position: { x: 0, y: 0, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
      },
    });

    console.log("创建任务成功:", response.data);
    return response.data.jobId;
  } catch (error) {
    console.error("创建任务失败:", error);
    throw error;
  }
}

async function testGetJobStatus(jobId: string): Promise<void> {
  try {
    const response = await axios.get<JobStatus>(`${API_URL}/jobs/${jobId}`);
    console.log("查询任务状态成功:", response.data);
  } catch (error) {
    console.error("查询任务状态失败:", error);
    throw error;
  }
}

async function runTests() {
  try {
    console.log("开始API测试...");

    // 测试创建任务
    console.log("\n1. 测试创建任务");
    const jobId = await testCreateJob();

    // 等待一段时间让worker处理任务
    console.log("\n等待5秒让worker处理任务...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 测试查询任务状态
    console.log("\n2. 测试查询任务状态");
    await testGetJobStatus(jobId);

    console.log("\nAPI测试完成!");
  } catch (error) {
    console.error("测试过程中发生错误:", error);
    process.exit(1);
  }
}

// 运行测试
runTests();
