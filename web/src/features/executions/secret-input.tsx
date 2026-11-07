import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/** 秘密変数の値の欄。パスワード形式と表示のボタン（ui.md 8.2・8.6）。 */
export function SecretInput(props: Omit<ComponentProps<typeof InputGroupInput>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput
        type={shown ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        placeholder="値を貼り付け"
        className="font-mono"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? "値を隠す" : "値を表示"}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
