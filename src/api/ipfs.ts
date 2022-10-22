// import { createReadStream } from 'fs';
// import FormData from 'form-data';
// import { http } from '@windingtree/org.id-utils';
// import { ExtraHeaders } from '@windingtree/org.id-utils/dist/http';
import { http } from '@windingtree/org.id-utils';
import { FileObject } from 'files-from-path';
import { Web3Storage, getFilesFromPath, Filelike } from 'web3.storage';
import { getApiKey } from './common';

export interface IpfsApiAddResponse {
  Name: string;
  Hash: string;
  Size: string;
}

const createWeb3StorageClient = async (basePath: string): Promise<Web3Storage> => {
  return new Web3Storage({ token: await getApiKey(basePath, 'w3s') });
};

const getFiles = async (path: string): Promise<FileObject[]> => {
  const files = await getFilesFromPath(path);
  return files;
};

export const addToIpfs = async (basePath: string, filePath: string): Promise<string> => {
  const client = await createWeb3StorageClient(basePath);
  const files = await getFiles(filePath);
  const cid = await client.put(files as Iterable<Filelike>, { wrapWithDirectory: false });
  return cid;
};

export const removeFromIpfs = async (basePath: string, cid: string): Promise<void> => {
  // will be implemented later
};

export const getFromIpfs = async (basePath: string, cid: string): Promise<unknown> => {
  return http.request(
    `https://w3s.link/ipfs/${cid}`,
    'GET',
    undefined,
    undefined,
    10000 // 10 sec timeout
  );
};

// export const defaultIpfsApiHost = process.env.IPFS_API_HOST;

// prepare extra auth headers
// export const getAuthHeaders = (): ExtraHeaders => {
//   const authHeaders = {};
//   // if IPFS API needs auth build auth headers
//   if (process.env.IPFS_API_AUTHORIZED === "true") {
//     const creds = process.env.IPFS_API_AUTH_CREDENTIALS;
//     switch (process.env.IPFS_API_AUTH_TYPE) {
//       case "basic": {
//         // creds in form USERNAME:PASSWORD
//         if (!creds) throw new Error("'IPFS_API_AUTH_CREDENTIALS=USERNAME:PASSWORD' env variable must be defined")
//         const base64Creds = Buffer.from(creds).toString("base64");
//         authHeaders["Authorization"] = `Basic ${base64Creds}`;
//         break;
//       }
//       case "bearerToken": {
//         // creds contain JWT
//         if (!creds) throw new Error("'IPFS_API_AUTH_CREDENTIALS=JWT' env variable must be defined");
//         authHeaders["Authorization"] = `Bearer ${creds}`;
//         break;
//       }
//       default:
//         break;
//     }
//   }

//   return authHeaders;
// }

// Adds and pin a file to IPFS
// export const addToIpfs = (
//   filePath: string,
//   pin = true
// ): Promise<IpfsApiAddResponse> => {
//   const readStream = createReadStream(filePath);
//     const form = new FormData();
//     form.append(
//       'file',
//       readStream
//     );

//     return http.request(
//       `${defaultIpfsApiHost}/api/v0/add?pin=${pin}`,
//       'POST',
//       form,
//       {
//         ...form.getHeaders(),
//         ...getAuthHeaders()
//       }
//     ) as Promise<IpfsApiAddResponse>;
// };

// Remove file pin
// export const removeFromIpfs = (
//   cid: string
// ): Promise<IpfsApiAddResponse> =>
//   http.request(
//     `${defaultIpfsApiHost}/api/v0/pin/rm?arg=${cid}&recursive=true`,
//     'POST'
//   ) as Promise<IpfsApiAddResponse>;

// export const getFromIpfs = (
//   cid: string
// ): Promise<unknown> =>
//   http.request(
//     `${defaultIpfsApiHost}/api/v0/cat?arg=${cid}`,
//     'POST'
//   ) as Promise<unknown>;
