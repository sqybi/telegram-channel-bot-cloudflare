import generate_oauth_request, { OauthRequest } from './generate_oauth_request';
import fetch_get_with_url_params from '../fetch_helpers/fetch_get_with_url_params';
import report_error_to_telegram from '../telegram_helpers/report_error_to_telegram';
import xml2js from 'xml2js';
import { TcbFatalError } from '../errors';

export type FlickrOauthConfig = {
  oauth_token: string;
  oauth_token_secret: string;
  oauth_verifier: string;
  consumer_key: string;
  consumer_secret: string;
  telegram_bot_token?: string;
  telegram_error_reporting_chat_id?: string;
};

async function report_error(config: FlickrOauthConfig, throwing: boolean, text: string, plain_text?: string) {
  if (config.telegram_bot_token && config.telegram_error_reporting_chat_id) {
    await report_error_to_telegram(config.telegram_bot_token, config.telegram_error_reporting_chat_id, text);
  }
  if (throwing) {
    throw new TcbFatalError(plain_text ?? text);
  }
}

export default async function request_flickr_api(
  flickr_method: string,
  request: OauthRequest,
  config: FlickrOauthConfig,
  redirect_url: string
) {
  try {
    const rest_request_url = 'https://www.flickr.com/services/rest';
    const rest_request = await generate_oauth_request(
      'GET',
      rest_request_url,
      {
        oauth_token: config.oauth_token,
        oauth_verifier: config.oauth_verifier,
        method: flickr_method,
        ...request,
      },
      config.oauth_token_secret,
      config.consumer_key,
      config.consumer_secret
    );
    const rest_response = await fetch_get_with_url_params(rest_request_url, rest_request);
    if (rest_response.status === 401) {
      await report_error(
        config,
        true,
        `Need login: ${redirect_url}`
      );
    } else if (rest_response.status !== 200) {
      await report_error(
        config,
        true,
        `Flickr API error: ${rest_response.status} ${rest_response.statusText}\n${flickr_method}\n${JSON.stringify(
          request
        )}`
      );
    } else {
      const rest_response_data = await xml2js.parseStringPromise(await rest_response.text());
      if (rest_response_data.rsp.$.stat !== 'ok') {
        await report_error(
          config,
          true,
          `Flickr API error: ${rest_response_data.rsp.err[0].$.msg}\n${flickr_method}\n${JSON.stringify(request)}`
        );
      } else {
        return rest_response_data;
      }
    }
  } catch (error) {
    if (error instanceof TcbFatalError) {
      throw error;
    } else {
      const error_message = error instanceof Error ? (error as Error).message : String(error);
      const full_error_message = `Flickr API error: ${error_message}\n${flickr_method}\n${JSON.stringify(request)}}`;
      await report_error(config, false, full_error_message);
      throw new TcbFatalError(full_error_message);
    }
  }
}
