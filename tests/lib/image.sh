# Resolve the digest before any smoke test contacts or changes a server.
# expected_image_digest TAG OVERRIDE SKILL_FILE
expected_image_digest() {
  local tag=$1 override=$2 skill=$3 pin_tag pin_digest
  [[ $tag =~ ^sha-[0-9a-f]{7}$ ]] || {
    echo 'image tag must be sha- followed by seven lowercase hexadecimal characters' >&2
    return 2
  }
  pin_tag=$(awk '/^  tested-image:/ {print $2}' "$skill") || return 2
  pin_digest=$(awk '/^  tested-digest:/ {print $2}' "$skill") || return 2
  if [[ $tag == "$pin_tag" ]]; then
    [[ -z $override || $override == "$pin_digest" ]] || {
      echo 'digest override disagrees with the recommended image in SKILL.md' >&2
      return 2
    }
    override=$pin_digest
  fi
  [[ $override =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo 'set an exact EXPECTED_DIGEST for a nondefault image (UPGRADE_EXPECTED_DIGEST for an upgrade)' >&2
    return 2
  }
  printf '%s\n' "$override"
}
