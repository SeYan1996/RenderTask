import { SQSClient } from '@aws-sdk/client-sqs';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config';

export const sqsClient = new SQSClient({ region: config.aws.region });
export const s3Client = new S3Client({ region: config.aws.region });
export const dynamoClient = new DynamoDBClient({ region: config.aws.region });
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient); 