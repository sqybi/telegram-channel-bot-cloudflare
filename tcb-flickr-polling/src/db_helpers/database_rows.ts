// Table: photos_messages

export type PhotosMessagesRow = {
  photo_id: string;
  chat_id: string;
  message_id: string;
  message_hash: string;
  photo_url: string;
};

// Table: photos

export type PhotosRowInfoColumn = {
  title: string;
  description?: string;
  page_url?: string;
  original_format?: string;
  permission: {
    is_public: boolean;
  };
  date: {
    taken?: string;
    uploaded?: string;
    updated?: string;
  };
  count: {
    views?: number;
    comments?: number;
  };
  location: {
    latitude?: number;
    longitude?: number;
    locality?: string;
    neighbourhood?: string;
    region?: string;
    country?: string;
  };
};

export type PhotosRow = {
  id: string;
  server: string;
  secret: string;
  owner: string;
  info: PhotosRowInfoColumn;
};

// Table: photos_tags

export type PhotosTagsRowInfoColumn = {
  tag_name: string;
  author_id: string;
  author_name: string;
  raw: string;
};

export type PhotosTagsRow = {
  photo_id: string;
  tag_id: string;
  tag_info: PhotosTagsRowInfoColumn;
};

// Table: photos_exifs

export type PhotosExifsRowInfoColumn = {
  make?: string;
  model?: string;
  lens_info?: string;
  lens_model?: string;
  exposure?: string;
  aperture?: string;
  focal_length?: string;
  focal_length_in_35mm_format?: string;
  iso?: string;
  exposure_program?: string;
  exposure_mode?: string;
  flash?: string;
  white_balance?: string;
  artist?: string;
  copyright?: string;
  original_date?: string;
  original_timezone?: string;
  create_date?: string;
  create_timezone?: string;
  modify_date?: string;
  timezone?: string;
  max_aperture?: string;
  brightness_value?: string;
  exposure_compensation?: string;
  metering_mode?: string;
  light_source?: string;
  clean: {
    exposure?: string;
    aperture?: string;
    focal_length?: string;
    exposure_compensation?: string;
  };
};

export type PhotosExifsRow = {
  photo_id: string;
  exif_info: PhotosExifsRowInfoColumn;
};

// Table: users

export type UsersRow = {
  id: string;
  username: string;
  realname?: string;
  location?: string;
};
