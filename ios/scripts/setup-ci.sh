#!/bin/zsh
# One-time: push App Store Connect API credentials to GitHub and enable TestFlight deploys.
# Usage: scripts/setup-ci.sh            (looks for ~/Downloads/AuthKey_*.p8 or AppStoreAPIKey_*.p8)
set -euo pipefail
setopt extended_glob
R=santiagotoscanini/anansi
D=~/Downloads

P8=( $D/(AuthKey|AppStoreAPIKey)_*.p8(N) ); P8=${P8[1]:-}
[[ -n "${P8:-}" ]] || { echo "No AuthKey_*.p8 in $D"; exit 1; }
KEY_ID=${${${P8:t:r}#AuthKey_}#AppStoreAPIKey_}            # key ID comes from the filename

read -r "ISSUER?Issuer ID (App Store Connect › Users and Access › Integrations): "
echo "key: ${P8:t}   key id: $KEY_ID   issuer: $ISSUER"

base64 -i $P8 | gh secret set ASC_KEY_P8_BASE64 --repo $R
gh secret set ASC_KEY_ID    --repo $R --body "$KEY_ID"
gh secret set ASC_ISSUER_ID --repo $R --body "$ISSUER"
gh variable set IOS_DEPLOY_ENABLED --repo $R --body true

echo "Done. Kick off the first build with: gh workflow run ios-deploy.yml --repo $R"
