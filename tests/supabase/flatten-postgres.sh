#!/usr/bin/env bash
# Optional local-test preparation for space-constrained Docker VFS hosts.
# Requires Docker's managed local socket, Python 3 and crane >= 0.22.0 on PATH.
# Installs/removes nothing; never prunes images, restarts Docker or changes its driver.
#
# Usage:
#   bash tests/supabase/flatten-postgres.sh
#   MISSION3_POSTGRES_IMAGE=restomanager-mission3/postgres:17-bookworm-flattened \
#     node tests/supabase/mission3.cjs
#
# The official PostgreSQL 17.11 filesystem is merged into one streamed layer.
# Entrypoint, command, environment, declared data volume/port and stop signal are
# preserved. The local image digest/history differ and provenance labels are added.
# Any removal of an unused original image is a separate, explicit operator action.
set -euo pipefail

readonly upstream='docker.io/library/postgres@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994'
readonly index_digest='sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994'
readonly amd64_digest='sha256:73bedc9eaa0121b92b9b26bb52e5141b3f6f37479c7ef913c0160455763ca80a'
readonly destination='restomanager-mission3/postgres:17-bookworm-flattened'

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

work="$(mktemp -d "${TMPDIR:-/tmp}/restomanager-postgres-image.XXXXXXXX")"
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
for field, value in official['config'].items():
    if image['Config'].get(field) != value:
        raise SystemExit('Runtime config mismatch: ' + field)
for field in ('User', 'WorkingDir'):
    if official['config'].get(field, '') != image['Config'].get(field, ''):
        raise SystemExit('Runtime config mismatch: ' + field)
if len(image['RootFS']['Layers']) != 1:
    raise SystemExit('Expected exactly one imported filesystem layer.')
if image['Config'].get('Labels', {}).get('restomanager.upstream.image') != sys.argv[3]:
    raise SystemExit('Existing destination lacks the expected upstream provenance label.')
print('Verified one-layer image:', image['Id'])
print('Verified all official config fields, including data volume, port and stop signal.')
PY
}

if local_docker image inspect "$destination" >/dev/null 2>&1; then
  validate_image
  echo "Already prepared: $destination"
  exit 0
fi

python3 - "$work/official-config.json" "$upstream" > "$work/changes.nul" <<'PY'
import json, re, sys
config = json.load(open(sys.argv[1], encoding='utf-8'))['config']
allowed = {'Env', 'Entrypoint', 'Cmd', 'ExposedPorts', 'Volumes', 'StopSignal'}
unsupported = set(config) - allowed
if unsupported:
    raise SystemExit('Unhandled upstream config fields: ' + ', '.join(sorted(unsupported)))
changes = [name.upper() + ' ' + json.dumps(config[name], separators=(',', ':'))
           for name in ('Entrypoint', 'Cmd')]
for item in config['Env']:
    key, value = item.split('=', 1)
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or '\n' in value or '\r' in value:
        raise SystemExit('Unexpected environment entry in upstream config.')
    changes.append('ENV ' + key + '=' + json.dumps(value))
for port in sorted(config['ExposedPorts']):
    if not re.fullmatch(r'\d+/(tcp|udp|sctp)', port):
        raise SystemExit('Unexpected exposed port in upstream config.')
    changes.append('EXPOSE ' + port)
changes.append('VOLUME ' + json.dumps(sorted(config['Volumes']), separators=(',', ':')))
if not re.fullmatch(r'SIG[A-Z0-9]+', config['StopSignal']):
    raise SystemExit('Unexpected stop signal in upstream config.')
changes.append('STOPSIGNAL ' + config['StopSignal'])
changes += ['LABEL restomanager.mission=3-isolated-test',
            'LABEL restomanager.upstream.image=' + sys.argv[2]]
sys.stdout.buffer.write(b''.join(change.encode() + b'\0' for change in changes))
PY

mapfile -d '' -t changes < "$work/changes.nul"
import_options=()
for change in "${changes[@]}"; do import_options+=(--change "$change"); done

crane export --platform linux/amd64 "$upstream" - | \
  local_docker import --platform linux/amd64 "${import_options[@]}" - "$destination"
validate_image
printf 'Prepared %s\nSet MISSION3_POSTGRES_IMAGE=%s for the isolated tests.\n' "$destination" "$destination"
