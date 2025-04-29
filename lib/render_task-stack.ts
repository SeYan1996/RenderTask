import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";

export class RenderTaskStack extends cdk.Stack {
  public readonly queue: sqs.Queue;
  public readonly bucket: s3.Bucket;
  public readonly table: dynamodb.Table;
  public readonly apiService: ecsPatterns.ApplicationLoadBalancedFargateService;
  public readonly workerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 创建 SQS 队列
    this.queue = new sqs.Queue(this, "RenderTaskQueue", {
      queueName: "RenderTaskQueue",
      fifo: true,
      visibilityTimeout: cdk.Duration.seconds(300), // 5分钟
    });

    // 创建 DynamoDB 表
    this.table = new dynamodb.Table(this, "RenderJobsTable", {
      tableName: "RenderJobsTable",
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 开发环境使用，生产环境应改为 RETAIN
    });

    // 创建 S3 存储桶
    this.bucket = new s3.Bucket(this, "RenderResultsBucket", {
      bucketName: "render-results-bucket",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 开发环境使用，生产环境应改为 RETAIN
      autoDeleteObjects: true, // 开发环境使用，生产环境应禁用
    });

    // 创建 VPC
    const vpc = new ec2.Vpc(this, "RenderTaskVpc", {
      maxAzs: 2,
      natGateways: 1, // 开发环境使用 1 个 NAT 网关以节省成本
    });

    // 创建 ECS 集群
    const cluster = new ecs.Cluster(this, "RenderTaskCluster", {
      vpc,
      containerInsights: true,
    });

    // 创建 API 服务任务定义
    const apiTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "ApiTaskDefinition",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      }
    );

    // 添加 API 容器
    const apiContainer = apiTaskDefinition.addContainer("ApiContainer", {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../src/api")),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "api",
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        AWS_REGION: this.region,
        SQS_QUEUE_URL: this.queue.queueUrl,
        S3_BUCKET_NAME: this.bucket.bucketName,
        DYNAMODB_TABLE_NAME: this.table.tableName,
        PORT: "3000",
      },
    });

    // 添加端口映射
    apiContainer.addPortMappings({
      containerPort: 3000,
      hostPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // 创建 API 服务
    this.apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "ApiService",
      {
        cluster,
        taskDefinition: apiTaskDefinition,
        desiredCount: 1,
        publicLoadBalancer: true,
      }
    );

    // 创建 Worker Lambda 函数
    this.workerFunction = new lambda.Function(this, "RenderWorkerFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("src/worker"),
      timeout: cdk.Duration.seconds(300), // 5分钟
      memorySize: 512,
      environment: {
        DYNAMODB_TABLE_NAME: this.table.tableName,
        S3_BUCKET_NAME: this.bucket.bucketName,
      },
    });

    // 添加 SQS 触发器
    this.workerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.queue)
    );

    // 授予 Lambda 函数访问 DynamoDB 和 S3 的权限
    this.table.grantReadWriteData(this.workerFunction);
    this.bucket.grantReadWrite(this.workerFunction);

    // 设置 IAM 权限
    // API 服务权限
    this.queue.grantSendMessages(this.apiService.taskDefinition.taskRole);
    this.bucket.grantReadWrite(this.apiService.taskDefinition.taskRole);
    this.table.grantReadWriteData(this.apiService.taskDefinition.taskRole);

    // 输出资源信息
    new cdk.CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
    });

    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: this.apiService.loadBalancer.loadBalancerDnsName,
      description: "API Endpoint",
    });
  }
}
