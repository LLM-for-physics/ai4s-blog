#!/bin/bash
# Routine static publication. Install/review nginx routing once before using this script.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
yarn docs:build
python3 scripts/verify-site.py --current-only
# Validate the installed nginx configuration before changing the served release.
sudo nginx -t
sudo python3 deploy/publish.py "$@"
# No nginx reload is needed for a current symlink switch.
echo 'Published. First migration requires the reviewed nginx root/routing change; see TERM-OPERATIONS.md.'
