# ProxyProof: Bluetooth attendance

A phone app that marks students present automatically when they are physically in the room, and makes proxy attendance hard.

```
server/   Node API + live WebSocket (Express, node:sqlite, ws). 20 tests.
app/      Expo (React Native) app for organisers, students and admins.
```

## How it works

1. The organiser starts a session. The server creates a secret for it and hands the organiser's phone a **token that changes every 10 seconds**.
2. The organiser's phone broadcasts the session ID and current token over BLE (no pairing).
3. A student's phone hears it and sends session ID, token, RSSI and its device ID to the server.
4. The server marks the student only if **all** of these hold (`server/src/attendance.js`, `verifyMark`):

| Check | Rejection code |
|---|---|
| Session is open and not past its end time | `session_closed` |
| Student is enrolled in the class | `not_registered` |
| Request comes from the phone bound to that student | `wrong_device` |
| Token is from the current or previous 10 s window | `stale_token` |
| RSSI is at or above the session threshold (default -80 dBm) | `too_far` |
| That phone has not already marked another student | `device_already_used` |

Every rejection is stored and shown to the organiser as a "blocked attempt".

**Device binding.** The first login binds a student to that phone. Signing in on another phone creates a request that an admin must approve. One phone can belong to only one student.

## Run it

Needs Node 22 or newer (the server uses the built-in `node:sqlite`).

```bash
cd server && npm install && npm run seed && npm start
```

```bash
cd app && npm install && npx expo start
```

Every demo account uses the password `proxyproof`:

| Role | Roll number |
|---|---|
| Admin | `ADMIN` |
| Organiser | `FAC01` (Computer Networks, Operating Systems), `FAC02` (Machine Learning) |
| Student | `23CS001` to `23CS012` |

On the login screen, "Server settings" lets you point a phone at your computer's address, for example `http://192.168.1.20:4000`. The server prints its LAN address on start. Set `EXPO_PUBLIC_API_URL` to change the default.

### Try it without Bluetooth

Open the app in Expo Go, the iOS Simulator, or on the web (`w` in the Expo terminal). Without the native modules it runs in **simulated signal** mode: the beacon travels through the server and the student screen has a distance slider that produces RSSI. The full flow works: start a session as `FAC01`, sign in as a student in a second device or browser tab, and watch the mark arrive live. Each web tab acts as its own phone.

### Real Bluetooth (two physical phones)

BLE advertising and scanning need native code, so this needs a development build, not Expo Go:

```bash
cd app && npx expo run:ios --device     # or: npx expo run:android --device
```

Checklist:
1. Phone A signs in as an organiser, phone B as a student. Both on the same Wi-Fi as the server.
2. On both, open Profile and set Signal source to **Bluetooth**.
3. Phone A starts a session. The ring shows a code that changes every 10 s.
4. Phone B, on the Today tab, should switch to "Found CS3401" and then "You're marked present" within a few seconds.
5. Walk to the far end of the room or beyond the range and check that RSSI drops below the threshold and the student is told to move closer.
6. Wait for a code to expire and replay a captured request: it must be rejected with `stale_token`.

The beacon packs `PROX | sessionId | token | check` into one 128-bit service UUID (`app/src/ble/payload.ts`), because iOS cannot advertise manufacturer data. Advertising uses `react-native-ble-advertiser` and scanning uses `react-native-ble-plx`.

## Tests

```bash
cd server && npm test
```

They cover each rule above, token rotation and replay, device switching with admin approval, manual add and remove, role guards, CSV output, history percentages, and the live WebSocket events.

## Known limitations

- **Native Bluetooth is untested on hardware.** The Simulator and browser have no Bluetooth, so the native advertise and scan path is written against the libraries' documented APIs but has not been run on two phones. Use the checklist above.
- **RSSI is reported by the student's phone.** A modified client could fake it. The rotating token, device binding and one-phone-per-student rules limit what that buys, but this is not tamper-proof.
- **Relay attacks.** Someone who rebroadcasts the signal to a remote friend within the 10 s window could still get through. Shorter rotation narrows the window.
- **The student app must be open.** iOS does not allow unfiltered Bluetooth scanning in the background, so the student keeps the Today screen open.
- Demo scope: seeded accounts with a shared password, a local SQLite file, no email flows or production hosting.
