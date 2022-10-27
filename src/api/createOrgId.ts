import type { OrgIdData } from '@windingtree/org.id-core/';
import {
  promptOrgId,
  prepareOrgIdApi,
  downloadOrgIdVc,
  promptKeyPair,
  createOrgIdInstance
} from './common';
import {
  updateOrgIdRecord
} from './project';
import { printError, printInfo, printMessage, printObject } from '../utils/console';
import { ProjectKeysReference, ProjectOrgIdsReference } from 'src/schema/types/project';
import { proposeTx } from './multisig';
import { parseDid } from '@windingtree/org.id-utils/dist/parsers';
import { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';

export interface OrgIdCreationResult extends Omit<OrgIdData, 'tokenId'> {
  tokenId: string;
}

export const createWithEthereum = async (
  basePath: string,
  orgId: ProjectOrgIdsReference,
  keyPair: ProjectKeysReference
): Promise<void> => {
  if (!orgId.orgIdVc) {
    throw new Error(`ORGiD VC not created for this ORGiD (${orgId.did}) yet`);
  }

  const {
    orgIdContract,
    signer,
    gasPrice
  } = await prepareOrgIdApi(basePath, orgId, keyPair);

  printMessage(
    '\nSending transaction "createOrgId(bytes32,string)"...'
  );

  const orgIdData = await orgIdContract.createOrgId(
    orgId.salt,
    orgId.orgIdVc,
    signer,
    gasPrice ? { gasPrice } : undefined,
    async txHash => {
      printInfo(`\nTransaction hash: ${txHash}`);
      try {
        await updateOrgIdRecord(
          basePath,
          orgId.did,
          {
            txHash
          }
        );
      } catch {
        printError('Unable to update project file');
      }
    }
  );

  if (!orgIdData) {
    throw new Error('Unable to fetch ORGiD data');
  }

  printInfo(
    `ORGiD with DID: "${orgId.did}" has been successfully created`
  );

  printObject({
    ...orgIdData,
    tokenId: orgIdData.tokenId.toString()
  });
};

// Propose ORGiD creation Tx to the multisig
export const createWithMultisig = async (
  basePath: string,
  orgId: ProjectOrgIdsReference,
  orgVcObj: ORGJSONVCNFT,
  keyPair: ProjectKeysReference
): Promise<void> => {
  if (!orgId.orgIdVc) {
    throw new Error('ORGiD VC URI not found');
  }

  if (!keyPair.multisig) {
    throw new Error('Invalid multisig keys config');
  }

  // Create OrgId Tx
  const orgIdInstance = await createOrgIdInstance(basePath, orgId);
  const registerTxRaw = await orgIdInstance.contract.populateTransaction['createOrgId'](
    orgId.salt,
    orgId.orgIdVc
  );

  const nonce = await proposeTx(
    keyPair.multisig,
    registerTxRaw
  );

  const isDelegated = typeof orgVcObj?.credentialSubject?.capabilityDelegation?.[0] === 'string';

  if (isDelegated) {

    if (!orgId.orgIdVc) {
      throw new Error('ORGiD VC URI not found');
    }

    if (!keyPair.multisig) {
      throw new Error('Invalid multisig keys config');
    }

    if (!orgVcObj.credentialSubject.capabilityDelegation) {
      throw new Error(`capabilityDelegation definition not found`);
    }

    // Create OrgId Tx
    const orgIdInstance = await createOrgIdInstance(basePath, orgId);

    const { orgId: id } = parseDid(orgId.did);

    const registerTxRaw = await orgIdInstance.contract
      .populateTransaction['addDelegates(bytes32,string[])'](
        id,
        orgVcObj.credentialSubject.capabilityDelegation.map(
          c => typeof c === 'string' ? c : c.id
        )
      );

    await proposeTx(
      keyPair.multisig,
      registerTxRaw,
      '179545',
      nonce
    );
  }
};

// Create new ORGiD
export const createOrgId = async (
  basePath: string
): Promise<void> => {

  const orgId = await promptOrgId(basePath, false);

  if (!orgId) {
    throw new Error('The ORGiD not been selected');
  }

  const {
    created,
    did,
    orgIdVc
  } = orgId;

  if (created) {
    throw new Error(`This ORGiD ${did} already has been created`);
  }

  if (!orgIdVc) {
    throw new Error(`ORGiD VC not created for this ORGiD (${did}) yet`);
  }

  const orgIdVcObj = await downloadOrgIdVc(basePath, orgIdVc);
  const isDelegated = typeof orgIdVcObj?.credentialSubject?.capabilityDelegation?.[0] === 'string';

  const keyPair = await promptKeyPair(
    basePath
  );

  if (!keyPair) {
    throw new Error('Key pair not selected');
  }

  switch (keyPair.type) {
    case 'ethereum':
      await createWithEthereum(basePath, orgId, keyPair);
      if (isDelegated) {
        // registerDelegatesWithEthereum
      }
      break;
    case 'multisig':
      printInfo('Proposing "createOrgId" tx to multisig...');
      await createWithMultisig(basePath, orgId, orgIdVcObj, keyPair);
      break;
    default:
      throw new Error(
        `Key with type "${keyPair.type}" cannot be used for an ORGiD creation`
      );
  }

  await updateOrgIdRecord(
    basePath,
    did,
    {
      created: true
    }
  );
};
