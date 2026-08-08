/**
 * Steganography utility for hiding data in plain text using zero-width characters.
 * 
 * Uses:
 * - \u200B (Zero-width space) as binary 0
 * - \u200C (Zero-width non-joiner) as binary 1
 * - \u200D (Zero-width joiner) as start/end delimiters
 */

const ZERO_WIDTH_0 = '\u200B';
const ZERO_WIDTH_1 = '\u200C';
const ZERO_WIDTH_DELIMITER = '\u200D';
const ZW_REGEX = new RegExp(`${ZERO_WIDTH_DELIMITER}([${ZERO_WIDTH_0}${ZERO_WIDTH_1}]+)${ZERO_WIDTH_DELIMITER}`, 'g');

/**
 * Encodes a string into zero-width characters wrapped in delimiters.
 */
export function encodeHiddenData(data: string): string {
  if (!data) return '';
  const buffer = Buffer.from(data, 'utf8');
  let binary = '';
  for (const byte of buffer) {
    binary += byte.toString(2).padStart(8, '0');
  }
  
  const hidden = binary
    .replace(/0/g, ZERO_WIDTH_0)
    .replace(/1/g, ZERO_WIDTH_1);
    
  return `${ZERO_WIDTH_DELIMITER}${hidden}${ZERO_WIDTH_DELIMITER}`;
}

/**
 * Extracts hidden data from a string.
 * Returns the cleaned string (with hidden data removed) and the hidden data itself.
 */
export function extractHiddenData(text: string): { cleanText: string, hiddenData: string | null } {
  if (!text) return { cleanText: text, hiddenData: null };
  
  let hiddenData: string | null = null;
  const match = ZW_REGEX.exec(text);
  
  if (match) {
    const hidden = match[1];
    const binary = hidden
      .replace(new RegExp(ZERO_WIDTH_0, 'g'), '0')
      .replace(new RegExp(ZERO_WIDTH_1, 'g'), '1');
      
    const bytes = [];
    for (let i = 0; i < binary.length; i += 8) {
      bytes.push(parseInt(binary.slice(i, i + 8), 2));
    }
    
    hiddenData = Buffer.from(bytes).toString('utf8');
  }
  
  const cleanText = text.replace(ZW_REGEX, '');
  return { cleanText, hiddenData };
}
