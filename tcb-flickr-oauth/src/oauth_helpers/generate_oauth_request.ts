import { v1 as uuidv1 } from 'uuid';

type OauthRequest = {
  [key: string]: string;
};

async function calculate_oauth_signature_base64(
  method: string,
  url: string,
  params: OauthRequest,
  consumer_secret: string,
  token_secret: string
) {
  const sortedParams = new URLSearchParams(params);
  sortedParams.sort();
  const normalizedParams = sortedParams.toString();
  const baseString = [method, url, normalizedParams].map(encodeURIComponent).join('&');

  const secret = encodeURIComponent(consumer_secret) + '&' + encodeURIComponent(token_secret);

  let encoder = new TextEncoder();
  let key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {name: "HMAC", hash: {name: "SHA-1"}},
      false,
      ["sign"]
  );
  let signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(baseString)
  );
  let digest = new Uint8Array(signature);
  return btoa(String.fromCharCode(...digest));
}

export default async function generate_oauth_request(
  method: string,
  url: string,
  request: OauthRequest,
  token_secret: string,
  consumer_key: string,
  consumer_secret: string
) {
  const defaultRequest = {
    oauth_nonce: uuidv1(),
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_consumer_key: consumer_key,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_version: '1.0',
  };
  request = { ...defaultRequest, ...request };
  return {
    ...request,
    oauth_signature: await calculate_oauth_signature_base64(method, url, request, consumer_secret, token_secret),
  };
}
