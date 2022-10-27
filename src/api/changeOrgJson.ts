import type { ParsedArgv } from '../utils/env';
import {
  promptOrgId,
  prepareOrgIdApi,
  downloadOrgIdVc
} from './common';
import prompts from 'prompts';
import { printInfo, printMessage, printObject, printWarn } from '../utils/console';
import { createOrgId } from './createOrgId';
import { ORGJSONVCNFT } from '@windingtree/org.json-schema/types/orgVc';
import { parsers, http } from '@windingtree/org.id-utils';
import { getFromIpfs } from './ipfs';

export const changeOrgJson = async (
  basePath: string,
  args: ParsedArgv
): Promise<void> => {

  // const orgId = await promptOrgId(basePath, true);

  // if (!orgId) {
  //   throw new Error('No registered ORGiDs found in the project');
  // }

  // const {
  //   did,
  //   orgIdVc
  // } = orgId;

  // if (!orgIdVc) {
  //   throw new Error(`An ORGID VC not found in the project`);
  // }

  // if (!orgIdVc) {
  //   throw new Error(
  //     'Chosen ORGiD does not have registered ORGiD VC yet. Please create it first using operation "--orgIdVc"'
  //   );
  // }

  // const orgIdVcObj = await downloadOrgIdVc(basePath, orgIdVc);

  // const {
  //   orgIdContract,
  //   signer,
  //   id
  // } = await prepareOrgIdApi(basePath, orgId);

  // let capabilityDelegation = orgIdVcObj?.credentialSubject?.capabilityDelegation;

  // if (Array.isArray(capabilityDelegation)) {
  //   // Normalizing delegates
  //   capabilityDelegation = (capabilityDelegation.map(
  //     c => typeof c === 'string' ? c : c.id
  //   ));

  //   printMessage(
  //     '\nSending transaction "addDelegates(bytes32,string[])"...'
  //   );

  //   await orgIdContract.addDelegates(
  //     id,
  //     capabilityDelegation as string[],
  //     signer,
  //     undefined,
  //     txHash => {
  //       printInfo(`\nTransaction (addDelegates) hash: ${txHash}`);
  //     }
  //   );
  // } else {
  //   console.log('orgIdVcObj:', orgIdVcObj);
  //   throw new Error('No delegates');
  // }

  // printMessage(
  //   '\nSending transaction "setOrgJson(bytes32,string)"...'
  // );

  // const orgIdData = await orgIdContract.setOrgJson(
  //   id,
  //   orgIdVc,
  //   signer,
  //   undefined,
  //   txHash => {
  //     printInfo(`\nTransaction (setOrgJson) hash: ${txHash}`);
  //   }
  // );

  // if (!orgIdData) {
  //   throw new Error('Unable to fetch ORGiD data');
  // }

  // printInfo(
  //   `ORGiD with DID: "${did}" has been successfully updated`
  // );

  // printObject({
  //   ...orgIdData,
  //   tokenId: orgIdData.tokenId.toString()
  // });
};
