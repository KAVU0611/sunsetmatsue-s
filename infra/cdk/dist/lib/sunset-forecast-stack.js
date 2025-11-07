"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SunsetForecastStack = void 0;
const path = __importStar(require("node:path"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
class SunsetForecastStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const webBucket = new s3.Bucket(this, "WebBucket", {
            versioned: true,
            publicReadAccess: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
            websiteIndexDocument: "index.html"
        });
        const imageBucket = new s3.Bucket(this, "ImageBucket", {
            versioned: true,
            publicReadAccess: true,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS
        });
        const distribution = new cloudfront.Distribution(this, "WebDistribution", {
            defaultBehavior: {
                origin: new origins.S3Origin(webBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
            },
            defaultRootObject: "index.html",
            comment: "Sunset Forecast web distribution"
        });
        const generateCardFn = this.createPythonLambda("GenerateCardHandler", {
            entry: path.join(__dirname, "../../../services/lambda/generate-card"),
            handler: "lambda_function.lambda_handler",
            environment: {
                MODEL_ID: props.defaultModelId,
                BUCKET: imageBucket.bucketName,
            }
        });
        generateCardFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
            resources: ["*"]
        }));
        imageBucket.grantPut(generateCardFn);
        const sunsetScoreFn = this.createPythonLambda("SunsetScoreHandler", {
            entry: path.join(__dirname, "../../../services/lambda/sunset-score"),
            handler: "lambda_function.lambda_handler",
            environment: {
                OPENWEATHER_API: props.openWeatherApiKey,
                LAT: props.latitude,
                LON: props.longitude
            }
        });
        const api = new apigateway.RestApi(this, "SunsetApi", {
            restApiName: "Sunset Forecast API",
            deployOptions: {
                stageName: "prod",
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: false,
                accessLogDestination: new apigateway.LogGroupLogDestination(new logs.LogGroup(this, "ApiAccessLogs", {
                    retention: logs.RetentionDays.ONE_MONTH
                })),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields()
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: ["GET", "POST", "OPTIONS"],
                allowHeaders: apigateway.Cors.DEFAULT_HEADERS
            }
        });
        const generateCardResource = api.root.addResource("generate-card");
        generateCardResource.addMethod("POST", new apigateway.LambdaIntegration(generateCardFn));
        const sunsetScoreResource = api.root.addResource("sunset-score");
        sunsetScoreResource.addMethod("GET", new apigateway.LambdaIntegration(sunsetScoreFn));
        new aws_cdk_lib_1.CfnOutput(this, "ApiUrlOutput", { value: api.url ?? "missing" });
        new aws_cdk_lib_1.CfnOutput(this, "WebBucketOutput", { value: webBucket.bucketName });
        new aws_cdk_lib_1.CfnOutput(this, "ImageBucketOutput", { value: imageBucket.bucketName });
        new aws_cdk_lib_1.CfnOutput(this, "CloudFrontUrlOutput", { value: `https://${distribution.domainName}` });
    }
    createPythonLambda(id, options) {
        return new lambda.Function(this, id, {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: options.handler,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 1024,
            environment: options.environment,
            code: lambda.Code.fromAsset(options.entry, {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        [
                            "if [ -f requirements.txt ]; then pip install -r requirements.txt -t /asset-output; fi",
                            "cp -r . /asset-output"
                        ].join(" && ")
                    ]
                }
            })
        });
    }
}
exports.SunsetForecastStack = SunsetForecastStack;
