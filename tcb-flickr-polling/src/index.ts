import { PhotosMessagesRow } from './db_helpers/database_rows';
import PhotosDataManager from './db_helpers/photos_data_manager';
import { TcbFatalError } from './errors';
import generate_photo_message from './message_generators/photo_message_generator';
import generate_photo_message_hash from './message_generators/photo_message_hash_generator';
import request_flickr_api, { FlickrOauthConfig } from './oauth_helpers/request_flickr_api';
import report_error_to_telegram from './telegram_helpers/report_error_to_telegram';
import send_telegram_bot_api from './telegram_helpers/send_telegram_bot_api';

function sleep(duration_ms: number) {
  return new Promise(resolve => setTimeout(resolve, duration_ms));
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    let status_obj_id = await env.TCB_KV.get('worker.polling.running_status_id');
    if (!status_obj_id) {
      status_obj_id = env.WORKER_RUNNING_STATUS.newUniqueId().toString();
      await env.TCB_KV.put('worker.polling.running_status_id', status_obj_id);
    }
    let status_obj;
    try {
      status_obj = env.WORKER_RUNNING_STATUS.get(env.WORKER_RUNNING_STATUS.idFromString(status_obj_id));
    } catch (error) {
      if (error instanceof TypeError) {
        status_obj_id = env.WORKER_RUNNING_STATUS.newUniqueId().toString();
        await env.TCB_KV.put('worker.polling.running_status_id', status_obj_id);
        status_obj = env.WORKER_RUNNING_STATUS.get(env.WORKER_RUNNING_STATUS.idFromString(status_obj_id));
      } else {
        throw error;
      }
    }
    const lock_status = await status_obj.fetch('http://status/acquire');
    if (!lock_status.ok) {
      console.log("Another polling worker is working, skip this run");
      return;
    }

    try {
      // Get Telegram configs
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

      // Get Flickr OAuth configs
      const redirect_url = `https://${env.DOMAIN}/flickr/oauth`;
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

      // Polling Flickr photos
      try {
        const update_time = Math.floor(new Date().getTime() / 1000);

        const photos_data_manager = new PhotosDataManager(env.TCB_DB);
        await photos_data_manager.initialize_tables();

        const recently_updated_action_timestamp = await photos_data_manager.get_action_timestamp('recentlyUpdated');

        const recently_updated_photo_base_infos = [];
        let page = 1;
        while (true) {
          // Get new photos
          const recently_updated_data = await request_flickr_api(
            'flickr.photos.recentlyUpdated',
            {
              min_date: recently_updated_action_timestamp?.toString() || '1',
              page: page.toString(),
            },
            flickr_config,
            redirect_url
          );

          // Append each photo to list
          if (recently_updated_data.rsp.photos[0]?.photo) {
            for (const photo_base_info of recently_updated_data.rsp.photos[0].photo) {
              recently_updated_photo_base_infos.push(photo_base_info);
            }
          }

          // Exit loop if current page is the last page
          if (page >= parseInt(recently_updated_data.rsp.photos[0].$.pages ?? 0)) {
            break;
          }
          page += 1;
        }

        // Reverse photo list to make sure the oldest photo is processed first
        recently_updated_photo_base_infos.reverse();

        for (const photo_base_info of recently_updated_photo_base_infos) {
          // Useful items in photo base info
          const photo_id = photo_base_info.$.id;
          const photo_secret = photo_base_info.$.secret;

          // Get full photo info
          const photo_info_data = await request_flickr_api(
            'flickr.photos.getInfo',
            {
              photo_id,
              secret: photo_secret,
            },
            flickr_config,
            redirect_url
          );
          const photo_info = photo_info_data.rsp.photo[0];

          // Get photo EXIF info
          const photo_exif_data = await request_flickr_api(
            'flickr.photos.getExif',
            {
              photo_id,
              secret: photo_secret,
            },
            flickr_config,
            redirect_url
          );
          const photo_exif_info = photo_exif_data.rsp.photo[0];

          // Generate DB structures
          const photos_row = await photos_data_manager.generate_photos_row(photo_info);
          const photos_tags_rows = await photos_data_manager.generate_photos_tags_rows(photo_info);
          const photos_exifs_row = await photos_data_manager.generate_photos_exifs_row(photo_exif_info);
          const users_row = await photos_data_manager.generate_users_row(photo_info);

          // Update DB
          await photos_data_manager.upsert_photos_table(photos_row);
          for (const photos_tags_row of photos_tags_rows) {
            await photos_data_manager.upsert_photos_tags_table(photos_tags_row);
          }
          await photos_data_manager.upsert_photos_exifs_table(photos_exifs_row);
          await photos_data_manager.upsert_users_table(users_row);

          if (photos_row.info.permission.is_public) {
            const message_content_markdown = await generate_photo_message(
              photos_row,
              photos_exifs_row,
              photos_tags_rows
            );
            const message_content_hash = await generate_photo_message_hash(message_content_markdown);
            const message_photo_url = `https://live.staticflickr.com/${photos_row.server}/${photos_row.id}_${photos_row.secret}_c.jpg`;

            // Send or update Telegram message
            const posted_message = await photos_data_manager.get_existing_message(photo_id);
            if (posted_message?.chat_id?.toString() !== telegram_photo_channel_id) {
              // Send new message when no posted message, or posted message is in another channel
              const telegram_response = await send_telegram_bot_api('sendPhoto', telegram_bot_token, {
                chat_id: telegram_photo_channel_id,
                photo: message_photo_url,
                caption: message_content_markdown,
                parse_mode: 'MarkdownV2',
              });
              const telegram_response_json = (await telegram_response.json()) as any;
              if (!telegram_response_json.ok) {
                throw new TcbFatalError(`Telegram API error:\n${JSON.stringify(telegram_response_json)}`);
              }
              const message_row: PhotosMessagesRow = {
                photo_id,
                chat_id: telegram_photo_channel_id,
                message_id: telegram_response_json.result.message_id,
                message_hash: message_content_hash,
                photo_url: message_photo_url,
              };
              if (posted_message) {
                await photos_data_manager.update_message(message_row);
              } else {
                await photos_data_manager.insert_message(message_row);
              }
            } else {
              // Update existing message if caption changed
              if (posted_message.message_hash !== message_content_hash) {
                const telegram_response = await send_telegram_bot_api('editMessageCaption', telegram_bot_token, {
                  chat_id: posted_message.chat_id,
                  message_id: posted_message.message_id,
                  caption: message_content_markdown,
                  parse_mode: 'MarkdownV2',
                });
                const telegram_response_json = (await telegram_response.json()) as any;
                if (!telegram_response_json.ok) {
                  throw new TcbFatalError(`Telegram API error:\n${JSON.stringify(telegram_response_json)}`);
                }
                const message_row: PhotosMessagesRow = {
                  photo_id,
                  chat_id: telegram_photo_channel_id,
                  message_id: telegram_response_json.result.message_id,
                  message_hash: message_content_hash,
                  photo_url: message_photo_url,
                };
                await photos_data_manager.update_message(message_row);
              }
            }
          }
        }

        // Update recentlyUpdated action timestamp
        if (recently_updated_action_timestamp) {
          await photos_data_manager.update_action_timestamp('recentlyUpdated', update_time);
        } else {
          await photos_data_manager.insert_action_timestamp('recentlyUpdated', update_time);
        }
      } catch (error) {
        if (error instanceof TcbFatalError) {
          throw error;
        }
        let error_message = error instanceof Error ? error.message + '\n' + error.stack ?? '' : String(error);
        await report_error_to_telegram(telegram_bot_token, telegram_error_reporting_chat_id, error_message);
      }
    } finally {
      const MAX_RETRIES = 10;
      const MAX_DELAY = 60 * 1000;  // 60 * 1000ms = 60s
      let attempt = 0;
      let delay = 1000;  // 1000ms = 1s
      while (true) {
        try {
          const release_status = await status_obj.fetch('http://status/release');
          if (release_status.ok) {
            break;
          }
          console.log("Error when releasing lock: ", release_status.status, release_status.statusText);
        } catch (error) {
          console.log("Error when releasing lock: ", error);
        }

        if (attempt >= MAX_RETRIES) {
          throw new Error(`Failed to relase lock after ${MAX_RETRIES} retries.`);
        }

        console.log(`Waiting for ${delay / 1000} seconds before retrying...`);
        await sleep(delay);

        delay = Math.min(MAX_DELAY, delay * 2);
        attempt++;
      }
    }
  },
};

export class WorkerRunningStatus {
  state: DurableObjectState;
  locked: boolean;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.locked = false;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/acquire':
        if (this.locked) {
          return new Response("Lock is already acquired", { status: 400 });
        } else {
          this.locked = true;
          await this.state.storage.put("locked", true);
          return new Response("Lock acquired", { status: 200 });
        }
      case '/release':
        this.locked = false;
        await this.state.storage.delete("locked");
        return new Response("Lock released", { status: 200 });
      default:
        return new Response('Not found', { status: 404 });
    }
  }
}
