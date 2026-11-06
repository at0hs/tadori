import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root がない");

// 仮の画面。Task 3 でルーターに置き換える。
createRoot(root).render(
  <StrictMode>
    <main className="p-8">
      <Button>Tadori</Button>
    </main>
  </StrictMode>,
);
