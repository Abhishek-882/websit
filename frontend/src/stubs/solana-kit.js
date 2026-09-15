// Simple base58 and base64 helper stub for rollup bundling
function toBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function getBase58Decoder() {
  return {
    decode: (bytes) => toBase64(bytes),
  };
}

export function getBase58Encoder() {
  return {
    encode: (str) => fromBase64(str),
  };
}

export function getBase64Decoder() {
  return {
    decode: (bytes) => toBase64(bytes),
  };
}

export function getBase64Encoder() {
  return {
    encode: (str) => fromBase64(str),
  };
}

export function getUtf8Decoder() {
  return new TextDecoder();
}

export function getUtf8Encoder() {
  return new TextEncoder();
}
