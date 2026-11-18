"use client";

// A widget's settings (spec 47), opened by a click on a widget while editing: a preview, its size, and
// for the weather where it is for (where you are, or a city it always shows, R48), for a goal widget
// which goal. Changes go into the list being edited; "Done" on the grid saves it (save_widgets, R47).
import { useId, useState } from "react";
import { Check, MapPin, Navigation, Trash2 } from "lucide-react";
import { AddressField } from "@/components/places/AddressField";
import { GoalTile } from "@/components/goals/GoalTile";
import { buttonClass } from "@/components/ui/Button";
import { pack, resized } from "@/lib/widgets/layout";
import { MAX_CITY_LENGTH, SIZES_OF, WIDGET_NAMES, type WidgetItem, type WidgetSize } from "@/lib/widgets/types";
import { WidgetDialog } from "./Dialog";
import { pxOf } from "./Gallery";
import { renderWidget, type WidgetContext } from "./grid";

const SIZE_NAMES: Record<WidgetSize, string> = { "1x1": "Small", "3x1": "Wide", "3x2": "Medium", "3x4": "Large" };

/** The size can change to `size` when the list still fits the full grid and this widget this screen. */
function sizeFits(list: WidgetItem[], index: number, size: WidgetSize, rows: number): boolean {
  const changed = list.map((w, i) => (i === index ? resized(w, size) : w));
  return pack(changed).hidden.length === 0 && !pack(changed, rows).hidden.includes(index);
}

export function WidgetSettings({
  draft,
  index,
  rows,
  ctx,
  onChange,
  onRemove,
  onClose,
}: {
  draft: WidgetItem[];
  /** The widget being set up, by its place in the list; null: the dialog is closed. */
  index: number | null;
  rows: number;
  ctx: WidgetContext;
  onChange: (item: WidgetItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const item = index === null ? null : (draft[index] ?? null);
  return (
    <WidgetDialog
      open={item !== null}
      onClose={onClose}
      titleId={titleId}
      width="md:max-w-md"
      title={item ? WIDGET_NAMES[item.kind] : ""}
      footer={
        <>
          <button type="button" onClick={onRemove} className={buttonClass("ghost", "sm", "mr-auto gap-1.5 text-danger hover:text-danger")}>
            <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
            Remove widget
          </button>
          <button type="button" onClick={onClose} className={buttonClass("primary", "sm")}>
            Done
          </button>
        </>
      }
    >
      {item && index !== null && <Body key={index} item={item} index={index} draft={draft} rows={rows} ctx={ctx} onChange={onChange} />}
    </WidgetDialog>
  );
}

function Body({
  item,
  index,
  draft,
  rows,
  ctx,
  onChange,
}: {
  item: WidgetItem;
  index: number;
  draft: WidgetItem[];
  rows: number;
  ctx: WidgetContext;
  onChange: (item: WidgetItem) => void;
}) {
  const sizes = SIZES_OF[item.kind];
  const { width, height } = pxOf(item.size);
  return (
    <div className="flex flex-col gap-5 px-5 pb-5">
      <div className="grid place-items-center rounded-card bg-raised p-5">
        <div aria-hidden className="pointer-events-none select-none" style={{ width, height }}>
          {renderWidget(item, ctx, true)}
        </div>
      </div>

      {sizes.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium text-ink-3">Size</legend>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              const on = size === item.size;
              const fits = on || sizeFits(draft, index, size, rows);
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={on}
                  disabled={!fits}
                  title={fits ? undefined : "No room for this size on this screen"}
                  onClick={() => onChange(resized(item, size))}
                  className={buttonClass(on ? "primary" : "secondary", "sm", "tabular")}
                >
                  {SIZE_NAMES[size]} · {size.replace("x", "×")}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {item.kind === "weather" && <WeatherPlace item={item} onChange={onChange} />}

      {item.kind === "goal" && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-xs font-medium text-ink-3">Goal</legend>
          {ctx.data.goals.length === 0 && <p className="text-sm text-ink-2">Add a goal on the Goals page first.</p>}
          {ctx.data.goals.map((goal, i) => {
            const on = item.goalId ? item.goalId === goal.id : i === 0;
            return (
              <button
                key={goal.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...item, goalId: goal.id })}
                className={`flex h-10 items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors hover:bg-raised ${on ? "bg-raised font-medium" : "text-ink-2"}`}
              >
                <GoalTile look={goal.look} size="md" />
                <span className="min-w-0 flex-1 truncate">{goal.title}</span>
                {on && <Check aria-hidden className="size-4 text-ink" strokeWidth={2.2} />}
              </button>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}

/** Where the weather is for: where you are (R48), or a city the widget always shows. */
function WeatherPlace({ item, onChange }: { item: WidgetItem; onChange: (item: WidgetItem) => void }) {
  const [mode, setMode] = useState<"here" | "city">(item.city ? "city" : "here");
  const [text, setText] = useState(item.city ?? "");
  const fieldId = useId();
  const apply = (value: string) => {
    const city = value.trim().slice(0, MAX_CITY_LENGTH);
    if (city !== "" && city !== item.city) onChange({ ...item, city });
  };
  const option = (value: "here" | "city", Icon: typeof Navigation, title: string, text: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => {
        setMode(value);
        if (value === "here" && item.city) onChange({ kind: item.kind, size: item.size });
      }}
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        mode === value ? "border-ink bg-surface" : "border-line-subtle hover:bg-raised"
      }`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.8} />
      <span className="flex flex-col">
        <span className="text-sm font-semibold tracking-snug">{title}</span>
        <span className="text-xs text-ink-2">{text}</span>
      </span>
    </button>
  );
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium text-ink-3">Location</legend>
      {option("here", Navigation, "Where you are", "Your location if you allow it, else the place of your event or home.")}
      {option("city", MapPin, "A city", "Always the same city, wherever you are.")}
      {mode === "city" && (
        <div className="flex flex-col gap-1 pt-1">
          <label htmlFor={fieldId} className="text-xs font-medium text-ink-2">
            City
          </label>
          <AddressField id={fieldId} value={text} onType={setText} onDone={() => apply(text)} savedPlaces={[]} label="City" placeholder="Lisbon" />
          <p className="text-[11px] text-ink-3">Pick a suggestion or type a city; it is used when you leave the field.</p>
        </div>
      )}
    </fieldset>
  );
}
