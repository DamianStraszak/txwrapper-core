/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * @ignore Don't show this file in documentation.
 */

import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import {
	construct,
	decode,
	deriveAddress,
	getRegistry,
	methods,
	PolkadotSS58Format,
} from '@substrate/txwrapper-polkadot';

import { rpcToAlephTestnet, signWith } from '../../common/util';

/**
 * Entry point of the script. This script assumes a Polkadot node is running
 * locally on `http://0.0.0.0:9933`.
 */
async function main(): Promise<void> {
	// Wait for the promise to resolve async WASM
	await cryptoWaitReady();
	// Create a new keyring, and add an "Alice" account
	const keyring = new Keyring();
	const alice = keyring.addFromUri('//Alice', { name: 'Alice' }, 'sr25519');
	console.log(
		"Alice's SS58-Encoded Address:",
		deriveAddress(alice.publicKey, PolkadotSS58Format.aleph)
	);

	// Construct a balance transfer transaction offline.
	// To construct the tx, we need some up-to-date information from the node.
	// `txwrapper` is offline-only, so does not care how you retrieve this info.
	// In this tutorial, we simply send RPC requests to the node.

	const { specVersion, transactionVersion, specName } = await rpcToAlephTestnet(
		'state_getRuntimeVersion'
	);
	const metadataRpc = await rpcToAlephTestnet('state_getMetadata');

	const registry = getRegistry({
		chainName: '',
		specName,
		specVersion,
		metadataRpc,
	});

	const { block } = await rpcToAlephTestnet('chain_getBlock');
	const block_number = registry.createType('BlockNumber', block.header.number).toNumber();
	const blockHash = await rpcToAlephTestnet('chain_getBlockHash',  [block_number]);
	const genesisHash = await rpcToAlephTestnet('chain_getBlockHash', [0]);


	const nonce = await rpcToAlephTestnet('system_accountNextIndex', [deriveAddress(alice.publicKey, PolkadotSS58Format.aleph)]);
	console.log(
		"Alice's nonce:",
		nonce
	);

	/**
	 * Create Polkadot's type registry.
	 *
	 * When creating a type registry, it accepts a `asCallsOnlyArg` option which
	 * defaults to false. When true this will minimize the size of the metadata
	 * to only include the calls. This removes storage, events, etc.
	 * This will ultimately decrease the size of the metadata stored in the registry.
	 *
	 * Example:
	 *
	 * ```
	 * const registry = getRegistry({
	 *  chainName: 'Polkadot',
	 *	specName,
	 *	specVersion,
	 *	metadataRpc,
	 *  asCallsOnlyArg: true,
	 * });
	 * ```
	 */


	/**
	 * Now we can create our `balances.transferKeepAlive` unsigned tx. The following
	 * function takes the above data as arguments, so it can be performed offline
	 * if desired.
	 *
	 * In order to decrease the size of the metadata returned in the unsigned transaction,
	 * be sure to include `asCallsOnlyArg` field in the options.
	 * Ex:
	 * {
	 *   metadataRpc,
	 *   registry,
	 *   asCallsOnlyArg: true
	 * }
	 */


	const unsigned = methods.balances.transferKeepAlive(
		{
			value: '10000000000',
			dest: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', // Bob
		},
		{
			address: deriveAddress(alice.publicKey, PolkadotSS58Format.aleph),
			blockHash,
			blockNumber: block_number,
			// Describe the longevity of a transaction. It represents the validity from the `blockHash` field, in number of blocks. Defaults to 64 blocks.
			eraPeriod: 64,
			genesisHash,
			metadataRpc,
			nonce: nonce, // Assuming this is Alice's first tx on the chain
			specVersion,
			tip: 0,
			transactionVersion,
		},
		{
			metadataRpc,
			registry,
		}
	);

	// Decode an unsigned transaction.
	const decodedUnsigned = decode(unsigned, {
		metadataRpc,
		registry,
	});
	console.log(
		`\nDecoded Transaction\n  To: ${
			(decodedUnsigned.method.args.dest as { id: string })?.id
		}\n` + `  Amount: ${decodedUnsigned.method.args.value}`
	);

	// Construct the signing payload from an unsigned transaction.
	const signingPayload = construct.signingPayload(unsigned, { registry });
	console.log(`\nPayload to Sign: ${signingPayload}`);

	// Decode the information from a signing payload.
	const payloadInfo = decode(signingPayload, {
		metadataRpc,
		registry,
	});
	console.log(
		`\nDecoded Transaction\n  To: ${
			(payloadInfo.method.args.dest as { id: string })?.id
		}\n` + `  Amount: ${payloadInfo.method.args.value}`
	);

	// Sign a payload. This operation should be performed on an offline device.
	const signature = signWith(alice, signingPayload, {
		metadataRpc,
		registry,
	});
	console.log(`\nSignature: ${signature}`);

	// Serialize a signed transaction.
	const tx = construct.signedTx(unsigned, signature, {
		metadataRpc,
		registry,
	});
	console.log(`\nTransaction to Submit: ${tx}`);

	// Derive the tx hash of a signed transaction offline.
	const expectedTxHash = construct.txHash(tx);
	console.log(`\nExpected Tx Hash: ${expectedTxHash}`);

	// Send the tx to the node. Again, since `txwrapper` is offline-only, this
	// operation should be handled externally. Here, we just send a JSONRPC
	// request directly to the node.
	const actualTxHash = await rpcToAlephTestnet('author_submitExtrinsic', [tx]);
	console.log(`Actual Tx Hash: ${actualTxHash}`);

	// Decode a signed payload.
	const txInfo = decode(tx, {
		metadataRpc,
		registry,
	});
	console.log(
		`\nDecoded Transaction\n  To: ${
			(txInfo.method.args.dest as { id: string })?.id
		}\n` + `  Amount: ${txInfo.method.args.value}\n`
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
