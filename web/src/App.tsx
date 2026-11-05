import { useEffect, useState } from "react";

// 雛形の確認用。画面は TanStack Router を入れるときに置き換える。
export function App() {
  const [status, setStatus] = useState("確認中");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus("API に接続できない"));
  }, []);

  return (
    <main>
      <h1>Tadori</h1>
      <p>API: {status}</p>
    </main>
  );
}
