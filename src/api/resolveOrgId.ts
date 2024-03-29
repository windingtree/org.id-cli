import type {
  FetcherConfig,
  FetcherResolver,
  OrgIdResolverAPI,
  ResolverOptions,
} from '@windingtree/org.id-resolver';
import {
  buildEvmChainConfig,
  buildHttpFetcherConfig,
  OrgIdResolver,
} from '@windingtree/org.id-resolver';
import type { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';
import { printInfo, printObject, printWarn } from '../utils/console';
import type { ParsedArgv } from '../utils/env';
import {
  getEthersProvider,
  getSupportedNetworkConfig,
  parseDid,
} from './common';
import { getFromIpfs } from './ipfs';

export const initOrgIdResolver = async (
  basePath: string,
  did: string
): Promise<OrgIdResolverAPI> => {
  const { network } = parseDid(did);
  const provider = await getEthersProvider(basePath, network);
  const { address } = getSupportedNetworkConfig(network);

  const chainConfig = buildEvmChainConfig(network, 'eip155', address, provider);

  const ipfsFetcherInitializer = (): FetcherResolver => ({
    getOrgJson: async (uri: string): Promise<ORGJSONVCNFT> =>
      getFromIpfs(basePath, uri) as Promise<ORGJSONVCNFT>,
  });

  const buildIpfsFetcherConfig = (): FetcherConfig => ({
    id: 'ipfs',
    name: 'ORG.JSON IPFS fetcher',
    init: ipfsFetcherInitializer,
  });

  const resolverOptions: ResolverOptions = {
    chains: [chainConfig],
    fetchers: [buildHttpFetcherConfig(), buildIpfsFetcherConfig()],
  };

  return OrgIdResolver(resolverOptions);
};

export const resolveOrgId = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {
  if (!args['--did']) {
    throw new Error('ORGiD DID must be provided using "--did" option');
  }

  const resolver = await initOrgIdResolver(basePath, args['--did']);

  const didResponse = await resolver.resolve(args['--did']);

  // Check the response
  if (didResponse.didDocument === null) {
    printWarn(
      `ORGiD with DID: "${args['--did']}" has been resolved with the error:`
    );
    printWarn(didResponse.didResolutionMetadata.error || 'Unknown error');
  } else {
    printInfo(
      `ORGiD with DID: "${args['--did']}" has been successfully resolved`
    );
  }

  printObject(didResponse);
};
