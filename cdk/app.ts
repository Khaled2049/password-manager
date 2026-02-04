#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PasswordManagerStack, PasswordManagerStackProps } from "./lib/stack";
import { GitHubOidcStack } from "./lib/github-oidc-stack";

const app = new cdk.App();

new GitHubOidcStack(app, "github-oidc", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  githubOrg: "Khaled2049",
  githubRepo: "password-manager",
  existingOidcProviderArn:
    "arn:aws:iam::308830239283:oidc-provider/token.actions.githubusercontent.com",
});

const stackProps: PasswordManagerStackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  stageName: "prod",
  throttlingRateLimit: 200,
  throttlingBurstLimit: 500,
  logRetention: 180,
  allowedOrigins: [
    "https://khaled2049.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ],
  enableVersioning: true,
  tags: {
    Environment: "prod",
    Project: "password-manager",
    ManagedBy: "CDK",
  },
};

new PasswordManagerStack(app, "password-manager-backend-prod", stackProps);
