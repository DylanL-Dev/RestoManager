#!/usr/bin/env bash
# Prepare a PostgreSQL 17 wal2json library for the disposable local test database.
# Requires curl, sha256sum and dpkg-deb. No package/system installation is made.
# Downloads the exact official PGDG Debian bookworm/amd64 package below, verifies
# its package checksum and metadata, then extracts it into a retained /tmp folder.
# The only stdout output on success is the absolute path to wal2json.so.
#
# Usage:
#   bash tests/supabase/prepare-wal2json.sh [/tmp/local-test-work/wal2json]
# The runner can bind this file read-only into its disposable PostgreSQL 17 image.
# Delete the printed path's /tmp/restomanager-wal2json.* parent after testing.
set -euo pipefail

readonly url='https://apt.postgresql.org/pub/repos/apt/pool/main/w/wal2json/postgresql-17-wal2json_2.7-1.pgdg12+1_amd64.deb'
readonly checksum='8531a733b870a30b60546f0d58090ab0e69d57fec763aaaceed5d831f6a439f0'
readonly expected_package='postgresql-17-wal2json'
readonly expected_version='2.7-1.pgdg12+1'
readonly expected_architecture='amd64'

for tool in curl sha256sum dpkg-deb realpath; do
  command -v "$tool" >/dev/null || { echo "Required tool missing: $tool" >&2; exit 1; }
done

[[ $# -le 1 ]] || { echo 'Expected zero or one staging-directory argument.' >&2; exit 2; }
if [[ $# -eq 1 ]]; then
  [[ "$1" = /* ]] || { echo 'Staging directory must be absolute and below /tmp.' >&2; exit 2; }
  destination="$(realpath --canonicalize-missing -- "$1")"
  [[ "$destination" = /tmp/* ]] || { echo 'Staging directory must be below /tmp.' >&2; exit 2; }
  mkdir -p -- "$destination"
  work="$(mktemp -d "$destination/restomanager-wal2json.XXXXXXXX")"
else
  work="$(mktemp -d /tmp/restomanager-wal2json.XXXXXXXX)"
fi
prepared=false
trap 'if [[ "$prepared" != true ]]; then rm -rf -- "$work"; fi' EXIT
archive="$work/wal2json.deb"

curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' \
  --tlsv1.2 --max-time 60 "$url" --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status || {
  echo 'wal2json package checksum mismatch; refusing extraction.' >&2; exit 1;
}
[[ "$(dpkg-deb --field "$archive" Package)" == "$expected_package" ]] && \
[[ "$(dpkg-deb --field "$archive" Version)" == "$expected_version" ]] && \
[[ "$(dpkg-deb --field "$archive" Architecture)" == "$expected_architecture" ]] || {
  echo 'Unexpected wal2json package metadata; refusing extraction.' >&2; exit 1;
}

dpkg-deb --extract "$archive" "$work/root"
library="$work/root/usr/lib/postgresql/17/lib/wal2json.so"
[[ -f "$library" && ! -L "$library" ]] || {
  echo 'Verified package did not contain the expected wal2json library.' >&2; exit 1;
}
# Public package contents only: allow the local Docker daemon to traverse the
# staging folder and read the library when preparing its read-only bind mount.
chmod 755 "$work"
chmod 644 "$library"
prepared=true
printf '%s\n' "$library"
