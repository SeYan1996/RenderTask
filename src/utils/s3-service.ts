import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./aws-clients";
import { config } from "../config";
import logger from "./logger";

export class S3Service {
  private readonly bucketName: string;

  constructor() {
    this.bucketName = config.aws.s3.bucketName;
  }

  async uploadResult(jobId: string, result: string): Promise<string> {
    try {
      const key = `results/${jobId}.png`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: Buffer.from(result),
          ContentType: "image/png",
        })
      );

      const resultUrl = `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
      logger.info("Result uploaded to S3 successfully", { jobId, resultUrl });
      return resultUrl;
    } catch (error) {
      logger.error("Error uploading result to S3", { error, jobId });
      throw error;
    }
  }
}
