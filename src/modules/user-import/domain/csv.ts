// Reading a CSV file (SPEC 2026-11-09-comunicacao-e-calendarios, 4.3 item 1; SF-241): UTF-8, the separator of the
// header (";" when the header has one, otherwise ","), quotes as in RFC 4180 ("" inside a quoted field is a quote; a
// quoted field may hold the separator and line breaks). Every value is text: nothing is ever evaluated.

export type CsvError = "unterminated_quote";

export interface CsvRecord {
  /** The file's line where the record starts (1 is the header). */
  line: number;
  fields: string[];
}

export type CsvResult = { ok: true; separator: ";" | ","; records: CsvRecord[] } | { ok: false; error: CsvError; line: number };

const BYTE_ORDER_MARK = "\uFEFF";

/** The separator of the header: ";" when its first line has one outside quotes, otherwise ",". */
export function detectSeparator(text: string): ";" | "," {
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && (character === "\n" || character === "\r")) break;
    else if (!quoted && character === ";") return ";";
  }
  return ",";
}

/** Splits the text into records; blank lines are left out. */
export function parseCsv(input: string): CsvResult {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const separator = detectSeparator(text);
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let fieldWasQuoted = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endRecord = () => {
    fields.push(field);
    // A blank line has one empty, unquoted field.
    if (!(fields.length === 1 && fields[0] === "" && !fieldWasQuoted)) records.push({ line: recordLine, fields });
    fields = [];
    field = "";
    fieldWasQuoted = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        if (character === "\n") line += 1;
        field += character;
      }
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
      fieldWasQuoted = true;
      quoteLine = line;
    } else if (character === separator) {
      fields.push(field);
      field = "";
      fieldWasQuoted = false;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += character;
    }
  }

  if (quoted) return { ok: false, error: "unterminated_quote", line: quoteLine };
  if (field !== "" || fields.length > 0 || fieldWasQuoted) endRecord();
  return { ok: true, separator, records };
}
