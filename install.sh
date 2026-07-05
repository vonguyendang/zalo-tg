#!/usr/bin/env sh
set -eu

APP_NAME="zalo-tg"
APP_VERSION="1.0.0"
MIN_NODE="20.11.0"
MIN_GO="1.24.0"
REPO_URL="${ZALO_TG_REPO:-https://github.com/williamcachamwri/zalo-tg.git}"
RAW_INSTALL_URL="https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh"
DEFAULT_INSTALL_DIR="${HOME:-${USERPROFILE:-.}}/${APP_NAME}"
INSTALL_DIR="${ZALO_TG_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

ASSUME_YES=0
DRY_RUN=0
SKIP_NPM=0
SKIP_TUI=0
RUN_CHECK=0

if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  RESET="$(printf '\033[0m')"
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  RED="$(printf '\033[31m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  BLUE="$(printf '\033[34m')"
  MAGENTA="$(printf '\033[35m')"
  CYAN="$(printf '\033[36m')"
  WHITE="$(printf '\033[37m')"
else
  RESET="" BOLD="" DIM="" RED="" GREEN="" YELLOW="" BLUE="" MAGENTA="" CYAN="" WHITE=""
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --skip-npm) SKIP_NPM=1 ;;
    --skip-tui) SKIP_TUI=1 ;;
    --check) RUN_CHECK=1 ;;
    --dir)
      shift
      if [ "$#" -eq 0 ]; then
        printf '%s\n' "${RED}Missing value for --dir${RESET}" >&2
        exit 2
      fi
      INSTALL_DIR=$1
      ;;
    --repo)
      shift
      if [ "$#" -eq 0 ]; then
        printf '%s\n' "${RED}Missing value for --repo${RESET}" >&2
        exit 2
      fi
      REPO_URL=$1
      ;;
    -h|--help)
      cat <<EOF
${APP_NAME} installer

Usage:
  sh install.sh [options]
  curl -fsSL ${RAW_INSTALL_URL} | sh
  curl -fsSL ${RAW_INSTALL_URL} | sh -s -- --yes

Options:
  -y, --yes       Accept default choices
  --dry-run       Show what would run without changing files
  --dir <path>    Install/checkout directory for curl installs
                  Default: ${INSTALL_DIR}
  --repo <url>    Git repository to clone
                  Default: ${REPO_URL}
  --skip-npm      Skip npm dependency install
  --skip-tui      Skip Go/Charmbracelet TUI build
  --check         Run npm run check after install
  -h, --help      Show this help

Environment:
  ZALO_TG_INSTALL_DIR  Same as --dir
  ZALO_TG_REPO         Same as --repo
EOF
      exit 0
      ;;
    *)
      printf '%s\n' "${RED}Unknown option:${RESET} $1" >&2
      exit 2
      ;;
  esac
  shift
done

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd || pwd)
CALL_DIR=$(pwd)
ROOT_DIR=$SCRIPT_DIR
BOOTSTRAP_MODE=0
OS_FAMILY="unknown"
OS_NAME="Unknown OS"

LOG_FILE="${TMPDIR:-/tmp}/zalo-tg-install.$$.log"
trap 'rm -f "$LOG_FILE"' EXIT INT TERM

line() {
  cols=${COLUMNS:-80}
  char=${1:-─}
  awk -v n="$cols" -v c="$char" 'BEGIN { for (i = 0; i < n; i++) printf c; printf "\n" }'
}

paint_status() {
  label=$1
  color=$2
  printf '%s%s%s' "$color" "$label" "$RESET"
}

header() {
  if [ -t 1 ]; then
    printf '\033[2J\033[H'
  fi
  printf '%s\n' "${DIM}$(line "─")${RESET}"
  printf '  %s●%s %s%s%s %s/%s installer %s%s%s\n' \
    "$GREEN" "$RESET" "$BOLD" "$APP_NAME" "$RESET" "$DIM" "$RESET" "$DIM" "v$APP_VERSION" "$RESET"
  printf '  %sZalo ⇄ Telegram bridge setup%s\n' "$DIM" "$RESET"
  printf '%s\n\n' "${DIM}$(line "─")${RESET}"
}

section() {
  printf '\n%s%s%s\n' "$BOLD" "$1" "$RESET"
  printf '%s\n' "${DIM}$(line "·")${RESET}"
}

note() {
  printf '  %s◆%s %s\n' "$CYAN" "$RESET" "$1"
}

ok() {
  printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"
}

warn() {
  printf '  %s▲%s %s\n' "$YELLOW" "$RESET" "$1"
}

fail() {
  printf '  %s×%s %s\n' "$RED" "$RESET" "$1" >&2
}

need_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

detect_os() {
  kernel=$(uname -s 2>/dev/null || printf 'unknown')
  case "$kernel" in
    Darwin*) OS_FAMILY="macos"; OS_NAME="macOS" ;;
    Linux*) OS_FAMILY="linux"; OS_NAME="Linux" ;;
    CYGWIN*|MINGW*|MSYS*) OS_FAMILY="windows"; OS_NAME="Windows" ;;
    *) OS_FAMILY="unknown"; OS_NAME="$kernel" ;;
  esac
}

tool_hint() {
  tool=$1
  case "$OS_FAMILY:$tool" in
    macos:git) warn "Install Git on macOS: xcode-select --install  # or: brew install git" ;;
    macos:node|macos:npm) warn "Install Node.js/npm on macOS: brew install node" ;;
    macos:go) warn "Install Go on macOS: brew install go" ;;
    linux:git) warn "Install Git on Linux, e.g. Debian/Ubuntu: sudo apt-get update && sudo apt-get install -y git" ;;
    linux:node|linux:npm) warn "Install Node.js/npm on Linux, e.g. Debian/Ubuntu: sudo apt-get install -y nodejs npm" ;;
    linux:go) warn "Install Go on Linux, e.g. Debian/Ubuntu: sudo apt-get install -y golang-go" ;;
    windows:git) warn "Install Git on Windows: winget install Git.Git  # then run this in Git Bash/WSL" ;;
    windows:node|windows:npm) warn "Install Node.js/npm on Windows: winget install OpenJS.NodeJS" ;;
    windows:go) warn "Install Go on Windows: winget install GoLang.Go" ;;
    *) warn "Install $tool and re-run this installer." ;;
  esac
}

version_ge() {
  current=$1
  minimum=$2
  awk -v cur="$current" -v min="$minimum" '
    BEGIN {
      split(cur, c, "."); split(min, m, ".");
      for (i = 1; i <= 3; i++) {
        cv = c[i] + 0; mv = m[i] + 0;
        if (cv > mv) exit 0;
        if (cv < mv) exit 1;
      }
      exit 0;
    }'
}

confirm() {
  prompt=$1
  default=${2:-Y}
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -t 0 ]; then
    printf '  %s?%s %s %s[%s]%s\n' "$MAGENTA" "$RESET" "$prompt" "$DIM" "$default" "$RESET"
    return 0
  fi
  suffix="[Y/n]"
  [ "$default" = "N" ] && suffix="[y/N]"
  printf '  %s?%s %s %s%s%s ' "$MAGENTA" "$RESET" "$prompt" "$DIM" "$suffix" "$RESET"
  read ans || ans=""
  [ "$ans" = "" ] && ans=$default
  case "$ans" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

run_cmd() {
  title=$1
  shift
  printf '  %s…%s %s\n' "$BLUE" "$RESET" "$title"
  printf '    %s$ %s%s\n' "$DIM" "$*" "$RESET"
  if [ "$DRY_RUN" -eq 1 ]; then
    ok "dry-run: skipped"
    return 0
  fi
  if "$@" >"$LOG_FILE" 2>&1; then
    ok "$title"
    return 0
  fi
  fail "$title failed"
  printf '%s\n' "${DIM}$(line "─")${RESET}" >&2
  sed -n '1,160p' "$LOG_FILE" >&2
  printf '%s\n' "${DIM}$(line "─")${RESET}" >&2
  exit 1
}

header

detect_os

section "Target"

ok "detected $OS_NAME"

if [ -f "$SCRIPT_DIR/package.json" ]; then
  ROOT_DIR=$SCRIPT_DIR
  ok "using local checkout $ROOT_DIR"
elif [ -f "$CALL_DIR/package.json" ]; then
  ROOT_DIR=$CALL_DIR
  ok "using local checkout $ROOT_DIR"
else
  BOOTSTRAP_MODE=1
  ROOT_DIR=$INSTALL_DIR
  note "curl/bootstrap mode"
  note "repository: $REPO_URL"
  note "install dir: $ROOT_DIR"

  if ! need_cmd git; then
    fail "Git not found; curl install needs Git to clone the repo"
    tool_hint git
    exit 1
  fi

  if [ -d "$ROOT_DIR" ]; then
    if [ -f "$ROOT_DIR/package.json" ]; then
      ok "existing checkout found"
      if [ -d "$ROOT_DIR/.git" ]; then
        if confirm "Update existing checkout with git pull --ff-only?" "Y"; then
          run_cmd "Update existing checkout" git -C "$ROOT_DIR" pull --ff-only
        else
          warn "checkout update skipped"
        fi
      else
        warn "target has package.json but is not a Git checkout; not updating"
      fi
    else
      fail "target directory exists but does not look like $APP_NAME: $ROOT_DIR"
      warn "Choose another path with: ZALO_TG_INSTALL_DIR=/path sh install.sh"
      exit 1
    fi
  else
    parent_dir=$(dirname "$ROOT_DIR")
    run_cmd "Create install parent" mkdir -p "$parent_dir"
    run_cmd "Clone repository" git clone "$REPO_URL" "$ROOT_DIR"
    if [ "$DRY_RUN" -eq 1 ]; then
      warn "dry-run stopped before workspace setup because checkout was not created"
      exit 0
    fi
  fi
fi

cd "$ROOT_DIR"

section "System"

if need_cmd node; then
  NODE_VERSION=$(node -p "process.versions.node" 2>/dev/null || printf '0.0.0')
  if version_ge "$NODE_VERSION" "$MIN_NODE"; then
    ok "Node.js $NODE_VERSION"
  else
    fail "Node.js $NODE_VERSION found; need >= $MIN_NODE"
    tool_hint node
    exit 1
  fi
else
  fail "Node.js not found; install Node.js >= $MIN_NODE"
  tool_hint node
  exit 1
fi

if need_cmd npm; then
  ok "npm $(npm -v)"
else
  fail "npm not found"
  tool_hint npm
  exit 1
fi

if [ "$SKIP_TUI" -eq 0 ]; then
  if need_cmd go; then
    GO_VERSION=$(go env GOVERSION 2>/dev/null | sed 's/^go//')
    if version_ge "$GO_VERSION" "$MIN_GO"; then
      ok "Go $GO_VERSION"
    else
      warn "Go $GO_VERSION found; TUI build expects >= $MIN_GO"
      tool_hint go
      if ! confirm "Continue and skip TUI build?" "Y"; then
        exit 1
      fi
      SKIP_TUI=1
    fi
  else
    warn "Go not found; Charmbracelet TUI sidecar will be skipped"
    tool_hint go
    SKIP_TUI=1
  fi
else
  warn "TUI build skipped by flag"
fi

section "Project"

if [ ! -f package.json ]; then
  fail "package.json not found in $ROOT_DIR"
  exit 1
fi
if [ "$BOOTSTRAP_MODE" -eq 1 ]; then
  ok "workspace $ROOT_DIR (bootstrapped)"
else
  ok "workspace $ROOT_DIR"
fi

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    if confirm "Create .env from .env.example?" "Y"; then
      if [ "$DRY_RUN" -eq 1 ]; then
        ok "dry-run: would copy .env.example to .env"
      else
        cp .env.example .env
        ok "created .env"
      fi
    else
      warn ".env not created"
    fi
  else
    warn ".env.example not found; create .env manually"
  fi
else
  ok ".env exists; leaving it untouched"
fi

section "Install"

if [ "$SKIP_NPM" -eq 0 ]; then
  if [ -f package-lock.json ]; then
    run_cmd "Install npm dependencies" npm ci
  else
    run_cmd "Install npm dependencies" npm install
  fi
else
  warn "npm dependency install skipped"
fi

if [ "$SKIP_TUI" -eq 0 ]; then
  run_cmd "Build Charmbracelet TUI sidecar" npm run tui:build
else
  warn "TUI sidecar build skipped; app will use ANSI fallback unless bin/zalo-tg-tui already exists"
fi

run_cmd "Build TypeScript" npm run build

if [ "$RUN_CHECK" -eq 1 ]; then
  run_cmd "Run full check" npm run check
fi

section "Done"

ok "Installation complete"
note "Edit .env with TG_TOKEN and TG_GROUP_ID before starting."
note "Start development mode: ${BOLD}npm run dev${RESET}"
note "Build the TUI again later: ${BOLD}npm run tui:build${RESET}"

if grep -q '^LOCAL_BOT_API=1' .env 2>/dev/null; then
  warn "LOCAL_BOT_API=1 detected. Start it with: docker compose up -d telegram-bot-api"
fi

printf '\n%s\n' "${DIM}$(line "─")${RESET}"
