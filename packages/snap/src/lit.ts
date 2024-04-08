/* eslint-disable jsdoc/match-description */
/* eslint-disable jsdoc/require-param */
/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-param-description */
import { LitAbility, LitActionResource } from '@lit-protocol/auth-helpers';
import { AuthMethodType, ProviderType } from '@lit-protocol/constants';
import type { WebAuthnProvider } from '@lit-protocol/lit-auth-client';
import { LitAuthClient } from '@lit-protocol/lit-auth-client';
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import type {
  AuthMethod,
  GetSessionSigsProps,
  IRelayPKP,
  SessionSigs,
} from '@lit-protocol/types';

export const RPC_URL = 'https://rpc.ankr.com/base_goerli';

const REPLY_API_KEY = 'test';

export class Lit {
  #litNodeClient: LitNodeClient;

  #authClient: LitAuthClient;

  constructor() {
    this.#litNodeClient = new LitNodeClient({
      litNetwork: 'cayenne',
      debug: true,
    });

    this.#authClient = new LitAuthClient({
      litRelayConfig: {
        relayApiKey: REPLY_API_KEY,
      },
      litNodeClient: this.#litNodeClient,
    });
  }

  static create() {
    return new Lit();
  }

  async connect() {
    if (!this.#litNodeClient) {
      throw new Error('LitNodeClient not initialized');
    }

    await this.#litNodeClient.connect();
  }

  async getSessionSigs({
    pkpPublicKey,
    authMethod,
    sessionSigsParams,
  }: {
    pkpPublicKey: string;
    authMethod: AuthMethod;
    sessionSigsParams: GetSessionSigsProps;
  }): Promise<SessionSigs> {
    await this.connect();
    const provider = this.getProviderByAuthMethod(authMethod);

    console.log('provider', provider);

    if (provider) {
      // get sessionSigs info
      const sessionSigs = await provider.getSessionSigs({
        pkpPublicKey,
        authMethod,
        sessionSigsParams,
      });
      return sessionSigs;
    }
    throw new Error(
      `Provider not found for auth method type ${authMethod.authMethodType}`,
    );
  }

  async registerWebAuthn(): Promise<IRelayPKP> {
    await this.connect();

    const provider = this.#authClient.initProvider<WebAuthnProvider>(
      ProviderType.WebAuthn,
    );
    // Register new WebAuthn credential
    const options = await provider.register();

    // Verify registration and mint PKP through relay server
    const txHash = await provider.verifyAndMintPKPThroughRelayer(options);
    const response = await provider.relay.pollRequestUntilTerminalState(txHash);
    if (response.status !== 'Succeeded') {
      throw new Error('Minting failed');
    }

    const { pkpTokenId, pkpPublicKey, pkpEthAddress } = response;

    if (!pkpTokenId || !pkpPublicKey || !pkpEthAddress) {
      throw new Error('Minting failed');
    }

    const newPKP: IRelayPKP = {
      tokenId: pkpTokenId,
      publicKey: pkpPublicKey,
      ethAddress: pkpEthAddress,
    };

    return newPKP;
  }

  /**
   * Get auth method object by authenticating with a WebAuthn credential
   */
  async authenticateWithWebAuthn(): Promise<AuthMethod> {
    await this.connect();
    let provider = this.#authClient.getProvider(ProviderType.WebAuthn);

    if (!provider) {
      provider = this.#authClient.initProvider<WebAuthnProvider>(
        ProviderType.WebAuthn,
      );
    }
    const authMethod = await provider.authenticate();
    return authMethod;
  }

  /**
   * Fetch PKPs associated with given auth method
   */
  async getPKPs(authMethod: AuthMethod): Promise<IRelayPKP[]> {
    await this.connect();
    const provider = this.getProviderByAuthMethod(authMethod);
    if (!provider) {
      throw new Error(
        `Provider not found for auth method type ${authMethod.authMethodType}`,
      );
    }

    const pkpInfo = await provider.fetchPKPsThroughRelayer(authMethod);
    console.log('pkpInfo:', pkpInfo);

    return pkpInfo;
  }

  /**
   * Mint a new PKP for current auth method
   */
  async mintPKP(): Promise<any> {
    await this.connect();
    const provider = this.#authClient.initProvider<WebAuthnProvider>(
      ProviderType.WebAuthn,
    );

    const authMethod = await provider.authenticate();
    // get public key
    const publicKey = await provider.computePublicKeyFromAuthMethod(authMethod);
    console.log('local public key computed: ', publicKey);

    const claimResp = await provider.claimKeyId({
      authMethod,
    });
    console.log('claim response public key: ', claimResp.pubkey);
    console.log('claim : ', claimResp);

    return claimResp.pubkey;
  }

  async getPkpWallet(
    pkpPublicKey: any,
    authMethod: AuthMethod,
    // sessionSig: SessionSigs
  ): Promise<PKPEthersWallet> {
    // get sssionSig
    const provider = this.#authClient.getProvider(ProviderType.WebAuthn);

    console.log('provider:', provider);
    console.log('authMethod:', authMethod);

    if (!provider) {
      throw new Error('Provider not found');
    }

    const sessionSigs = await provider.getSessionSigs({
      authMethod,
      pkpPublicKey,
      sessionSigsParams: {
        chain: 'ethereum',
        resourceAbilityRequests: [
          {
            resource: new LitActionResource('*'),
            ability: LitAbility.PKPSigning,
          },
        ],
      },
    });

    console.log('sessionSigs:', sessionSigs);

    // create PKP instance
    const pkpWallet = new PKPEthersWallet({
      pkpPubKey: pkpPublicKey,
      rpc: RPC_URL,
      controllerSessionSigs: sessionSigs,
    });
    await pkpWallet.init();

    console.log('pkpWallet:', pkpWallet);
    console.log("pkpWallet's address:", await pkpWallet.getAddress());
    console.log("pkpWallet's add:", await pkpWallet.getAddress());

    return pkpWallet;
  }

  /**
   * Get auth method object by authenticating with a WebAuthn credential
   */
  getProviderByAuthMethod(authMethod: AuthMethod) {
    switch (authMethod.authMethodType) {
      case AuthMethodType.WebAuthn:
        return this.#authClient.getProvider(ProviderType.WebAuthn);
      default:
        throw new Error(
          `Provider not found for auth method type ${authMethod.authMethodType}`,
        );
    }
  }
}
