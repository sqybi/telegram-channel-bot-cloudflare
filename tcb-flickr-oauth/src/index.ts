import handleCallback from './callback';
import handleOauth from './oauth';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // You can get pretty far with simple logic like if/switch-statements
    switch (url.pathname) {
      case '/flickr/oauth':
        return handleOauth.fetch(request, env, ctx);
      case '/flickr/oauth/callback':
        return handleCallback.fetch(request, env, ctx);
    }

    return new Response('<p>Wrong request URL!</p>', { headers: { 'Content-Type': 'text/html' }, status: 404 });
  },
};
