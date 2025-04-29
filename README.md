# 渲染任务编排系统

这是一个基于AWS的渲染任务编排系统，支持创建渲染任务、排队处理、生成结果和查询任务状态。

## 系统架构

### 架构图

```
+-------------+     +-------------+     +-------------+
|             |     |             |     |             |
|  客户端     +---->+  API服务    +---->+  SQS队列    |
|             |     |             |     |             |
+-------------+     +-------------+     +-------------+
                           |                   |
                           v                   v
                    +-------------+     +-------------+
                    |             |     |             |
                    | DynamoDB    |     |  Worker服务  |
                    |             |     |             |
                    +-------------+     +-------------+
                                             |
                                             v
                                      +-------------+
                                      |             |
                                      |  S3存储桶    |
                                      |             |
                                      +-------------+
```

### 系统流程

1. **创建渲染任务**
   - 客户端发送POST请求到API服务
   - API服务将任务信息保存到DynamoDB（状态：PENDING）
   - API服务将任务ID发送到SQS队列
   - API服务返回任务ID给客户端

2. **处理渲染任务**
   - Worker服务从SQS队列获取任务
   - Worker服务更新任务状态为PROCESSING
   - Worker服务模拟渲染过程（2-5秒）
   - Worker服务将结果上传到S3
   - Worker服务更新任务状态为COMPLETED

3. **查询任务状态**
   - 客户端发送GET请求到API服务
   - API服务从DynamoDB获取任务信息
   - API服务返回任务状态和结果URL

## 技术栈

- **后端**：Node.js, TypeScript, Express
- **数据库**：Amazon DynamoDB
- **消息队列**：Amazon SQS
- **存储**：Amazon S3
- **计算**：AWS Lambda
- **基础设施即代码**：AWS CDK

## 本地开发

### 前提条件

- Node.js 18+
- Docker
- Docker Compose
- AWS CLI（可选）

### 设置本地环境

1. 安装依赖
   ```bash
   npm install
   ```

2. 启动LocalStack
   ```bash
   docker-compose up -d
   ```

3. 设置本地资源
   ```bash
   npm run setup:local
   ```

4. 启动API服务
   ```bash
   npm run start:local
   ```

5. 在另一个终端中启动worker服务
   ```bash
   npm run worker
   ```

6. 运行测试用例
   ```bash
   npm run test:concurrency
   ```

### 测试API

1. 创建渲染任务
   ```bash
   curl -X POST http://localhost:3000/jobs \
     -H "Content-Type: application/json" \
     -d '{
       "designId": "test-design-1",
       "userId": "test-user-1",
       "camera": {
         "position": {"x": 0, "y": 0, "z": 5},
         "target": {"x": 0, "y": 0, "z": 0},
         "up": {"x": 0, "y": 1, "z": 0},
         "fov": 45
       }
     }'
   ```

2. 查询任务状态
   ```bash
   curl http://localhost:3000/jobs/<job-id>
   ```




## 部署到AWS

### 前提条件

- AWS账户
- AWS CLI已配置
- Node.js 18+

### 部署步骤

1. 安装依赖
   ```bash
   npm install
   ```

2. 构建项目
   ```bash
   npm run build
   ```

3. 部署到AWS
   ```bash
   npm run deploy
   ```

4. 清理资源（可选）
   ```bash
   npm run destroy
   ```

## 设计权衡与改进方向

### 设计权衡

1. **Serverless vs 容器微服务**
   - 选择Serverless架构，利用Lambda的自动扩展和按需付费特性
   - 缺点：冷启动延迟，但通过预热策略可以缓解

2. **数据存储**
   - 使用DynamoDB存储任务状态，提供高可用性和低延迟
   - 使用S3存储渲染结果，支持大文件存储和CDN分发

3. **消息队列**
   - 使用SQS FIFO队列实现任务排队，确保任务按创建时间顺序处理
   - 通过Lambda函数的配置（batchSize=1）确保消息按顺序处理
   - 提供可靠的消息传递和自动重试机制
   - 支持基于内容的去重，避免重复处理

### 并发处理保证

1. **FIFO顺序保证**
   - 使用SQS FIFO队列确保消息按创建时间顺序处理
   - Lambda函数配置为一次只处理一条消息
   - 通过处理时间分析验证FIFO顺序
   - 支持并发测试，验证任务处理顺序

2. **任务处理时间分析**
   - 记录每个任务的创建时间和开始处理时间
   - 计算处理延迟（从创建到开始处理的时间）
   - 验证处理延迟按创建顺序递增
   - 允许100ms的误差，考虑网络延迟和系统调度

3. **并发测试验证**
   - 支持多个并发任务提交
   - 验证所有任务最终完成
   - 验证结果URL有效性
   - 验证任务处理顺序符合FIFO要求

### 改进方向

1. **认证与授权**
   - 添加JWT或Cognito认证，保护API接口
   - 实现基于角色的访问控制

2. **任务重试与幂等性**
   - 实现消费失败自动重试机制
   - 添加DLQ处理无法处理的消息
   - 确保数据库操作的幂等性

3. **监控与告警**
   - 添加CloudWatch监控和告警
   - 实现任务处理时间监控
   - 设置错误率告警

4. **成本优化**
   - 使用S3生命周期策略管理存储成本
   - 优化Lambda内存和超时设置
   - 考虑使用Spot实例降低成本

5. **实时通知**
   - 实现WebSocket或SSE推送任务进度
   - 添加任务完成通知机制

## 项目结构

```
repo-root/
├── bin/                # CDK入口
├── lib/                # CDK栈定义
├── src/
│   ├── api/            # API服务
│   ├── worker/         # Worker服务
│   └── types/          # 类型定义
├── tests/
│   ├── integration/    # 集成测试
│   └── __tests__/      # 单元测试
├── scripts/            # 辅助脚本
├── docker-compose.yml  # LocalStack配置
├── jest.config.js      # Jest配置
├── package.json        # 项目配置
└── README.md           # 项目说明
```

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：

创建 `.env` 文件：

```env
AWS_REGION=us-east-1
SQS_QUEUE_URL=your-sqs-queue-url
S3_BUCKET_NAME=your-s3-bucket-name
DYNAMODB_TABLE_NAME=your-dynamodb-table-name
PORT=3000
WORKER_POLL_INTERVAL=1000
```

3. 部署基础设施：

```bash
npm run deploy
```

4. 启动服务：

在一个终端中启动 API 服务器：

```bash
npm run start
```

在另一个终端中启动 worker：

```bash
npm run worker
```

## API 接口

### 创建渲染任务

```http
POST /jobs
Content-Type: application/json

{
  "designId": "string",
  "userId": "string",
  "camera": {
    "position": { "x": 0, "y": 0, "z": 5 },
    "target": { "x": 0, "y": 0, "z": 0 },
    "up": { "x": 0, "y": 1, "z": 0 },
    "fov": 45
  }
}
```

响应：

```json
{
  "jobId": "string"
}
```

### 查询任务状态

```http
GET /jobs/{jobId}
```

响应：

```json
{
  "status": "PENDING|PROCESSING|COMPLETED|FAILED",
  "resultUrl": "string",
  "createdAt": "string",
  "updatedAt": "string",
  "error": "string"
}
```

## 测试

运行所有测试：

```bash
npm test
```

运行集成测试：

```bash
npm run test:integration
```

## 开发

1. 代码格式化：

```bash
npm run format
```

2. 代码检查：

```bash
npm run lint
```

## 部署

使用 CDK 部署到 AWS：

```bash
npm run deploy
```

清理资源：

```bash
npm run destroy
```

## 监控和日志

- 使用 CloudWatch 查看日志
- 使用 CloudWatch Metrics 监控系统性能
- 使用 CloudWatch Alarms 设置告警

## 安全考虑

- 所有 API 端点都应该添加适当的认证和授权
- 使用 IAM 角色和策略限制服务访问权限
- 加密敏感数据
- 定期更新依赖包以修复安全漏洞

## 后续改进

1. 添加用户认证和授权
2. 实现任务重试机制
3. 添加任务优先级
4. 实现任务取消功能
5. 添加任务进度追踪
6. 实现 WebSocket 实时通知
7. 添加更多的监控和告警
8. 优化性能和成本
