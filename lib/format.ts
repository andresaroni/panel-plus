export function formatMoney(value: number | string | { toString(): string } | null) {
  const amount = value === null ? 0 : Number(value.toString());
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatRelativeDate(value: Date | string | null, now: Date = new Date()) {
  if (!value) return "No disponible";

  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const distance = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("es-EC", { numeric: "auto" });
  const match = relativeUnits.find(([, size]) => distance >= size);
  return match
    ? formatter.format(Math.round(seconds / match[1]), match[0])
    : formatter.format(seconds, "second");
}

export function elapsedSeconds(start: Date | string | null, end: Date | string | null) {
  if (!start || !end) return null;
  const elapsed = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return elapsed >= 0 ? elapsed : null;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "No disponible";
  if (seconds < 60) return `${seconds} s`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) return `${hours} h ${minutes} min ${remainingSeconds} s`;
  return `${minutes} min ${remainingSeconds} s`;
}

export function formatResponseTime(
  seconds: number | null,
  presentedAt: Date | string | null,
  status: string,
) {
  if (seconds !== null) return formatDuration(seconds);
  return presentedAt && status === "pendiente" ? "Pendiente" : "No disponible";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
