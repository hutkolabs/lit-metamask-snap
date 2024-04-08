/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/match-description */
/* eslint-disable jsdoc/require-param */
/* eslint-disable import/no-nodejs-modules */
import type { JsonTx } from '@ethereumjs/tx';
import type { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import type {
  Keyring,
  KeyringAccount,
  KeyringRequest,
  KeyringResponse,
} from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';
import { JsonRpcProvider, Wallet as EthersWallet } from 'ethers';
import { v4 as uuid } from 'uuid';

import { Lit, RPC_URL } from './lit';
import { getState, saveState } from './management';
import { isEvmChain } from './utils';

export type KeyringState = {
  wallets: Record<string, Wallet>;
  requests: Record<string, KeyringRequest>;
  signer: Wallet;
};

export type Wallet = {
  account: KeyringAccount;
  privateKey: string;
};

/**
 * type Keyring = {
 * listAccounts(): Promise<KeyringAccount[]>;
 * getAccount(id: string): Promise<KeyringAccount | undefined>;
 * createAccount(options?: Record<string, Json>): Promise<KeyringAccount>;
 * filterAccountChains(id: string, chains: string[]): Promise<string[]>;
 * updateAccount(account: KeyringAccount): Promise<void>;
 * deleteAccount(id: string): Promise<void>;
 * exportAccount?(id: string): Promise<KeyringAccountData>;
 * listRequests?(): Promise<KeyringRequest[]>;
 * getRequest?(id: string): Promise<KeyringRequest | undefined>;
 * submitRequest(request: KeyringRequest): Promise<KeyringResponse>;
 * approveRequest?(id: string, data?: Record<string, Json>): Promise<void>;
 * rejectRequest?(id: string): Promise<void>;
 * }
 */

export class ERC4337Keyring implements Keyring {
  #signer: Wallet;

  #wallets: Record<string, Wallet>;

  #requests: Record<string, KeyringRequest>;

  async #saveState(): Promise<void> {
    await saveState({
      wallets: this.#wallets,
      requests: this.#requests,
      signer: this.#signer,
    });
  }

  async #createPkpWallet(): Promise<PKPEthersWallet> {
    const lit = Lit.create();

    const authMethod = await lit.authenticateWithWebAuthn();

    let pkp = await lit.getPKPs(authMethod);

    if (pkp.length === 0) {
      await lit.mintPKP();

      pkp = await lit.getPKPs(authMethod);
    }

    const account = pkp.at(0);
    if (!account) {
      throw new Error('No PKP account found');
    }

    // get new pkpWallet
    const newPkpWallet = await lit.getPkpWallet(account.publicKey, authMethod);

    return newPkpWallet;
  }

  async #createSigner(options: Record<string, Json>): Promise<Wallet> {
    console.log('Creating Signer');
    const pkpWallet = await this.#createPkpWallet();

    const { privateKey, address } = pkpWallet;

    const account: KeyringAccount = {
      id: uuid(),
      options,
      address,
      methods: [
        'eth_signTransaction',
        'eth_sign',
        'eth_signTransaction',
        'eth_signTypedData_v1',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
        'personal_sign',
      ],
      type: 'eip155:eoa',
    };

    return { account, privateKey };
  }

  #getWalletByAddress(address: string): Wallet {
    const walletMatch = Object.values(this.#wallets).find(
      (wallet) =>
        wallet.account.address.toLowerCase() === address.toLowerCase(),
    );

    if (walletMatch === undefined) {
      throw new Error(`Cannot find wallet for address: ${address}`);
    }
    return walletMatch;
  }

  constructor(state: KeyringState) {
    this.#wallets = state.wallets;
    this.#requests = state.requests;
    this.#signer = state.signer;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#wallets).map(({ account }) => account);
  }

  async getAccount(id: string): Promise<KeyringAccount | undefined> {
    return this.#wallets[id]?.account;
  }

  /**
   * finished
   */
  async createAccount(options: Record<string, Json>): Promise<KeyringAccount> {
    // Create signer for SCWs if not available.
    const keyringState = await getState();

    if (keyringState.signer) {
      this.#signer = keyringState.signer;
    } else {
      this.#signer = await this.#createSigner(options);
    }

    const account: KeyringAccount = {
      type: 'eip155:erc4337',
      address: this.#signer.account.address,
      id: uuid(),
      options: {
        ...options,
        // Add the signer address to the options.
        signer: this.#signer,
      },
      methods: ['eth_signTransaction'],
    };

    this.#wallets[account.id] = {
      account,
      privateKey: this.#signer.privateKey,
    };

    await this.#saveState();

    await snap.request({
      method: 'snap_manageAccounts',
      params: {
        method: 'createAccount',
        params: { account },
      },
    });

    return account;
  }

  /**
   * finished
   */
  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // The `id` argument is not used because all accounts created by this snap
    // are expected to be compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  /**
   * finished
   */
  async updateAccount(account: KeyringAccount): Promise<void> {
    const wallet = this.#wallets[account.id];
    if (!wallet) {
      throw new Error('Account not found');
    }

    const currentAccount = wallet.account;
    const newAccount: KeyringAccount = {
      ...currentAccount,
      ...account,
      // Restore read-only properties.
      address: currentAccount.address,
      methods: currentAccount.methods,
      type: currentAccount.type,
      options: currentAccount.options,
    };

    wallet.account = newAccount;
    await this.#saveState();

    await snap.request({
      method: 'snap_manageAccounts',
      params: {
        method: 'updateAccount',
        params: { account },
      },
    });
  }

  /**
   * finished
   */
  async deleteAccount(id: string): Promise<void> {
    delete this.#wallets[id];
    await this.#saveState();

    await snap.request({
      method: 'snap_manageAccounts',
      params: {
        method: 'deleteAccount',
        params: { id },
      },
    });
  }

  async listRequests(): Promise<KeyringRequest[]> {
    return Object.values(this.#requests);
  }

  async getRequest(id: string): Promise<KeyringRequest | undefined> {
    return this.#requests[id];
  }

  async submitRequest(request: KeyringRequest): Promise<KeyringResponse> {
    const { method, params } = request.request;

    if (method !== 'eth_signTransaction') {
      throw new Error('Unsupported method');
    }

    const [from, tx] = params as [string, JsonTx]; //, Json];

    const rpcProvider = new JsonRpcProvider(RPC_URL);

    const signer = this.#getWalletByAddress(from);

    const ethersWallet = new EthersWallet(signer.privateKey, rpcProvider);

    const transaction = await ethersWallet.sendTransaction({
      ...tx,
      type: 0,
      nonce: null,
    });

    return {
      pending: false,
      result: transaction as unknown as Json,
    };
  }
}
