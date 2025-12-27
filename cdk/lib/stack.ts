import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

export class PasswordManagerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get allowed origins from context with validation
    const originsContext = this.node.tryGetContext("allowedOrigins");
    const allowedOrigins = originsContext
      ? originsContext.split(",").map((origin: string) => origin.trim())
      : ["http://localhost:5173", "http://127.0.0.1:5173"];

    // Validate origins format
    allowedOrigins.forEach((origin: string) => {
      if (!origin.match(/^https?:\/\/.+/) && origin !== "*") {
        throw new Error(`Invalid origin format: ${origin}`);
      }
    });

    // S3 Bucket with enhanced security
    const vaultBucket = new s3.Bucket(this, "VaultBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED, // Consider KMS for production
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
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

    // Lambda function with enhanced security
    const vaultApiLambda = new lambda.Function(this, "VaultApiLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "vault-api.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambda"), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "npm install",
              "npx tsc",
              "cp dist/vault-api.js /asset-output/",
              "cp package.json /asset-output/",
              "cd /asset-output && npm install --omit=dev",
            ].join(" && "),
          ],
        },
      }),
      environment: {
        BUCKET_NAME: vaultBucket.bucketName,
        AWS_REGION: this.region,
        NODE_OPTIONS: "--enable-source-maps", // Better error traces
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512, // Explicit memory allocation
      reservedConcurrentExecutions: 100, // Prevent runaway costs
      logRetention: logs.RetentionDays.ONE_MONTH, // Explicit log retention
      // Enable tracing for debugging
      tracing: lambda.Tracing.ACTIVE,
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
      restApiName: "Password Manager Vault API",
      description: "API for managing password vaults",
      deployOptions: {
        stageName: "prod",
        tracingEnabled: true, // Enable X-Ray tracing
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: false, // Don't log request/response bodies (sensitive data)
        metricsEnabled: true,
        throttlingRateLimit: 100, // Requests per second
        throttlingBurstLimit: 200, // Burst capacity
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
        allowCredentials: false, // Set to true if using cookies/auth
        maxAge: cdk.Duration.hours(1),
      },
      // Consider adding API key or other auth
      cloudWatchRole: true,
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(vaultApiLambda, {
      proxy: true,
      // Add timeout to prevent hanging requests
      timeout: cdk.Duration.seconds(29), // Slightly less than Lambda timeout
    });

    // Add routes
    const vaults = api.root.addResource("vaults");
    vaults.addMethod("GET", lambdaIntegration);
    vaults.addMethod("OPTIONS", lambdaIntegration);

    const vaultKey = vaults.addResource("{key}");
    vaultKey.addMethod("POST", lambdaIntegration);
    vaultKey.addMethod("OPTIONS", lambdaIntegration);

    // Add request validation
    const requestValidator = new apigateway.RequestValidator(
      this,
      "RequestValidator",
      {
        restApi: api,
        validateRequestBody: true,
        validateRequestParameters: true,
      }
    );

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
