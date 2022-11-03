import type { ParsedArgv } from '../utils/env';
import { ethers, utils } from 'ethers';
import { parsers } from '@windingtree/org.id-utils';
import { createAuthJWTWithEthers, createAuthJWT } from '@windingtree/org.id-auth/dist/tokens';
import { initOrgIdResolver } from './resolveOrgId';
import { printInfo, printWarn } from '../utils/console';
import { getKeyPairsFromProject } from './project';
import prompts from 'prompts';
import { decrypt } from './common';
import { parseDid } from '@windingtree/org.id-utils/dist/parsers';
import { JWK } from '@windingtree/org.id-auth/dist/keys';

const createJwtWithEthereum = async (
  issuer: string,
  audience: string,
  scope: string[] | undefined,
  expiration: number | undefined,
  accountAddress: string,
  signerKey: string
): Promise<string> => {
  const signer = new ethers.Wallet(signerKey);

  const signerAddress = await signer.getAddress();

  if (utils.getAddress(accountAddress) !== signerAddress) {
    throw new Error(
      `blockchainAccountId address is different from the signer address: ${signerAddress}`
    );
  }

  return await createAuthJWTWithEthers(
    signer,
    issuer,
    audience,
    scope,
    expiration
  );
};

const createJwtWithPem = async (
  issuer: string,
  audience: string,
  scope: string[] | undefined,
  expiration: number | undefined,
  signerKey: JWK
): Promise<string> => {
  return await createAuthJWT(
    signerKey,
    issuer,
    audience,
    scope,
    expiration
  );
};

export const createJwt = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {

  if (!args['--issuer']) {
    throw new Error(
      'A token issuer did must be provided using "--issuer" option'
    );
  }

  if (!args['--audience']) {
    throw new Error(
      'A token audience did must be provided using "--audience" option'
    );
  }

  let expiration: number | undefined;

  if (args['--expiration']) {
    expiration = Number(args['--expiration']);

    if (expiration <= Date.now()) {
      throw new Error(
        'Invalid "--expiration" value provided. Expiration cannot be in the past'
      );
    }
  }

  let scope: string[] | undefined;

  if (args['--scope']) {
    try {
      scope = args['--scope'].split(',');
    } catch (error) {
      throw new Error('Invalid "--scope" value');
    }
  }

  const resolver = await initOrgIdResolver(basePath, args['--issuer']);

  printInfo(`Resolving the ${args['--issuer']} please wait...`);

  const { didDocument, didResolutionMetadata } = await resolver.resolve(
    args['--issuer']
  );

  if (didDocument === null) {
    printWarn(
      `ORGiD with DID: "${args['--issuer']}" has been resolved with the error:`
    );
    printWarn(didResolutionMetadata.error || 'Unknown error');
    return;
  } else {
    printInfo('Success. The issuer DID is resolved and valid');
  }

  const verificationMethod = didDocument?.verificationMethod?.find(
    v => v.id === args['--issuer']
  );

  if (!verificationMethod) {
    throw Error(`Verification method ${args['--issuer']} not found`);
  }

  const keyPairRecords = await getKeyPairsFromProject(basePath);

  const { fragment } = parseDid(args['--issuer']);

  if (!fragment) {
    throw new Error(`Unable to extract verification method key Id from ${args['--issuer']}`);
  }

  const keyPair = keyPairRecords.find(
    k => k.tag === fragment
  );

  if (!keyPair) {
    throw new Error(`Key pair ${fragment} not found in the project`);
  }

  const { password } = await prompts({
    type: 'password',
    name: 'password',
    message: `Enter the password for the key pair "${keyPair.tag}"`
  });

  let signerKey = decrypt(keyPair.privateKey, password);
  let token: string;

  switch (keyPair.type) {
    case 'ethereum':
      token = await createJwtWithEthereum(
        args['--issuer'],
        args['--audience'],
        scope,
        expiration,
        keyPair.publicKey,
        signerKey
      );
      break;
    case 'pem':
      signerKey = JSON.parse(signerKey);
      token = await createJwtWithPem(
        args['--issuer'],
        args['--audience'],
        scope,
        expiration,
        signerKey as unknown as JWK
      );
      break;
    default:
      throw new Error(
        `Key pair ${keyPair.tag} of type ${keyPair.type} cannot be used for the JWT signing`
      );
  }

  printInfo(`\n\nJWT: ${token}`);
};
