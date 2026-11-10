import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard.ts";
import { versionQueryOptions } from "./queries.ts";

// 「Tadori について」のダイアログ（ui.md 2章、D-69）。問い合わせのときに版と SHA を伝えられるようにする。

export const SOURCE_URL = "https://github.com/at0hs/tadori";
const LICENSES_URL = "/THIRD_PARTY_LICENSES.txt";

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isError, refetch } = useQuery(versionQueryOptions);
  const [copied, setCopied] = useState(false);

  // 取り直しは自動ではしない（staleTime が無限）ので、取れなかったときは開くたびに取り直す
  useEffect(() => {
    if (open && isError) void refetch();
  }, [open, isError, refetch]);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    if (!data) return;
    try {
      await copyText(`${data.version} (${data.commit})`);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Tadori について</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">バージョン</dt>
          <dd>{data ? data.version : isError ? "取得できませんでした" : "…"}</dd>
          <dt className="text-muted-foreground">コミット</dt>
          <dd className="flex items-center gap-1">
            {data ? (
              <>
                <code data-testid="about-commit" className="font-mono">
                  {data.commit}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={copied ? "コピーしました" : "版とコミットをコピー"}
                  title="版とコミットをコピー"
                  onClick={() => void copy()}
                >
                  {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
                </Button>
              </>
            ) : isError ? (
              "取得できませんでした"
            ) : (
              "…"
            )}
          </dd>
          <dt className="text-muted-foreground">ライセンス</dt>
          <dd>MIT</dd>
          <dt className="text-muted-foreground">ソース</dt>
          <dd>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              github.com/at0hs/tadori
            </a>
          </dd>
        </dl>
        {copyFailed && (
          <p role="alert" className="text-xs text-destructive">
            コピーできませんでした。文字を選んでコピーしてください。
          </p>
        )}
        <a
          href={LICENSES_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          使っているライブラリのライセンス
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </DialogContent>
    </Dialog>
  );
}
