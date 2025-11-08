import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
export interface SunsetForecastStackProps extends StackProps {
    readonly myDomainName: string;
    readonly frontendOrigin?: string;
    readonly bedrockModelId?: string;
    readonly bedrockRegion?: string;
    readonly weatherApiKey?: string;
    readonly defaultLat?: string;
    readonly defaultLon?: string;
}
export declare class SunsetForecastStack extends Stack {
    private readonly corsPrimaryOrigin;
    constructor(scope: Construct, id: string, props: SunsetForecastStackProps);
    private addCorsOptions;
}
