export default async function fetch_get_with_url_params(url: string, request: Record<string, string>) {
    const request_params = new URLSearchParams(request);
    return await fetch(new Request(url + '?' + request_params.toString()));
}