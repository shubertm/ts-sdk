import { describe, it, expect, vi, beforeEach } from "vitest";
import { hex } from "@scure/base";
import { Wallet, SingleKey, OnchainWallet } from "../src";
import type { Coin } from "../src/wallet";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventSource
const MockEventSource = vi.fn().mockImplementation((url: string) => ({
    url,
    onmessage: null,
    onerror: null,
    close: vi.fn(),
}));
vi.stubGlobal("EventSource", MockEventSource);

describe("Wallet", () => {
    // Test vector from BIP340
    const mockPrivKeyHex =
        "ce66c68f8875c0c98a502c666303dc183a21600130013c06f9d1edf60207abf2";
    // X-only pubkey (without the 02/03 prefix)
    const mockServerKeyHex =
        "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const mockIdentity = SingleKey.fromHex(mockPrivKeyHex);

    beforeEach(() => {
        mockFetch.mockReset();
    });

    describe("getBalance", () => {
        const mockUTXOs: Coin[] = [
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 0,
                value: 100000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
        ];

        it("should calculate balance from coins", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUTXOs),
            });

            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            const balance = await wallet.getBalance();
            expect(balance).toBe(100000);
        });

        it("should calculate balance from virtual coins", async () => {
            const mockServerResponse = {
                vtxos: [
                    {
                        outpoint: {
                            txid: hex.encode(new Uint8Array(32).fill(3)),
                            vout: 0,
                        },
                        amount: "50000",
                        spentBy: null,
                        expiresAt: "1704067200",
                        createdAt: "1704067200",
                        script: "cf63d80fddd790bb2de2b639545b7298d3b5c33d483d84b0be399fe828720fcf",
                        isPreconfirmed: false,
                        isSwept: false,
                        isUnrolled: false,
                        isSpent: false,
                        commitmentTxids: [
                            "f3e437911673f477f314f8fc31eb08def6ccff9edcd0524c10bcf5fc05009d69",
                        ],
                        settledBy: null,
                    },
                ],
            };

            // Setup mocks in the correct order based on actual call sequence:
            // 1. getInfo() call during wallet creation
            // 2. getBoardingUtxos() -> getCoins() call
            // 3. getVtxos() -> first vtxos call (spendable)
            // 4. getVtxos() -> second vtxos call (recoverable)

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            signerPubkey: mockServerKeyHex,
                            forfeitPubkey: mockServerKeyHex,
                            batchExpiry: BigInt(144),
                            unilateralExitDelay: BigInt(144),
                            roundInterval: BigInt(144),
                            network: "mutinynet",
                            forfeitAddress:
                                "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                            checkpointTapscript:
                                "5ab27520e35799157be4b37565bb5afe4d04e6a0fa0a4b6a4f4e48b0d904685d253cdbdbac",
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockUTXOs),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockServerResponse),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ vtxos: [] }),
                });

            const wallet = await Wallet.create({
                identity: mockIdentity,
                arkServerUrl: "http://localhost:7070",
            });

            const balance = await wallet.getBalance();
            expect(balance.settled).toBe(50000);
            expect(balance.boarding.total).toBe(100000);
            expect(balance.preconfirmed).toBe(0);
            expect(balance.available).toBe(50000);
            expect(balance.recoverable).toBe(0);
            expect(balance.total).toBe(150000);
        });
    });

    describe("getCoins", () => {
        const mockUTXOs: Coin[] = [
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 0,
                value: 100000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
        ];

        it("should return coins from provider", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUTXOs),
            });

            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            const coins = await wallet.getCoins();
            expect(coins).toEqual(mockUTXOs);
        });
    });

    describe("sendBitcoin", () => {
        const mockUTXOs = [
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 0,
                value: 100000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 1,
                value: 7000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 2,
                value: 1000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 3,
                value: 6500,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 4,
                value: 12000,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
            {
                txid: hex.encode(new Uint8Array(32).fill(1)),
                vout: 5,
                value: 1400,
                status: {
                    confirmed: true,
                    block_height: 100,
                    block_hash: hex.encode(new Uint8Array(32).fill(2)),
                    block_time: 1600000000,
                },
            },
        ];
        const mockTxId = hex.encode(new Uint8Array(32).fill(1));
        const mockFeeRate = 3;

        beforeEach(() => {
            mockFetch.mockReset();
        });

        it("should throw error when amount is negative", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            await expect(
                wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: -1000,
                })
            ).rejects.toThrow("Amount must be positive");
        });

        it("should throw error when funds are insufficient", async () => {
            const mockFeeRate = 3;
            const mockTxId = hex.encode(new Uint8Array(32).fill(1));

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUTXOs),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockFeeRate),
            });

            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            await expect(
                wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: 12500000,
                })
            ).rejects.toThrow("Insufficient funds");
        });

        it("should throw when amount is below dust", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );
            await expect(
                wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: 545,
                })
            ).rejects.toThrow("Amount is below dust limit");
        });

        it("should send funds when change amount is below dust", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUTXOs),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockFeeRate),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockTxId),
            });

            expect(
                await wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: 111500, // With selection of 100000 and 12000, the change is less than dust(546sats)
                })
            ).toEqual(mockTxId);
        });

        it("should send amount with correct fees", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUTXOs),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockFeeRate),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve(mockTxId),
            });

            expect(
                await wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: 115000,
                })
            ).toEqual(mockTxId);
        });

        it("should calculate different tx sizes for Segwit vs Taproot", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            const coins: Coin[] = [
                {
                    txid: hex.encode(new Uint8Array(32).fill(1)),
                    vout: 0,
                    value: 100_000_000,
                    status: {
                        confirmed: true,
                        block_height: 100,
                        block_hash: "",
                        block_time: 0,
                    },
                },
            ];
            const feeRate = 10;

            const mockCalls = () => {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(coins),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(feeRate),
                });
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    text: () => Promise.resolve("txid_mock"),
                });
            };

            // 1. Send to Native Segwit Address (tb1q...)
            // We expect a smaller output size (~31 bytes)
            const segwitAddr = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
            mockCalls();
            await wallet.send({ address: segwitAddr, amount: 50_000 });

            // Extract the hex from the broadcast call (3rd call, 2nd arg is init object with body)
            const segwitTxHex = mockFetch.mock.calls[2][1].body;
            const segwitSize = segwitTxHex.length / 2;

            mockFetch.mockReset();

            // 2. Send to Taproot Address (Wallet Address is P2TR)
            // We expect a larger output size (~43 bytes)
            const taprootAddr = wallet.address;
            mockCalls();
            await wallet.send({ address: taprootAddr, amount: 50_000 });

            const taprootTxHex = mockFetch.mock.calls[2][1].body;
            const taprootSize = taprootTxHex.length / 2;

            expect(segwitSize).toBeLessThan(taprootSize);
        });

        it("should resolve oscillation when change is near dust limit", async () => {
            const wallet = await OnchainWallet.create(
                mockIdentity,
                "mutinynet"
            );

            const feeRate = 10;
            // Calculations for the edge case:
            // Tx with 1 input, 1 output (no change) ≈ 111 vBytes. Fee ≈ 1110.
            // Tx with 1 input, 2 outputs (change) ≈ 154 vBytes. Fee ≈ 1540.
            // Difference (cost of change output) ≈ 430 sats.
            // Dust limit = 546 sats.
            // We need: Remaining Amount (after fee) to be > 546 BUT < (546 + 430).
            // Let's target Remaining = 800.

            const sendAmount = 50_000;
            const approxFeeNoChange = 1110;
            const inputAmount = sendAmount + approxFeeNoChange + 800;

            const coins: Coin[] = [
                {
                    txid: hex.encode(new Uint8Array(32).fill(2)),
                    vout: 0,
                    value: inputAmount,
                    status: {
                        confirmed: true,
                        block_height: 100,
                        block_hash: "",
                        block_time: 0,
                    },
                },
            ];

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(coins),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(feeRate),
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                text: () => Promise.resolve("txid_mock"),
            });

            await expect(
                wallet.send({
                    address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                    amount: sendAmount,
                })
            ).resolves.toBeDefined();
        });
    });

    describe("getInfos", () => {
        const mockArkInfo = {
            signerPubkey: mockServerKeyHex,
            forfeitPubkey: mockServerKeyHex,
            batchExpiry: BigInt(144),
            unilateralExitDelay: BigInt(144),
            roundInterval: BigInt(144),
            network: "mutinynet",
            dust: BigInt(1000),
            boardingDescriptorTemplate: "boarding_template",
            vtxoDescriptorTemplates: ["vtxo_template"],
            forfeitAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
            checkpointTapscript:
                "5ab27520e35799157be4b37565bb5afe4d04e6a0fa0a4b6a4f4e48b0d904685d253cdbdbac",
        };

        it("should initialize with ark provider when configured", async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        ...mockArkInfo,
                        vtxoTreeExpiry: mockArkInfo.batchExpiry, // Server response uses vtxoTreeExpiry
                    }),
            });

            const wallet = await Wallet.create({
                identity: mockIdentity,
                arkServerUrl: "http://localhost:7070",
            });

            const address = await wallet.getAddress();
            expect(address).toBeDefined();

            const boardingAddress = await wallet.getBoardingAddress();
            expect(boardingAddress).toBeDefined();
        });
    });
});
