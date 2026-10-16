# EPOMAKER TH80 V2 PRO plugin for SignalRGB

Unofficial SignalRGB plugins for the **EPOMAKER TH80 V2 PRO**, connected over **USB cable or its 2.4 GHz dongle**, using its original firmware.

They stream SignalRGB effects to the keyboard without flashing QMK or replacing the keyboard firmware. The device owner confirmed both USB and 2.4 GHz operation in SignalRGB on October 16, 2026.

| Connection | Plugin | Status |
| --- | --- | --- |
| USB cable | [`EPOMAKER_TH80_V2_PRO.js`](./EPOMAKER_TH80_V2_PRO.js) | Tested and confirmed in SignalRGB |
| 2.4 GHz dongle | [`EPOMAKER_TH80_V2_PRO_Wireless.js`](./EPOMAKER_TH80_V2_PRO_Wireless.js) | Tested and confirmed in SignalRGB |
| Bluetooth | — | No vendor RGB HID interface exposed by the tested firmware; not supported |

## Tested hardware

| Item | Tested value |
| --- | --- |
| Keyboard | EPOMAKER TH80 V2 PRO |
| USB vendor / product ID | `0C45:800B` |
| Internal product number | `35` |
| Keyboard firmware | `1.09` |
| Connection | USB cable, USB mode |
| Host application | SignalRGB `2.5.82-beta` on Windows |
| RGB interface | HID interface `2`, usage page `FF68`, usage `61` |

For 2.4 GHz, the tested receiver is `0C45:FEFE` (release `0x0138`), HID interface `3`, usage page `FF60`, usage `61`. It reports the same internal keyboard model `35`, firmware `1.09`, and work mode `2`.

Other firmware versions and hardware revisions have not been verified. The TH80, TH80 Pro, TH80 Pro V2 VIA, TH80 SE, and other receivers/models are outside the tested scope. Bluetooth is not implemented; see the findings below.

## Features

- Per-key SignalRGB canvas mapping for the 78 keys, based on the manufacturer's matrix and corrected against an owner-supplied photo of the physical keyboard.
- On USB, three additional responding LED IDs (`97`, `98`, `103`) receive the average keyboard color. On the dongle, only `103` is present in the RGB stream; other status LEDs remain firmware-controlled. Their physical positions have not been identified, so they are not presented as individually mapped keys.
- Canvas mode for synchronized effects, or Forced mode for a fixed color.
- USB: adjustable update rate from 5 to 30 FPS; default 20 FPS.
- Dongle: RGB565 color encoding and a lower update rate, 1–8 FPS (default 5). Receiver bandwidth and hardware brightness affect the result.
- The keyboard's hardware lighting effect is read at initialization and restored when SignalRGB gracefully releases the device.
- Internal product-number and active-connection checks prevent controlling another model or sending lighting/restoration commands through an inactive transport.
- Acknowledged, bounded USB transfers. USB retries failed initialization and pauses after three consecutive failed frames, then reconnects with delays from 1 to 30 seconds. It preserves the pre-stream hardware effect and does not request native lighting during temporary failures. USB identity and active mode are rechecked every five seconds.
- The dongle plugin pauses after three failed frames, checks keyboard identity/link state every five seconds, and retries every 3 seconds while waiting. The interval stays capped at 3 seconds even after a long period in USB/Bluetooth mode, avoiding the previous wait of up to 30 seconds. Physical unattended sleep has not been exhaustively tested.

The plugin controls RGB lighting only. It does not configure the screen, key assignments, macros, or firmware.

## Installation

1. Choose the connection: USB data cable and **USB mode**, or the original dongle and **2.4 GHz mode**.
2. Download the matching `.js` file from the table above. You can install both files for switching between connections. Use GitHub's **Download raw file** button so that the saved files contain JavaScript, not an HTML page.
3. Copy the file(s) into your SignalRGB user-plugin directory:

   ```text
   %USERPROFILE%\Documents\WhirlwindFX\Plugins
   ```

   If Windows redirects Documents to OneDrive or another location, use the custom-plugin folder shown by SignalRGB. See [SignalRGB file locations](https://docs.signalrgb.com/guides/installation-setup/file-locations/).
4. Close any active connection in the EPOMAKER browser driver.
5. Quit SignalRGB through its system-tray menu and open it again.
6. Open **Devices**. The keyboard should appear as **EPOMAKER TH80 V2 PRO** for USB, or **EPOMAKER TH80 V2 PRO (2.4 GHz)** for the dongle. SignalRGB stores device settings/layout placement separately for the two connections.
7. Keep **Lighting Mode = Canvas** to synchronize it with your current effect. Place and scale it in SignalRGB's layout as needed.

For the loading mechanism, see SignalRGB's [custom-plugin installation instructions](https://docs.signalrgb.com/troubleshooting/advanced-troubleshooting/replacing-plugin/).

## Settings

| Setting | Purpose |
| --- | --- |
| Lighting Mode: Canvas | Sample the active SignalRGB effect at each mapped key. |
| Lighting Mode: Forced | Apply one fixed color to the keyboard. |
| Forced Color | Select the fixed color used in Forced mode. |
| Frame Rate | USB: 5–30 FPS, default 20. Dongle: 1–8 FPS, default 5. |

## Troubleshooting and removal

- **Keyboard missing:** verify the selected connection and the matching plugin. USB uses `0C45:800B`; the dongle uses `0C45:FEFE`. Restart SignalRGB after placing the plugin in the user folder.
- **Identity mismatch:** this plugin also requires internal product `35`. Do not bypass that check to force another model to connect.
- **Initialization or transfer failures:** close the EPOMAKER browser driver's connection and any active display uploader. Both plugins retry temporary failures automatically. If USB still receives no replies, reconnect the cable or restart SignalRGB. Check the device console or debug log for messages prefixed `TH80-DIAG-USB` / `TH80-DIAG-2G`; no recovery can guarantee success while another application owns the interface.
- **Stuttering:** lower USB Frame Rate to 10 or 15 FPS, or dongle Frame Rate to 3 FPS. Wireless updates are less smooth than USB.
- **Dongle waiting for keyboard:** wake the keyboard and select 2.4 GHz mode. The receiver can remain connected while the keyboard is asleep, off, or using another mode. The plugin checks every 3 seconds and streams only after verifying the expected keyboard and mode. The measured USB-to-dongle handover was about 3–5 seconds, including firmware/host delays.
- **Returning to the manufacturer driver:** quit SignalRGB before connecting the browser driver. Graceful shutdown restores the previous hardware lighting effect; unplugging or forcibly terminating the application may prevent that restoration.
- **Removal:** quit SignalRGB, remove the corresponding `.js` file(s) from the user-plugin folder, then reopen SignalRGB. User plugins persist across application updates and can override future official support for the same VID/PID.

## Protocol and verification

The implementation was independently written from the RGB transport exposed by EPOMAKER's official [browser driver](https://epomaker.driveall.cn/custom-keys), and compared with the manufacturer's [EPOMAKER Hub](https://hub.epomaker.com/).

- HID report ID `0`; 64 bytes of report data. SignalRGB uses 65-byte writes and reads to reserve a possible leading zero report-ID byte. Query replies must contain the complete requested payload; both prefixed and unnumbered replies are accepted.
- Request header `AA`; response header `55`.
- Read device information with `0x10`; read lighting effect with `0x13`.
- Stream temporary RGB records with `0x32`, in 56-byte payload chunks. Each record is `[LED ID, R, G, B]`.
- Restore the saved effect with `0x23` when releasing the device.
- RGB frames do **not** use the custom-profile write command `0x24`.

Direct hardware tests sent red, green, and blue frames, then used RGB readback command `0x33` to confirm the requested values at 81 LED IDs. The original lighting effect was restored and read back afterward. The manufacturer-derived per-key mapping has also been checked in offline tests; physical key-by-key visual verification remains open to community feedback.

### 2.4 GHz transport and validation

The receiver uses 32-byte HID data reports with a leading report-ID byte in 33-byte SignalRGB writes **and reads**. Device queries and effect restoration use the same eight-byte header as USB, with 24-byte payload chunks.

RGB streaming uses command `0x35` with a four-byte header `[AA, 35, chunk index, 00]` followed by 28 bytes of big-endian RGB565 colors. The wire format omits LED IDs and uses a compact order of 79 slots, including auxiliary ID `103` at slot 13. A frame consists of six chunks, with zero padding at the end. Responses are matched by command and chunk index. USB's `0x32` command acknowledged on this receiver but did not update its LEDs; the wireless plugin therefore uses the verified `0x35` transport.

Direct receiver tests read back monochrome red, green and blue at **all 78 mapped key IDs**, with the expected RGB565/brightness reduction. Unique-color tests then verified the exact compact slot-to-matrix mapping for all 78 keys against the manufacturer's sequence; a static left-red/right-blue frame generated by the actual plugin also read back correctly at all 78 key IDs. Auxiliary status LEDs can be overridden by firmware. The saved hardware effect was restored and read back. After correcting the compact wireless order and physical function-row coordinates, the owner confirmed that the effects map correctly over both 2.4 GHz and USB on October 16, 2026. A half-width red/blue check places F6 on the red side and F7 on the blue side. Protocol captures, device addresses and full machine logs are not included in this repository.

### Connection and recovery checks

The owner tested the recovery update on October 16, 2026, with SignalRGB 2.5.82-beta and firmware 1.09:

| Scenario | Observed result |
| --- | --- |
| Restart SignalRGB in USB mode without reconnecting the cable | Native lighting during shutdown; SignalRGB resumed on startup. |
| Switch USB to 2.4 GHz with both cable and receiver connected | SignalRGB resumed on the receiver in about 3–5 seconds after capping receiver retries at 3 seconds. |
| Switch 2.4 GHz back to USB with both connected | USB control resumed automatically. |
| Use the display / Fn + knob on USB | Screen navigation worked; the owner accepted about three brief flashes when changing the knob's function, followed by resumed SignalRGB lighting. The source of the flashes has not been established. |
| Use the receiver with the USB cable physically removed, including Fn + knob | Owner confirmed operation. |
| Restart SignalRGB on the receiver without a USB cable | Owner confirmed automatic recovery. |
| Extended unattended sleep, repeated cycling, and other firmware revisions | Not exhaustively verified. |

On this tested keyboard, switching to 2.4 GHz disconnected the USB control interface even while the cable remained plugged in. SignalRGB currently shows USB and the receiver as separate devices with separate layout/settings; these plugins do not merge them into one device.

These are specific owner-confirmed checks, not a guarantee that every disconnect or firmware delay will recover. During a successful connection-mode handover, the releasing plugin did not restore native lighting through the other transport.

### Bluetooth investigation

The connected keyboard was inspected over Bluetooth on October 16, 2026. It exposes standard keyboard, system-control, consumer-control and multi-axis HID collections, but no vendor RGB HID collection equivalent to USB `FF68` or dongle `FF60`.

An uncached GATT discovery found standard GAP, GATT, device-information, battery, scan-parameters and HID services, plus service `FEE0` / characteristic `FEE1`. Its user-description descriptor explicitly identifies it as **"OTA Channel"**. No RGB command channel was identified. No commands or firmware data were written to that OTA characteristic.

Bluetooth RGB support would require a documented/verified RGB-capable Bluetooth transport or a firmware change, and an integration compatible with SignalRGB. The receiver plugin deliberately rejects Bluetooth HID endpoints even though they reuse `0C45:FEFE`.

Both plugin files include the corrected physical function-row coordinates. USB and 2.4 GHz were separately confirmed by the device owner after this correction.

## Development

There are no runtime or test dependencies. Use Node.js 20 or newer:

```sh
npm test
```

The offline checks cover both transports: endpoint and internal-model guards, all 78 key mappings, auxiliary colors, packet boundaries, frame pacing, reply formats, effect restoration, partial-frame failures, failed-initialization recovery, USB connection-mode changes, protected shutdown, bounded USB backoff, and receiver retry latency after prolonged absence. They do not substitute for testing on a physical keyboard.

When reporting an issue, include the exact keyboard name, VID/PID, firmware and SignalRGB versions, connection mode, and the relevant device-console error. Do not post account tokens, complete system logs, or other private information.

## License and affiliation

MIT license. This is a community plugin, not an official EPOMAKER or SignalRGB release. Product names and trademarks belong to their respective owners.
