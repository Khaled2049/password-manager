import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { Construct } from 'constructs';

export class PasswordManagerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket with security best practices
    const vaultBucket = new s3.Bucket(this, 'VaultBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // AES-256 encryption
      enforceSSL: true, // HTTPS-only access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Prevent accidental deletion
      autoDeleteObjects: false,
    });

    // Create CloudTrail for logging
    const trail = new cloudtrail.Trail(this, 'VaultTrail', {
      enableFileValidation: true,
    });

    // Add S3 bucket to CloudTrail logging
    trail.addS3EventSelector([{
      bucket: vaultBucket,
    }]);

    // Output bucket name
    new cdk.CfnOutput(this, 'BucketName', {
      value: vaultBucket.bucketName,
      description: 'Name of the S3 bucket for vault storage',
    });

    new cdk.CfnOutput(this, 'BucketArn', {
      value: vaultBucket.bucketArn,
      description: 'ARN of the S3 bucket for vault storage',
    });
  }
}

