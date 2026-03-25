#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/jobc90/claudex-power-commands.git"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}"
SRC_ROOT="${CACHE_ROOT}/claudex-power-commands"
CLAUDE_DIR="${HOME}/.claude"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
CODEX_SKILLS_DIR="${CODEX_HOME_DIR}/skills"

COMMANDS=(check cowork super docs design)
RULES=(code-quality git-conventions plugins-catalog security-checklist verification)

if [[ -d "${SRC_ROOT}/.git" ]]; then
  git -C "${SRC_ROOT}" fetch --depth 1 origin main
  git -C "${SRC_ROOT}" reset --hard origin/main
else
  mkdir -p "${CACHE_ROOT}"
  git clone --depth 1 "${REPO_URL}" "${SRC_ROOT}"
fi

mkdir -p "${CLAUDE_DIR}/commands" "${CLAUDE_DIR}/rules" "${CODEX_SKILLS_DIR}"

for command in "${COMMANDS[@]}"; do
  cp "${SRC_ROOT}/commands/${command}.md" "${CLAUDE_DIR}/commands/${command}.md"
done

for rule in "${RULES[@]}"; do
  cp "${SRC_ROOT}/rules/${rule}.md" "${CLAUDE_DIR}/rules/${rule}.md"
done

for skill in "${COMMANDS[@]}"; do
  rm -rf "${CODEX_SKILLS_DIR:?}/${skill}"
  cp -R "${SRC_ROOT}/codex-skills/${skill}" "${CODEX_SKILLS_DIR}/${skill}"
done

echo "Synced claudex-power-commands from ${SRC_ROOT}"
echo "Claude commands:"
printf '  - %s\n' "${COMMANDS[@]}"
echo "Claude rules:"
printf '  - %s\n' "${RULES[@]}"
echo "Codex skills:"
printf '  - %s\n' "${COMMANDS[@]}"
