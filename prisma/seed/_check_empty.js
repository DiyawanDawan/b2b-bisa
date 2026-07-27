import prisma from '../../src/config/prisma.js';

async function main() {
  const models = [
    'address',
    'article',
    'articleComment',
    'booking',
    'cartItem',
    'category',
    'certificate',
    'chatMessage',
    'collection',
    'country',
    'deviceClaim',
    'dispute',
    'disputeEvidence',
    'district',
    'faq',
    'forumPost',
    'forumGroup',
    'harvestLot',
    'iotReading',
    'knowledgeDocument',
    'landArea',
    'mediaUploadSession',
    'negotiation',
    'negotiationEvent',
    'notification',
    'order',
    'orderItem',
    'partnership',
    'paymentRecord',
    'payout',
    'pickupVehicle',
    'platformSetting',
    'product',
    'productBooking',
    'productCertificate',
    'productCollection',
    'productCustomSpec',
    'productLike',
    'productMedia',
    'productQuestion',
    'productSpec',
    'productVideo',
    'promotion',
    'province',
    'ratingCache',
    'regency',
    'regionalMarketSale',
    'review',
    'rfq',
    'rfqResponse',
    'sampleOrder',
    'shippingCenter',
    'shippingRate',
    'storeBanner',
    'storeBannerModerationHistory',
    'supportTicket',
    'supportTicketMessage',
    'transaction',
    'user',
    'userFollow',
    'vendor',
    'village',
    'voucher',
    'voucherRedemption',
    'wasteData',
    'webhookLog',
  ];

  const empty = [];
  const errors = [];
  for (const m of models) {
    try {
      const c = await prisma[m].count();
      if (c === 0) empty.push(m);
      else console.log(`  ${m}: ${c}`);
    } catch (e) {
      errors.push(m);
    }
  }
  console.log('\n--- EMPTY TABLES ---');
  if (empty.length) empty.forEach((m) => console.log(`  [EMPTY] ${m}`));
  else console.log('  (none - semua tabel punya data)');
  if (errors.length) {
    console.log('\n--- NO MODEL ---');
    errors.forEach((m) => console.log(`  [SKIP] ${m}`));
  }
  await prisma.$disconnect();
}
main();
