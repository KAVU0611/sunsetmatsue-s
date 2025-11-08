#!/usr/bin/env node
import "source-map-support/register.js";
import { App, Environment } from "aws-cdk-lib";
import { SunsetForecastStack } from "../lib/sunset-forecast-stack";

const app = new App();

const env: Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
};

const myDomainName = process.env.MY_DOMAIN_NAME ?? "example.com";

new SunsetForecastStack(app, "SunsetForecastStack", {
  env,
  myDomainName,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  bedrockModelId: process.env.MODEL_ID ?? "amazon.titan-image-generator-v1",
  bedrockRegion: process.env.BEDROCK_REGION ?? "us-east-1",
  weatherApiKey: process.env.OPENWEATHER_API ?? "",
  defaultLat: process.env.DEFAULT_LAT ?? "35.468",
  defaultLon: process.env.DEFAULT_LON ?? "133.050",
  cdnHost: process.env.CDN_HOST
});
