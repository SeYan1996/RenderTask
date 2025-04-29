import { PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDocClient } from "./aws-clients";
import { config } from "../config";
import { RenderJob, JobStatus } from "../types";
import logger from "./logger";

export class DatabaseService {
  private readonly tableName: string;

  constructor() {
    this.tableName = config.aws.dynamodb.tableName;
  }

  async createJob(job: RenderJob): Promise<void> {
    try {
      await dynamoDocClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: job,
        })
      );
      logger.info("Job created successfully", { jobId: job.jobId });
    } catch (error) {
      logger.error("Error creating job", { error, jobId: job.jobId });
      throw error;
    }
  }

  async getJob(jobId: string): Promise<RenderJob | null> {
    try {
      const result = await dynamoDocClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { jobId },
        })
      );
      return (result.Item as RenderJob) || null;
    } catch (error) {
      logger.error("Error getting job", { error, jobId });
      throw error;
    }
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    resultUrl?: string,
    error?: string
  ): Promise<void> {
    try {
      let updateExpression = "SET #status = :status, updatedAt = :updatedAt";
      const expressionAttributeNames: Record<string, string> = {
        "#status": "status",
      };
      const expressionAttributeValues: Record<string, any> = {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
      };

      if (resultUrl) {
        updateExpression += ", resultUrl = :resultUrl";
        expressionAttributeValues[":resultUrl"] = resultUrl;
      }

      if (error) {
        updateExpression += ", error = :error";
        expressionAttributeValues[":error"] = error;
      }

      await dynamoDocClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { jobId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        })
      );
      logger.info("Job status updated successfully", { jobId, status });
    } catch (error) {
      logger.error("Error updating job status", { error, jobId, status });
      throw error;
    }
  }
}
