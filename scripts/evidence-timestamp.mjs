const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_UTC_MILLISECOND_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export function isEvidenceTimestampAtOrAfter(
  capturedAt,
  asOf,
) {
  if (
    typeof capturedAt !== "string" ||
    typeof asOf !== "string" ||
    !ISO_UTC_MILLISECOND_TIMESTAMP.test(capturedAt) ||
    !ISO_DATE.test(asOf)
  ) {
    return false;
  }
  const capturedMilliseconds = Date.parse(capturedAt);
  const asOfMilliseconds = Date.parse(
    `${asOf}T00:00:00.000Z`,
  );
  return (
    Number.isFinite(capturedMilliseconds) &&
    Number.isFinite(asOfMilliseconds) &&
    new Date(capturedMilliseconds).toISOString() === capturedAt &&
    new Date(asOfMilliseconds).toISOString().slice(0, 10) ===
      asOf &&
    capturedMilliseconds >= asOfMilliseconds
  );
}
