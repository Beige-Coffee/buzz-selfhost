# Resolve the image before any smoke test contacts or changes a server: its tag, its digest, and
# the block/buzz commit it was built from, where the Compose bundle is checked out.
# A tag is sha-<7 hex>, which names its own commit, or a release such as 0.3.0, which does not.

# valid_image_tag TAG
valid_image_tag() {
  [[ $1 =~ ^sha-[0-9a-f]{7}$ || $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# skill_metadata KEY SKILL_FILE: one value from SKILL.md's metadata, as the skill's own awk reads it
skill_metadata() {
  awk -v key="  $1:" 'index($0, key) == 1 {print $2}' "$2"
}

# default_image_tag SKILL_FILE: the image the skill recommends, which every driver defaults to
default_image_tag() {
  local tag
  tag=$(skill_metadata tested-image "$1") || return 2
  valid_image_tag "$tag" || {
    echo 'SKILL.md needs a tested-image: sha- and seven hexadecimal characters, or a release such as 0.3.0' >&2
    return 2
  }
  printf '%s\n' "$tag"
}

# expected_image_digest TAG OVERRIDE SKILL_FILE
expected_image_digest() {
  local tag=$1 override=$2 skill=$3 pin_tag pin_digest
  valid_image_tag "$tag" || {
    echo 'image tag must be sha- followed by seven lowercase hexadecimal characters, or a release such as 0.3.0' >&2
    return 2
  }
  pin_tag=$(skill_metadata tested-image "$skill") || return 2
  pin_digest=$(skill_metadata tested-digest "$skill") || return 2
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

# expected_image_commit TAG OVERRIDE SKILL_FILE
# SKILL.md gives the commit for the recommended image (tested-commit). An sha- tag names its own
# first seven characters. Any other release needs the exact commit from the caller: a release's
# name says nothing about its source, so nothing here guesses it.
expected_image_commit() {
  local tag=$1 override=$2 skill=$3 pin_tag pin_commit
  valid_image_tag "$tag" || {
    echo 'image tag must be sha- followed by seven lowercase hexadecimal characters, or a release such as 0.3.0' >&2
    return 2
  }
  [[ -z $override || $override =~ ^[0-9a-f]{40}$ ]] || {
    echo 'EXPECTED_COMMIT must be 40 lowercase hexadecimal characters (UPGRADE_EXPECTED_COMMIT for an upgrade)' >&2
    return 2
  }
  pin_tag=$(skill_metadata tested-image "$skill") || return 2
  pin_commit=$(skill_metadata tested-commit "$skill") || return 2
  if [[ $tag == "$pin_tag" ]]; then
    [[ $pin_commit =~ ^[0-9a-f]{40}$ ]] || {
      echo 'SKILL.md needs a 40-character tested-commit for the recommended image' >&2
      return 2
    }
    [[ -z $override || $override == "$pin_commit" ]] || {
      echo 'commit override disagrees with the recommended image in SKILL.md' >&2
      return 2
    }
    override=$pin_commit
  fi
  if [[ $tag == sha-* ]]; then
    [[ -z $override || $override == "${tag#sha-}"* ]] || {
      echo 'the commit disagrees with the sha- tag, which names its first seven characters' >&2
      return 2
    }
    override=${override:-${tag#sha-}}
  fi
  [[ -n $override ]] || {
    echo 'set the exact 40-character EXPECTED_COMMIT for a release image (UPGRADE_EXPECTED_COMMIT for an upgrade)' >&2
    return 2
  }
  printf '%s\n' "$override"
}
