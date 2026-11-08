#!/usr/bin/env bash
# Optional local-test image preparation for space-constrained Docker VFS hosts.
# Requires Docker's managed local socket, Python 3 and crane >= 0.22.0 on PATH.
# Installs nothing; never prunes images, restarts Docker or changes its driver.
#
# Usage:
#   bash tests/supabase/flatten-realtime.sh
#   MISSION3_REALTIME_IMAGE=restomanager-mission3/realtime:v2.151.3-flattened \
#     node tests/supabase/mission3.cjs
#
# crane merges the official, digest-pinned filesystem layers into a tar stream.
# docker import receives that stream as one layer, avoiding cumulative VFS copies.
# The resulting image has a different digest/history. Its executable filesystem
# and Linux runtime config are preserved; provenance labels identify the source.
set -euo pipefail

readonly upstream='docker.io/supabase/realtime@sha256:dac44c958d0776144f0046ff0c0f8d51e0ff4f8a86c4a5e25287dd2f79fffa1e'
readonly index_digest='sha256:dac44c958d0776144f0046ff0c0f8d51e0ff4f8a86c4a5e25287dd2f79fffa1e'
readonly amd64_digest='sha256:b4e2c38b1474cea7cde0853bd7495f5c4dd54fbf9d8c53b6139aa56ce4e97bf0'
readonly destination='restomanager-mission3/realtime:v2.151.3-flattened'

for tool in crane docker python3; do
  command -v "$tool" >/dev/null || { echo "Required tool missing: $tool" >&2; exit 1; }
done
python3 - "$(crane version)" <<'PY'
import re, sys
match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?', sys.argv[1].strip())
if not match or tuple(map(int, match.groups())) < (0, 22, 0):
    raise SystemExit('crane >= 0.22.0 is required; install it separately from its official release.')
PY

local_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY \
    -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
local_docker info --format 'Managed local Docker storage driver: {{.Driver}}'

work="$(mktemp -d "${TMPDIR:-/tmp}/restomanager-realtime-image.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT

[[ "$(crane digest "$upstream")" == "$index_digest" ]] || {
  echo 'Unexpected upstream manifest digest; refusing import.' >&2; exit 1;
}
[[ "$(crane digest --platform linux/amd64 "$upstream")" == "$amd64_digest" ]] || {
  echo 'Unexpected upstream linux/amd64 digest; refusing import.' >&2; exit 1;
}
crane config --platform linux/amd64 "$upstream" > "$work/official-config.json"

validate_image() {
  local_docker image inspect "$destination" > "$work/local-inspect.json"
  python3 - "$work/official-config.json" "$work/local-inspect.json" "$upstream" <<'PY'
import json, sys
official = json.load(open(sys.argv[1], encoding='utf-8'))
image = json.load(open(sys.argv[2], encoding='utf-8'))[0]
if (official.get('architecture'), official.get('os')) != ('amd64', 'linux'):
    raise SystemExit('Unexpected upstream platform.')
if (image.get('Architecture'), image.get('Os')) != ('amd64', 'linux'):
    raise SystemExit('Unexpected imported platform.')
for field in ('User', 'Env', 'Entrypoint', 'Cmd', 'WorkingDir'):
    if official['config'].get(field) != image['Config'].get(field):
        raise SystemExit('Runtime config mismatch: ' + field)
if len(image['RootFS']['Layers']) != 1:
    raise SystemExit('Expected exactly one imported filesystem layer.')
if image['Config'].get('Labels', {}).get('restomanager.upstream.image') != sys.argv[3]:
    raise SystemExit('Existing destination lacks the expected upstream provenance label.')
print('Verified one-layer image:', image['Id'])
print('Verified official User, Env, Entrypoint, Cmd and WorkingDir.')
PY
}

# Avoid replacing any existing image, including an unrelated image with this tag.
if local_docker image inspect "$destination" >/dev/null 2>&1; then
  validate_image
  echo "Already prepared: $destination"
  exit 0
fi

python3 - "$work/official-config.json" "$upstream" > "$work/changes.nul" <<'PY'
import json, re, sys
source = json.load(open(sys.argv[1], encoding='utf-8'))
config = source['config']
# This helper intentionally accepts only the known official v2.151.3 config.
# ArgsEscaped is Windows-specific/deprecated and has no Linux runtime effect.
unsupported = set(config) - {'User', 'Env', 'Entrypoint', 'Cmd', 'WorkingDir', 'ArgsEscaped'}
if unsupported:
    raise SystemExit('Unhandled upstream config fields: ' + ', '.join(sorted(unsupported)))
changes = ['USER ' + config['User'], 'WORKDIR ' + config['WorkingDir']]
changes += [name.upper() + ' ' + json.dumps(config[name], separators=(',', ':'))
            for name in ('Entrypoint', 'Cmd')]
for item in config['Env']:
    key, value = item.split('=', 1)
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or '\n' in value or '\r' in value:
        raise SystemExit('Unexpected environment entry in upstream config.')
    changes.append('ENV ' + key + '=' + json.dumps(value))
changes += ['LABEL restomanager.mission=3-isolated-test',
            'LABEL org.opencontainers.image.source=https://github.com/supabase/realtime',
            'LABEL restomanager.upstream.image=' + sys.argv[2]]
sys.stdout.buffer.write(b''.join(change.encode() + b'\0' for change in changes))
PY

mapfile -d '' -t changes < "$work/changes.nul"
import_options=()
for change in "${changes[@]}"; do import_options+=(--change "$change"); done

crane export --platform linux/amd64 "$upstream" - | \
  local_docker import --platform linux/amd64 "${import_options[@]}" - "$destination"
validate_image
printf 'Prepared %s\nSet MISSION3_REALTIME_IMAGE=%s for the isolated tests.\n' "$destination" "$destination"
