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
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
class SunsetForecastStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const apexDomain = props.myDomainName;
        const wwwDomain = `www.${props.myDomainName}`;
        const canonicalHttpsOrigins = [`https://${apexDomain}`, `https://${wwwDomain}`];
        const frontendOrigins = props.frontendOrigin
            ?.split(",")
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0) ?? [];
        const resolvedAllowedOrigins = Array.from(new Set([...canonicalHttpsOrigins, ...frontendOrigins]));
        this.corsPrimaryOrigin = canonicalHttpsOrigins[0];
        const hostedZone = new route53.HostedZone(this, "SunsetHostedZone", {
            zoneName: apexDomain,
            comment: "Hosted zone created by CDK. Final DNS records managed manually."
        });
        hostedZone.applyRemovalPolicy(aws_cdk_lib_1.RemovalPolicy.RETAIN);
        const certificateRequestorFn = new lambda.Function(this, "SiteCertificateCertificateRequestorFunction", {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.X86_64,
            handler: "lambda_function.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../../../services/lambda/site-certificate-requestor")),
            memorySize: 512,
            timeout: aws_cdk_lib_1.Duration.seconds(900),
            logRetention: logs.RetentionDays.ONE_WEEK,
            environment: {
                SKIP_WAIT: "0",
                ACM_REGION: "us-east-1",
                MAX_WAIT_SECONDS: "900"
            }
        });
        certificateRequestorFn.grantInvoke(new iam.ServicePrincipal("cloudformation.amazonaws.com"));
        certificateRequestorFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["route53:ChangeResourceRecordSets"],
            resources: [hostedZone.hostedZoneArn]
        }));
        certificateRequestorFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["route53:ListHostedZonesByName", "route53:ListResourceRecordSets"],
            resources: ["*"]
        }));
        certificateRequestorFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["acm:RequestCertificate", "acm:DescribeCertificate", "acm:ListCertificates", "acm:DeleteCertificate", "acm:AddTagsToCertificate"],
            resources: ["*"]
        }));
        certificateRequestorFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
            resources: ["*"]
        }));
        const siteCertificateCustomResource = new aws_cdk_lib_1.CustomResource(this, "SiteCertificateCertificateRequestorResource", {
            serviceToken: certificateRequestorFn.functionArn,
            properties: {
                DomainName: apexDomain,
                SubjectAlternativeNames: [wwwDomain],
                HostedZoneId: hostedZone.hostedZoneId,
                Region: "us-east-1",
                StackName: aws_cdk_lib_1.Stack.of(this).stackName
            }
        });
        const siteCertificateArn = siteCertificateCustomResource.getAttString("CertificateArn");
        const imageBucket = new s3.Bucket(this, "CardImagesBucket", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            versioned: true,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.RETAIN,
            autoDeleteObjects: false
        });
        const pillowLayer = new lambda.LayerVersion(this, "PillowLayer", {
            description: "Pillow runtime for generate-card",
            compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
            compatibleArchitectures: [lambda.Architecture.X86_64],
            code: lambda.Code.fromAsset(path.join(__dirname, "../../../layers/pillow"), {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        [
                            "pip install pillow==10.4.0 -t /asset-output/python/lib/python3.12/site-packages",
                            "find /asset-output -type f -name '*.pyc' -delete"
                        ].join(" && ")
                    ]
                }
            })
        });
        const generateCardFn = new lambda.Function(this, "GenerateCard", {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.X86_64,
            handler: "lambda_function.lambda_handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../../../services/lambda/generate-card"), {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        [
                            "if [ -f requirements.txt ]; then pip install -r requirements.txt -t /asset-output; fi",
                            "cp -R . /asset-output"
                        ].join(" && ")
                    ]
                }
            }),
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 2048,
            tracing: lambda.Tracing.ACTIVE,
            logRetention: logs.RetentionDays.ONE_MONTH,
            environment: {
                MODEL_ID: props.bedrockModelId ?? "amazon.titan-image-generator-v1",
                BEDROCK_REGION: props.bedrockRegion ?? "us-east-1",
                OUTPUT_BUCKET: imageBucket.bucketName,
                CODE_VERSION: "2025-11-07-02"
            },
            layers: [pillowLayer]
        });
        imageBucket.grantReadWrite(generateCardFn);
        generateCardFn.addToRolePolicy(new iam.PolicyStatement({
            actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
            resources: ["*"]
        }));
        generateCardFn.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:GetParametersByPath",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "kms:Decrypt"
            ],
            resources: ["*"]
        }));
        const sunsetIndexFn = new lambda.Function(this, "SunsetIndexFunction", {
            runtime: lambda.Runtime.PYTHON_3_12,
            architecture: lambda.Architecture.X86_64,
            handler: "lambda_function.lambda_handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../../../services/lambda/sunset-score"), {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        [
                            "if [ -f requirements.txt ]; then pip install -r requirements.txt -t /asset-output; fi",
                            "cp -R . /asset-output"
                        ].join(" && ")
                    ]
                }
            }),
            timeout: aws_cdk_lib_1.Duration.seconds(20),
            memorySize: 512,
            logRetention: logs.RetentionDays.ONE_MONTH,
            environment: {
                OPENWEATHER_API: props.weatherApiKey ?? "",
                LAT: props.defaultLat ?? "35.468",
                LON: props.defaultLon ?? "133.050"
            }
        });
        const api = new apigateway.RestApi(this, "SunsetApi", {
            restApiName: "Sunset Forecast",
            deployOptions: {
                stageName: "prod",
                tracingEnabled: true,
                metricsEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: false,
                accessLogDestination: new apigateway.LogGroupLogDestination(new logs.LogGroup(this, "ApiAccessLogs", {
                    retention: logs.RetentionDays.ONE_MONTH,
                    removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY
                })),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields()
            },
            defaultCorsPreflightOptions: {
                allowOrigins: resolvedAllowedOrigins,
                allowMethods: ["GET", "POST", "OPTIONS"],
                allowHeaders: ["Content-Type", "Authorization"]
            }
        });
        const apiV1 = api.root.addResource("v1");
        const sunsetIndexResource = apiV1.addResource("sunset-index");
        sunsetIndexResource.addMethod("GET", new apigateway.LambdaIntegration(sunsetIndexFn));
        this.addCorsOptions(sunsetIndexResource);
        const generateCardResource = apiV1.addResource("generate-card");
        generateCardResource.addMethod("POST", new apigateway.LambdaIntegration(generateCardFn));
        this.addCorsOptions(generateCardResource);
        const oac = new cloudfront.CfnOriginAccessControl(this, "ImagesOAC", {
            originAccessControlConfig: {
                name: `${aws_cdk_lib_1.Stack.of(this).stackName}-images-oac`,
                originAccessControlOriginType: "s3",
                signingBehavior: "always",
                signingProtocol: "sigv4",
                description: "Origin access control for generated images"
            }
        });
        const cachePolicyId = cloudfront.CachePolicy.CACHING_OPTIMIZED.cachePolicyId;
        const distribution = new cloudfront.CfnDistribution(this, "ImagesDistribution", {
            distributionConfig: {
                enabled: true,
                comment: "Sunset Forecast generated cards",
                priceClass: "PriceClass_100",
                origins: [
                    {
                        id: "ImagesS3Origin",
                        domainName: imageBucket.bucketRegionalDomainName,
                        s3OriginConfig: {},
                        originAccessControlId: oac.attrId
                    }
                ],
                defaultCacheBehavior: {
                    targetOriginId: "ImagesS3Origin",
                    viewerProtocolPolicy: "redirect-to-https",
                    allowedMethods: ["GET", "HEAD", "OPTIONS"],
                    cachedMethods: ["GET", "HEAD", "OPTIONS"],
                    compress: true,
                    cachePolicyId
                },
                cacheBehaviors: [
                    {
                        pathPattern: "images/*",
                        targetOriginId: "ImagesS3Origin",
                        viewerProtocolPolicy: "redirect-to-https",
                        allowedMethods: ["GET", "HEAD", "OPTIONS"],
                        cachedMethods: ["GET", "HEAD", "OPTIONS"],
                        compress: true,
                        cachePolicyId,
                        minTtl: 0,
                        defaultTtl: aws_cdk_lib_1.Duration.hours(1).toSeconds(),
                        maxTtl: aws_cdk_lib_1.Duration.days(1).toSeconds()
                    }
                ],
                aliases: [apexDomain, wwwDomain],
                viewerCertificate: {
                    acmCertificateArn: siteCertificateArn,
                    sslSupportMethod: "sni-only",
                    minimumProtocolVersion: "TLSv1.2_2021"
                },
                restrictions: {
                    geoRestriction: {
                        restrictionType: "none"
                    }
                }
            }
        });
        imageBucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: "AllowCloudFrontPrivateAccess",
            actions: ["s3:GetObject"],
            principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
            resources: [imageBucket.arnForObjects("*")],
            conditions: {
                StringEquals: {
                    "AWS:SourceArn": `arn:aws:cloudfront::${aws_cdk_lib_1.Stack.of(this).account}:distribution/${distribution.attrId}`
                }
            }
        }));
        generateCardFn.addEnvironment("CLOUDFRONT_DOMAIN", distribution.attrDomainName);
        const cloudFrontAliasTarget = {
            bind: () => ({
                hostedZoneId: "Z2FDTNDATAQYW2",
                dnsName: distribution.attrDomainName
            })
        };
        new route53.ARecord(this, "ApexAliasRecord", {
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(cloudFrontAliasTarget)
        });
        new route53.AaaaRecord(this, "ApexAliasRecordIpv6", {
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(cloudFrontAliasTarget)
        });
        new route53.CnameRecord(this, "WwwCnameRecord", {
            zone: hostedZone,
            recordName: "www",
            domainName: apexDomain
        });
        new aws_cdk_lib_1.CfnOutput(this, "ApiUrl", { value: `${api.url}v1` });
        new aws_cdk_lib_1.CfnOutput(this, "ImagesBucketName", { value: imageBucket.bucketName });
        new aws_cdk_lib_1.CfnOutput(this, "CloudFrontDomain", { value: distribution.attrDomainName });
        new aws_cdk_lib_1.CfnOutput(this, "CloudFrontDistributionId", { value: distribution.attrId });
        new aws_cdk_lib_1.CfnOutput(this, "HostedZoneId", { value: hostedZone.hostedZoneId });
        new aws_cdk_lib_1.CfnOutput(this, "HostedZoneNameServers", {
            value: hostedZone.hostedZoneNameServers
                ? aws_cdk_lib_1.Fn.join(",", hostedZone.hostedZoneNameServers)
                : "pending"
        });
        new aws_cdk_lib_1.CfnOutput(this, "DnsRecordGuidance", {
            value: `A/AAAA aliases for ${props.myDomainName} and www CNAME are managed by CDK. Ensure registrar NS = ${props.myDomainName} HostedZoneNameServers.`
        });
    }
    addCorsOptions(resource) {
        if (resource.node.tryFindChild("OPTIONS")) {
            return;
        }
        resource.addMethod("OPTIONS", new apigateway.MockIntegration({
            integrationResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Origin": `'${this.corsPrimaryOrigin}'`,
                        "method.response.header.Access-Control-Allow-Credentials": "'false'",
                        "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
                        "method.response.header.Access-Control-Allow-Methods": "'GET,POST,OPTIONS'"
                    }
                }
            ],
            passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
            requestTemplates: {
                "application/json": '{"statusCode": 200}'
            }
        }), {
            methodResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Origin": true,
                        "method.response.header.Access-Control-Allow-Credentials": true,
                        "method.response.header.Access-Control-Allow-Headers": true,
                        "method.response.header.Access-Control-Allow-Methods": true
                    }
                }
            ]
        });
    }
}
exports.SunsetForecastStack = SunsetForecastStack;
