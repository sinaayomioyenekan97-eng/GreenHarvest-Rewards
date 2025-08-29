import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MintRecord {
  amount: number;
  recipient: string;
  metadata: string;
  blockHeight: number;
  minter: string;
}

interface BatchEntry {
  recipient: string;
  amount: number;
  metadata: string;
}

interface ContractState {
  balances: Map<string, number>;
  minters: Map<string, boolean>;
  mintRecords: Map<number, MintRecord>;
  totalSupply: number;
  paused: boolean;
  admin: string;
  mintCounter: number;
  tokenUri: string | null;
}

// Mock contract implementation
class GHVTokenMock {
  private state: ContractState = {
    balances: new Map(),
    minters: new Map([["contract-owner", true]]),
    mintRecords: new Map(),
    totalSupply: 0,
    paused: false,
    admin: "contract-owner",
    mintCounter: 0,
    tokenUri: null,
  };

  private CONTRACT_OWNER = "contract-owner";
  private MAX_METADATA_LEN = 500;
  private MAX_URI_LEN = 256;
  private TOKEN_NAME = "GreenHarvestValue";
  private TOKEN_SYMBOL = "GHV";
  private TOKEN_DECIMALS = 6;
  private ERR_UNAUTHORIZED = 100;
  private ERR_PAUSED = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_INVALID_RECIPIENT = 103;
  private ERR_INVALID_MINTER = 104;
  private ERR_ALREADY_REGISTERED = 105;
  private ERR_METADATA_TOO_LONG = 106;
  private ERR_INSUFFICIENT_BALANCE = 107;
  private ERR_INVALID_URI = 108;
  private ERR_NOT_OWNER = 109;

  private mockBlockHeight = 1000; // Mock block height for testing

  getName(): ClarityResponse<string> {
    return { ok: true, value: this.TOKEN_NAME };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: this.TOKEN_SYMBOL };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: this.TOKEN_DECIMALS };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getTokenUri(): ClarityResponse<string | null> {
    return { ok: true, value: this.state.tokenUri };
  }

  isMinter(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.minters.get(account) ?? false };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getMintRecord(mintId: number): ClarityResponse<MintRecord | null> {
    return { ok: true, value: this.state.mintRecords.get(mintId) ?? null };
  }

  getMintCounter(): ClarityResponse<number> {
    return { ok: true, value: this.state.mintCounter };
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin && caller !== this.CONTRACT_OWNER) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setTokenUri(caller: string, newUri: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (newUri.length > this.MAX_URI_LEN) {
      return { ok: false, value: this.ERR_INVALID_URI };
    }
    this.state.tokenUri = newUri;
    return { ok: true, value: true };
  }

  addMinter(caller: string, newMinter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.minters.has(newMinter)) {
      return { ok: false, value: this.ERR_ALREADY_REGISTERED };
    }
    this.state.minters.set(newMinter, true);
    return { ok: true, value: true };
  }

  removeMinter(caller: string, minter: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.minters.set(minter, false);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, metadata: string): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === this.CONTRACT_OWNER) {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalSupply += amount;
    const mintId = this.state.mintCounter + 1;
    this.state.mintRecords.set(mintId, {
      amount,
      recipient,
      metadata,
      blockHeight: this.mockBlockHeight++,
      minter: caller,
    });
    this.state.mintCounter = mintId;
    return { ok: true, value: mintId };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (recipient === this.CONTRACT_OWNER) {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const senderBalance = this.state.balances.get(caller) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(caller, senderBalance - amount);
    this.state.totalSupply -= amount;
    return { ok: true, value: true };
  }

  batchMint(caller: string, entries: BatchEntry[]): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.minters.get(caller)) {
      return { ok: false, value: this.ERR_INVALID_MINTER };
    }
    let count = 0;
    for (const entry of entries) {
      const result = this.mint(caller, entry.amount, entry.recipient, entry.metadata);
      if (!result.ok) {
        return result;
      }
      count++;
    }
    return { ok: true, value: count };
  }

  verifyMintOwnership(mintId: number, owner: string): ClarityResponse<boolean> {
    const record = this.state.mintRecords.get(mintId);
    if (!record) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (record.recipient !== owner) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  contractOwner: "contract-owner",
  admin: "admin",
  minter: "wallet_1",
  user1: "wallet_2",
  user2: "wallet_3",
};

describe("GHVToken Contract", () => {
  let contract: GHVTokenMock;

  beforeEach(() => {
    contract = new GHVTokenMock();
    vi.resetAllMocks();
    // Set initial admin if needed
    contract.setAdmin(accounts.contractOwner, accounts.admin);
  });

  it("should initialize with correct token metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "GreenHarvestValue" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "GHV" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 6 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 0 });
    expect(contract.getTokenUri()).toEqual({ ok: true, value: null });
  });

  it("should allow admin to set token URI", () => {
    const newUri = "https://greenharvest.example/metadata.json";
    const setUri = contract.setTokenUri(accounts.admin, newUri);
    expect(setUri).toEqual({ ok: true, value: true });
    expect(contract.getTokenUri()).toEqual({ ok: true, value: newUri });
  });

  it("should prevent non-admin from setting token URI", () => {
    const setUri = contract.setTokenUri(accounts.user1, "invalid");
    expect(setUri).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to add minter", () => {
    const addMinter = contract.addMinter(accounts.admin, accounts.minter);
    expect(addMinter).toEqual({ ok: true, value: true });
    const isMinter = contract.isMinter(accounts.minter);
    expect(isMinter).toEqual({ ok: true, value: true });
  });

  it("should prevent non-admin from adding minter", () => {
    const addMinter = contract.addMinter(accounts.user1, accounts.minter);
    expect(addMinter).toEqual({ ok: false, value: 100 });
  });

  it("should allow minter to mint tokens with metadata", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    const mintResult = contract.mint(
      accounts.minter,
      1000000, // 1.000000 GHV
      accounts.user1,
      "1 ton CO2 sequestered from sustainable farming"
    );
    expect(mintResult).toEqual({ ok: true, value: 1 });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000000 });
    const mintRecord = contract.getMintRecord(1);
    expect(mintRecord).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 1000000,
        recipient: accounts.user1,
        metadata: "1 ton CO2 sequestered from sustainable farming",
        minter: accounts.minter,
      }),
    });
  });

  it("should prevent non-minter from minting", () => {
    const mintResult = contract.mint(
      accounts.user1,
      1000000,
      accounts.user1,
      "Unauthorized mint"
    );
    expect(mintResult).toEqual({ ok: false, value: 104 });
  });

  it("should allow token transfer between users", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");
    const transferResult = contract.transfer(
      accounts.user1,
      500000,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500000 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500000 });
  });

  it("should prevent transfer of insufficient balance", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    contract.mint(accounts.minter, 100000, accounts.user1, "Test mint");
    const transferResult = contract.transfer(
      accounts.user1,
      200000,
      accounts.user1,
      accounts.user2
    );
    expect(transferResult).toEqual({ ok: false, value: 107 });
  });

  it("should allow burning tokens", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");
    const burnResult = contract.burn(accounts.user1, 300000);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 700000 });
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.admin);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });
    const mintDuringPause = contract.mint(
      accounts.admin,
      1000000,
      accounts.user1,
      "Paused mint"
    );
    expect(mintDuringPause).toEqual({ ok: false, value: 101 });
    const unpauseResult = contract.unpauseContract(accounts.admin);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent metadata exceeding max length", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    const longMetadata = "a".repeat(501);
    const mintResult = contract.mint(
      accounts.minter,
      1000000,
      accounts.user1,
      longMetadata
    );
    expect(mintResult).toEqual({ ok: false, value: 106 });
  });

  it("should allow batch minting", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    const entries: BatchEntry[] = [
      { recipient: accounts.user1, amount: 1000000, metadata: "Batch1" },
      { recipient: accounts.user2, amount: 2000000, metadata: "Batch2" },
    ];
    const batchResult = contract.batchMint(accounts.minter, entries);
    expect(batchResult).toEqual({ ok: true, value: 2 });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000000 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 2000000 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 3000000 });
  });

  it("should verify mint ownership", () => {
    contract.addMinter(accounts.admin, accounts.minter);
    contract.mint(accounts.minter, 1000000, accounts.user1, "Test mint");
    const verifyCorrect = contract.verifyMintOwnership(1, accounts.user1);
    expect(verifyCorrect).toEqual({ ok: true, value: true });
    const verifyIncorrect = contract.verifyMintOwnership(1, accounts.user2);
    expect(verifyIncorrect).toEqual({ ok: false, value: 109 });
  });
});