#!/bin/sh
set -eu
: "${AGENT_RELEASE_COMMIT:?Managed release required}"
export CLOUDFLARE_ACCOUNT_ID=58008ae4816f34f96786f0f52834dce5
npx --yes --package=wrangler@4.148.0 wrangler deploy --profile default --keep-vars --var "RELEASE_COMMIT:$AGENT_RELEASE_COMMIT" --message "tideline-intake:$AGENT_RELEASE_COMMIT" > .tideline-intake-release.log 2>&1
cat .tideline-intake-release.log
