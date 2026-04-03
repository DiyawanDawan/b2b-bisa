/**
 * ⚠️  DEPRECATED: File ini sudah dimigrasikan ke wallet.service.ts
 *
 * Semua logika finansial (releaseEscrow, refundToBuyer, withdrawFunds, dll)
 * kini tersentralisasi di satu tempat untuk mencegah duplikasi logic.
 *
 * Re-export untuk backward compatibility, jangan tambahkan fungsi baru di sini.
 */
export {
  releaseEscrow,
  refundToBuyer,
  withdrawFunds,
  getMyWallet,
  getSupportedBanks,
  getWalletTransactions,
} from '#services/wallet.service';
