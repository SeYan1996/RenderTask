import {
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqsClient } from "./aws-clients";
import { config } from "../config";
import logger from "./logger";

export class SQSService {
  private readonly queueUrl: string;

  constructor() {
    this.queueUrl = config.aws.sqs.queueUrl;
  }

  async sendMessage(messageBody: any): Promise<void> {
    try {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(messageBody),
        })
      );
      logger.info("Message sent to SQS successfully", { messageBody });
    } catch (error) {
      logger.error("Error sending message to SQS", { error, messageBody });
      throw error;
    }
  }

  async receiveMessage(): Promise<any | null> {
    try {
      const result = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 20,
        })
      );

      if (!result.Messages || result.Messages.length === 0) {
        return null;
      }

      const message = result.Messages[0];
      return {
        messageId: message.MessageId,
        receiptHandle: message.ReceiptHandle,
        body: JSON.parse(message.Body || "{}"),
      };
    } catch (error) {
      logger.error("Error receiving message from SQS", { error });
      throw error;
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      await sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: receiptHandle,
        })
      );
      logger.info("Message deleted from SQS successfully", { receiptHandle });
    } catch (error) {
      logger.error("Error deleting message from SQS", { error, receiptHandle });
      throw error;
    }
  }
}
