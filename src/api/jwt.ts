import type { ParsedArgv } from '../utils/env';
import { ethers, utils } from 'ethers';
import { parsers } from '@windingtree/org.id-utils';
import { createAuthJWTWithEthers } from '@windingtree/org.id-auth/dist/tokens';
import { initOrgIdResolver } from './resolveOrgId';
import { printInfo, printWarn } from '../utils/console';
import { getKeyPairsFromProject } from './project';
import prompts from 'prompts';
import { decrypt } from './common';

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

  const { didDocument, didResolutionMetadata } = await resolver.resolve(
    args['--issuer']
  );

  if (didDocument === null) {
    printWarn(
      `ORGiD with DID: "${args['--issuer']}" has been resolved with the error:`
    );
    printWarn(didResolutionMetadata.error || 'Unknown error');
    return;
  }

  const verificationMethod = didDocument?.verificationMethod?.find(
    v => v.id === args['--issuer']
  );

  if (!verificationMethod) {
    throw Error(`Verification method ${args['--issuer']} not found`);
  }

  if (!verificationMethod.blockchainAccountId) {
    throw Error('blockchainAccountId not found');
  }

  const { accountAddress } = parsers.parseBlockchainAccountId(
    verificationMethod.blockchainAccountId
  );

  const keyPairRecords = await getKeyPairsFromProject(basePath);

  const keyPair = keyPairRecords.find(
    k => utils.getAddress(k.publicKey as string) === utils.getAddress(accountAddress)
  );

  let signerKey: string;

  if (keyPair) {
    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: `Enter the password for the key pair "${keyPair.tag}"`
    });
    signerKey = decrypt(keyPair.privateKey, password);
  } else {
    printWarn(`A key associated with blockchainAccountId ${accountAddress} not found`);

    const { useCustomKey } = await prompts({
      type: 'select',
      name: 'useCustomKey',
      message: 'Do you want to enter a custom key?',
      choices: [
        {
          title: 'Yes',
          value: true
        },
        {
          title: 'No',
          value: false
        }
      ],
      initial: 0
    });

    if (!useCustomKey) {
      printWarn('Unable to create JWT without a key. Process terminated.');
      return;
    }

    const { privateKey } = await prompts([
      {
        type: 'password',
        name: 'privateKey',
        message: `Please enter a private key for the account ${accountAddress}`,
      }
    ]);

    signerKey = privateKey;
  }

  const signer = new ethers.Wallet(signerKey);

  const signerAddress = await signer.getAddress();

  if (utils.getAddress(accountAddress) !== signerAddress) {
    throw new Error(
      `blockchainAccountId address is different from the signer address: ${signerAddress}`
    );
  }

  const token = await createAuthJWTWithEthers(
    signer,
    args['--issuer'],
    args['--audience'],
    scope,
    expiration
  );

  printInfo(`JWT: ${token}`);
};
