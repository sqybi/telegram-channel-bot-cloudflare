export default async function generate_photo_message_hash(message: string): Promise<string> {
  const message_buffer = new TextEncoder().encode(message);
  const hash_buffer = await crypto.subtle.digest('SHA-1', message_buffer);
  const hash_array = Array.from(new Uint8Array(hash_buffer));
  const hash_hex = hash_array.map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return hash_hex;
}
