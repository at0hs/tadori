import { useRef, useState } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

// タグの入力（ui.md 7.5）。既存のタグから選ぶか、入力して Enter で足す。
// 変換中の Enter と、候補を強調しているときの Enter はアプリで足さない（library-checks UI-05・UI-06）。
export function TagInput({
  value,
  onChange,
  suggestions,
  id,
  invalid,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  id?: string;
  invalid?: boolean;
}) {
  const [input, setInput] = useState("");
  const highlighted = useRef<string | undefined>(undefined);
  const anchor = useComboboxAnchor();
  const items = [...new Set([...suggestions, ...value])];

  return (
    <Combobox
      multiple
      items={items}
      value={value}
      inputValue={input}
      onInputValueChange={setInput}
      onValueChange={(v) => onChange(v as string[])}
      onItemHighlighted={(v) => {
        highlighted.current = v as string | undefined;
      }}
    >
      <ComboboxChips ref={anchor} className="bg-card">
        <ComboboxValue>
          {(vals: string[]) => vals.map((t) => <ComboboxChip key={t}>{t}</ComboboxChip>)}
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          aria-invalid={invalid || undefined}
          placeholder="タグを追加（既存のタグから選ぶか、入力して Enter）"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            if (highlighted.current !== undefined) return;
            const t = input.trim();
            if (!t) return;
            e.preventDefault();
            if (!value.includes(t)) onChange([...value, t]);
            setInput("");
          }}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>候補はありません（Enter で新しいタグとして足します）</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
