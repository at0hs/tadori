#!/usr/bin/env bash
# backup/lib.sh のテスト。backup のイメージの中で動かす：
#   docker compose run --rm -T backup bash /opt/tadori/test/lib.test.sh
set -uo pipefail
export TZ=Asia/Tokyo
# shellcheck source=../lib.sh
source "$(dirname "$0")/../lib.sh"

failures=0
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name：期待 [$expected]、実際 [$actual]"
    failures=$((failures + 1))
  fi
}
# コマンドが失敗する（0 以外で終わる）こと
assert_fails() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL $name：成功してしまった"
    failures=$((failures + 1))
  else
    echo "ok   $name"
  fi
}
epoch() { date -d "$1" +%s; }

# parse_times
assert_eq "時刻の空白・重複・並びを整える" $'03:00\n15:00' "$(parse_times "15:00, 03:00,03:00")"
assert_eq "時刻1つ" "03:00" "$(parse_times "03:00")"
for bad in "3:00" "24:00" "03:60" "" "03:00,," ",03:00" "03:00;15:00" "abc"; do
  assert_fails "誤った時刻を断る（$bad）" parse_times "$bad"
done

# validate_keep
assert_fails "残す数 0 を断る" validate_keep 0
assert_fails "残す数 -1 を断る" validate_keep -1
assert_fails "残す数 a を断る" validate_keep a
assert_fails "残す数の空を断る" validate_keep ""
assert_fails "残す数 07 を断る" validate_keep 07
if validate_keep 7; then echo "ok   残す数 7"; else echo "FAIL 残す数 7"; failures=$((failures + 1)); fi

# seconds_until_next
assert_eq "時刻の1分前" 60 "$(seconds_until_next "$(epoch "2026-11-08 02:59:00")" 03:00)"
assert_eq "ちょうどの時刻なら翌日" 86400 "$(seconds_until_next "$(epoch "2026-11-08 03:00:00")" 03:00)"
assert_eq "日付をまたぐ" 10860 "$(seconds_until_next "$(epoch "2026-11-08 23:59:00")" 03:00)"
assert_eq "複数の時刻のうち次" 3600 "$(seconds_until_next "$(epoch "2026-11-08 14:00:00")" 03:00 15:00)"
assert_eq "月をまたぐ" 10800 "$(seconds_until_next "$(epoch "2026-11-30 15:00:00")" 03:00 15:00 18:00)"

# previous_slot・dump_epoch・missed_backup（ホストが止まっていた時刻の取り直し）
assert_eq "今日のうち直前の時刻" "$(epoch "2026-11-08 03:00:00")" "$(previous_slot "$(epoch "2026-11-08 14:00:00")" 03:00 15:00)"
assert_eq "ちょうどの時刻はその時刻" "$(epoch "2026-11-08 15:00:00")" "$(previous_slot "$(epoch "2026-11-08 15:00:00")" 03:00 15:00)"
assert_eq "今日の最初より前なら前の日の最後" "$(epoch "2026-11-07 15:00:00")" "$(previous_slot "$(epoch "2026-11-08 02:00:00")" 03:00 15:00)"
assert_eq "ダンプの名前から日時" "$(epoch "2026-11-08 03:00:05")" "$(dump_epoch /backups/auto/tadori-20261108-030005.dump)"
now=$(epoch "2026-11-08 09:00:00")
if missed_backup "$now" "" 03:00; then echo "ok   ダンプがなければ取る"; else echo "FAIL ダンプがなければ取る"; failures=$((failures + 1)); fi
if missed_backup "$now" /b/auto/tadori-20261107-030000.dump 03:00; then echo "ok   直前の時刻より古ければ取る"; else echo "FAIL 直前の時刻より古ければ取る"; failures=$((failures + 1)); fi
assert_fails "直前の時刻に取れていれば取らない" missed_backup "$now" /b/auto/tadori-20261108-030001.dump 03:00

# check_dump（壊れたダンプを断る）
dir=$(mktemp -d)
echo "not a dump" >"$dir/broken.dump"
assert_fails "壊れたダンプを断る" check_dump "$dir/broken.dump"
rm -rf "$dir"

# rotate
dir=$(mktemp -d)
for d in 01 02 03 04 05 06 07 08 09; do touch "$dir/tadori-202611${d}-030000.dump"; done
touch "$dir/.tadori-20261110-030000.dump.tmp"
rotate "$dir" 7 >/dev/null
assert_eq "古い2つだけ消す" "tadori-20261103-030000.dump" "$(find "$dir" -name 'tadori-*.dump' -printf '%f\n' | sort | head -1)"
assert_eq "7つ残る" 7 "$(find "$dir" -name 'tadori-*.dump' | wc -l)"
assert_eq "書きかけは数えず消さない" 1 "$(find "$dir" -name '*.tmp' | wc -l)"
rm -rf "$dir"

# latest_dump
dir=$(mktemp -d)
mkdir -p "$dir/auto" "$dir/manual"
assert_fails "ダンプがなければ失敗" latest_dump "$dir"
touch "$dir/auto/tadori-20261108-030000.dump" "$dir/manual/tadori-20261108-101500.dump"
touch "$dir/auto/.tadori-20261108-120000.dump.tmp"
assert_eq "auto と manual のうち一番新しい" "$dir/manual/tadori-20261108-101500.dump" "$(latest_dump "$dir")"

# resolve_dump
assert_eq "指定がなければ一番新しい" "$dir/manual/tadori-20261108-101500.dump" "$(BACKUP_ROOT="$dir" resolve_dump "")"
assert_eq "置き場からの相対で指定できる" "$dir/auto/tadori-20261108-030000.dump" "$(BACKUP_ROOT="$dir" resolve_dump auto/tadori-20261108-030000.dump)"
assert_eq "絶対パスで指定できる" "$dir/auto/tadori-20261108-030000.dump" "$(BACKUP_ROOT="$dir" resolve_dump "$dir/auto/tadori-20261108-030000.dump")"
assert_fails "ないダンプを断る" env BACKUP_ROOT="$dir" bash -c "source $(dirname "$0")/../lib.sh; resolve_dump auto/nope.dump"
rm -rf "$dir"

# dump_to（pg_dump と mv を関数で差し替える。関数はコマンド置換の中にも引き継がれる）
dir=$(mktemp -d)
pg_dump() { echo dump >"$3"; }
mv() { return 1; }
assert_fails "名前を変えられなければ失敗" dump_to "$dir"
assert_eq "名前を変えられなければ一時ファイルを消す" 0 "$(find "$dir" -type f | wc -l)"
unset -f mv
assert_eq "成功したらダンプのパスを出す" 1 "$(dump_to "$dir" | grep -c "^$dir/tadori-.*\.dump$")"
pg_dump() { echo dump >"$3"; return 1; }
assert_fails "pg_dump が失敗したら失敗" dump_to "$dir"
assert_eq "pg_dump が失敗したら一時ファイルを消す" 0 "$(find "$dir" -name '*.tmp' | wc -l)"
unset -f pg_dump
rm -rf "$dir"

# remove_stale_tmp（止められて残った書きかけを消す）
dir=$(mktemp -d)
mkdir -p "$dir/auto" "$dir/manual"
touch "$dir/auto/.tadori-20261108-030000.dump.tmp" "$dir/manual/.tadori-20261108-101500.dump.tmp"
touch "$dir/auto/tadori-20261107-030000.dump" "$dir/auto/other.tmp"
BACKUP_ROOT="$dir" remove_stale_tmp >/dev/null
assert_eq "書きかけだけ消す" $'other.tmp\ntadori-20261107-030000.dump' "$(find "$dir" -type f -printf '%f\n' | sort)"
rm -rf "$dir"

# acquire_lock（バックアップと復元を同時に走らせない）
dir=$(mktemp -d)
(BACKUP_ROOT="$dir" acquire_lock >/dev/null && sleep 3) &
holder=$!
sleep 1
assert_fails "ほかが持っている間は取れない" flock -n "$dir/.lock" true
start=$(date +%s)
(BACKUP_ROOT="$dir" acquire_lock >/dev/null)
assert_eq "ほかが外すまで待つ" 1 "$(($(date +%s) - start >= 1 ? 1 : 0))"
wait "$holder"
(BACKUP_ROOT="$dir" acquire_lock >/dev/null && release_lock)
if flock -n "$dir/.lock" true; then echo "ok   外したら取れる"; else echo "FAIL 外したら取れる"; failures=$((failures + 1)); fi
rm -rf "$dir"

if ((failures > 0)); then
  echo "$failures 件の失敗"
  exit 1
fi
echo "すべて通った"
