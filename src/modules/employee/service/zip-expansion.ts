/**
 * A guard against zip bombs in uploaded `.xlsx` files.
 *
 * An `.xlsx` is a zip container, so a byte cap on the *uploaded* file only bounds the
 * compressed size. XML compresses extremely well — a few megabytes of highly repetitive
 * worksheet markup can expand to gigabytes — and the row-count cap further downstream is
 * no help, because it can only run after the parser has already unzipped the archive and
 * materialised every row in memory. An authenticated HR user could take the whole shared
 * Node process down with one small file.
 *
 * This inspects the zip's **central directory** instead, which records each entry's
 * uncompressed size in the archive metadata, and refuses the file before a single byte is
 * decompressed. Reading the directory is cheap: it is a fixed-size record per entry at the
 * tail of the file, not the entry data itself.
 *
 * A hostile archive can of course understate those sizes. That is why the ratio check
 * below is separate from the absolute one, and why this is defence in depth rather than a
 * complete answer — an entry that lies about its size still has to get past the parser,
 * which fails on a malformed archive. What this reliably stops is the ordinary,
 * well-formed, enormously-expanding bomb.
 */

/** Total uncompressed bytes an .xlsx may declare. Generous next to the 5 MB upload cap. */
export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/**
 * Whole-archive compression ratio ceiling. Real spreadsheet XML lands well under this;
 * a bomb is orders of magnitude above it.
 */
export const MAX_COMPRESSION_RATIO = 200;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
/** The comment field is a 16-bit length, so the record starts within this of the end. */
const EOCD_MAX_SEARCH = EOCD_MIN_SIZE + 0xffff;

export type ZipExpansionCheck =
  | { ok: true; uncompressedBytes: number; ratio: number }
  | { ok: false; reason: string };

/** Locates the End Of Central Directory record, scanning back from the tail. */
function findEocdOffset(buffer: Buffer): number | null {
  const start = Math.max(0, buffer.length - EOCD_MAX_SEARCH);
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return null;
}

/**
 * Sums the uncompressed sizes declared in the central directory and compares them against
 * both an absolute cap and a compression-ratio ceiling. Never decompresses anything.
 */
export function checkZipExpansion(buffer: Buffer): ZipExpansionCheck {
  const eocd = findEocdOffset(buffer);
  // Not a zip at all, or a truncated one — let the real parser produce the error message,
  // since it will reject this anyway and knows better what to say about it.
  if (eocd === null) return { ok: true, uncompressedBytes: 0, ratio: 0 };

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let uncompressedBytes = 0;

  for (let i = 0; i < entryCount; i += 1) {
    // A malformed directory is the parser's problem, not ours; bail out permissively
    // rather than throwing a confusing error from a security guard.
    if (offset + 46 > buffer.length) break;
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) break;

    uncompressedBytes += buffer.readUInt32LE(offset + 24);

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const ratio = buffer.length > 0 ? uncompressedBytes / buffer.length : 0;

  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    return {
      ok: false,
      reason: `This workbook expands to about ${Math.round(uncompressedBytes / (1024 * 1024))} MB, over the ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB limit.`,
    };
  }
  if (ratio > MAX_COMPRESSION_RATIO) {
    return {
      ok: false,
      reason: 'This workbook is compressed far more than a real spreadsheet would be and was not opened.',
    };
  }

  return { ok: true, uncompressedBytes, ratio };
}
