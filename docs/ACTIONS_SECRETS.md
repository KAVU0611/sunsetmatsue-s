# Required GitHub Secrets
- AWS_ROLE_TO_ASSUME = arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsOIDCDeployRole
- AWS_REGION = us-east-1
- FRONTEND_DEPLOY_BUCKET = <S3 static site bucket>
- FRONTEND_DISTRIBUTION_ID = <CloudFront DistributionId>

GitHub → Settings → Secrets and variables → Actions → New repository secret で登録。
