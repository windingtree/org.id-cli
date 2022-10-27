import axios from 'axios';
import { utils, constants, Wallet, PopulatedTransaction, BigNumber, TypedDataField } from 'ethers';
import { _TypedDataEncoder } from '@ethersproject/hash';
import prompts from 'prompts';

export interface SafeNonceResponse {
  nonce: number;
  [k: string]: unknown;
}

export interface SafeTxGas {
  safeTxGas: string;
  [k: string]: unknown;
}

export interface BaseTx extends Omit<PopulatedTransaction, 'value'> {
  value: number | string;
  operation?: number;
}

export interface SafeTx extends Omit<BaseTx, 'nonce' | 'gasPrice'> {
  nonce: number | string;
  safeTxGas: number | string;
  baseGas: number | string;
  gasPrice: number | string;
  gasToken: string;
  refundReceiver: string;
}

export interface SafeAddress {
  address: string;
  chainId: number;
  name: string;
}

const chains: Record<string, { chainId: number, name: string }> = {
  gor: {
    chainId: 5,
    name: 'goerli'
  }
};

export const parseSafeAddress = (rawAddress: string): SafeAddress => {
  const [network, address] = rawAddress.split(':');
  const chainId = chains[network]?.chainId;
  const name = chains[network]?.name;

  if (!chainId || !name) {
    throw new Error(`Unsupported network "${network}"`);
  }

  return {
    address: utils.getAddress(address),
    chainId,
    name
  };
};

export const getNonce = async (
  safeAddress: string,
  chainPrefix: string
): Promise<SafeNonceResponse> => {
  try {
    const uri = `https://safe-transaction-${chainPrefix}.safe.global/api/v1/safes/${safeAddress}`;
    const response = await axios.get<SafeNonceResponse>(
      uri
    );
    return response.data;
  } catch (error) {
    throw new Error(JSON.stringify(error.response.data));
  }
}

export const estimateTx = async (
  safeAddress: string,
  chainPrefix: string,
  baseTx: BaseTx
): Promise<SafeTxGas> => {
  try {
    const uri = `https://safe-transaction-${chainPrefix}.safe.global/api/v1/safes/${safeAddress}/multisig-transactions/estimations/`;
    const response =  await axios.post<SafeTxGas>(
      uri,
      baseTx
    );
    return response.data;
  } catch (error) {
    console.log(error);
    throw new Error(JSON.stringify(error.response.data));
  }
}

export const proposeTx = async (
  safeAddress: string,
  baseTx: PopulatedTransaction,
  overrideEstimation?: string,
  nonce?: number
): Promise<number> => {
  const {
    address: walletAccount,
    name: chainPrefix,
    chainId
  } = parseSafeAddress(safeAddress);

  const normalizedTx: BaseTx = {
    ...baseTx,
    value: baseTx.value
      ? BigNumber.isBigNumber(baseTx.value)
        ? baseTx.value.toString()
        : baseTx.value
      : '0',
    operation: 0
  };

  if (nonce === undefined) {
    const safeNonce = await getNonce(walletAccount, chainPrefix);
    nonce = safeNonce.nonce;
  } else {
    nonce++;
  }

  const gas = overrideEstimation
    ? { safeTxGas: overrideEstimation }
    : await estimateTx(walletAccount, chainPrefix, normalizedTx);

  const txn: SafeTx = {
    ...normalizedTx,
    nonce,
    safeTxGas: gas.safeTxGas,
    baseGas: '0',
    gasPrice: '0',
    gasToken: constants.AddressZero,
    refundReceiver: constants.AddressZero
  };

  const safeTxTypes: Record<string, TypedDataField[]> = {
    EIP712Domain: [
      { type: 'uint256', name: 'chainId' },
      { type: 'address', name: 'verifyingContract' }
    ],
    SafeTx: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' },
      { type: 'uint8', name: 'operation' },
      { type: 'uint256', name: 'safeTxGas' },
      { type: 'uint256', name: 'baseGas' },
      { type: 'uint256', name: 'gasPrice' },
      { type: 'address', name: 'gasToken' },
      { type: 'address', name: 'refundReceiver' },
      { type: 'uint256', name: 'nonce' }
    ]
  };

  const { privateKey } = await prompts({
    type: 'password',
    name: 'privateKey',
    message: `Please enter a private key of one of the owners of the ${safeAddress} multisig`
  });

  if (!privateKey || privateKey === '') {
    throw new Error();
  }

  const signer = new Wallet(privateKey);
  const sender = await signer.getAddress();

  const safeTypedDataDomain = {
    chainId,
    verifyingContract: walletAccount
  };

  const contractTransactionHash = _TypedDataEncoder.hash(
    safeTypedDataDomain,
    { SafeTx: safeTxTypes.SafeTx },
    txn
  );

  const signature = await signer._signTypedData(
    safeTypedDataDomain,
    { SafeTx: safeTxTypes.SafeTx },
    txn
  );

  const uri = `https://safe-transaction-${chainPrefix}.safe.global/api/v1/safes/${walletAccount}/multisig-transactions/`;

  try {
    await axios.post(
      uri,
      {
        ...txn,
        sender,
        contractTransactionHash,
        signature
      }
    );

    return nonce;
  } catch (error) {
    throw new Error(JSON.stringify(error.response.data));
  }
};
