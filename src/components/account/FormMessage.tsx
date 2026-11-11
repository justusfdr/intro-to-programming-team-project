/** The answer of an action under its form. Read out by screen readers when it appears. */
export function FormMessage({ tone, text }: { tone: "error" | "success"; text: string }) {
  const style = tone === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mt-4 rounded-xl px-3 py-2 text-sm ${style}`}>
      {text}
    </p>
  );
}
