import fetch_get_with_url_params from './fetch_helpers/fetch_get_with_url_params';
import generate_oauth_request from './oauth_helpers/generate_oauth_request';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const oauth_verifier = url.searchParams.get('oauth_verifier');
    if (!oauth_verifier) {
      return new Response('oauth_verifier is required', { status: 400 });
    }
    await env.TCB_KV.put('flickr.oauth.verifier', oauth_verifier);
    const oauth_token = await env.TCB_KV.get('flickr.oauth.token');
    const oauth_token_secret = await env.TCB_KV.get('flickr.oauth.token_secret');
    if (!oauth_token || !oauth_token_secret) {
      return Response.redirect(`${url.origin}/flickr/oauth`);
    }

    const consumer_key = await env.TCB_KV.get('flickr.consumer.key');
    const consumer_secret = await env.TCB_KV.get('flickr.consumer.secret');
    if (!consumer_key || !consumer_secret) {
      return new Response('Secret configs missing', { status: 400 });
    }

    let username, user_nsid;
    try {
      const oauth_access_token_url = 'https://www.flickr.com/services/oauth/access_token';
      const oauth_access_token_request = await generate_oauth_request(
        'GET',
        oauth_access_token_url,
        { oauth_token, oauth_verifier },
        oauth_token_secret,
        consumer_key,
        consumer_secret
      );
      const oauth_access_token_response = await fetch_get_with_url_params(
        oauth_access_token_url,
        oauth_access_token_request
      );
      const oauth_access_token_response_params = new URLSearchParams(await oauth_access_token_response.text());
      username = oauth_access_token_response_params.get('username');
      user_nsid = oauth_access_token_response_params.get('user_nsid');
    } catch (error) {
      return Response.redirect(`${url.origin}/flickr/oauth`);
    }

    const encoder = new TextEncoder();
    return new Response(
      encoder.encode(`<p><b>OAuth successed!</b></p><p>Username: ${username}</p><p>User nsid: ${user_nsid}</p>`),
      {
        headers: { 'Content-Type': 'text/html', charset: 'utf-8' },
      }
    );
  },
};
