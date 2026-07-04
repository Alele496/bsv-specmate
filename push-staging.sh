#!/bin/bash
# push-staging.sh — 推送公开仓库 + 同步 MAINTAINER.md 到私有仓库

git push bsv-specmate master

if [ -f docs/MAINTAINER.md ]; then
    git add -f docs/MAINTAINER.md
    git commit -m "docs: sync MAINTAINER.md $(date +%Y-%m-%d)" 2>/dev/null
    git push bsv-specmate-staging master
    git reset HEAD~1 --soft 2>/dev/null
    git reset HEAD docs/MAINTAINER.md 2>/dev/null
    git checkout HEAD -- docs/MAINTAINER.md 2>/dev/null || true
fi
