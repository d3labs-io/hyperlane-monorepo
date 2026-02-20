import { ContractFactory } from 'ethers';

import { buildArtifact } from '@hyperlane-xyz/core/buildArtifact.js';
import {
  ChainMap,
  EvmERC20WarpRouteReader,
  ExplorerFamily,
  ExplorerLicenseType,
  MultiProvider,
  PostDeploymentContractVerifier,
  TokenType,
  VerificationInput,
  WarpCoreConfig,
  hypERC20contracts,
  hypERC20factories,
  isProxy,
  proxyImplementation,
  verificationUtils,
} from '@hyperlane-xyz/sdk';
import { Address, assert, objFilter } from '@hyperlane-xyz/utils';

import { requestAndSaveApiKeys } from '../context/context.js';
import { CommandContext } from '../context/types.js';
import { logBlue, logGray, logGreen } from '../logger.js';

// Zircuit does not have an external API: https://docs.zircuit.com/dev-tools/block-explorer
const UNSUPPORTED_CHAINS = ['zircuit'];

export async function runVerifyWarpRoute({
  context,
  warpCoreConfig,
}: {
  context: CommandContext;
  warpCoreConfig: WarpCoreConfig;
}) {
  const { multiProvider, chainMetadata, registry, skipConfirmation } = context;

  const verificationInputs: ChainMap<VerificationInput> = {};

  let apiKeys: ChainMap<string> = {};
  if (!skipConfirmation)
    apiKeys = await requestAndSaveApiKeys(
      warpCoreConfig.tokens.map((t) => t.chainName),
      chainMetadata,
      registry,
    );

  for (const token of warpCoreConfig.tokens) {
    const { chainName } = token;
    verificationInputs[chainName] = [];

    if (UNSUPPORTED_CHAINS.includes(chainName)) {
      logBlue(`Unsupported chain ${chainName}. Skipping.`);
      continue;
    }

    assert(token.addressOrDenom, 'Invalid addressOrDenom');

    const provider = multiProvider.getProvider(chainName);
    const isProxyContract = await isProxy(provider, token.addressOrDenom);

    // Verify Implementation first because Proxy won't verify without it.
    const deployedContractAddress = isProxyContract
      ? await proxyImplementation(provider, token.addressOrDenom)
      : token.addressOrDenom;

    const { factory, tokenType } = await getWarpRouteFactory(
      multiProvider,
      chainName,
      deployedContractAddress,
    );
    const contractName = hypERC20contracts[tokenType];

    const explorerFamily = chainMetadata[chainName]?.blockExplorers?.[0]?.family;
    if (explorerFamily === ExplorerFamily.Kaiascan) {
      // Kaiascan uses sourcify-compatible verification and verifies runtime
      // (deployed) bytecode rather than creation bytecode. Constructor args are
      // not required and must not be fetched via the Etherscan-compatible API
      // (which Kaiascan does not expose). Build inputs with empty constructor
      // args; KaiascanContractVerifier ignores them.
      // Implementation
      verificationInputs[chainName].push(
        verificationUtils.buildVerificationInput(
          contractName,
          deployedContractAddress,
          '',
        ),
      );
      // Proxy contract source (TransparentUpgradeableProxy) — Kaiascan
      // verifies the proxy's own source code at the proxy address.
      if (isProxyContract) {
        verificationInputs[chainName].push(
          verificationUtils.buildVerificationInput(
            'TransparentUpgradeableProxy',
            token.addressOrDenom,
            '',
            true,
            deployedContractAddress,
          ),
        );
      }
      continue;
    }

    logGray(`Getting constructor args for ${chainName} using explorer API`);

    const implementationInput = await verificationUtils.getImplementationInput({
      chainName,
      contractName,
      multiProvider,
      bytecode: factory.bytecode,
      implementationAddress: deployedContractAddress,
    });
    verificationInputs[chainName].push(implementationInput);

    // Verify Proxy and ProxyAdmin
    if (isProxyContract) {
      const {
        proxyAdminInput,
        transparentUpgradeableProxyInput,
        transparentUpgradeableImplementationInput,
      } = await verificationUtils.getProxyAndAdminInput({
        chainName,
        multiProvider,
        proxyAddress: token.addressOrDenom,
      });

      verificationInputs[chainName].push(proxyAdminInput);
      verificationInputs[chainName].push(transparentUpgradeableProxyInput);
      verificationInputs[chainName].push(
        transparentUpgradeableImplementationInput,
      );
    }
  }

  logBlue(`All explorer constructor args successfully retrieved. Verifying...`);
  const verifier = new PostDeploymentContractVerifier(
    verificationInputs,
    context.multiProvider,
    apiKeys,
    buildArtifact,
    ExplorerLicenseType.MIT,
  );

  await verifier.verify();

  return logGreen('Finished contract verification');
}

async function getWarpRouteFactory(
  multiProvider: MultiProvider,
  chainName: string,
  warpRouteAddress: Address,
): Promise<{
  factory: ContractFactory;
  tokenType: Exclude<
    TokenType,
    TokenType.syntheticUri | TokenType.collateralUri
  >;
}> {
  const warpRouteReader = new EvmERC20WarpRouteReader(multiProvider, chainName);
  const tokenType = (await warpRouteReader.deriveTokenType(
    warpRouteAddress,
  )) as Exclude<TokenType, TokenType.syntheticUri | TokenType.collateralUri>;

  const factory = objFilter(
    hypERC20factories,
    (t, _contract): _contract is any => t === tokenType,
  )[tokenType];

  return { factory, tokenType };
}
