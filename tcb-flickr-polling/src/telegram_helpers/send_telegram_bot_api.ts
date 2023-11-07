import fetch_get_with_url_params from '../fetch_helpers/fetch_get_with_url_params';

export default async function send_telegram_bot_api(method: string, token: string, request: Record<string, string>) {
    return await fetch_get_with_url_params(`https://api.telegram.org/bot${token}/${method}`, request);
}
