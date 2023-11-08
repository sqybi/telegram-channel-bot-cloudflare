import fetch_get_with_url_params from './fetch_helpers/fetch_get_with_url_params';
import generate_oauth_request from './oauth_helpers/generate_oauth_request';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const consumer_key = await env.TCB_KV.get('flickr.consumer.key');
    const consumer_secret = await env.TCB_KV.get('flickr.consumer.secret');
    if (!consumer_key || !consumer_secret) {
      return new Response('Secret configs missing', { status: 400 });
    }

    const oauth_request_token_url = 'https://www.flickr.com/services/oauth/request_token';
    const oauth_request_token_request = await generate_oauth_request(
      'GET',
      oauth_request_token_url,
      { oauth_callback: `${url.origin}/flickr/oauth/callback` },
      '',
      consumer_key,
      consumer_secret
    );
    const oauth_request_token_response = await fetch_get_with_url_params(
      oauth_request_token_url,
      oauth_request_token_request
    );
    const oauth_request_token_response_params = new URLSearchParams(await oauth_request_token_response.text());
    const oauth_request_token = oauth_request_token_response_params.get('oauth_token');
    const oauth_request_token_secret = oauth_request_token_response_params.get('oauth_token_secret');

    if (oauth_request_token && oauth_request_token_secret) {
      await env.TCB_KV.put('flickr.oauth.request_token', oauth_request_token);
      await env.TCB_KV.put('flickr.oauth.request_token_secret', oauth_request_token_secret);
    } else {
      return new Response('Cannot get oauth_token or oauth_token_secret from Flickr OAuth service.', { status: 500 });
    }

    return Response.redirect(`https://www.flickr.com/services/oauth/authorize?oauth_token=${oauth_request_token}`);
  },
};
