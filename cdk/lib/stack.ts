import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

export interface PasswordManagerStackProps extends cdk.StackProps {
  stageName: string;
  throttlingRateLimit: number;
  throttlingBurstLimit: number;
  logRetention: number;
  allowedOrigins: string[];
  enableVersioning: boolean;
  tags?: { [key: string]: string };
}

export class PasswordManagerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PasswordManagerStackProps) {
    super(scope, id, props);

    // Apply tags to all resources in the stack
    if (props.tags) {
      Object.entries(props.tags).forEach(([key, value]) => {
        cdk.Tags.of(this).add(key, value);
      });
    }

    // Use allowed origins from props
    const allowedOrigins = props.allowedOrigins;

    // Validate origins format
    allowedOrigins.forEach((origin: string) => {
      if (!origin.match(/^https?:\/\/.+/) && origin !== "*") {
        throw new Error(`Invalid origin format: ${origin}`);
      }
    });

    // S3 Bucket with enhanced security
    const vaultBucket = new s3.Bucket(this, "VaultBucket", {
      bucketName: `password-manager-vault-${props.stageName}-${this.account}`,
      versioned: props.enableVersioning,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // Add lifecycle rules to manage old versions
      lifecycleRules: [
        {
          id: "DeleteOldVersions",
          noncurrentVersionExpiration: cdk.Duration.days(90),
          enabled: true,
        },
        {
          id: "AbortIncompleteMultipartUploads",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          enabled: true,
        },
      ],
      cors: [
        {
          allowedOrigins: allowedOrigins,
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
          ],
          allowedHeaders: [
            "Content-Type",
            "Content-Length",
            "x-amz-content-sha256",
          ],
          exposedHeaders: ["ETag", "x-amz-version-id"],
          maxAge: 3600,
        },
      ],
    });
    

    const lambdaLogGroup = new logs.LogGroup(this, "VaultApiLambdaLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda function with enhanced security
    const vaultApiLambda = new NodejsFunction(this, "VaultApiLambda", {
      entry: path.join(__dirname, "lambda/vault-api.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      depsLockFilePath: path.join(__dirname, "../../yarn.lock"),
      environment: {
        BUCKET_NAME: vaultBucket.bucketName,
        NODE_OPTIONS: "--enable-source-maps",
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      logGroup: lambdaLogGroup,
    });

    // Least privilege IAM permissions
    vaultApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetObjectVersion",
          "s3:HeadObject",
        ],
        resources: [`${vaultBucket.bucketArn}/vaults/*`],
      })
    );

    vaultApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListBucket"],
        resources: [vaultBucket.bucketArn],
        conditions: {
          StringLike: {
            "s3:prefix": ["vaults/*"],
          },
        },
      })
    );

    // API Gateway with enhanced security
    const api = new apigateway.RestApi(this, "VaultApi", {
      restApiName: `Password Manager Vault API - ${props.stageName}`,
      description: `API for managing password vaults (${props.stageName} environment)`,
      deployOptions: {
        stageName: props.stageName,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: false,
        throttlingRateLimit: props.throttlingRateLimit,
        throttlingBurstLimit: props.throttlingBurstLimit,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
        allowCredentials: false,
        maxAge: cdk.Duration.hours(1),
      },
      cloudWatchRole: true,
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(vaultApiLambda, {
      proxy: true,
      // Add timeout to prevent hanging requests
      timeout: cdk.Duration.seconds(29), // Slightly less than Lambda timeout
    });

    // Add routes (OPTIONS handled automatically by defaultCorsPreflightOptions)
    const vaults = api.root.addResource("vaults");
    vaults.addMethod("GET", lambdaIntegration);

    const vaultKey = vaults.addResource("{key}");
    vaultKey.addMethod("POST", lambdaIntegration);

    // Add WAF for production (commented out as it requires additional setup)
    // Consider enabling for production:
    // - Rate limiting
    // - IP whitelisting/blacklisting
    // - SQL injection protection
    // - XSS protection

    // Outputs
    new cdk.CfnOutput(this, "BucketName", {
      value: vaultBucket.bucketName,
      description: "Name of the S3 bucket for vault storage",
    });

    new cdk.CfnOutput(this, "BucketArn", {
      value: vaultBucket.bucketArn,
      description: "ARN of the S3 bucket for vault storage",
      exportName: `${this.stackName}-BucketArn`,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "URL of the Vault API Gateway",
      exportName: `${this.stackName}-ApiUrl`,
    });

    new cdk.CfnOutput(this, "ApiId", {
      value: api.restApiId,
      description: "API Gateway REST API ID",
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: vaultApiLambda.functionArn,
      description: "ARN of the Lambda function",
    });
  }
}
