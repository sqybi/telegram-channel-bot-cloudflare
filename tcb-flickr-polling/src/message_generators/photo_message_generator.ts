import { marked } from 'marked';
import { load } from 'cheerio';

import { PhotosExifsRow, PhotosRow, PhotosTagsRow } from '../db_helpers/database_rows';
import escape_telegram_markdown from '../telegram_helpers/escape_telegram_markdown';

const MAX_CAPTION_LENGTH = 1000;  // Telegram's limit is 1024, leave some spaces for different calculation methods
const APPENDING_TEXT = '\n\n\\.\\.\\.';
const APPENDING_TEXT_LENGTH = (await generate_plain_text_from_markdown(APPENDING_TEXT)).length;

async function generate_plain_text_from_markdown(text: string): Promise<string> {
  const html = await marked(text);
  return load(html).text();
}

async function smart_shorten_text(text: string, length_limit: number): Promise<string> {
  let l = length_limit + 1;
  let r = text.length;
  let result = text.slice(0, length_limit);
  while (l <= r) {
    const mid = Math.floor((l + r) / 2);
    const sliced_text = text.slice(0, mid);
    const plain_text = await generate_plain_text_from_markdown(sliced_text);
    if (plain_text.length <= length_limit) {
      result = sliced_text;
      l = mid + 1;
    } else {
      r = mid - 1;
    }
  }
  return result;
}

async function generate_text(data: any, smart_length_limit_mode: boolean = false): Promise<string> {
  // Let's assume pre_text itself will never exceed Telegram's length limit
  const pre_text = [
    `*${data.title}*`,
    data.exif.artist ? `  // ${data.exif.artist}` : '',
    '\n\n',
  ].join('');
  let text = data.description;
  let post_text = [
    '\n\n',
    data.url ? `[Flickr 页面](${data.url})\n\n` : '',
    data.tags
      ? data.tags.reduce(
          (acc: string, cur: string) => `${acc}[\\#${cur}](https://www.flickr.com/photos/tags/${cur}) `,
          ''
        ) + '\n\n'
      : '',
    data.exif.copyright ? `\`Copyright ©${data.exif.copyright}\`\n\n` : '',
    '\n',
    data.date ? `*拍摄时间* \\| ${data.date}\n` : '',
    data.exif.make || data.exif.model
      ? `*相机型号* \\| ${data.exif.make}${data.exif.make && data.exif.model ? ' ' : ''}${data.exif.model}\n`
      : '',
    data.exif.lens_model ? `*镜头型号* \\| ${data.exif.lens_model}\n` : '',
    data.exif.max_aperture ? `*最大光圈* \\| ${data.exif.max_aperture}\n` : '',
    '\n',
    data.exif.focal_length || data.exif.focal_length_35mm
      ? `*${data.exif.focal_length ? '焦距' : ''}${data.exif.focal_length && data.exif.focal_length_35mm ? ' / ' : ''}${
          data.exif.focal_length_35mm ? '35mm 等效焦距' : ''
        }* \\| ${data.exif.focal_length}${data.exif.focal_length && data.exif.focal_length_35mm ? ' / ' : ''}${
          data.exif.focal_length_35mm
        }\n`
      : '',
    data.exif.exposure ? `*曝光时间* \\| ${data.exif.exposure}\n` : '',
    data.exif.aperture ? `*光圈* \\| ${data.exif.aperture}\n` : '',
    data.exif.iso ? `*ISO* \\| ${data.exif.iso}\n` : '',
    '\n',
    data.exif.exposure_program
      ? `*曝光程序* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/exposureprogram.html) \\| ${data.exif.exposure_program}\n`
      : '',
    data.exif.exposure_mode
      ? `*曝光模式* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/exposuremode.html) \\| ${data.exif.exposure_mode}\n`
      : '',
    data.exif.flash
      ? `*闪光模式* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/flash.html) \\| ${data.exif.flash}\n`
      : '',
    data.exif.white_balance
      ? `*白平衡模式* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/whitebalance.html) \\| ${data.exif.white_balance}\n`
      : '',
    data.exif.metering_mode
      ? `*测光模式* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/meteringmode.html) \\| ${data.exif.metering_mode}\n`
      : '',
    data.exif.light_source
      ? `*光源类型* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/lightsource.html) \\| ${data.exif.light_source}\n`
      : '',
    '\n',
    data.exif.brightness_value
      ? `*亮度* [\\(?\\)](https://www.awaresystems.be/imaging/tiff/tifftags/privateifd/exif/brightnessvalue.html) \\| ${data.exif.brightness_value}\n`
      : '',
    data.exif.exposure_compensation ? `*曝光补偿* \\| ${data.exif.exposure_compensation}\n` : '',
  ].join('');

  if (smart_length_limit_mode) {
    const pre_plain_text = await generate_plain_text_from_markdown(pre_text);
    let post_plain_text = await generate_plain_text_from_markdown(post_text);
    if (pre_plain_text.length + post_plain_text.length >= MAX_CAPTION_LENGTH - APPENDING_TEXT_LENGTH) {
      // Leave spaces for two appending texts, one on post_text and one on text
      post_text = await smart_shorten_text(post_text, MAX_CAPTION_LENGTH - APPENDING_TEXT_LENGTH * 2 - pre_plain_text.length);
      post_text += APPENDING_TEXT;
    }
    text = await smart_shorten_text(text, MAX_CAPTION_LENGTH - pre_plain_text.length - post_plain_text.length - APPENDING_TEXT_LENGTH);
    text += APPENDING_TEXT;
  }
  const shorten_length = (await generate_plain_text_from_markdown(pre_text + text + post_text)).length;
  return pre_text + text + post_text;
}

export default async function generate_photo_message(
  photos_row: PhotosRow,
  photos_exifs_row: PhotosExifsRow,
  photos_tags_rows: PhotosTagsRow[]
) {
  // No template engines! `eval` is not allowed.

  const data = {
    title: escape_telegram_markdown(photos_row.info.title),
    description: escape_telegram_markdown(photos_row.info.description),
    url: escape_telegram_markdown(photos_row.info.page_url),
    tags: photos_tags_rows.map((photos_tags_row) => photos_tags_row.tag_info.tag_name),
    date: escape_telegram_markdown(photos_row.info.date.taken),
    exif: {
      artist: escape_telegram_markdown(photos_exifs_row.exif_info.artist),
      copyright: escape_telegram_markdown(photos_exifs_row.exif_info.copyright),
      make: escape_telegram_markdown(photos_exifs_row.exif_info.make),
      model: escape_telegram_markdown(photos_exifs_row.exif_info.model),
      lens_model: escape_telegram_markdown(photos_exifs_row.exif_info.lens_model),
      max_aperture: escape_telegram_markdown(photos_exifs_row.exif_info.max_aperture),
      focal_length: escape_telegram_markdown(
        photos_exifs_row.exif_info.clean.focal_length ?? photos_exifs_row.exif_info.focal_length
      ),
      focal_length_35mm: escape_telegram_markdown(photos_exifs_row.exif_info.focal_length_in_35mm_format),
      exposure: escape_telegram_markdown(
        photos_exifs_row.exif_info.clean.exposure ?? photos_exifs_row.exif_info.exposure
      ),
      aperture: escape_telegram_markdown(
        photos_exifs_row.exif_info.clean.aperture ?? photos_exifs_row.exif_info.aperture
      ),
      iso: escape_telegram_markdown(photos_exifs_row.exif_info.iso),
      exposure_program: escape_telegram_markdown(photos_exifs_row.exif_info.exposure_program),
      exposure_mode: escape_telegram_markdown(photos_exifs_row.exif_info.exposure_mode),
      flash: escape_telegram_markdown(photos_exifs_row.exif_info.flash),
      white_balance: escape_telegram_markdown(photos_exifs_row.exif_info.white_balance),
      metering_mode: escape_telegram_markdown(photos_exifs_row.exif_info.metering_mode),
      light_source: escape_telegram_markdown(photos_exifs_row.exif_info.light_source),
      brightness_value: escape_telegram_markdown(photos_exifs_row.exif_info.brightness_value),
      exposure_compensation: escape_telegram_markdown(
        photos_exifs_row.exif_info.clean.exposure_compensation ?? photos_exifs_row.exif_info.exposure_compensation
      ),
    },
  };

  return await generate_text(data, true);
}
