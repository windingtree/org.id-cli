import asn1 from 'asn1.js';
import {
  KMSClient,
  KMSClientConfig,
  GetPublicKeyCommand,
  SignCommand
} from '@aws-sdk/client-kms';
import { TransactionRequest, Provider } from '@ethersproject/abstract-provider';
import { Bytes, Signer, TypedDataDomain, TypedDataField, utils } from 'ethers';
import { Deferrable, UnsignedTransaction } from 'ethers/lib/utils';
import BN from 'bn.js';

export type EcdsaParser = {
  decode: (
    asnStringBuffer: Buffer,
    format: 'der'
  ) => { r: BN; s: BN }
};

const EcdsaPubKey = asn1.define('EcdsaPubKey', function (this: any) {
  // https://tools.ietf.org/html/rfc5480#section-2
  this.seq().obj(
      this.key('algo').seq().obj(
          this.key('algorithm').objid(),
          this.key('parameters').objid(),
      ),
      this.key('pubKey').bitstr() // <-- this is what we want
  );
});

const EcdsaSigAsnParse: EcdsaParser = asn1.define(
  'EcdsaSig',
  function (this: any) {
    // parsing this according to https://tools.ietf.org/html/rfc3279#section-2.2.3
    this.seq().obj(
      this.key('r').int(),
      this.key('s').int()
    );
  }
);

export class AwsKmsSigner extends Signer {
  private readonly config: KMSClientConfig;
  private readonly client: KMSClient;
  private readonly keyId: string;
  private rawPublicKey: ArrayBuffer;
  public readonly provider?: Provider;
  public address?: string;

  constructor(keyId: string, config?: KMSClientConfig, provider?: Provider) {
    super();
    this.keyId = keyId;
    this.config = config ?? {};
    this.client = new KMSClient(this.config);
    this.provider = provider;
  }

  async getPublicKey(): Promise<ArrayBuffer> {
    if (this.rawPublicKey !== undefined) {
      return this.rawPublicKey;
    }

    const command = new GetPublicKeyCommand({ KeyId: this.keyId });
    const response = await this.client.send(command);

    if (!response.PublicKey) {
      throw new Error('AwsKmsSigner: PublicKey is undefined.');
    }

    this.rawPublicKey = Buffer.from(response.PublicKey);

    return this.rawPublicKey;
  }

  async getAddress(): Promise<string> {
    if (this.address !== undefined) {
      return this.address;
    }

    const key = await this.getPublicKey();
    const res = EcdsaPubKey.decode(key, 'der');
    let pubKeyBuffer = res.pubKey.data as Buffer;
    pubKeyBuffer = pubKeyBuffer.slice(1, pubKeyBuffer.length);
    this.address = utils.getAddress(
      utils.keccak256(pubKeyBuffer).slice(-40)
    );

    return this.address;
  }

  private async _signDigest(digest: Buffer) {
    const command = new SignCommand({
      KeyId: this.keyId,
      Message: digest,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    });
    const response = await this.client.send(command);

    if (!response.Signature) {
      throw new Error('AwsKmsSigner: Signature is undefined.');
    }

    const { r, s } = EcdsaSigAsnParse.decode(
      Buffer.from(response.Signature),
      'der'
    );
    const secp256k1N = new BN(
      'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      16
    );
    const secp256k1halfN = secp256k1N.div(new BN(2));

    const signature = {
      r: `0x${r.toString('hex')}`,
      s: `0x${(s.gt(secp256k1halfN) ? secp256k1N.sub(s) : s).toString('hex')}`
    };
    const address = await this.getAddress();

    return utils.joinSignature({
      v: utils.recoverAddress(
          digest,
          { ...signature, v: 27 }
        ).toLocaleLowerCase() === address.toLocaleLowerCase()
          ? 27
          : 28,
      ...signature
    });
  }

  createDigest(hash: string | Bytes): Buffer {
    return Buffer.from(utils.arrayify(hash));
  }

  async signMessage(message: string | Bytes): Promise<string> {
    return this._signDigest(this.createDigest(utils.hashMessage(message)));
  }

  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    const hash = utils._TypedDataEncoder.hash(domain, types, value);
    return this._signDigest(this.createDigest(hash));
  }

  async signTransaction(transaction: Deferrable<TransactionRequest>): Promise<string> {
    const unsignedTx = await utils.resolveProperties(transaction);
    const serializedTx = utils.serializeTransaction(<UnsignedTransaction>unsignedTx);
    const transactionSignature = await this.signMessage(utils.keccak256(serializedTx));
    return utils.serializeTransaction(<UnsignedTransaction>unsignedTx, transactionSignature);
  }

  connect(provider: Provider): AwsKmsSigner {
    return new AwsKmsSigner(this.keyId, this.config, provider);
  }
}
