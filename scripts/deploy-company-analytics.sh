#!/bin/sh
set -eu
npx wrangler deploy --profile tideline --keep-vars --var "RELEASE_COMMIT:$AGENT_RELEASE_COMMIT" > .company-release.log 2>&1
cat .company-release.log
