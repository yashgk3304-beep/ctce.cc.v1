# CT-C Assistant

CT-C Assistant reads the visible question, editor text, and visible sample tests on CodeTantra coding practice pages. It asks Gemini for a proposal, then can compile and run that proposal against those visible samples on your own computer with gcc. You review the proposal and type or submit it yourself. The extension never types, clicks, or submits on CodeTantra. It does nothing on pages detected as quizzes.

## Windows setup

1. Install Chrome Stable, Node.js LTS, and Git. Install a C compiler. For MSYS2 UCRT64, open its UCRT64 terminal and run:

   ```powershell
   pacman -S mingw-w64-ucrt-x86_64-gcc
   ```

   Add the UCRT64 `bin` folder (usually `C:\msys64\ucrt64\bin`) to your Windows PATH. Open a new PowerShell window and run `gcc --version`.

2. Clone the repository and build it:

   ```powershell
   git clone <repository-url>
   cd ct-c-assistant
   npm ci --ignore-scripts
   npm run build
   ```

   The unpacked extension is created in `dist/`.

3. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the project's `dist` folder. Pin CT-C Assistant from Chrome's extensions menu.

4. Open the extension's **Options** page. Review and accept the consent text, enter your Gemini API key, and select **Load models**. Run `npm run helper:init` in PowerShell, copy the token shown once into Options, leave the port at `47831` unless you change it in both places, and select **Test helper**.

5. For each coding session, run `npm run helper` in a PowerShell window and leave it open.

6. Open a CodeTantra programming practice page. The assistant pill appears when the page is detected as a coding page. Expand sample cases on CodeTantra yourself if the panel asks; the extension never clicks page controls.

7. After changing the source, run `npm run build`, reload the extension at `chrome://extensions`, and refresh the CodeTantra tab.

## Development checks

```powershell
npm ci --ignore-scripts
npm run verify
npm run test:e2e
```

The E2E test build adds a loopback fixture match only when `build:test` is used. Do not load that test build for normal use. The release build does not include the fixture host.

## Key and data use

The Gemini API key is stored in `chrome.storage.local` and sent only in the `x-goog-api-key` request header. Before a request, visible question, editor, and sample fields are redacted for email, phone, and ID-like strings. The page URL and account header are not included. Read [docs/PRIVACY.md](docs/PRIVACY.md) and Google's [Gemini API Terms](https://ai.google.dev/gemini-api/terms) before enabling suggestions. Google's data use differs by service tier; check current terms for your account.

Only visible sample tests are checked. A passed badge does not check hidden tests or establish that a solution will pass the CodeTantra judge. Read [docs/CALIBRATION.md](docs/CALIBRATION.md) if selectors need adjustment.

## Troubleshooting

- **Managed Chrome blocks unpacked extensions:** use a personal Chrome profile if permitted.
- **gcc not found:** reopen PowerShell after changing PATH and check `gcc --version`.
- **Port in use:** stop the other local process or change the port in Options and restart the helper. The extension manifest must also be rebuilt after changing its helper port.
- **The first run is slow:** antivirus may scan each newly compiled test executable.
- **Extension context invalidated:** reload the CodeTantra tab.
- **No helper connection:** keep `npm run helper` running, check the token and port, then use **Test helper**.
- **Question or editor not read reliably:** export the page structure report from Options and follow [docs/CALIBRATION.md](docs/CALIBRATION.md). The report contains structure and attributes, not page text or URL path.

## Project docs

- [Permissions](docs/PERMISSIONS.md)
- [Privacy and data flow](docs/PRIVACY.md)
- [Assumptions](docs/ASSUMPTIONS.md)
- [Verified APIs](docs/VERIFIED.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Manual QA](docs/QA.md)
