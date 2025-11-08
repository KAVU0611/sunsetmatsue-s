#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register.js");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const sunset_forecast_stack_1 = require("../lib/sunset-forecast-stack");
const app = new aws_cdk_lib_1.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
};
const myDomainName = process.env.MY_DOMAIN_NAME ?? "example.com";
new sunset_forecast_stack_1.SunsetForecastStack(app, "SunsetForecastStack", {
    env,
    myDomainName,
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    bedrockModelId: process.env.MODEL_ID ?? "amazon.titan-image-generator-v1",
    bedrockRegion: process.env.BEDROCK_REGION ?? "us-east-1",
    weatherApiKey: process.env.OPENWEATHER_API ?? "",
    defaultLat: process.env.DEFAULT_LAT ?? "35.468",
    defaultLon: process.env.DEFAULT_LON ?? "133.050"
});
