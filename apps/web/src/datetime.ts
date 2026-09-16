/** JDBC LocalDateTime values omit an offset; the database connection uses UTC. */
export function parseApiDate(value: string): Date {
  const offsetless = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  return new Date(offsetless.test(value) ? value.replace(" ", "T") + "Z" : value);
}

export const date = (value: string) =>
  parseApiDate(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
