const RFC8259_WHITESPACE = new Set([" ", "\t", "\r", "\n"]);

export class StrictJsonError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StrictJsonError";
    this.code = code;
  }
}

function strictFail(code, label, source, cursor, message) {
  const byteOffset = new TextEncoder().encode(source.slice(0, cursor)).length;
  throw new StrictJsonError(code, `${label} ${message} at byte ${byteOffset}`);
}

function assertScalarString(value, label, source, cursor) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        strictFail("JSON_UNPAIRED_SURROGATE", label, source, cursor, "contains an unpaired high surrogate");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      strictFail("JSON_UNPAIRED_SURROGATE", label, source, cursor, "contains an unpaired low surrogate");
    }
  }
}

export function parseJsonStrict(source, label = "JSON document") {
  if (typeof source !== "string") {
    throw new StrictJsonError("JSON_INPUT_NOT_TEXT", `${label} must be UTF-8 text`);
  }
  if (source.startsWith("\uFEFF")) {
    throw new StrictJsonError("JSON_BOM_FORBIDDEN", `${label} must not contain a UTF-8 BOM`);
  }
  if (source.includes("\uFFFD")) {
    throw new StrictJsonError("JSON_INVALID_UTF8", `${label} contains invalid UTF-8 replacement bytes`);
  }
  let cursor = 0;
  const fail = (code, message) => strictFail(code, label, source, cursor, message);
  const skipWhitespace = () => {
    while (cursor < source.length && RFC8259_WHITESPACE.has(source[cursor])) cursor += 1;
  };
  const parseString = () => {
    if (source[cursor] !== '"') fail("JSON_EXPECTED_STRING", "expected string");
    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < source.length) {
      const character = source[cursor];
      cursor += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') {
        let value;
        try {
          value = JSON.parse(source.slice(start, cursor));
        } catch {
          fail("JSON_INVALID_STRING_ESCAPE", "contains an invalid string escape");
        }
        assertScalarString(value, label, source, cursor);
        return value;
      }
      if (character.charCodeAt(0) < 0x20) {
        fail("JSON_UNESCAPED_CONTROL", "contains an unescaped control character");
      }
    }
    fail("JSON_UNTERMINATED_STRING", "contains an unterminated string");
  };
  const parseValue = () => {
    skipWhitespace();
    if (cursor >= source.length) fail("JSON_MISSING_VALUE", "ended before a value");
    if (source[cursor] === '"') return parseString();
    if (source[cursor] === "{") return parseObject();
    if (source[cursor] === "[") return parseArray();
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
      if (source.startsWith(token, cursor)) {
        cursor += token.length;
        return value;
      }
    }
    const number = source.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      cursor += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) fail("JSON_NON_FINITE_NUMBER", "contains a non-finite number");
      return value;
    }
    fail("JSON_INVALID_VALUE", "contains an invalid value");
  };
  const parseObject = () => {
    const result = Object.create(null);
    const keys = new Set();
    const normalizedKeys = new Map();
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "}") {
      cursor += 1;
      return result;
    }
    while (cursor < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) fail("JSON_DUPLICATE_KEY", `contains duplicate object key ${JSON.stringify(key)}`);
      const normalized = key.normalize("NFC");
      const previous = normalizedKeys.get(normalized);
      if (previous !== undefined && previous !== key) {
        fail("JSON_NORMALIZATION_COLLISION", `contains normalization-colliding object keys ${JSON.stringify(previous)} and ${JSON.stringify(key)}`);
      }
      keys.add(key);
      normalizedKeys.set(normalized, key);
      skipWhitespace();
      if (source[cursor] !== ":") fail("JSON_EXPECTED_COLON", "expected colon after object key");
      cursor += 1;
      result[key] = parseValue();
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ",") fail("JSON_EXPECTED_COMMA", "expected comma between object entries");
      cursor += 1;
    }
    fail("JSON_UNTERMINATED_OBJECT", "contains an unterminated object");
  };
  const parseArray = () => {
    const result = [];
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return result;
    }
    while (cursor < source.length) {
      result.push(parseValue());
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return result;
      }
      if (source[cursor] !== ",") fail("JSON_EXPECTED_COMMA", "expected comma between array entries");
      cursor += 1;
    }
    fail("JSON_UNTERMINATED_ARRAY", "contains an unterminated array");
  };

  const result = parseValue();
  skipWhitespace();
  if (cursor !== source.length) fail("JSON_TRAILING_CONTENT", "contains trailing content or non-RFC8259 whitespace");
  return result;
}

export function parseJsonBytesStrict(bytes, label = "JSON document") {
  if (!(bytes instanceof Uint8Array)) {
    throw new StrictJsonError("JSON_INPUT_NOT_BYTES", `${label} must be a Uint8Array`);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new StrictJsonError("JSON_BOM_FORBIDDEN", `${label} must not contain a UTF-8 BOM`);
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new StrictJsonError("JSON_INVALID_UTF8", `${label} is not valid UTF-8`);
  }
  return parseJsonStrict(source, label);
}
