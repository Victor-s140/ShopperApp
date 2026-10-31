# Counter

A lightweight browser app for recording customer purchases at checkout. It includes a product catalog, stock tracking, cash, card, mobile payment, and credit sale recording, customer balances and repayments, printable receipts, sales history, and reports with downloadable daily product sales.

## Run the app

The app uses Supabase for sign-in and shared shop data. Configure a Supabase project before opening the app; the app must be served from an HTTP(S) origin and will not work when opened as a `file://` URL.

1. Create a Supabase project.
2. In Supabase Authentication settings, allow email sign-ups. Choose whether email confirmation is required. Users can create a new account from the sign-in screen; each account gets separate products and sales.
3. Run `supabase/migrations/202609300001_initial_backend.sql` in the Supabase SQL Editor.
4. Copy the project URL and publishable key from the Supabase project API settings into `supabase-config.js`. These browser settings are public; never put a service-role key in this file.
5. In Supabase Authentication URL settings, add the hosted app URL to the allowed redirect URLs. For local development, use a local HTTP server such as the VS Code Live Server extension.
6. Open the hosted app and create an account or sign in. If email confirmation is enabled, confirm the address before signing in. If this browser has data from the older local-only version, use **Import** before removing its local storage. The original local copy is retained after import.

Checkout requires an internet connection. The server validates current prices and stock and records each sale and its stock deduction atomically. Payment methods are recorded for bookkeeping; the app does not process card or mobile payments.

## Data and settings

Products, sales, sale items, and credit repayments are stored in Supabase and scoped to the signed-in shop account. Browser local storage is retained only as the source for a one-time import from the previous version. Prices are displayed in Nigerian naira (NGN); existing imported prices keep the same numeric values and are treated as naira, with no currency conversion.

Tax is not calculated. Confirm your local tax requirements before using the app for live sales.
