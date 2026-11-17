#!/usr/bin/env bash
set -euo pipefail
cron_artifacts="${TMPDIR:-/tmp}/restomanager-pg-cron-1.6.4-bookworm"
mkdir -p "$cron_artifacts"
exec 9>"$cron_artifacts/.prepare.lock"
flock 9
cron_deb="$cron_artifacts/pg-cron.deb"
cron_sha=d224cb6f347feccacaef92ed850913d1aa9f726ff1417e478b68690c31b9d262
if ! test -f "$cron_deb" || ! echo "$cron_sha  $cron_deb" | sha256sum --check --status; then
 curl --fail --location --silent --show-error --max-time 40 'https://apt-archive.postgresql.org/pub/repos/apt/pool/main/p/pg-cron/postgresql-17-cron_1.6.4-2.pgdg120%2B1_amd64.deb' --output "$cron_deb"
fi
echo "$cron_sha  $cron_deb" | sha256sum --check --status
dpkg-deb --extract "$cron_deb" "$cron_artifacts/extracted"
printf '%s\n' "$cron_artifacts/extracted"
