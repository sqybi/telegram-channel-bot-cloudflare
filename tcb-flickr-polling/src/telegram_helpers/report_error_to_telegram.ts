import escape_telegram_markdown from './escape_telegram_markdown';
import send_telegram_bot_api from './send_telegram_bot_api';

export default async function report_error_to_telegram(token: string, chat_id: string, error_message: string) {
  await send_telegram_bot_api('sendMessage', token, {
    chat_id,
    text: `*Telegram Chat Bot \\- Flickr \\| Error*\n${escape_telegram_markdown(error_message)}`,
    parse_mode: 'MarkdownV2',
  });
}
