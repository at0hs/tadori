# バックアップのスクリプトが共通で使う関数（operations.md 5〜6章）。bin/ の各コマンドが source する。
# 時刻は TZ（compose で Asia/Tokyo）に従う。接続先は PGHOST・PGUSER・PGDATABASE・PGPASSWORD。

BACKUP_ROOT=${BACKUP_ROOT:-/backups}

log() { echo "$(date '+%F %T') $*"; }
err() { echo "$(date '+%F %T') $*" >&2; }

# BACKUP_TIMES（例："03:00,15:00"）を検証し、並べて重複を除いて1行ずつ出す。
parse_times() {
  local raw="${1//[[:space:]]/}" item
  local -a items
  if [[ -z "$raw" || "$raw" == ,* || "$raw" == *, || "$raw" == *,,* ]]; then
    err "BACKUP_TIMES「$1」が正しくありません。HH:MM をカンマで区切って書いてください（例：03:00,15:00）"
    return 1
  fi
  IFS=',' read -r -a items <<<"$raw"
  for item in "${items[@]}"; do
    if [[ ! "$item" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
      err "BACKUP_TIMES の「$item」は HH:MM（00:00〜23:59、2桁）ではありません"
      return 1
    fi
  done
  printf '%s\n' "${items[@]}" | sort -u
}

# BACKUP_KEEP が1以上の整数か
validate_keep() {
  if [[ ! "$1" =~ ^[1-9][0-9]*$ ]]; then
    err "BACKUP_KEEP「$1」が正しくありません。1以上の整数を書いてください"
    return 1
  fi
}

# now_epoch から、次の実行（並べ済みの時刻のうち now より後の最初のもの。なければ翌日の最初）までの秒。
# ちょうど同じ時刻は「後」に含めない（同じ時刻に2回取らない）。
seconds_until_next() {
  local now="$1" today tomorrow t at
  shift
  today=$(date -d "@$now" +%F)
  for t in "$@"; do
    at=$(date -d "$today $t" +%s)
    if ((at > now)); then
      echo $((at - now))
      return
    fi
  done
  tomorrow=$(date -d "$today + 1 day" +%F)
  at=$(date -d "$tomorrow $1" +%s)
  echo $((at - now))
}

# now_epoch 以前で一番近い実行の時刻（今日のうちになければ前の日の最後の時刻）
previous_slot() {
  local now="$1" today t at prev=""
  shift
  today=$(date -d "@$now" +%F)
  for t in "$@"; do
    at=$(date -d "$today $t" +%s)
    if ((at <= now)); then prev=$at; fi
  done
  if [[ -z "$prev" ]]; then
    prev=$(date -d "$(date -d "$today - 1 day" +%F) ${*: -1}" +%s)
  fi
  echo "$prev"
}

# ダンプの名前（tadori-YYYYMMDD-HHMMSS.dump）の日時
dump_epoch() {
  local name d
  name=$(basename "$1")
  d="${name#tadori-}"
  d="${d%.dump}"
  date -d "${d:0:4}-${d:4:2}-${d:6:2} ${d:9:2}:${d:11:2}:${d:13:2}" +%s
}

# 直前の実行の時刻に取れていなければ 0（ホストが止まっていた・スリープしていたなど）。
# latest は auto/ の一番新しいダンプ（なければ空）。
missed_backup() {
  local now="$1" latest="$2"
  shift 2
  [[ -z "$latest" ]] && return 0
  (($(dump_epoch "$latest") < $(previous_slot "$now" "$@")))
}

# ダンプとして読めるか（形式と目次）を確かめる。root で読んで標準入力から渡す。
check_dump() {
  pg_restore -l <"$1" >/dev/null 2>&1
}

# バックアップと復元を同時に走らせない（復元の途中のダンプや、ダンプの途中の DROP を防ぐ）。
# $BACKUP_ROOT/.lock を fd 9 で flock する。ほかが持っていれば外れるまで待つ。プロセスが終われば外れる。
acquire_lock() {
  mkdir -p "$BACKUP_ROOT"
  exec 9>"$BACKUP_ROOT/.lock"
  if ! flock -n 9; then
    log "ほかのバックアップか復元が終わるのを待つ"
    flock 9
  fi
}

release_lock() {
  flock -u 9
  exec 9>&-
}

# 止められて残った書きかけ（.tadori-….dump.tmp）を消す。ほかが書いている途中のものを消さないよう、ロックを持って呼ぶ。
remove_stale_tmp() {
  local f
  while IFS= read -r f; do
    rm -f -- "$f"
    log "残っていた書きかけを消した：$f"
  done < <(find "$BACKUP_ROOT/auto" "$BACKUP_ROOT/manual" -maxdepth 1 -type f -name '.tadori-*.dump.tmp' 2>/dev/null)
}

# dir にダンプを取り、そのパスを出す。書きかけは一時的な名前にし、成功してから本来の名前に変える。
# 呼び出し側は `if path=$(dump_to …)` の形で使い、そこでは set -e が効かないので、失敗はすべて return 1 で返す。
dump_to() {
  local dir="$1" name tmp
  mkdir -p "$dir"
  name="tadori-$(date +%Y%m%d-%H%M%S).dump"
  # 同じ秒に2回取ったときに上書きしない
  while [[ -e "$dir/$name" ]]; do
    sleep 1
    name="tadori-$(date +%Y%m%d-%H%M%S).dump"
  done
  tmp="$dir/.$name.tmp"
  if ! pg_dump -Fc -f "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  if ! mv "$tmp" "$dir/$name"; then
    err "書きかけを本来の名前に変えられなかった：$tmp"
    rm -f "$tmp"
    return 1
  fi
  echo "$dir/$name"
}

# 自動のバックアップを dir に取り、成功したら古いものを消す。失敗したら間を置いてやり直す。
# Docker の再起動で backup が db より先に起動したとき（compose の depends_on が効かない）や、
# 一時的な失敗で、次の時刻（既定では翌日）までバックアップがない状態を避けるため。
# 間隔は BACKUP_RETRY_DELAYS（秒、空白区切り。既定で合わせて約19分）。ロックは試すたびに取り、待つ間は外す。
backup_with_retry() {
  local dir="$1" keep="$2" path delay attempt=1
  local -a delays
  read -r -a delays <<<"${BACKUP_RETRY_DELAYS:-10 30 60 120 300 600}"
  while true; do
    acquire_lock
    if path=$(dump_to "$dir"); then
      log "バックアップを取った：$path"
      rotate "$dir" "$keep"
      release_lock
      return 0
    fi
    release_lock
    if ((attempt > ${#delays[@]})); then
      err "バックアップに失敗した。やり直しをやめる（古いバックアップは消していない）"
      return 1
    fi
    delay=${delays[attempt - 1]}
    err "バックアップに失敗した。${delay}秒後にやり直す（${attempt}/${#delays[@]}）"
    # 裏で sleep して wait する（呼び出し側の TERM をすぐ受け取るため）
    sleep "$delay" &
    wait $!
    attempt=$((attempt + 1))
  done
}

# dir のダンプのうち新しい keep 個を残し、古いものを消す。書きかけ（.tmp）は数えない。
rotate() {
  local dir="$1" keep="$2" i
  local -a files
  mapfile -t files < <(find "$dir" -maxdepth 1 -type f -name 'tadori-*.dump' -printf '%f\n' | sort)
  for ((i = 0; i < ${#files[@]} - keep; i++)); do
    rm -f -- "${dir:?}/${files[i]}"
    log "古いバックアップを消した：${files[i]}"
  done
}

# コマンドに渡されたダンプの指定をパスにする。空なら一番新しいもの。
# 「manual/tadori-….dump」のようにバックアップの置き場からの相対でも指定できる。
resolve_dump() {
  local given="$1"
  if [[ -z "$given" ]]; then
    latest_dump "$BACKUP_ROOT"
  elif [[ -f "$given" ]]; then
    echo "$given"
  elif [[ -f "$BACKUP_ROOT/$given" ]]; then
    echo "$BACKUP_ROOT/$given"
  else
    err "ダンプ「$given」がありません"
    return 1
  fi
}

# root の auto/ と manual/ のダンプのうち、名前の日時が一番新しいもののパス
latest_dump() {
  local root="$1" latest
  latest=$(find "$root/auto" "$root/manual" -maxdepth 1 -type f -name 'tadori-*.dump' -printf '%f\t%p\n' 2>/dev/null |
    sort | tail -n 1 | cut -f 2)
  if [[ -z "$latest" ]]; then
    err "$root にバックアップがありません"
    return 1
  fi
  echo "$latest"
}
