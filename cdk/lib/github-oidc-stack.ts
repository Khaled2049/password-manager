import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface GitHubOidcStackProps extends cdk.StackProps {
  githubOrg: string;
  githubRepo: string;
  existingOidcProviderArn?: string;
}

export class GitHubOidcStack extends cdk.Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    const providerArn =
      props.existingOidcProviderArn ??
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

    // Create the GitHub Actions role with explicit trust policy
    this.role = new iam.Role(this, "GitHubActionsRole", {
      roleName: "github-actions-cdk-deploy-role",
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.FederatedPrincipal(
        providerArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${props.githubOrg}/${props.githubRepo}:*`,
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    // CloudFormation permissions
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudFormation",
        effect: iam.Effect.ALLOW,
        actions: [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResources",
          "cloudformation:GetTemplate",
          "cloudformation:ValidateTemplate",
          "cloudformation:CreateChangeSet",
          "cloudformation:DescribeChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
          "cloudformation:ListStacks",
          "cloudformation:GetTemplateSummary",
        ],
        resources: ["*"],
      })
    );

    // CDK Bootstrap / SSM permissions
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CDKBootstrap",
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`,
        ],
      })
    );

    // S3 permissions for CDK assets and vault bucket
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "S3Permissions",
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:PutBucketPolicy",
          "s3:GetBucketPolicy",
          "s3:DeleteBucketPolicy",
          "s3:PutBucketVersioning",
          "s3:GetBucketVersioning",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutEncryptionConfiguration",
          "s3:GetEncryptionConfiguration",
          "s3:PutLifecycleConfiguration",
          "s3:GetLifecycleConfiguration",
          "s3:PutBucketCors",
          "s3:GetBucketCors",
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetBucketLocation",
          "s3:PutBucketOwnershipControls",
          "s3:GetBucketOwnershipControls",
          "s3:PutBucketTagging",
          "s3:GetBucketTagging",
        ],
        resources: [
          "arn:aws:s3:::cdk-*",
          "arn:aws:s3:::cdk-*/*",
          "arn:aws:s3:::password-manager-vault-*",
          "arn:aws:s3:::password-manager-vault-*/*",
        ],
      })
    );

    // Lambda permissions
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "Lambda",
        effect: iam.Effect.ALLOW,
        actions: [
          "lambda:CreateFunction",
          "lambda:DeleteFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:InvokeFunction",
          "lambda:ListTags",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:PublishVersion",
          "lambda:ListVersionsByFunction",
        ],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:*`],
      })
    );

    // API Gateway permissions
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "APIGateway",
        effect: iam.Effect.ALLOW,
        actions: [
          "apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:DELETE",
          "apigateway:PATCH",
          "apigateway:UpdateRestApiPolicy",
        ],
        resources: [
          `arn:aws:apigateway:${this.region}::/restapis`,
          `arn:aws:apigateway:${this.region}::/restapis/*`,
          `arn:aws:apigateway:${this.region}::/account`,
          `arn:aws:apigateway:${this.region}::/tags/*`,
        ],
      })
    );

    // IAM permissions (scoped)
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "IAMRoles",
        effect: iam.Effect.ALLOW,
        actions: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PassRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateAssumeRolePolicy",
        ],
        resources: [
          `arn:aws:iam::${this.account}:role/password-manager-*`,
          `arn:aws:iam::${this.account}:role/cdk-*`,
        ],
      })
    );

    // CloudWatch Logs permissions
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:DescribeLogGroups",
          "logs:TagResource",
          "logs:ListTagsForResource",
          "logs:TagLogGroup",
          "logs:UntagLogGroup",
          "logs:ListTagsLogGroup",
        ],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:*`],
      })
    );

    // STS for CDK lookups
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: "STS",
        effect: iam.Effect.ALLOW,
        actions: ["sts:GetCallerIdentity"],
        resources: ["*"],
      })
    );

    // Outputs
    new cdk.CfnOutput(this, "RoleArn", {
      value: this.role.roleArn,
      description: "Add this to GitHub secrets as AWS_ROLE_ARN",
      exportName: "GitHubActionsRoleArn",
    });

    new cdk.CfnOutput(this, "OIDCProviderArn", {
      value: providerArn,
      description: "OIDC Provider ARN",
    });
  }
}