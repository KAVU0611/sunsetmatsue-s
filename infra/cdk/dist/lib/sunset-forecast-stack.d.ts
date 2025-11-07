import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
export interface SunsetForecastStackProps extends StackProps {
    defaultModelId: string;
    openWeatherApiKey: string;
    latitude: string;
    longitude: string;
}
export declare class SunsetForecastStack extends Stack {
    constructor(scope: Construct, id: string, props: SunsetForecastStackProps);
    private createPythonLambda;
}
