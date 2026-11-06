import { CloudOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state.tsx";
import { Button } from "@/components/ui/button";

// 画面を描けないエラー（API が止まっているなど）のときの表示。ルーターの既定の英語の画面の代わり。
export function ErrorScreen() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <EmptyState
        icon={CloudOff}
        title="画面を読み込めませんでした"
        description="サーバーにつながらないか、エラーが発生しました。時間をおいて試してください。"
        action={
          <Button variant="outline" onClick={() => window.location.reload()}>
            再読み込み
          </Button>
        }
      />
    </div>
  );
}
