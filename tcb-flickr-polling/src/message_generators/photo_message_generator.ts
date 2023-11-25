import { PhotosExifsRow, PhotosRow, PhotosTagsRow } from '../db_helpers/database_rows';
import escape_telegram_markdown from '../telegram_helpers/escape_telegram_markdown';

const MAX_CAPTION_LENGTH = 1024;

async function generate_caption(data: any, length_limit_mode: boolean = false): Promise<string> {
  const components = [
    `*${data.title}*`,
    data.exif.artist ? `  // ${data.exif.artist}` : '',
    '\n\n',
    data.description ? `${data.description}` : '\\.\\.\\.',
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
  ];

  if (length_limit_mode) {
    let result = '';
    for (const component of components) {
      if (result.length + component.length > MAX_CAPTION_LENGTH) {
        result += '...';
        break;
      }
      result += component;
    }
    return result;
  } else {
    return components.join('');
  }
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

  let result = await generate_caption(data);
  if (result.length > MAX_CAPTION_LENGTH) {
    const diff = result.length - MAX_CAPTION_LENGTH + 3;
    data.description = data.description?.slice(0, -diff);
    if (data.description) {
      data.description = data.description + '...';
    }
    result = await generate_caption(data, true);
  }

  return result;
}
