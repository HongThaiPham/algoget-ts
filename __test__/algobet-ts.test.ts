import { describe, test, beforeAll, beforeEach, expect } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import algosdk, { Account, encodeAddress, makeBasicAccountTransactionSigner } from 'algosdk';
import { algos, getOrCreateKmdWalletAccount, microAlgos } from '@algorandfoundation/algokit-utils';
import { AlgobetTsClient } from '../contracts/clients/AlgobetTsClient';

const fixture = algorandFixture();

describe('AlgobetTs', () => {
  let algod: algosdk.Algodv2;

  let appClient: AlgobetTsClient;
  let oracleAccount: Account;
  let managerAccount: Account;
  let sender: Account;
  let appId: bigint | number;
  let appAddress: string;
  const eventStartUnixTimestamp = Math.floor(new Date().getTime() / 1000) + 10;
  const eventEndUnixTimestamp = eventStartUnixTimestamp + 2000;

  beforeEach(fixture.beforeEach);

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount, kmd } = fixture.context;
    managerAccount = testAccount;
    algod = fixture.context.algod;

    oracleAccount = await getOrCreateKmdWalletAccount(
      {
        name: 'unencrypted-default-wallet',
        fundWith: algos(10_000_000),
      },
      algod,
      kmd
    );

    sender = await getOrCreateKmdWalletAccount(
      {
        name: 'tealscript-test-wallet',
        fundWith: algos(10),
      },
      algod,
      kmd
    );

    appClient = new AlgobetTsClient(
      {
        sender: managerAccount,
        resolveBy: 'id',
        id: 0,
      },
      algod
    );

    await appClient.create.createApplication({
      managerAddr: managerAccount.addr,
      oracleAddr: oracleAccount.addr,
      eventStartUnixTimestamp: BigInt(eventStartUnixTimestamp),
      eventEndUnixTimestamp: BigInt(eventEndUnixTimestamp),
      payoutTimeWindowS: 5,
    });

    const appRef = await appClient.appClient.getAppReference();
    appId = appRef.appId;
    appAddress = appRef.appAddress;

    const atc = new algosdk.AtomicTransactionComposer();
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: appAddress,
      amount: 100_000,
      suggestedParams: await algod.getTransactionParams().do(),
    });
    const signer = makeBasicAccountTransactionSigner(sender);
    atc.addTransaction({ txn, signer });
    await atc.execute(algod, 3);
  });

  test('Init', async () => {
    const globalState = await appClient.getGlobalState();
    const managerType = algosdk.ABIType.from('address');
    expect(managerType.decode(globalState.manager!.asByteArray())).toEqual(managerAccount.addr);
    expect(encodeAddress(globalState.oracleAddr!.asByteArray())).toEqual(oracleAccount.addr);
  });

  test('Optin application', async () => {
    await appClient.optIn.optInToApplication(
      {},
      {
        sender,
      }
    );
    const localState = await appClient.getLocalState(sender.addr);
    const valueType = algosdk.ABIType.from('bool');
    expect(valueType.decode(localState.hasPlacedBet!.asByteArray())).toEqual(false);
    expect(valueType.decode(localState.hasRequestedPayout!.asByteArray())).toEqual(false);
  });

  test('Bet', async () => {
    let globalState = await appClient.getGlobalState();
    const betAmount = globalState.betAmount!.asNumber();
    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: sender.addr,
      to: appAddress,
      amount: betAmount,
      suggestedParams: await algokit.getTransactionParams(undefined, algod),
    });

    await appClient.bet(
      {
        opt: 0,
        betDepositTx: paymentTxn,
      },
      {
        sender,
      }
    );
    globalState = await appClient.getGlobalState();
    expect(globalState.counterOpt0!.asNumber()).toEqual(1);
    expect(globalState.stakeAmount!.asNumber()).toEqual(betAmount);
    const localState = await appClient.getLocalState(sender.addr);
    const valueType = algosdk.ABIType.from('bool');
    expect(valueType.decode(localState.hasPlacedBet!.asByteArray())).toEqual(true);
    expect(valueType.decode(localState.hasRequestedPayout!.asByteArray())).toEqual(false);
    expect(localState.chosenOpt!.asNumber()).toEqual(0);
  });

  test('Set event (Negative)', async () => {
    await expect(appClient.setEventResult({ opt: 0 })).rejects.toThrow();
  });

  test('Set event', async () => {
    await appClient.setEventResult(
      { opt: 0 },
      {
        sender: oracleAccount,
      }
    );
    const globalState = await appClient.getGlobalState();
    expect(globalState.eventResult!.asNumber()).toEqual(0);
    expect(globalState.winningPayout!.asNumber()).toBeGreaterThan(0);
  });

  test('Payout', async () => {
    await appClient.payout(
      {},
      {
        sender,
        sendParams: {
          fee: microAlgos(2000),
        },
      }
    );
    const localState = await appClient.getLocalState(sender.addr);
    const valueType = algosdk.ABIType.from('bool');
    expect(valueType.decode(localState.hasPlacedBet!.asByteArray())).toEqual(true);
    expect(valueType.decode(localState.hasRequestedPayout!.asByteArray())).toEqual(true);
  }, 10000);

  test.skip('Delete application', async () => {
    await appClient.delete.deleteApplication(
      {},
      {
        sendParams: {
          fee: microAlgos(2000),
        },
      }
    );
    await expect(appClient.getGlobalState()).rejects.toThrow();
  });
});
function AccountTransactionSigner(sk: any): any {
  throw new Error('Function not implemented.');
}
