# ZK Scooter Rider App

Cross-platform React Native (Expo + Dev Client) app that unlocks, rides, and locks a
shared electric scooter over Bluetooth Low Energy, authorized by a backend. Built to the
ZK Series @Mobile Application User Protocol (`QSZMAUPZKAN8009`, v80.09).

## Two independent links

1. **App ↔ Backend** — HTTPS REST, phone-initiated. Authenticates the rider and returns
   the BLE password.
2. **App ↔ Scooter** — BLE, local. Sends commands and receives acks. The backend never
   relays commands to the scooter; the phone does.

## Project layout

```
zk-rider-app/
├── App.tsx                     App root (providers + navigation)
├── index.ts                    Expo entry
├── app.json                    Expo config: BLE + camera plugins & permissions
├── src/
│   ├── ble/
│   │   ├── constants.ts        GATT UUIDs (Service 0x2C00 / Char 0x2C10), chunk size
│   │   ├── protocol.ts         Framing, chunking, all 8 command builders, ack parsers, redaction
│   │   ├── protocol.test.ts    Unit tests for the protocol layer
│   │   ├── bleManager.ts       Scan-by-IMEI, connect, subscribe, write+await-ack
│   │   └── permissions.ts      Runtime BLE/location permissions
│   ├── api/
│   │   ├── client.ts           Typed REST client for the §4 contract
│   │   └── types.ts            Backend types + ApiError
│   ├── state/
│   │   ├── authStore.ts        Bearer token (auth is stubbed)
│   │   └── rideStore.ts        In-memory ride + BLE password (never persisted)
│   ├── rideService.ts          High-level ride actions bridging BLE + audit
│   ├── screens/                Login, Home, Unlock, Ride
│   ├── components/             Shared UI + QR scanner
│   ├── navigation/             React Navigation stack
│   ├── config.ts               API base URL resolution
│   └── log.ts                  Password-redacting logger
└── server/
    └── index.js                Zero-dependency mock backend (§4 contract)
```

## Prerequisites

- Node 18+
- Xcode (iOS) / Android Studio (Android) for the native dev build
- A physical device is recommended — BLE does not work in the iOS Simulator, and the
  Android emulator has no BLE radio.

## Running

### 1. Start the mock backend

```bash
npm run mock-server
```

Serves on `http://localhost:4000`. Seeded scooter IMEIs are printed on start. The
`blePassword` is only ever returned by `POST /v1/rides/start`.

### 2. Install app dependencies and build a dev client

```bash
npm install
npx expo prebuild            # generate native projects
npm run ios                  # or: npm run android
```

Expo Go will **not** work (BLE needs native modules). Use the Dev Client build.

### 3. Point the app at your backend

- iOS device: set `expo.extra.apiBaseUrl` in `app.json` to your machine's LAN IP,
  e.g. `http://192.168.1.20:4000`.
- Android emulator: defaults to `http://10.0.2.2:4000`.
- iOS Simulator / localhost: defaults to `http://localhost:4000`.

## Testing

```bash
npm test          # protocol unit tests (framing, chunking, all commands, ack parsing, redaction)
npm run typecheck # tsc --noEmit
```

## Backend REST contract

| Method + path | Body | Success | Errors |
|---|---|---|---|
| `GET /health` | — | `{ ok: true }` | — |
| `GET /v1/scooters/:imei` | — | scooter summary | `404 scooter_not_found` |
| `POST /v1/rides/start` | `{ imei }` | `201 { rideId, blePassword, passwordMode }` | `404` · `409 scooter_in_use` · `409 no_active_password` · `409 no_static_password_set` |
| `POST /v1/rides/:id/end` | — | `{ rideId, endedAt }` | `404` · `403 not_your_ride` · `409 ride_already_ended` |
| `POST /v1/rides/:id/commands` | `{ command, params?, ackStatus? }` | `201 { id }` | `404` · `403` · `400 invalid_body` |

All `/v1/*` routes require `Authorization: Bearer <token>`.

## BLE protocol summary

- Service `0x2C00`, characteristic `0x2C10` (Write + Notify).
- ASCII, comma-separated params, password first, terminated with `$\r\n`, chunked to ≤20 bytes.
- Eight commands: `BKSCT` (lock/unlock), `BKECP` (ride config), `BKLED` (headlamp),
  `BKLOC` (locate), `BKWRN` (warning), `BKPWD` (change password), `BKINF` (query info),
  `BKVER` (query version).

## Security notes

- The BLE password is treated as a secret: kept in memory only, never logged, never
  persisted. Command audit logs redact it.
- The BLE link has no encryption or handshake beyond the per-command password — factor
  this into any security review.

## Discovery details (from protocol §3.1.1)

The scooter advertises its IMEI as ASCII inside the **manufacturer-specific data**
(`0xFF`) AD structure, alongside a complete local name of `ZK100`. It does **not**
advertise the `0x2C00` GATT service UUID — that service is discovered only after
connecting. Therefore BLE scanning must run **unfiltered** and match the target scooter
by the IMEI in its advertisement (see `advertisesImei` in `bleManager.ts`), not by a
service-UUID scan filter.

Acks may exceed 20 bytes (e.g. `BKVER`) and arrive across multiple notifications, so the
notify handler reassembles incoming bytes and splits complete frames on the `$`
terminator before parsing.

## Known ambiguities (from the protocol doc)

- `BKLOC` (locate) and `BKWRN` (warning) have names only; physical behavior is undefined.
  The UI presents them plainly with no promised effect.
- `BKSCT` command `2` (enhanced unlock) differs from normal unlock in an undefined way.
- Static-password provisioning uses the `<Static Password String>` field of an
  `AT+GTBCP` command that is not defined in this doc.

Frame terminator (resolved): the doc shows every command and ack ending with `$` and
states messages end with `<CR><LF>`, so the wire terminator is `$\r\n` — this is what
`FRAME_SUFFIX` in `protocol.ts` emits.

## Out of scope

Billing/payments, account/auth internals (bearer token is an integration point), fleet
ops, and NFC.
