# 🚀 API Implementation Task List

Berdasarkan dokumen [planing_route.md](file:///d:/HACKATON/Apps/Backend/docs/planing_route.md), berikut adalah status progres pengerjaan API BISA B2B:

## Phase 1: Authentication & Identity (High Priority)

- [x] **Auth System** (`/api/v1/auth`)
  - [x] Register (Supplier & Buyer)
  - [x] Login & JWT Management
  - [x] OTP & Email Verification
  - [x] Password Reset Flow (OTP & Token)
  - [x] Profile Get/Update (incl. Avatar)
  - [x] Identity Verification (KYC) Upload
- [x] **User Management Add-ons** (`/api/v1/users`)
  - [x] Manage Additional Addresses (`CustomerAddress`)
  - [x] Operating Hours Management
- [x] **System Constants & Enums** (`/api/v1/system/constants`)
  - [x] Fetch all Enums for FE Dropdowns
- [x] **Notifications** (`/api/v1/notifications`)
  - [x] List & Mark as Read

---

## Phase 2: Core Marketplace & Geolocation

- [x] **GIS / Geospasial** (`/api/v1/gis`)
  - [x] Master data Wilayah (Provinsi/Kabupaten/Kecamatan/Desa)
- [x] **Categories** (`/api/v1/categories`)
- [x] **Products** (`/api/v1/products`)
  - [x] Basic CRUD (Sync dengan UUID)
  - [x] Product Images & Technical Specs
- [x] **Supplier Directory** (`/api/v1/suppliers`)

---

## Phase 3: Business Logic & Revenue (Complex)

- [x] **Negotiations** (`/api/v1/negotiations`)
  - [x] Offer Flow & Global Chat
- [x] **Orders & Escrow** (`/api/v1/orders`)
  - [x] Checkout Flow
  - [x] Shipment Tracking
- [x] **Financials** (`/api/v1/transactions`, `/api/v1/payments`, `/api/v1/wallets`)
  - [x] Xendit Integration (Webhook & Payout)
- [x] **Reviews** (`/api/v1/reviews`)

---

## Phase 4: Back Office - Admin & Governance [ACTIVE FOCUS]

- [ ] **Admin Dashboard** (`/api/v1/admin/dashboard`)
  - [ ] Real-time Stats (GMV, Users, Biomass Volume)
- [ ] **User Control & KYC** (`/api/v1/admin/users`)
  - [ ] Advanced User Listing (Search & Pagination)
  - [ ] Identity Verification Review (Approve/Reject)
  - [ ] User Status Toggle (Block/Unblock)
- [ ] **Payment & Financial Control** (`/api/v1/admin/channels`)
  - [ ] Payment Channel Management (Kill-Switch)
  - [ ] Transaction Audit List
- [ ] **Audit Logs** (`/api/v1/admin/logs`)

---

## Phase 5: Buyer & Supplier Experience (Extended)

- [ ] **Notification Email Update**
  - [ ] Update Notification IN App & Email
- [ ] **Reviews & Ratings** (`/api/v1/reviews`)
- [ ] **CMS & Static Content** (`/api/v1/cms`)
- [ ] **Articles & Library** (`/api/v1/articles`)

---

## Phase 6: Ecosystem Value-Adds

- [ ] **IoT Monitoring** (`/api/v1/iot`)
- [ ] **AI Predictions** (`/api/v1/ai/predict`)
- [ ] **Community Forum** (`/api/v1/forum`)
- [ ] **Market Trends Dashboard** (`/api/v1/analytics`)
