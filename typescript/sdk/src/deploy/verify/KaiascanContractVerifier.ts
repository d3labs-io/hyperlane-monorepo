import fetch from 'cross-fetch';
import { Logger } from 'pino';

import { rootLogger } from '@hyperlane-xyz/utils';

import { MultiProvider } from '../../providers/MultiProvider.js';
import { ChainName } from '../../types.js';

import { BaseContractVerifier } from './BaseContractVerifier.js';
import {
  BuildArtifact,
  ContractVerificationInput,
  SolidityStandardJsonInput,
} from './types.js';

/**
 * Kaiascan verification API endpoints, keyed by EVM chainId.
 *
 * Kaiascan uses a sourcify-compatible JSON API (POST {address, chain, files})
 * that is completely separate from the Etherscan-style read API.
 * The verification URL is therefore hardcoded here rather than read from the
 * chain metadata apiUrl field, so that the metadata apiUrl can continue to
 * point to the Etherscan-compatible read API (kairos-oapi.kaiascan.io).
 */
const KAIASCAN_VERIFY_URLS: Record<number, string> = {
  8217: 'https://mainnet-api.kaiascan.io/forge-verify', // Kaia mainnet
  1001: 'https://kairos-api.kaiascan.io/forge-verify', // Kairos testnet
};

/**
 * @title KaiascanContractVerifier
 * @notice Handles contract verification on Kaiascan block explorer
 * @dev Kaiascan uses a sourcify-compatible JSON API rather than the
 * Etherscan module/action format. This verifier constructs the correct
 * payload and submits it to the hardcoded Kaiascan verification endpoint
 * for the target chain (resolved by chainId).
 *
 * Chain metadata apiUrl is intentionally ignored for verification — only
 * the family field needs to be set to 'kaiascan' to activate this verifier.
 */
export class KaiascanContractVerifier extends BaseContractVerifier {
  protected logger = rootLogger.child({ module: 'KaiascanContractVerifier' });
  private readonly compilerVersion: string;

  constructor(
    protected readonly multiProvider: MultiProvider,
    buildArtifact: BuildArtifact,
  ) {
    super(multiProvider, buildArtifact);
    this.compilerVersion = `v${buildArtifact.solcLongVersion}`;
  }

  /**
   * @notice Resolves the Kaiascan verification endpoint for a given chain.
   * @throws if the chainId is not a known Kaiascan network.
   */
  private getVerifyUrl(chain: ChainName): string {
    const chainId = Number(this.multiProvider.getChainMetadata(chain).chainId);
    const url = KAIASCAN_VERIFY_URLS[chainId];
    if (!url) {
      throw new Error(
        `No Kaiascan verification URL configured for chainId ${chainId} (${chain}). ` +
          `Supported chainIds: ${Object.keys(KAIASCAN_VERIFY_URLS).join(', ')}`,
      );
    }
    return url;
  }

  /**
   * @notice Verifies a contract on Kaiascan.
   * @dev Kaiascan uses a sourcify-compatible flow that verifies the contract
   * source at an address — both the implementation and the proxy contract
   * itself need their source submitted. The Etherscan-style VERIFY_PROXY
   * "registration" action does not exist here; instead, submitting the
   * TransparentUpgradeableProxy source for the proxy address is what marks it
   * as verified on Kaiascan.
   */
  protected async verify(
    chain: ChainName,
    input: ContractVerificationInput,
    verificationLogger: Logger,
  ): Promise<void> {
    const sourceName = this.contractSourceMap[input.name];
    if (!sourceName) {
      const errorMessage = `Contract '${input.name}' not found in provided build artifact`;
      verificationLogger.error(errorMessage);
      throw new Error(`[${chain}] ${errorMessage}`);
    }

    const filteredStandardInputJson = this.filterStandardInputJsonByContractName(
      input.name,
      this.standardInputJson,
      verificationLogger,
    );

    await this.submitKaiascanForm(
      chain,
      input,
      sourceName,
      filteredStandardInputJson,
      verificationLogger,
    );
  }

  /**
   * Not called directly — verify() is fully overridden and does not go through
   * the base getImplementationData() → prepareImplementationData() path.
   */
  protected prepareImplementationData(
    _sourceName: string,
    _input: ContractVerificationInput,
    _filteredStandardInputJson: SolidityStandardJsonInput,
  ): never {
    throw new Error(
      'prepareImplementationData is not used in KaiascanContractVerifier',
    );
  }

  /**
   * @notice Builds the sourcify-compatible metadata.json for Kaiascan.
   */
  private buildKaiascanMetadata(
    sourceName: string,
    contractName: string,
    filteredStandardInputJson: SolidityStandardJsonInput,
  ): Record<string, unknown> {
    // SolidityStandardJsonInput.settings only exposes optimizer and
    // outputSelection, but the real build artifact may also contain evmVersion,
    // libraries, and remappings — cast to access them safely.
    const settings = filteredStandardInputJson.settings as Record<string, any>;

    return {
      compiler: { version: this.compilerVersion },
      language: 'Solidity',
      output: { abi: [], devdoc: {}, userdoc: {} },
      settings: {
        compilationTarget: { [sourceName]: contractName },
        evmVersion: settings.evmVersion ?? 'london',
        libraries: settings.libraries ?? {},
        metadata: { bytecodeHash: 'ipfs' },
        optimizer: filteredStandardInputJson.settings.optimizer,
        remappings: settings.remappings ?? [],
      },
      sources: Object.fromEntries(
        Object.entries(filteredStandardInputJson.sources).map(
          ([src, { content }]) => [src, { content }],
        ),
      ),
      version: 1,
    };
  }

  /**
   * @notice Submits the verification payload to the Kaiascan API.
   * @dev Payload: { address, chain (chainId), files: { "metadata.json", <sourceFiles>, ["constructor-args.txt"] } }
   *      The API endpoint is resolved from KAIASCAN_VERIFY_URLS by chainId,
   *      not from the chain metadata apiUrl.
   */
  private async submitKaiascanForm(
    chain: ChainName,
    input: ContractVerificationInput,
    sourceName: string,
    filteredStandardInputJson: SolidityStandardJsonInput,
    verificationLogger: Logger,
  ): Promise<void> {
    const verifyUrl = this.getVerifyUrl(chain);
    const chainId = Number(this.multiProvider.getChainMetadata(chain).chainId);

    const metadata = this.buildKaiascanMetadata(
      sourceName,
      input.name,
      filteredStandardInputJson,
    );

    const files: Record<string, string> = {
      'metadata.json': JSON.stringify(metadata),
    };

    // Add all filtered source files
    for (const [src, { content }] of Object.entries(
      filteredStandardInputJson.sources,
    )) {
      files[src] = content;
    }

    // Kaiascan's Sourcify-compatible API verifies the runtime (deployed)
    // bytecode rather than the creation bytecode, so constructor arguments
    // are not required and must NOT be sent — including them causes a
    // "Contract source is not compiled." error for contracts that have
    // constructor parameters.

    const payload = {
      address: input.address,
      chain: chainId,
      files,
    };

    verificationLogger.trace(
      { verifyUrl, chain, address: input.address },
      'Submitting verification to Kaiascan...',
    );

    let response: Response;
    try {
      response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(
        `[${chain}] Kaiascan verification request failed for ${input.address}: ${err}`,
      );
    }

    let responseJson: any;
    try {
      responseJson = await response.json();
    } catch {
      throw new Error(
        `[${chain}] Failed to parse Kaiascan response (${verifyUrl}): ` +
          `${response.statusText || 'UNKNOWN STATUS TEXT'} (${response.status})`,
      );
    }

    verificationLogger.debug(
      { verifyUrl, chain, address: input.address, response: responseJson },
      'Kaiascan verification response received',
    );

    if (!response.ok) {
      const errorMessage =
        responseJson?.message ??
        responseJson?.error ??
        response.statusText ??
        'Unknown error';
      throw new Error(
        `[${chain}] Kaiascan verification failed for ${input.address} ` +
          `(HTTP ${response.status}): ${errorMessage}`,
      );
    }

    verificationLogger.debug(
      { address: input.address },
      '✅ Kaiascan verification submitted successfully.',
    );
  }
}
