import { Contract } from '@algorandfoundation/tealscript';

// eslint-disable-next-line no-unused-vars
class AlgobetTs extends Contract {
  manager = GlobalStateKey<Address>();

  oracleAddr = GlobalStateKey<Address>();

  eventResult = GlobalStateKey<uint64>();

  betAmount = GlobalStateKey<uint64>();

  counterOpt0 = GlobalStateKey<uint64>();

  counterOpt1 = GlobalStateKey<uint64>();

  counterOpt2 = GlobalStateKey<uint64>();

  stakeAmount = GlobalStateKey<uint64>();

  winningCount = GlobalStateKey<uint64>();

  winningPayout = GlobalStateKey<uint64>();

  eventStartTimestamp = GlobalStateKey<uint64>();

  eventEndTimestamp = GlobalStateKey<uint64>();

  payoutTimeWindowS = GlobalStateKey<uint64>();

  chosenOpt = LocalStateKey<uint64>();

  hasPlacedBet = LocalStateKey<boolean>();

  hasRequestedPayout = LocalStateKey<boolean>();

  createApplication(
    managerAddr: Address,
    oracleAddr: Address,
    eventStartUnixTimestamp: uint64,
    eventEndUnixTimestamp: uint64,
    payoutTimeWindowS: uint64
  ): void {
    this.manager.value = managerAddr;
    this.oracleAddr.value = oracleAddr;

    assert(eventEndUnixTimestamp > globals.latestTimestamp);
    assert(eventEndUnixTimestamp > eventStartUnixTimestamp);
    this.eventResult.value = 99;
    this.betAmount.value = 1_400_000;
    this.stakeAmount.value = 0;
    this.counterOpt0.value = 0;
    this.counterOpt1.value = 0;
    this.counterOpt2.value = 0;
    this.winningCount.value = 0;
    this.eventStartTimestamp.value = eventStartUnixTimestamp;
    this.eventEndTimestamp.value = eventEndUnixTimestamp;
    this.payoutTimeWindowS.value = payoutTimeWindowS;
  }

  set_event_result(opt: uint64): void {
    assert(this.txn.sender === this.oracleAddr.value);
    // assert(globals.latestTimestamp >= this.eventEndTimestamp.value);
    if (opt > 3) {
      throw Error('Invalid option');
    }
    this.eventResult.value = opt;
    if (opt === 0) {
      this.winningCount.value = this.counterOpt0.value;
    }
    if (opt === 1) {
      this.winningCount.value = this.counterOpt1.value;
    }
    if (opt === 2) {
      this.winningCount.value = this.counterOpt2.value;
    }
    if (this.winningCount.value === 0) {
      this.winningPayout.value = this.stakeAmount.value - globals.minTxnFee;
    } else {
      this.winningPayout.value = this.stakeAmount.value / this.winningCount.value - globals.minTxnFee;
    }
  }

  deleteApplication(): void {
    assert(this.txn.sender === this.manager.value);
    // assert(globals.latestTimestamp >= this.eventEndTimestamp.value);
    // assert(globals.latestTimestamp >= this.eventEndTimestamp.value + this.payoutTimeWindowS.value);
    sendPayment({
      receiver: this.txn.sender,
      amount: 0,
      closeRemainderTo: this.txn.sender,
    });
  }

  private setManager(newManager: Address): void {
    this.manager.value = newManager;
  }

  private setOracle(newOracle: Address): void {
    this.oracleAddr.value = newOracle;
  }

  private setEventStartTimestamp(newEventStartTimestamp: uint64): void {
    this.eventStartTimestamp.value = newEventStartTimestamp;
  }

  private setEventEndTimestamp(newEventEndTimestamp: uint64): void {
    this.eventEndTimestamp.value = newEventEndTimestamp;
  }

  private setPayoutTimeWindowS(newPayoutTimeWindowS: uint64): void {
    this.payoutTimeWindowS.value = newPayoutTimeWindowS;
  }

  optInToApplication(): void {
    this.hasPlacedBet(this.txn.sender).value = false;
    this.hasRequestedPayout(this.txn.sender).value = false;
  }

  bet(opt: uint64, betDepositTx: PayTxn): void {
    verifyPayTxn(betDepositTx, {
      amount: this.betAmount.value,
      receiver: this.app.address,
    });
    // assert(globals.latestTimestamp < this.eventStartTimestamp.value);

    assert(this.hasPlacedBet(this.txn.sender).value === false);
    if (opt > 3) {
      throw Error('Invalid option');
    }
    this.chosenOpt(this.txn.sender).value = opt;
    if (opt === 0) {
      this.counterOpt0.value = this.counterOpt0.value + 1;
    }
    if (opt === 1) {
      this.counterOpt1.value = this.counterOpt1.value + 1;
    }
    if (opt === 2) {
      this.counterOpt2.value = this.counterOpt2.value + 1;
    }
    this.hasPlacedBet(this.txn.sender).value = true;
    this.stakeAmount.value = this.stakeAmount.value + this.betAmount.value;
  }

  payout(): void {
    assert(this.txn.sender.isOptedInToApp(this.app));
    assert(this.eventResult.value === this.chosenOpt(this.txn.sender).value);
    assert(this.hasRequestedPayout(this.txn.sender).value === false);
    this.hasRequestedPayout(this.txn.sender).value = true;
    sendPayment({
      receiver: this.txn.sender,
      amount: this.winningPayout.value,
    });
  }
}
