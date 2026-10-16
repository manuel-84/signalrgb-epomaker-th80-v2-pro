# EPOMAKER TH80 V2 PRO plugin for SignalRGB

An unofficial SignalRGB plugin for the **EPOMAKER TH80 V2 PRO**, connected over **USB**, using its original firmware.

It streams SignalRGB effects to the keyboard without flashing QMK or replacing the keyboard firmware. The device owner confirmed that the plugin works in SignalRGB on October 16, 2026.

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

Other firmware versions and hardware revisions have not been verified. The TH80, TH80 Pro, TH80 Pro V2 VIA, TH80 SE, and devices with a different product ID are outside this plugin's tested scope. Bluetooth and 2.4 GHz are not implemented.

## Features

- Per-key SignalRGB canvas mapping for the 78 keys, based on the manufacturer's layout.
- Three additional responding LED IDs (`97`, `98`, `103`) receive the average keyboard color. Their physical positions have not been identified, so they are not presented as individually mapped keys.
- Canvas mode for synchronized effects, or Forced mode for a fixed color.
- Adjustable update rate from 5 to 30 FPS; default 20 FPS.
- The keyboard's hardware lighting effect is read at initialization and restored when SignalRGB gracefully releases the device.
- An internal product-number check prevents controlling a different model that shares the USB identifiers.
- Acknowledged, bounded USB transfers; streaming stops after three consecutive failed frames.

The plugin controls RGB lighting only. It does not configure the screen, key assignments, macros, or firmware.

## Installation

1. Connect the keyboard with a USB data cable and select **USB mode** on the keyboard.
2. Download [`EPOMAKER_TH80_V2_PRO.js`](./EPOMAKER_TH80_V2_PRO.js). Use GitHub's **Download raw file** button so that the saved file contains JavaScript, not an HTML page.
3. Copy it into your SignalRGB user-plugin directory:

   ```text
   %USERPROFILE%\Documents\WhirlwindFX\Plugins
   ```

   If Windows redirects Documents to OneDrive or another location, use the custom-plugin folder shown by SignalRGB. See [SignalRGB file locations](https://docs.signalrgb.com/guides/installation-setup/file-locations/).
4. Close any active connection in the EPOMAKER browser driver.
5. Quit SignalRGB through its system-tray menu and open it again.
6. Open **Devices**. The keyboard should appear as **EPOMAKER TH80 V2 PRO**.
7. Keep **Lighting Mode = Canvas** to synchronize it with your current effect. Place and scale it in SignalRGB's layout as needed.

For the loading mechanism, see SignalRGB's [custom-plugin installation instructions](https://docs.signalrgb.com/troubleshooting/advanced-troubleshooting/replacing-plugin/).

## Settings

| Setting | Purpose |
| --- | --- |
| Lighting Mode: Canvas | Sample the active SignalRGB effect at each mapped key. |
| Lighting Mode: Forced | Apply one fixed color to the keyboard. |
| Forced Color | Select the fixed color used in Forced mode. |
| Frame Rate | Set the USB update rate, 5–30 FPS. Start with 20 FPS. |

## Troubleshooting and removal

- **Keyboard missing:** verify USB mode, the data cable, and VID/PID `0C45:800B`. Restart SignalRGB after placing the plugin in the user folder.
- **Identity mismatch:** this plugin also requires internal product `35`. Do not bypass that check to force another model to connect.
- **Initialization or transfer failures:** close the EPOMAKER browser driver's connection, reconnect the keyboard, and reload the plugin or restart SignalRGB. Check the keyboard's device console for messages prefixed `TH80 V2 PRO`.
- **Stuttering:** lower Frame Rate to 10 or 15 FPS.
- **Returning to the manufacturer driver:** quit SignalRGB before connecting the browser driver. Graceful shutdown restores the previous hardware lighting effect; unplugging or forcibly terminating the application may prevent that restoration.
- **Removal:** quit SignalRGB, remove this `.js` file from the user-plugin folder, then reopen SignalRGB. User plugins persist across application updates and can override future official support for the same VID/PID.

## Protocol and verification

The implementation was independently written from the RGB transport exposed by EPOMAKER's official [browser driver](https://epomaker.driveall.cn/custom-keys), and compared with the manufacturer's [EPOMAKER Hub](https://hub.epomaker.com/).

- HID report ID `0`; 64 bytes of report data, with a leading zero report-ID byte in SignalRGB's 65-byte writes.
- Request header `AA`; response header `55`.
- Read device information with `0x10`; read lighting effect with `0x13`.
- Stream temporary RGB records with `0x32`, in 56-byte payload chunks. Each record is `[LED ID, R, G, B]`.
- Restore the saved effect with `0x23` when releasing the device.
- RGB frames do **not** use the custom-profile write command `0x24`.

Direct hardware tests sent red, green, and blue frames, then used RGB readback command `0x33` to confirm the requested values at 81 LED IDs. The original lighting effect was restored and read back afterward. The manufacturer-derived per-key mapping has also been checked in offline tests; physical key-by-key visual verification remains open to community feedback.

The published plugin uses the same code installed and confirmed working by the device owner; line endings have been normalized to LF for Git. Its SHA-256 is:

```text
67bd8fb096c3353bfb9df882717d1aea3add67095715f783003b246004fa3df5
```

## Development

There are no runtime or test dependencies. Use Node.js 20 or newer:

```sh
npm test
```

The offline checks cover endpoint and internal-model guards, all 78 key mappings, auxiliary colors, packet boundaries, frame pacing, reply formats, effect restoration, and stopping after failed transfers. They do not substitute for testing on a physical keyboard.

When reporting an issue, include the exact keyboard name, VID/PID, firmware and SignalRGB versions, connection mode, and the relevant device-console error. Do not post account tokens, complete system logs, or other private information.

## License and affiliation

MIT license. This is a community plugin, not an official EPOMAKER or SignalRGB release. Product names and trademarks belong to their respective owners.
