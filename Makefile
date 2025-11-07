CDK_DIR := infra/cdk
CERT_ENSURE_WAIT_SECONDS ?= 0

.PHONY: bootstrap cert\:ensure cert\:status cert-ensure cert-status deploy destroy

bootstrap:
	cd $(CDK_DIR) && pnpm install && npx cdk bootstrap

cert\:ensure: cert-ensure

cert-ensure:
	bash ./scripts/cert_ensure.sh

cert\:status: cert-status

cert-status:
	@set -euo pipefail; \
	REGION="$${AWS_REGION:-us-east-1}"; \
	DOMAIN="$${MY_DOMAIN_NAME:?Environment variable MY_DOMAIN_NAME is required}"; \
	echo "Listing ACM certificates for $$DOMAIN in $$REGION"; \
	aws acm list-certificates --region "$$REGION" --query "CertificateSummaryList[?contains(DomainName, '$$DOMAIN')][CertificateArn,DomainName]" --output table; \
	for ARN in $$(aws acm list-certificates --region "$$REGION" --query "CertificateSummaryList[?contains(DomainName, '$$DOMAIN')].CertificateArn" --output text); do \
	  [ -z "$$ARN" ] && continue; \
	  echo "=== $$ARN ==="; \
	  aws acm describe-certificate --certificate-arn "$$ARN" --region "$$REGION" --query "{Status:Certificate.Status, InUseBy:Certificate.InUseBy, DVOs:Certificate.DomainValidationOptions[].ResourceRecord}" --output json; \
	done

deploy: cert\:ensure
	cd $(CDK_DIR) && pnpm install && npx cdk deploy --require-approval never

destroy:
	cd $(CDK_DIR) && pnpm install && npx cdk destroy
