import { createReadStream } from 'fs';
import FormData from 'form-data';
import { http } from '@windingtree/org.id-utils';
import { ExtraHeaders } from '@windingtree/org.id-utils/dist/http';

export interface IpfsApiAddResponse {
  Name: string;
  Hash: string;
  Size: string;
}

export const defaultIpfsApiHost = process.env.IPFS_API_HOST;

// prepare extra auth headers
export const getAuthHeaders = (): ExtraHeaders => {
  const authHeaders = {};
  // if IPFS API needs auth build auth headers
  if (process.env.IPFS_API_AUTHORIZED === "true") {
    const creds = process.env.IPFS_API_AUTH_CREDENTIALS;
    switch (process.env.IPFS_API_AUTH_TYPE) {
      case "basic": {
        // creds in form USERNAME:PASSWORD
        if (!creds) throw new Error("'IPFS_API_AUTH_CREDENTIALS=USERNAME:PASSWORD' env variable must be defined")
        const base64Creds = Buffer.from(creds).toString("base64");
        authHeaders["Authorization"] = `Basic ${base64Creds}`;
        break;
      }
      case "bearerToken": {
        // creds contain JWT
        if (!creds) throw new Error("'IPFS_API_AUTH_CREDENTIALS=JWT' env variable must be defined");
        authHeaders["Authorization"] = `Bearer ${creds}`;
        break;
      }
      default:
        break;
    }
  }

  return authHeaders;
}

// Adds and pin a file to IPFS
export const addToIpfs = (
  filePath: string,
  pin = true
): Promise<IpfsApiAddResponse> => {
  const readStream = createReadStream(filePath);
    const form = new FormData();
    form.append(
      'file',
      readStream
    );

    return http.request(
      `${defaultIpfsApiHost}/api/v0/add?pin=${pin}`,
      'POST',
      form,
      {
        ...form.getHeaders(),
        ...getAuthHeaders()
      }
    ) as Promise<IpfsApiAddResponse>;
};

// Remove file pin
export const removeFromIpfs = (
  cid: string
): Promise<IpfsApiAddResponse> =>
  http.request(
    `${defaultIpfsApiHost}/api/v0/pin/rm?arg=${cid}&recursive=true`,
    'POST'
  ) as Promise<IpfsApiAddResponse>;

export const getFromIpfs = (
  cid: string
): Promise<unknown> =>
  http.request(
    `${defaultIpfsApiHost}/api/v0/cat?arg=${cid}`,
    'POST'
  ) as Promise<unknown>;
