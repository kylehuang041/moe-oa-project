#!/usr/bin/env bash
# Runs a command with credentials that work for both AWS CLI *and* Pulumi/SST (Go SDK).
# SSO profiles are reliably loaded via `aws configure export-credentials`.

set -euo pipefail

export AWS_SDK_LOAD_CONFIG="${AWS_SDK_LOAD_CONFIG:-1}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

PROFILE="${AWS_PROFILE:-bob}"

# Export fresh keys from SSO/profile so Pulumi/SST (Go SDK) use the same session as the CLI.
if CREDENTIALS_ENV="$(aws configure export-credentials --profile "$PROFILE" --format env 2>/dev/null)"; then
  eval "$CREDENTIALS_ENV"
  unset AWS_PROFILE || true
else
  echo "warn: aws configure export-credentials failed for profile '$PROFILE'; using AWS_PROFILE only (SSO must be logged in)." >&2
  export AWS_PROFILE="$PROFILE"
fi

exec "$@"
