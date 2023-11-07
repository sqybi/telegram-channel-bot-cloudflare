import request_flickr_api, { FlickrOauthConfig } from './oauth_helpers/request_flickr_api';
import send_telegram_bot_api from './telegram_helpers/send_telegram_bot_api';
import report_error_to_telegram from './telegram_helpers/report_error_to_telegram';
import escape_telegram_markdown from './telegram_helpers/escape_telegram_markdown';
import { TcbFatalError } from './errors';
import moment from 'moment';

type ExifData = Record<string, any>;

function generate_exif(raw_exif: any): ExifData {
  const exif_labels = new Set([
    'Date and Time (Original)',
    'Offset Time',
    'Make',
    'Model',
    'Lens Model',
    'Focal Length',
    'Focal Length (35mm format)',
    'Exposure Program',
    'Exposure',
    'Aperture',
    'ISO Speed',
  ]);

  const exif: ExifData = {};
  for (const raw_exif_item of raw_exif) {
    if (exif_labels.has(raw_exif_item.$.label)) {
      exif[raw_exif_item.$.label] = raw_exif_item.raw[0];
    }
  }

  return exif;
}

function generate_photo_information(base_info: any, ext_info: any, exif: ExifData) {
  // Title
  let result = `*${base_info.title}*\n`;

  // Description
  if (ext_info.description[0]) {
    result += escape_telegram_markdown(`${ext_info.description[0]}\n\n`);
  }

  // Flickr page
  let flickr_url = null;
  if (ext_info.urls && ext_info.urls[0].url) {
    for (const url of ext_info.urls[0].url) {
      if (url.$.type === 'photopage') {
        flickr_url = url._;
      }
    }
    if (flickr_url) {
      result += `[Flickr 页面](${flickr_url})\n\n`;
    }
  }

  // Date
  if (exif['Date Created']) {
    const datetime_created = moment.parseZone(
      `${exif['Date and Time (Original)']}${exif['Offset Time']}`,
      'YYYY:MM:DD HH:mm:ssZ'
    );
    result += `*拍摄时间* ${escape_telegram_markdown(datetime_created.toISOString())}\n`;
  }

  // Model
  if (exif['Model']) {
    result += `*相机型号* ${escape_telegram_markdown(exif['Model'])}\n`;
  }

  // Lens Model
  if (exif['Lens Model']) {
    result += `*镜头型号* ${escape_telegram_markdown(exif['Lens Model'])}\n`;
  }

  // Focal Length
  if (exif['Focal Length'] || exif['Focal Length (35mm format)']) {
    let key = '';
    let value = '';
    if (exif['Focal Length']) {
      key += '焦距';
      value += exif['Focal Length'];
    }
    if (exif['Focal Length'] && exif['Focal Length (35mm format)']) {
      key += ' / ';
      value += ' / ';
    }
    if (exif['Focal Length (35mm format)']) {
      key += '35mm 等效焦距';
      value += exif['Focal Length (35mm format)'];
    }
    result += `*${key}* ${escape_telegram_markdown(value)}\n`;
  }

  // Exposure Program
  if (exif['Exposure Program']) {
    result += `*曝光程序* ${escape_telegram_markdown(exif['Exposure Program'])}\n`;
  }

  // Exposure
  if (exif['Exposure']) {
    result += `*曝光时间* ${escape_telegram_markdown(exif['Exposure'])}\n`;
  }

  // Aperture
  if (exif['Aperture']) {
    result += `*光圈* ${escape_telegram_markdown(exif['Aperture'])}\n`;
  }

  // ISO Speed
  if (exif['ISO Speed']) {
    result += `*ISO* ${escape_telegram_markdown(exif['ISO Speed'])}\n`;
  }

  return result;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    let status_obj_id = await env.TCB_KV.get('worker.polling.running_status_id');
    if (!status_obj_id) {
      status_obj_id = env.WORKER_RUNNING_STATUS.newUniqueId().toString();
      await env.TCB_KV.put('worker.polling.running_status_id', status_obj_id);
    }
    const status_obj = env.WORKER_RUNNING_STATUS.get(env.WORKER_RUNNING_STATUS.idFromString(status_obj_id));
    const status = await status_obj.fetch('http://status/get');
    if (await status.text() === 'working') {
      console.log('Another plling worker is working, skip this run');
      return;
    }

    try {
      await status_obj.fetch('http://status/set/working');

      const redirect_url = `https://${env.DOMAIN}/flickr/oauth`;
      const telegram_bot_token = await env.TCB_KV.get('telegram.bot_token');
      if (!telegram_bot_token) {
        throw new TcbFatalError('telegram.bot_token config missing!');
      }
      const telegram_error_reporting_chat_id = await env.TCB_KV.get('telegram.error_reporting_chat_id');
      if (!telegram_error_reporting_chat_id) {
        throw new TcbFatalError('telegram.error_reporting_chat_id config missing!');
      }
      const telegram_photo_channel_id = await env.TCB_KV.get('telegram.photo_channel_id');
      if (!telegram_photo_channel_id) {
        await report_error_to_telegram(
          telegram_bot_token,
          telegram_error_reporting_chat_id,
          'telegram.photo_channel_id config missing!'
        );
        throw new TcbFatalError('telegram.photo_channel_id config missing!');
      }

      const flickr_config: FlickrOauthConfig = {
        oauth_token: (await env.TCB_KV.get('flickr.oauth.token')) || '',
        oauth_token_secret: (await env.TCB_KV.get('flickr.oauth.token_secret')) || '',
        oauth_verifier: (await env.TCB_KV.get('flickr.oauth.verifier')) || '',
        consumer_key: (await env.TCB_KV.get('flickr.consumer.key')) || '',
        consumer_secret: (await env.TCB_KV.get('flickr.consumer.secret')) || '',
        telegram_bot_token,
        telegram_error_reporting_chat_id,
      };
      if (!flickr_config.oauth_token || !flickr_config.oauth_token_secret || !flickr_config.oauth_verifier) {
        await report_error_to_telegram(
          telegram_bot_token,
          telegram_error_reporting_chat_id,
          `Need login: ${redirect_url}`
        );
        throw new TcbFatalError(`Need login: ${redirect_url}`);
      } else if (!flickr_config.consumer_key || !flickr_config.consumer_secret) {
        await report_error_to_telegram(
          telegram_bot_token,
          telegram_error_reporting_chat_id,
          'flickr.consumer.key / flickr.consumer.secret configs missing!'
        );
        throw new TcbFatalError('flickr.consumer.key / flickr.consumer.secret configs missing!');
      }

      // D1 SQL statements
      const action_statement = env.TCB_DB.prepare('SELECT timestamp FROM actions WHERE action = ?1');
      const insert_action_statement = env.TCB_DB.prepare('INSERT INTO actions (action, timestamp) VALUES (?1, ?2)');
      const update_action_statement = env.TCB_DB.prepare('UPDATE actions SET timestamp = ?2 WHERE action = ?1');
      const photo_statement = env.TCB_DB.prepare('SELECT * FROM photos WHERE id = ?1');
      const insert_photo_statement = env.TCB_DB.prepare(
        'INSERT INTO photos (id, secret, owner, is_public, is_published) VALUES (?1, ?2, ?3, ?4, ?5)'
      );
      const update_photo_statement = env.TCB_DB.prepare(
        'UPDATE photos SET secret = ?2, owner = ?3, is_public = ?4 WHERE id = ?1'
      );
      const update_photo_is_published_statement = env.TCB_DB.prepare(
        'UPDATE photos SET is_published = ?2 WHERE id = ?1'
      );

      // Polling Flickr photos
      try {
        const update_time = Math.floor(new Date().getTime() / 1000);

        const { results: recently_updated_action_result } = await action_statement.bind('recentlyUpdated').all();
        let recently_updated_action_timestamp = 1; // default value
        if (recently_updated_action_result.length === 0) {
          await insert_action_statement.bind('recentlyUpdated', recently_updated_action_timestamp).run();
        } else {
          recently_updated_action_timestamp = recently_updated_action_result[0].timestamp as number;
        }

        let page = 1;
        while (true) {
          // Get new photos
          const recently_updated_data = await request_flickr_api(
            'flickr.photos.recentlyUpdated',
            {
              min_date: recently_updated_action_timestamp.toString(),
              page: page.toString(),
            },
            flickr_config,
            redirect_url
          );

          // Check each photo
          if (recently_updated_data.rsp.photos[0]?.photo) {
            for (const photo of recently_updated_data.rsp.photos[0].photo) {
              // Get photo base info
              const photo_base_info = photo.$;

              // Check if photo has been sent
              const { results: photo_sent_result } = await photo_statement.bind(photo_base_info.id).all();
              if (photo_sent_result.length > 0) {
                // Update existing photo info
                await update_photo_statement
                  .bind(photo_base_info.id, photo_base_info.secret, photo_base_info.owner, photo_base_info.ispublic)
                  .run();
                // Telegram doesn't support updating photo caption, so skip if photo has been published
                if (photo_sent_result[0].is_published === 1) {
                  continue;
                }
              } else {
                // Add new photo to database, with is_published = 0
                await insert_photo_statement
                  .bind(photo_base_info.id, photo_base_info.secret, photo_base_info.owner, photo_base_info.ispublic, 0)
                  .run();
              }

              // Skip if photo is not public
              if (photo_base_info.ispublic === '0') {
                continue;
              }

              // Get photo ext info
              const photo_ext_info_data = await request_flickr_api(
                'flickr.photos.getInfo',
                {
                  photo_id: photo_base_info.id,
                  secret: photo_base_info.secret,
                },
                flickr_config,
                redirect_url
              );
              const photo_ext_info = photo_ext_info_data.rsp.photo[0];

              // Get photo exif
              const photo_exif_data = await request_flickr_api(
                'flickr.photos.getExif',
                {
                  photo_id: photo_base_info.id,
                  secret: photo_base_info.secret,
                },
                flickr_config,
                redirect_url
              );
              const exif = generate_exif(photo_exif_data.rsp.photo[0].exif);

              // Send to Telegram channel
              await send_telegram_bot_api('sendPhoto', telegram_bot_token, {
                chat_id: telegram_photo_channel_id,
                photo: `https://live.staticflickr.com/${photo_base_info.server}/${photo_base_info.id}_${photo_base_info.secret}_c.jpg`,
                caption: generate_photo_information(photo_base_info, photo_ext_info, exif),
                parse_mode: 'MarkdownV2',
              });

              // Update photo is_published
              await update_photo_is_published_statement.bind(photo_base_info.id, 1).run();
            }
          }

          // Exit loop if current page is the last page
          if (page >= parseInt(recently_updated_data.rsp.photos[0].$.pages ?? 0)) {
            break;
          }
          page += 1;
        }

        // Update recentlyUpdated action timestamp
        await update_action_statement.bind('recentlyUpdated', update_time).run();
      } catch (error) {
        if (error instanceof TcbFatalError) {
          throw error;
        }
        let error_message = error instanceof Error ? error.message : String(error);
        await report_error_to_telegram(telegram_bot_token, telegram_error_reporting_chat_id, error_message);
      }
    } finally {
      await status_obj.fetch('http://status/set/idle');
    }
  },
};

export class WorkerRunningStatus {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    let status: string = (await this.state.storage.get('status')) || 'idle';
    switch (url.pathname) {
      case '/get':
        return new Response(status.toString());
      case '/set/working':
        status = 'working';
        break;
      case '/set/idle':
        status = 'idle';
        break;
      default:
        return new Response('Not found', { status: 404 });
    }
    await this.state.storage.put('status', status);

    return new Response(status.toString());
  }
}
