const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`JPEG ${label} must be a positive integer`);
  }
}

function markerSegment(input, view, offset, label) {
  if (offset + 2 > input.byteLength) {
    throw new RangeError(`JPEG ${label} segment is truncated`);
  }
  const byteLength = view.getUint16(offset, false);
  const end = offset + byteLength;
  if (byteLength < 2 || end > input.byteLength) {
    throw new RangeError(`JPEG ${label} segment is invalid`);
  }
  return { byteLength, dataOffset: offset + 2, end };
}

function inspectQuantizationTables(input, segment, tables) {
  let offset = segment.dataOffset;
  while (offset < segment.end) {
    const descriptor = input[offset];
    const precision = descriptor >>> 4;
    const table = descriptor & 0x0f;
    const bytes = precision === 0 ? 64 : 128;
    if (
      precision !== 0 ||
      table > 3 ||
      offset + 1 + bytes > segment.end ||
      tables.has(table)
    ) {
      throw new DOMException(
        "JPEG quantization table profile is unsupported",
        "NotSupportedError",
      );
    }
    tables.add(table);
    offset += 1 + bytes;
  }
  if (offset !== segment.end) {
    throw new Error("JPEG quantization tables are malformed");
  }
}

function inspectHuffmanTables(input, segment, tables) {
  let offset = segment.dataOffset;
  while (offset < segment.end) {
    if (offset + 17 > segment.end) {
      throw new RangeError("JPEG Huffman table is truncated");
    }
    const descriptor = input[offset];
    const tableClass = descriptor >>> 4;
    const table = descriptor & 0x0f;
    const key = `${tableClass}:${table}`;
    if (tableClass > 1 || table > 3 || tables.has(key)) {
      throw new DOMException(
        "JPEG Huffman table profile is unsupported",
        "NotSupportedError",
      );
    }
    let symbols = 0;
    for (let index = 1; index <= 16; index += 1) {
      symbols += input[offset + index];
    }
    if (
      symbols === 0 ||
      symbols > 256 ||
      offset + 17 + symbols > segment.end
    ) {
      throw new Error("JPEG Huffman table is malformed");
    }
    tables.add(key);
    offset += 17 + symbols;
  }
  if (offset !== segment.end) {
    throw new Error("JPEG Huffman tables are malformed");
  }
}

export function inspectBoundedJpeg(
  input,
  {
    maximumCompressionRatio = 256,
    maximumDecodedBytes = 16 * 1024 * 1024,
    maximumDimension = 2_048,
    maximumSegments = 256,
    maximumSourceBytes = 8 * 1024 * 1024,
  } = {},
) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("JPEG input must be a Uint8Array");
  }
  for (const [label, value] of Object.entries({
    maximumCompressionRatio,
    maximumDecodedBytes,
    maximumDimension,
    maximumSegments,
    maximumSourceBytes,
  })) {
    positiveInteger(value, label);
  }
  if (
    input.byteLength < 16 ||
    input.byteLength > maximumSourceBytes ||
    input[0] !== 0xff ||
    input[1] !== 0xd8 ||
    input.at(-2) !== 0xff ||
    input.at(-1) !== 0xd9
  ) {
    throw new RangeError("JPEG source exceeds the bounded profile");
  }
  const view = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  );
  const quantizationTables = new Set();
  const huffmanTables = new Set();
  const frameComponents = new Map();
  let components = 0;
  let entropyBytes = 0;
  let height = 0;
  let offset = 2;
  let restartInterval = 0;
  let nextRestartMarker = 0xd0;
  let segments = 0;
  let sawFrame = false;
  let sawScan = false;
  let width = 0;

  while (offset < input.byteLength) {
    if (segments >= maximumSegments || input[offset] !== 0xff) {
      throw new RangeError(
        "JPEG marker table exceeds the bounded profile",
      );
    }
    while (offset < input.byteLength && input[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= input.byteLength) {
      throw new RangeError("JPEG marker is truncated");
    }
    const marker = input[offset];
    offset += 1;
    segments += 1;
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      throw new Error("JPEG marker sequence is invalid");
    }
    if (marker === 0xd9) {
      throw new Error("JPEG ended before its image scan");
    }
    if (SOF_MARKERS.has(marker) && marker !== 0xc0) {
      throw new DOMException(
        "only baseline sequential JPEG is supported",
        "NotSupportedError",
      );
    }
    if ([0xc8, 0xcc, 0xdc].includes(marker)) {
      throw new DOMException(
        "JPEG arithmetic and dynamic-height profiles are unsupported",
        "NotSupportedError",
      );
    }
    if (
      ![0xc0, 0xc4, 0xda, 0xdb, 0xdd].includes(marker) &&
      !(marker >= 0xe0 && marker <= 0xef) &&
      marker !== 0xfe
    ) {
      throw new DOMException(
        "JPEG marker profile is unsupported",
        "NotSupportedError",
      );
    }
    const segment = markerSegment(
      input,
      view,
      offset,
      `0x${marker.toString(16).padStart(2, "0")}`,
    );
    if (marker === 0xc0) {
      if (sawFrame || segment.byteLength < 11) {
        throw new Error("JPEG baseline frame is invalid");
      }
      height = view.getUint16(segment.dataOffset + 1, false);
      width = view.getUint16(segment.dataOffset + 3, false);
      components = input[segment.dataOffset + 5];
      if (
        input[segment.dataOffset] !== 8 ||
        ![1, 3].includes(components) ||
        segment.byteLength !== 8 + components * 3 ||
        width === 0 ||
        height === 0 ||
        width > maximumDimension ||
        height > maximumDimension
      ) {
        throw new DOMException(
          "JPEG baseline frame profile is unsupported",
          "NotSupportedError",
        );
      }
      let samplingUnits = 0;
      for (let index = 0; index < components; index += 1) {
        const componentOffset = segment.dataOffset + 6 + index * 3;
        const identifier = input[componentOffset];
        const sampling = input[componentOffset + 1];
        const horizontal = sampling >>> 4;
        const vertical = sampling & 0x0f;
        const quantizationTable = input[componentOffset + 2];
        if (
          identifier === 0 ||
          frameComponents.has(identifier) ||
          horizontal === 0 ||
          horizontal > 4 ||
          vertical === 0 ||
          vertical > 4 ||
          quantizationTable > 3
        ) {
          throw new Error("JPEG frame component is invalid");
        }
        samplingUnits += horizontal * vertical;
        frameComponents.set(identifier, quantizationTable);
      }
      if (samplingUnits > 10) {
        throw new DOMException(
          "JPEG sampling profile is unsupported",
          "NotSupportedError",
        );
      }
      sawFrame = true;
    } else if (marker === 0xdb) {
      inspectQuantizationTables(
        input,
        segment,
        quantizationTables,
      );
    } else if (marker === 0xc4) {
      inspectHuffmanTables(input, segment, huffmanTables);
    } else if (marker === 0xdd) {
      if (segment.byteLength !== 4 || restartInterval !== 0) {
        throw new Error("JPEG restart interval is invalid");
      }
      restartInterval = view.getUint16(segment.dataOffset, false);
      if (restartInterval === 0) {
        throw new Error("JPEG restart interval is empty");
      }
    } else if (marker === 0xda) {
      if (!sawFrame || sawScan) {
        throw new Error("JPEG scan sequence is invalid");
      }
      const scanComponents = input[segment.dataOffset];
      if (
        scanComponents !== components ||
        segment.byteLength !== 6 + scanComponents * 2
      ) {
        throw new DOMException(
          "JPEG single-scan profile is unsupported",
          "NotSupportedError",
        );
      }
      const observed = new Set();
      for (let index = 0; index < scanComponents; index += 1) {
        const componentOffset = segment.dataOffset + 1 + index * 2;
        const identifier = input[componentOffset];
        const selectors = input[componentOffset + 1];
        const dcTable = selectors >>> 4;
        const acTable = selectors & 0x0f;
        if (
          !frameComponents.has(identifier) ||
          observed.has(identifier) ||
          dcTable > 3 ||
          acTable > 3 ||
          !huffmanTables.has(`0:${dcTable}`) ||
          !huffmanTables.has(`1:${acTable}`)
        ) {
          throw new Error("JPEG scan component is invalid");
        }
        observed.add(identifier);
      }
      const parameters = segment.dataOffset + 1 + scanComponents * 2;
      if (
        input[parameters] !== 0 ||
        input[parameters + 1] !== 63 ||
        input[parameters + 2] !== 0
      ) {
        throw new DOMException(
          "JPEG spectral scan profile is unsupported",
          "NotSupportedError",
        );
      }
      for (const table of frameComponents.values()) {
        if (!quantizationTables.has(table)) {
          throw new Error("JPEG frame quantization table is missing");
        }
      }
      sawScan = true;
      offset = segment.end;
      const entropyStart = offset;
      while (offset < input.byteLength) {
        if (input[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const markerStart = offset;
        while (offset < input.byteLength && input[offset] === 0xff) {
          offset += 1;
        }
        if (offset >= input.byteLength) {
          throw new RangeError("JPEG entropy marker is truncated");
        }
        const entropyMarker = input[offset];
        offset += 1;
        if (entropyMarker === 0x00) {
          continue;
        }
        if (entropyMarker >= 0xd0 && entropyMarker <= 0xd7) {
          if (
            restartInterval === 0 ||
            entropyMarker !== nextRestartMarker
          ) {
            throw new Error(
              "JPEG restart marker sequence is invalid",
            );
          }
          nextRestartMarker = 0xd0 + (
            (nextRestartMarker - 0xd0 + 1) % 8
          );
          continue;
        }
        if (entropyMarker !== 0xd9 || offset !== input.byteLength) {
          throw new DOMException(
            "JPEG multiple scans or trailing data are unsupported",
            "NotSupportedError",
          );
        }
        entropyBytes = markerStart - entropyStart;
        if (entropyBytes === 0) {
          throw new Error("JPEG entropy payload is empty");
        }
        offset = input.byteLength;
        break;
      }
      break;
    }
    offset = segment.end;
  }
  if (
    !sawFrame ||
    !sawScan ||
    quantizationTables.size === 0 ||
    huffmanTables.size === 0 ||
    entropyBytes === 0
  ) {
    throw new Error("JPEG image structure is incomplete");
  }
  const decodedBytes = width * height * 4;
  if (
    decodedBytes > maximumDecodedBytes ||
    decodedBytes / input.byteLength > maximumCompressionRatio
  ) {
    throw new RangeError("JPEG decoded bytes exceed the bounded profile");
  }
  return Object.freeze({
    byteLength: input.byteLength,
    components,
    decodedBytes,
    entropyBytes,
    height,
    mediaType: "image/jpeg",
    segments,
    width,
  });
}
