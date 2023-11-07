export default function escape_telegram_markdown(text: string): string {
  // Get latest escape characters from https://core.telegram.org/bots/api#markdownv2-style
  const telegram_escape_strings = [
    '_',
    '*',
    '[',
    ']',
    '(',
    ')',
    '~',
    '`',
    '>',
    '#',
    '+',
    '-',
    '=',
    '|',
    '{',
    '}',
    '.',
    '!',
  ];
  for (const telegram_escape_string of telegram_escape_strings) {
    text = text.replaceAll(telegram_escape_string, `\\${telegram_escape_string}`);
  }
  return text;
}
