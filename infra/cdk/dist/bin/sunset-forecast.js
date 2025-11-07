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
const stackProps = {
    env,
    defaultModelId: process.env.MODEL_ID ?? "stability.stable-diffusion-xl-v1",
    openWeatherApiKey: process.env.OPENWEATHER_API ?? "REPLACE_ME",
    latitude: process.env.LAT ?? "35.468",
    longitude: process.env.LON ?? "133.048"
};
new sunset_forecast_stack_1.SunsetForecastStack(app, "SunsetForecastStack", stackProps);
