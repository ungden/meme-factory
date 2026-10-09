/** Ba bước của một kênh: kênh → nhân vật → nội dung. */
export default function ChannelStages({ current }: { current: 0 | 1 | 2 }) {
  const labels = ["Kênh", "Nhân vật", "Làm nội dung"];
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Các bước của kênh">
      {labels.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-current={index === current ? "step" : undefined}
            className={`flex h-6 min-w-6 items-center justify-center rounded-full px-2 font-semibold ${index < current ? "th-bg-success-light th-text-success" : index === current ? "th-bg-accent-light th-text-accent" : "th-bg-tertiary th-text-muted"}`}
          >
            {index + 1}. {label}
          </span>
          {index < labels.length - 1 && <span className="th-text-muted" aria-hidden>›</span>}
        </li>
      ))}
    </ol>
  );
}
