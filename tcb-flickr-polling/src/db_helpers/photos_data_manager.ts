import {
  PhotosExifsRow,
  PhotosMessagesRow,
  PhotosRow,
  PhotosRowMessageContentColumn,
  PhotosTagsRow,
  UsersRow,
} from './database_rows';

type ExifInfoItem = {
  tag: string;
  label: string;
  raw: string;
  clean?: string;
};

type ProcessedPhotoExifInfo = {
  IFD0: Record<string, ExifInfoItem>;
  ExifIFD: Record<string, ExifInfoItem>;
};

function delete_undefined_values(obj: any) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        delete_undefined_values(obj[key]);
      } else if (obj[key] === undefined) {
        delete obj[key];
      }
    }
  }
}

class PhotosDataManager {
  database: D1Database;
  actions_table_create_statement: D1PreparedStatement;
  photos_table_create_statement: D1PreparedStatement;
  photos_tags_table_create_statement: D1PreparedStatement;
  photos_exifs_table_create_statement: D1PreparedStatement;
  users_table_create_statement: D1PreparedStatement;
  photos_messages_table_create_statement: D1PreparedStatement;
  actions_table_select_statement: D1PreparedStatement;
  actions_table_insert_statement: D1PreparedStatement;
  actions_table_update_statement: D1PreparedStatement;
  photos_table_exist_statement: D1PreparedStatement;
  photos_table_insert_statement: D1PreparedStatement;
  photos_table_update_statement: D1PreparedStatement;
  photos_tags_table_exist_statement: D1PreparedStatement;
  photos_tags_table_insert_statement: D1PreparedStatement;
  photos_tags_table_update_statement: D1PreparedStatement;
  photos_exifs_table_exist_statement: D1PreparedStatement;
  photos_exifs_table_insert_statement: D1PreparedStatement;
  photos_exifs_table_update_statement: D1PreparedStatement;
  users_table_exist_statement: D1PreparedStatement;
  users_table_insert_statement: D1PreparedStatement;
  users_table_update_statement: D1PreparedStatement;
  photos_messages_table_select_statement: D1PreparedStatement;
  photos_messages_table_insert_statement: D1PreparedStatement;
  photos_messages_table_update_statement: D1PreparedStatement;

  constructor(database: D1Database) {
    this.database = database;

    // Statements: tables
    this.actions_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS actions (
      action STRING PRIMARY KEY,
      timestamp INTEGER NOT NULL
    )`);
    this.photos_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS photos (
      id STRING PRIMARY KEY,
      server STRING NOT NULL,
      secret STRING NOT NULL,
      owner STRING NOT NULL,
      info JSON NOT NULL
    )`);
    this.photos_tags_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS photos_tags (
      photo_id STRING NOT NULL,
      tag_id STRING NOT NULL,
      tag_info JSON NOT NULL,
      PRIMARY KEY (photo_id, tag_id)
    )`);
    this.photos_exifs_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS photos_exifs (
      photo_id STRING PRIMARY KEY,
      exif_info JSON NOT NULL
    )`);
    this.users_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS users (
      id STRING PRIMARY KEY,
      username STRING NOT NULL,
      realname STRING,
      location STRING
    )`);
    this.photos_messages_table_create_statement = this.database.prepare(`CREATE TABLE IF NOT EXISTS photos_messages (
      photo_id STRING PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      message_id INTEGER NOT NULL,
      message_hash STRING NOT NULL,
      photo_url STRING NOT NULL
    )`);

    // Statements: actions
    this.actions_table_select_statement = this.database.prepare('SELECT timestamp FROM actions WHERE action = ?1');
    this.actions_table_insert_statement = this.database.prepare(
      'INSERT INTO actions (action, timestamp) VALUES (?1, ?2)'
    );
    this.actions_table_update_statement = this.database.prepare('UPDATE actions SET timestamp = ?2 WHERE action = ?1');

    // Statements: photos
    this.photos_table_exist_statement = this.database.prepare(`SELECT id FROM photos WHERE id = ?1`);
    this.photos_table_insert_statement = this.database.prepare(
      `INSERT INTO photos (id, server, secret, owner, info) VALUES (?1, ?2, ?3, ?4, ?5)`
    );
    this.photos_table_update_statement = this.database.prepare(
      `UPDATE photos SET server = ?2, secret = ?3, owner = ?4, info = ?5 WHERE id = ?1`
    );

    // Statements: photos_tags
    this.photos_tags_table_exist_statement = this.database.prepare(
      `SELECT photo_id, tag_id FROM photos_tags WHERE photo_id = ?1 AND tag_id = ?2`
    );
    this.photos_tags_table_insert_statement = this.database.prepare(
      `INSERT INTO photos_tags (photo_id, tag_id, tag_info) VALUES (?1, ?2, ?3)`
    );
    this.photos_tags_table_update_statement = this.database.prepare(
      `UPDATE photos_tags SET tag_info = ?3 WHERE photo_id = ?1 AND tag_id = ?2`
    );

    // Statements: photos_exifs
    this.photos_exifs_table_exist_statement = this.database.prepare(
      `SELECT photo_id FROM photos_exifs WHERE photo_id = ?1`
    );
    this.photos_exifs_table_insert_statement = this.database.prepare(
      `INSERT INTO photos_exifs (photo_id, exif_info) VALUES (?1, ?2)`
    );
    this.photos_exifs_table_update_statement = this.database.prepare(
      `UPDATE photos_exifs SET exif_info = ?2 WHERE photo_id = ?1`
    );

    // Statements: users
    this.users_table_exist_statement = this.database.prepare(`SELECT id FROM users WHERE id = ?1`);
    this.users_table_insert_statement = this.database.prepare(
      `INSERT INTO users (id, username, realname, location) VALUES (?1, ?2, ?3, ?4)`
    );
    this.users_table_update_statement = this.database.prepare(
      `UPDATE users SET username = ?2, realname = ?3, location = ?4 WHERE id = ?1`
    );

    // Statements: photos_messages
    this.photos_messages_table_select_statement = this.database.prepare(
      `SELECT photo_id, chat_id, message_id, message_hash, photo_url FROM photos_messages WHERE photo_id = ?1`
    );
    this.photos_messages_table_insert_statement = this.database.prepare(
      `INSERT INTO photos_messages (photo_id, chat_id, message_id, message_hash, photo_url) VALUES (?1, ?2, ?3, ?4, ?5)`
    );
    this.photos_messages_table_update_statement = this.database.prepare(
      `UPDATE users SET chat_id = ?2, message_id = ?3, message_hash = ?4, photo_url = ?5 WHERE photo_id = ?1`
    );
  }

  // Initialization

  async initialize_tables(): Promise<void> {
    const result = await this.actions_table_create_statement.bind().run();
    await this.photos_table_create_statement.bind().run();
    await this.photos_tags_table_create_statement.bind().run();
    await this.photos_exifs_table_create_statement.bind().run();
    await this.users_table_create_statement.bind().run();
    await this.photos_messages_table_create_statement.bind().run();
  }

  // Actions

  async get_action_timestamp(action: string): Promise<number | null> {
    const { results } = await this.actions_table_select_statement.bind(action).all();
    if (results.length === 0) {
      return null;
    } else {
      return results[0].timestamp as number;
    }
  }

  async update_action_timestamp(action: string, timestamp: number): Promise<void> {
    await this.actions_table_update_statement.bind(action, timestamp).run();
  }

  async insert_action_timestamp(action: string, timestamp: number): Promise<void> {
    await this.actions_table_insert_statement.bind(action, timestamp).run();
  }

  // Photos - Data generation

  async generate_photos_row(photo_info: any): Promise<PhotosRow> {
    // photo_info is either a photo_base_info or a photo_info

    let page_url = undefined;
    if (photo_info.urls?.[0]?.url) {
      for (const url of photo_info.urls[0].url) {
        if (url.$.type === 'photopage') {
          page_url = url._;
          break;
        }
      }
    }

    const photos_row: PhotosRow = {
      id: photo_info.$.id,
      server: photo_info.$.server,
      secret: photo_info.$.secret,
      owner: photo_info.owner?.[0]?.$?.nsid ?? photo_info.$.owner,
      info: {
        title: photo_info.title?.[0],
        description: photo_info.description?.[0],
        page_url: page_url,
        original_format: photo_info.$?.originalformat,
        permission: {
          is_public: (photo_info.$.visibility?.[0]?.$?.ispublic ?? photo_info.$.ispublic) !== '0',
        },
        date: {
          taken: photo_info.dates?.[0]?.$?.taken,
          uploaded: photo_info.$?.dateuploaded,
          updated: photo_info.dates?.[0]?.$?.lastupdate,
        },
        count: {
          views: parseInt(photo_info.$?.views),
          comments: parseInt(photo_info.comments?.[0]),
        },
        location: {
          latitude: parseFloat(photo_info.location?.[0]?.$?.latitude),
          longitude: parseFloat(photo_info.location?.[0]?.$?.longitude),
          locality: photo_info.location?.[0].locality?.[0],
          neighbourhood: photo_info.location?.[0].neighbourhood?.[0],
          region: photo_info.location?.[0].region?.[0],
          country: photo_info.location?.[0]?.country?.[0],
        },
      },
    };
    delete_undefined_values(photos_row);

    return photos_row;
  }

  async generate_photos_tags_rows(photo_info: any): Promise<PhotosTagsRow[]> {
    const photos_tags_rows: PhotosTagsRow[] = [];
    if (photo_info.tags?.[0]?.tag) {
      for (const tag of photo_info.tags[0].tag) {
        const photos_tags_row: PhotosTagsRow = {
          photo_id: photo_info.$.id,
          tag_id: tag.$.id,
          tag_info: {
            tag_name: tag._,
            author_id: tag.$.author,
            author_name: tag.$.authorname,
            raw: tag.$.raw,
          },
        };
        photos_tags_rows.push(photos_tags_row);
      }
    }
    delete_undefined_values(photos_tags_rows);

    return photos_tags_rows;
  }

  async generate_photos_exifs_row(photo_exif_info: any): Promise<PhotosExifsRow> {
    const processed_photo_exif_info: ProcessedPhotoExifInfo = {
      IFD0: {},
      ExifIFD: {},
    };
    for (const exif_info of photo_exif_info.exif) {
      const exif_info_item: ExifInfoItem = {
        tag: exif_info.$.tag,
        label: exif_info.$.label,
        raw: exif_info.raw[0],
        clean: exif_info.clean?.[0],
      };
      if (exif_info.$.tagspace === 'IFD0') {
        processed_photo_exif_info.IFD0[exif_info.$.tag] = exif_info_item;
      } else if (exif_info.$.tagspace === 'ExifIFD') {
        processed_photo_exif_info.ExifIFD[exif_info.$.tag] = exif_info_item;
      }
    }

    const photos_exifs_row: PhotosExifsRow = {
      photo_id: photo_exif_info.$.id,
      exif_info: {
        make: processed_photo_exif_info.IFD0.Make?.raw,
        model: processed_photo_exif_info.IFD0.Model?.raw,
        lens_info: processed_photo_exif_info.ExifIFD.LensInfo?.raw,
        lens_model: processed_photo_exif_info.ExifIFD.LensModel?.raw,
        exposure: processed_photo_exif_info.ExifIFD.ExposureTime?.raw,
        aperture: processed_photo_exif_info.ExifIFD.FNumber?.raw,
        focal_length: processed_photo_exif_info.ExifIFD.FocalLength?.raw,
        focal_length_in_35mm_format: processed_photo_exif_info.ExifIFD.FocalLengthIn35mmFormat?.raw,
        iso: processed_photo_exif_info.ExifIFD.ISO?.raw,
        exposure_program: processed_photo_exif_info.ExifIFD.ExposureProgram?.raw,
        exposure_mode: processed_photo_exif_info.ExifIFD.ExposureMode?.raw,
        flash: processed_photo_exif_info.ExifIFD.Flash?.raw,
        white_balance: processed_photo_exif_info.ExifIFD.WhiteBalance?.raw,
        artist: processed_photo_exif_info.IFD0.Artist?.raw,
        copyright: processed_photo_exif_info.IFD0.Copyright?.raw,
        original_date: processed_photo_exif_info.ExifIFD.DateTimeOriginal?.raw,
        original_timezone: processed_photo_exif_info.ExifIFD.OffsetTimeOriginal?.raw,
        create_date: processed_photo_exif_info.ExifIFD.CreateDate?.raw,
        create_timezone: processed_photo_exif_info.ExifIFD.OffsetTimeDigitized?.raw,
        modify_date: processed_photo_exif_info.IFD0.ModifyDate?.raw,
        timezone: processed_photo_exif_info.ExifIFD.OffsetTime?.raw,
        max_aperture: processed_photo_exif_info.ExifIFD.MaxApertureValue?.raw,
        brightness_value: processed_photo_exif_info.ExifIFD.BrightnessValue?.raw,
        exposure_compensation: processed_photo_exif_info.ExifIFD.ExposureCompensation?.raw,
        metering_mode: processed_photo_exif_info.ExifIFD.MeteringMode?.raw,
        light_source: processed_photo_exif_info.ExifIFD.LightSource?.raw,
        clean: {
          exposure: processed_photo_exif_info.ExifIFD.ExposureTime?.clean,
          aperture: processed_photo_exif_info.ExifIFD.FNumber?.clean,
          focal_length: processed_photo_exif_info.ExifIFD.FocalLength?.clean,
          exposure_compensation: processed_photo_exif_info.ExifIFD.ExposureCompensation?.clean,
        },
      },
    };
    delete_undefined_values(photos_exifs_row);

    return photos_exifs_row;
  }

  async generate_users_row(photo_info: any): Promise<UsersRow> {
    const users_row: UsersRow = {
      id: photo_info.owner[0].$.nsid,
      username: photo_info.owner[0].$.username,
      realname: photo_info.owner[0].$.realname,
      location: photo_info.owner[0].$.location,
    };
    delete_undefined_values(users_row);

    return users_row;
  }

  // Photos - Upsert

  async upsert_photos_table(row: PhotosRow): Promise<void> {
    // No transaction: make sure there is only one instance running at the same time
    // (Using Durable Objects in current implementation)
    const { results } = await this.photos_table_exist_statement.bind(row.id).all();
    if (results.length === 0) {
      await this.photos_table_insert_statement
        .bind(row.id, row.server, row.secret, row.owner, JSON.stringify(row.info))
        .run();
    } else {
      await this.photos_table_update_statement
        .bind(row.id, row.server, row.secret, row.owner, JSON.stringify(row.info))
        .run();
    }
  }

  async upsert_photos_tags_table(row: PhotosTagsRow): Promise<void> {
    // No transaction: make sure there is only one instance running at the same time
    // (Using Durable Objects in current implementation)
    const { results } = await this.photos_tags_table_exist_statement.bind(row.photo_id, row.tag_id).all();
    if (results.length === 0) {
      await this.photos_tags_table_insert_statement.bind(row.photo_id, row.tag_id, JSON.stringify(row.tag_info)).run();
    } else {
      await this.photos_tags_table_update_statement.bind(row.photo_id, row.tag_id, JSON.stringify(row.tag_info)).run();
    }
  }

  async upsert_photos_exifs_table(row: PhotosExifsRow): Promise<void> {
    // No transaction: make sure there is only one instance running at the same time
    // (Using Durable Objects in current implementation)
    const { results } = await this.photos_exifs_table_exist_statement.bind(row.photo_id).all();
    if (results.length === 0) {
      await this.photos_exifs_table_insert_statement.bind(row.photo_id, JSON.stringify(row.exif_info)).run();
    } else {
      await this.photos_exifs_table_update_statement.bind(row.photo_id, JSON.stringify(row.exif_info)).run();
    }
  }

  async upsert_users_table(row: UsersRow): Promise<void> {
    // No transaction: make sure there is only one instance running at the same time
    // (Using Durable Objects in current implementation)
    const { results } = await this.users_table_exist_statement.bind(row.id).all();
    if (results.length === 0) {
      await this.users_table_insert_statement.bind(row.id, row.username, row.realname, row.location).run();
    } else {
      await this.users_table_update_statement.bind(row.id, row.username, row.realname, row.location).run();
    }
  }

  // Messages

  async get_existing_message(photo_id: string): Promise<PhotosMessagesRow | null> {
    const { results } = await this.photos_messages_table_select_statement.bind(photo_id).all();
    if (results.length === 0) {
      return null;
    } else {
      const row = results[0];
      const photos_messages_row: PhotosMessagesRow = {
        photo_id: row.photo_id as string,
        chat_id: row.chat_id as string,
        message_id: row.message_id as string,
        message_hash: row.message_hash as string,
        photo_url: row.photo_url as string,
      };
      return photos_messages_row;
    }
  }

  async update_message(row: PhotosMessagesRow): Promise<void> {
    await this.photos_messages_table_update_statement
      .bind(row.photo_id, row.chat_id, row.message_id, row.message_hash, row.photo_url)
      .run();
  }

  async insert_message(row: PhotosMessagesRow): Promise<void> {
    await this.photos_messages_table_insert_statement
      .bind(row.photo_id, row.chat_id, row.message_id, row.message_hash, row.photo_url)
      .run();
  }
}

export default PhotosDataManager;
